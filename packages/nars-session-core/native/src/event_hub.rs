//! Native event-hub and event-attachment semantics for NARS sessions.
//!
//! The durable journal remains the source of truth.  This module owns the
//! bounded live/replay buffer and the subscription lifecycle that sits on top
//! of that journal.  Subscribers receive envelopes through a pollable queue;
//! transports (JSONL, WebSocket, or another carrier) decide how to deliver
//! those envelopes.

use crate::CoreError;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub const EVENTS_ENVELOPE_SCHEMA: &str = "narada.nars.events.envelope.v1";
pub const EVENT_ATTACHMENT_SCHEMA: &str = "narada.nars.event_attachment_state.v1";
pub const EVENT_ATTACHMENT_STATES: &[&str] = &[
    "requested",
    "replaying",
    "live",
    "closing",
    "closed",
    "failed",
];

const CONVERSATION_KINDS: &[&str] = &[
    "assistant_message",
    "assistant_message_stream",
    "user_message",
    "operator_input_submitted",
    "conversation_enqueue_requested",
    "input_event_queued",
    "input_event_deduplicated",
    "input_event_started",
    "input_event_completed",
    "runtime_request_state_transition",
    "input_queued_for_turn_boundary",
    "input_admitted_to_turn",
    "input_dropped_by_operator",
    "input_abandoned_on_session_end",
    "input_completed",
    "session_control_accepted",
    "session_control_response",
    "session_control_rejected",
    "session_cancel",
    "carrier_turn_started",
    "carrier_turn_completed",
    "carrier_turn_failed",
    "carrier_turn_interrupted",
    "turn_started",
    "turn_complete",
    "turn_failed",
    "turn_interrupted",
    "session_affordance_action_requested",
    "session_affordance_action_result",
    "session_affordance_action_refused",
    "session_affordance_confirmation_required",
    "session_affordance_action_confirmed",
    "session_affordance_action_cancelled",
    "agent_web_ui_message",
    "agent_web_ui_help",
    "session_artifact_registered",
    "session_artifact_read",
    "error",
    "websocket_error",
    "web_ui_decode_error",
    "web_ui_input_not_sent",
    "runtime_error",
];

const OPERATION_KINDS: &[&str] = &[
    "tool_call",
    "tool_result",
    "carrier_tool_requested",
    "carrier_tool_completed",
    "tool_execution_state_transition",
    "tool_execution_completed",
    "tool_execution_refused",
    "tool_admitted",
    "tool_refused",
    "turn_lifecycle_transition",
    "turn_failed",
    "conversation_enqueue_requested",
    "input_queued_for_turn_boundary",
    "input_admitted_to_turn",
    "input_dropped_by_operator",
    "input_abandoned_on_session_end",
    "input_completed",
    "session_started",
    "session_closed",
    "session_status",
    "session_recovery",
    "session_operations",
    "session_sync",
    "observer_status",
    "observers_status",
    "carrier_command_result",
    "turn_started",
    "turn_complete",
    "directive_received",
    "directive_receipt_recorded",
    "directive_carrier_accepted_recorded",
    "directive_complete",
];

const DIAGNOSTIC_KINDS: &[&str] = &[
    "authority_session_revoked",
    "projection_revoked",
    "carrier_diagnostic_recorded",
    "mcp_runtime_fault",
    "runtime_projection_failure",
    "runtime_output_failure",
    "runtime_control_input_bridge_error",
    "runtime_intelligence_reconfiguration",
    "runtime_intelligence_reconfiguration_cancel",
    "intelligence_runtime_reconfiguration_state_transition",
    "provider_runtime_fault",
    "provider_error",
    "session_health",
    "websocket_connected",
    "session_events_subscription_started",
    "session_events_replay_completed",
];

#[derive(Debug, Clone)]
struct Subscription {
    filters: Value,
    state: String,
    history: Vec<Value>,
    pending: Vec<Value>,
    delivered: Vec<Value>,
    active: bool,
}

#[derive(Debug, Clone)]
pub struct EventHub {
    max_buffer: usize,
    sequence: u64,
    buffer: Vec<Value>,
    subscriptions: BTreeMap<String, Subscription>,
}

impl EventHub {
    pub fn new(max_buffer: usize) -> Self {
        Self {
            max_buffer: max_buffer.max(1),
            sequence: 0,
            buffer: Vec::new(),
            subscriptions: BTreeMap::new(),
        }
    }

    /// Seed the in-memory replay buffer from the durable journal without
    /// notifying subscribers.  This is used during core rehydration.
    pub fn seed(&mut self, event: Value) {
        let Some(mut object) = event.as_object().cloned() else {
            return;
        };
        let sequence = sequence_of(&event).unwrap_or(self.sequence.saturating_add(1));
        self.sequence = self.sequence.max(sequence);
        object.insert("event_sequence".to_string(), json!(sequence));
        object.insert("sequence".to_string(), json!(sequence));
        self.buffer.push(Value::Object(object));
        self.trim_buffer();
    }

    pub fn publish(&mut self, event: Value) -> Option<Value> {
        let Some(mut object) = event.as_object().cloned() else {
            return None;
        };
        let assigned = sequence_of(&event)
            .filter(|sequence| *sequence > self.sequence)
            .unwrap_or_else(|| self.sequence.saturating_add(1));
        self.sequence = assigned;
        object.insert("event_sequence".to_string(), json!(assigned));
        object.insert("sequence".to_string(), json!(assigned));
        let sequenced = Value::Object(object);
        self.buffer.push(sequenced.clone());
        self.trim_buffer();

        let ids: Vec<String> = self
            .subscriptions
            .iter()
            .filter(|(_, subscription)| {
                subscription.active && matches_event(&sequenced, &subscription.filters)
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            let envelope = envelope(&id, assigned, sequenced.clone());
            if let Some(subscription) = self.subscriptions.get_mut(&id) {
                if subscription.state == "replaying" {
                    subscription.pending.push(sequenced.clone());
                } else if subscription.state == "live" {
                    subscription.delivered.push(envelope);
                }
            }
        }
        Some(sequenced)
    }

    pub fn cursor(&self) -> Value {
        json!({
            "last_sequence": if self.sequence == 0 { Value::Null } else { json!(self.sequence) },
            "next_sequence": self.sequence.saturating_add(1),
        })
    }

    pub fn subscriber_count(&self) -> usize {
        self.subscriptions
            .values()
            .filter(|subscription| subscription.active)
            .count()
    }

    pub fn subscribe(&mut self, subscription_id: Option<&str>, filters: Value) -> Value {
        let id = subscription_id
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("sub_{}_{}", now_millis(), self.subscriptions.len() + 1));
        let initial = attachment_transition(
            &id,
            None,
            "requested",
            json!({
                "reason": "subscription_requested"
            }),
        );
        self.subscriptions.insert(
            id.clone(),
            Subscription {
                filters,
                state: "requested".to_string(),
                history: vec![initial],
                pending: Vec::new(),
                delivered: Vec::new(),
                active: true,
            },
        );
        self.subscription_value(&id).unwrap_or(Value::Null)
    }

    pub fn begin_replay(
        &mut self,
        subscription_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        self.transition_subscription(subscription_id, "replaying", evidence)
    }

    pub fn mark_live(
        &mut self,
        subscription_id: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        let transition = self.transition_subscription(subscription_id, "live", evidence.clone())?;
        let replay_last = evidence
            .get("replay_last_sequence")
            .and_then(as_u64)
            .unwrap_or(0);
        let replay_field = evidence
            .get("replay_sequence_field")
            .and_then(Value::as_str)
            .map(str::to_string);
        let pending = self.subscriptions.get_mut(subscription_id).ok_or_else(|| {
            CoreError(format!(
                "nars_event_subscription_not_found:{subscription_id}"
            ))
        })?;
        let pending_events = std::mem::take(&mut pending.pending);
        for event in pending_events {
            let sequence = replay_field
                .as_deref()
                .and_then(|field| event.get(field).and_then(as_u64))
                .or_else(|| sequence_of(&event))
                .unwrap_or(0);
            if replay_last > 0 && sequence <= replay_last {
                continue;
            }
            pending
                .delivered
                .push(envelope(subscription_id, sequence, event));
        }
        Ok(transition)
    }

    pub fn fail(&mut self, subscription_id: &str, evidence: Value) -> Result<Value, CoreError> {
        self.transition_subscription(subscription_id, "failed", evidence)
    }

    pub fn unsubscribe(
        &mut self,
        subscription_id: &str,
        reason: Option<&str>,
    ) -> Result<Value, CoreError> {
        let state = self
            .subscriptions
            .get(subscription_id)
            .map(|subscription| subscription.state.clone())
            .ok_or_else(|| {
                CoreError(format!(
                    "nars_event_subscription_not_found:{subscription_id}"
                ))
            })?;
        let mut transition = Value::Null;
        if matches!(state.as_str(), "requested" | "replaying" | "live") {
            transition = self.transition_subscription(
                subscription_id,
                "closing",
                json!({ "reason": reason.unwrap_or("unsubscribe") }),
            )?;
        }
        if self
            .subscriptions
            .get(subscription_id)
            .map(|subscription| subscription.state.as_str())
            == Some("closing")
        {
            transition = self.transition_subscription(
                subscription_id,
                "closed",
                json!({ "reason": reason.unwrap_or("unsubscribe") }),
            )?;
        }
        if let Some(subscription) = self.subscriptions.get_mut(subscription_id) {
            subscription.active = false;
        }
        Ok(transition)
    }

    pub fn poll(&mut self, subscription_id: &str) -> Result<Vec<Value>, CoreError> {
        let subscription = self.subscriptions.get_mut(subscription_id).ok_or_else(|| {
            CoreError(format!(
                "nars_event_subscription_not_found:{subscription_id}"
            ))
        })?;
        Ok(std::mem::take(&mut subscription.delivered))
    }

    pub fn poll_all(&mut self) -> Vec<Value> {
        let ids: Vec<String> = self
            .subscriptions
            .iter()
            .filter(|(_, subscription)| subscription.active)
            .map(|(id, _)| id.clone())
            .collect();
        let mut output = Vec::new();
        for id in ids {
            if let Some(subscription) = self.subscriptions.get_mut(&id) {
                output.extend(std::mem::take(&mut subscription.delivered));
            }
        }
        output
    }

    pub fn subscription(&self, subscription_id: &str) -> Option<Value> {
        self.subscription_value(subscription_id)
    }

    pub fn replay_for(&self, options: &Value) -> Result<Vec<Value>, CoreError> {
        let filters = options.get("filters").cloned().unwrap_or_else(|| {
            let mut value = Map::new();
            if let Some(view) = options.get("view") {
                value.insert("view".to_string(), view.clone());
            }
            Value::Object(value)
        });
        validate_view(filters.get("view").and_then(Value::as_str))?;
        let since_sequence = options.get("since_sequence").and_then(as_i64);
        let since_timestamp = options
            .get("since_timestamp")
            .and_then(Value::as_str)
            .and_then(parse_iso_millis);
        let parsed_limit = options
            .get("max_replay")
            .or_else(|| options.get("limit"))
            .and_then(as_i64)
            .unwrap_or(100)
            .clamp(0, self.max_buffer as i64) as usize;
        let mut events: Vec<Value> = self
            .buffer
            .iter()
            .filter(|event| {
                let sequence = sequence_of(event).unwrap_or(0);
                if let Some(cursor) = since_sequence {
                    if sequence as i64 <= cursor {
                        return false;
                    }
                }
                if let Some(since) = since_timestamp {
                    if let Some(event_time) = event
                        .get("timestamp")
                        .or_else(|| event.get("generated_at"))
                        .and_then(Value::as_str)
                        .and_then(parse_iso_millis)
                    {
                        if event_time <= since {
                            return false;
                        }
                    }
                }
                matches_event(event, &filters)
            })
            .cloned()
            .collect();
        if parsed_limit == 0 {
            events.clear();
        } else if events.len() > parsed_limit {
            events = events.split_off(events.len() - parsed_limit);
        }
        Ok(events)
    }

    pub fn page_from_events(&self, events: &[Value], options: &Value) -> Result<Value, CoreError> {
        let view = options.get("view").and_then(Value::as_str).unwrap_or("raw");
        validate_view(Some(view))?;
        let filters = options.get("filters").cloned().unwrap_or_else(|| json!({}));
        let after = options.get("after_sequence").and_then(as_i64);
        let before = options.get("before_sequence").and_then(as_i64);
        let since_timestamp = if after.is_some() {
            None
        } else {
            options
                .get("since_timestamp")
                .and_then(Value::as_str)
                .and_then(parse_iso_millis)
        };
        let mut filtered: Vec<Value> = events
            .iter()
            .filter(|event| {
                let sequence = sequence_of(event).unwrap_or(0) as i64;
                if after.is_some_and(|cursor| sequence <= cursor)
                    || before.is_some_and(|cursor| sequence >= cursor)
                {
                    return false;
                }
                if let Some(since) = since_timestamp {
                    if let Some(event_time) = event
                        .get("timestamp")
                        .or_else(|| event.get("generated_at"))
                        .and_then(Value::as_str)
                        .and_then(parse_iso_millis)
                    {
                        if event_time <= since {
                            return false;
                        }
                    }
                }
                let mut merged = filters.clone();
                if let Some(object) = merged.as_object_mut() {
                    object.insert("view".to_string(), json!(view));
                }
                matches_event(event, &merged)
            })
            .cloned()
            .collect();
        let limit = options
            .get("limit")
            .and_then(as_i64)
            .unwrap_or(100)
            .clamp(0, 1000) as usize;
        let direction = options
            .get("direction")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| {
                if before.is_some() {
                    "backward".to_string()
                } else {
                    "forward".to_string()
                }
            });
        let has_more = filtered.len() > limit;
        if filtered.len() > limit {
            if direction == "backward" {
                filtered = filtered.split_off(filtered.len() - limit);
            } else {
                filtered.truncate(limit);
            }
        }
        let first = filtered.first();
        let last = filtered.last();
        let last_sequence = events.last().and_then(sequence_of);
        let first_sequence = first.and_then(sequence_of);
        let last_page_sequence = last.and_then(sequence_of);
        Ok(json!({
            "schema": "narada.nars.events.read.v1",
            "status": "ok",
            "source": "events_jsonl",
            "direction": direction,
            "view": view,
            "limit": limit,
            "event_count": filtered.len(),
            "has_more": has_more,
            "first_sequence": first_sequence,
            "last_sequence": last_page_sequence,
            "cursor": {
                "before_sequence": first_sequence.or(before.map(|value| value as u64)),
                "after_sequence": last_page_sequence.or(after.map(|value| value as u64)),
                "last_sequence": last_sequence,
                "next_sequence": last_sequence.unwrap_or(0).saturating_add(1),
            },
            "events": filtered,
        }))
    }

    fn transition_subscription(
        &mut self,
        subscription_id: &str,
        next: &str,
        evidence: Value,
    ) -> Result<Value, CoreError> {
        let subscription = self.subscriptions.get_mut(subscription_id).ok_or_else(|| {
            CoreError(format!(
                "nars_event_subscription_not_found:{subscription_id}"
            ))
        })?;
        if subscription.state == next {
            return Ok(subscription.history.last().cloned().unwrap_or(Value::Null));
        }
        if !can_transition_attachment(Some(&subscription.state), next) {
            return Err(CoreError(format!(
                "invalid_nars_event_attachment_transition:{}:{next}",
                subscription.state
            )));
        }
        let transition =
            attachment_transition(subscription_id, Some(&subscription.state), next, evidence);
        subscription.state = next.to_string();
        if matches!(next, "closed" | "failed") {
            subscription.active = false;
        }
        subscription.history.push(transition.clone());
        Ok(transition)
    }

    fn subscription_value(&self, subscription_id: &str) -> Option<Value> {
        self.subscriptions.get(subscription_id).map(|subscription| {
            json!({
                "subscription_id": subscription_id,
                "state": subscription.state,
                "state_history": subscription.history,
                "filters": subscription.filters,
                "pending_count": subscription.pending.len(),
                "delivered_count": subscription.delivered.len(),
            })
        })
    }

    fn trim_buffer(&mut self) {
        if self.buffer.len() > self.max_buffer {
            let remove = self.buffer.len() - self.max_buffer;
            self.buffer.drain(0..remove);
        }
    }
}

pub fn can_transition_attachment(previous: Option<&str>, next: &str) -> bool {
    if previous == Some(next) {
        return true;
    }
    match (previous, next) {
        (None, "requested") => true,
        (Some("requested"), "replaying" | "live" | "closing" | "failed") => true,
        (Some("replaying"), "live" | "closing" | "failed") => true,
        (Some("live"), "closing" | "failed") => true,
        (Some("closing"), "closed" | "failed") => true,
        _ => false,
    }
}

pub fn attachment_transition(
    attachment_id: &str,
    previous: Option<&str>,
    next: &str,
    evidence: Value,
) -> Value {
    json!({
        "schema": EVENT_ATTACHMENT_SCHEMA,
        "attachment_id": attachment_id,
        "previous_state": previous,
        "attachment_state": next,
        "evidence": evidence,
    })
}

pub fn matches_event(event: &Value, filters: &Value) -> bool {
    let object = filters.as_object();
    let kind = event_kind(event);
    if let Some(view) = object
        .and_then(|value| value.get("view"))
        .and_then(Value::as_str)
    {
        if view != "raw" && !matches_view(&kind, view) {
            return false;
        }
    }
    let kinds = object
        .and_then(|value| value.get("event_kinds").or_else(|| value.get("kinds")))
        .and_then(Value::as_array);
    if let Some(kinds) = kinds {
        if !kinds
            .iter()
            .any(|value| value.as_str() == Some(kind.as_str()))
        {
            return false;
        }
    }
    if let Some(families) = object
        .and_then(|value| value.get("families"))
        .and_then(Value::as_array)
    {
        let family = if kind.starts_with("session_") {
            "session"
        } else {
            "turn"
        };
        if !families.iter().any(|value| value.as_str() == Some(family)) {
            return false;
        }
    }
    if let Some(expected) = object.and_then(|value| value.get("request_id")) {
        if !selector_matches(event, "request_id", expected) {
            return false;
        }
    }
    if let Some(expected) = object.and_then(|value| value.get("turn_id")) {
        if !selector_matches(event, "turn_id", expected) {
            return false;
        }
    }
    if let Some(any_of) = object
        .and_then(|value| value.get("any_of"))
        .and_then(Value::as_object)
    {
        let selectors = ["request_id", "turn_id", "input_event_id", "directive_id"];
        let selected: Vec<(&str, &Value)> = selectors
            .iter()
            .filter_map(|field| any_of.get(*field).map(|value| (*field, value)))
            .filter(|(_, value)| !value.is_null() && value.as_str() != Some(""))
            .collect();
        if !selected.is_empty()
            && !selected
                .iter()
                .any(|(field, expected)| selector_matches(event, field, expected))
        {
            return false;
        }
    }
    true
}

pub fn validate_view(view: Option<&str>) -> Result<(), CoreError> {
    match view.unwrap_or("raw") {
        "conversation" | "operations" | "diagnostics" | "raw" => Ok(()),
        value => Err(CoreError(format!(
            "invalid_nars_session_event_view:{value}"
        ))),
    }
}

fn matches_view(kind: &str, view: &str) -> bool {
    match view {
        "conversation" => CONVERSATION_KINDS.contains(&kind),
        "operations" => {
            CONVERSATION_KINDS.contains(&kind)
                || OPERATION_KINDS.contains(&kind)
                || kind.starts_with("authority_source_")
                || kind.starts_with("authority_target_")
                || matches!(
                    kind,
                    "item.started" | "item.completed" | "turn.started" | "turn.completed"
                )
        }
        "diagnostics" => DIAGNOSTIC_KINDS.contains(&kind) || kind.starts_with("provider_"),
        _ => true,
    }
}

fn selector_matches(event: &Value, field: &str, expected: &Value) -> bool {
    let payload = event.get("payload").and_then(Value::as_object);
    let mut values = Vec::new();
    if field == "input_event_id" {
        values.push(event.get("input_event_id"));
        values.push(event.get("event_id"));
        values.push(payload.and_then(|value| value.get("input_event_id")));
        values.push(payload.and_then(|value| value.get("event_id")));
    } else {
        values.push(event.get(field));
        values.push(payload.and_then(|value| value.get(field)));
    }
    values.into_iter().flatten().any(|value| {
        value != &Value::Null
            && value.to_string().trim_matches('"') == expected.to_string().trim_matches('"')
    })
}

fn event_kind(event: &Value) -> String {
    let value = event
        .get("event")
        .or_else(|| event.get("event_kind"))
        .or_else(|| event.get("type"));
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Object(object)) => object
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        _ => String::new(),
    }
}

fn envelope(subscription_id: &str, sequence: u64, payload: Value) -> Value {
    json!({
        "schema": EVENTS_ENVELOPE_SCHEMA,
        "event": "session_event",
        "subscription_id": subscription_id,
        "cursor": { "sequence": sequence, "next_sequence": sequence.saturating_add(1) },
        "payload": payload,
    })
}

fn sequence_of(value: &Value) -> Option<u64> {
    value
        .get("event_sequence")
        .or_else(|| value.get("sequence"))
        .and_then(as_u64)
}

fn as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|value| u64::try_from(value).ok()))
        .or_else(|| value.as_str().and_then(|value| value.parse::<u64>().ok()))
}

fn as_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|value| i64::try_from(value).ok()))
        .or_else(|| value.as_str().and_then(|value| value.parse::<i64>().ok()))
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn parse_iso_millis(value: &str) -> Option<i64> {
    let text = value.trim();
    let (date, time) = text.split_once('T')?;
    let mut date_parts = date.split('-');
    let year = date_parts.next()?.parse::<i64>().ok()?;
    let month = date_parts.next()?.parse::<i64>().ok()?;
    let day = date_parts.next()?.parse::<i64>().ok()?;
    let time = time.trim_end_matches('Z');
    let (clock, fraction) = time.split_once('.').unwrap_or((time, "0"));
    let mut clock_parts = clock.split(':');
    let hour = clock_parts.next()?.parse::<i64>().ok()?;
    let minute = clock_parts.next()?.parse::<i64>().ok()?;
    let second = clock_parts.next()?.parse::<i64>().ok()?;
    let millis = fraction
        .chars()
        .take(3)
        .collect::<String>()
        .parse::<i64>()
        .unwrap_or(0)
        * match fraction.len() {
            0 => 1000,
            1 => 100,
            2 => 10,
            _ => 1,
        };
    let days = days_from_civil(year, month, day);
    Some((days * 86_400 + hour * 3_600 + minute * 60 + second) * 1000 + millis)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - if month <= 2 { 1 } else { 0 };
    let era = if year >= 0 { year } else { year - 399 }.div_euclid(400);
    let yoe = year - era * 400;
    let month = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * month + 2).div_euclid(5) + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_and_replay_order_match_contract() {
        let mut hub = EventHub::new(10);
        let subscription = hub.subscribe(Some("sub-1"), json!({}));
        assert_eq!(subscription["state"], "requested");
        hub.begin_replay("sub-1", json!({ "source": "event_log" }))
            .unwrap();
        hub.publish(json!({ "event": "session_status", "event_sequence": 2 }));
        assert!(hub.poll("sub-1").unwrap().is_empty());
        hub.mark_live("sub-1", json!({ "replay_last_sequence": 1 }))
            .unwrap();
        assert_eq!(
            hub.poll("sub-1").unwrap()[0]["payload"]["event_sequence"],
            2
        );
        hub.publish(json!({ "event": "session_status", "event_sequence": 3 }));
        assert_eq!(
            hub.poll("sub-1").unwrap()[0]["payload"]["event_sequence"],
            3
        );
        hub.unsubscribe("sub-1", None).unwrap();
        assert_eq!(hub.subscriber_count(), 0);
    }

    #[test]
    fn durable_replay_filter_is_applied_before_limit() {
        let mut hub = EventHub::new(20);
        for (sequence, kind) in [
            (1, "session_health"),
            (2, "user_message"),
            (3, "assistant_message"),
            (4, "session_health"),
        ] {
            hub.seed(json!({ "event": kind, "event_sequence": sequence }));
        }
        let events = hub
            .page_from_events(&hub.buffer, &json!({ "view": "conversation", "limit": 1 }))
            .unwrap();
        assert_eq!(events["events"][0]["event_sequence"], 2);
        assert_eq!(events["has_more"], true);
    }
}
