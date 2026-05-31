use crate::carrier_protocol::{InputEvent, SessionEventKind};
use crate::provider_adapter_admission::ProviderAdapterAdmission;
use crate::provider_runtime_config::ProviderRuntimeConfig;
use crate::rendering_boundary::{
    decide_payload_inline, default_payload_policy, InlinePayloadDecision,
};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderDispatchStatus {
    RecordedNotDispatched,
    Dispatched,
    Completed,
    Failed,
    Interrupted,
}

impl ProviderDispatchStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RecordedNotDispatched => "recorded_not_dispatched",
            Self::Dispatched => "dispatched",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Interrupted => "interrupted",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProviderDispatchRecord {
    pub status: ProviderDispatchStatus,
    pub provider_execution_enabled: bool,
    pub payload: Value,
    pub outputs: Vec<ProviderOutputRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderOutputKind {
    TextDelta,
    ToolCallRequest,
}

impl ProviderOutputKind {
    pub fn session_event_kind(&self) -> SessionEventKind {
        match self {
            Self::TextDelta => SessionEventKind::ProviderTextDeltaRecorded,
            Self::ToolCallRequest => SessionEventKind::ProviderToolCallRequested,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TextDelta => "text_delta",
            Self::ToolCallRequest => "tool_call_request",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProviderOutputRecord {
    pub kind: ProviderOutputKind,
    pub payload: Value,
}

pub trait ProviderAdapter {
    fn dispatch_request(&self, input: &InputEvent, turn_id: &str) -> ProviderDispatchRecord;
}

#[derive(Debug, Clone)]
pub struct ProviderDispatchStub {
    runtime_config: ProviderRuntimeConfig,
}

impl ProviderOutputRecord {
    pub fn text_delta(turn_id: &str, delta: &str, sequence: u64) -> Self {
        let policy = default_payload_policy();
        let payload_ref_id = format!("mcp_payload:provider_text_{turn_id}_{sequence}@v1");
        let decision = decide_payload_inline(
            delta,
            false,
            payload_ref_id,
            "provider text delta omitted from transcript",
            &policy,
        );
        let (text_delta, text_delta_ref) = inline_text_or_ref(delta, decision);
        Self {
            kind: ProviderOutputKind::TextDelta,
            payload: json!({
                "turn_id": turn_id,
                "provider_output_kind": ProviderOutputKind::TextDelta.as_str(),
                "sequence": sequence,
                "text_delta": text_delta,
                "text_delta_ref": text_delta_ref
            }),
        }
    }

    pub fn tool_call_request(
        turn_id: &str,
        tool_name: &str,
        arguments_summary: &str,
        sequence: u64,
    ) -> Self {
        Self::tool_call_request_with_sensitivity(
            turn_id,
            tool_name,
            arguments_summary,
            sequence,
            false,
        )
    }

    pub fn sensitive_tool_call_request(
        turn_id: &str,
        tool_name: &str,
        arguments_summary: &str,
        sequence: u64,
    ) -> Self {
        Self::tool_call_request_with_sensitivity(
            turn_id,
            tool_name,
            arguments_summary,
            sequence,
            true,
        )
    }

    fn tool_call_request_with_sensitivity(
        turn_id: &str,
        tool_name: &str,
        arguments_summary: &str,
        sequence: u64,
        sensitive: bool,
    ) -> Self {
        let policy = default_payload_policy();
        let payload_ref_id = format!("mcp_payload:provider_tool_args_{turn_id}_{sequence}@v1");
        let decision = decide_payload_inline(
            arguments_summary,
            sensitive,
            payload_ref_id,
            if sensitive {
                "sensitive provider tool arguments omitted from transcript"
            } else {
                "provider tool arguments omitted from transcript"
            },
            &policy,
        );
        let (arguments_summary, arguments_ref) = inline_text_or_ref(arguments_summary, decision);
        Self {
            kind: ProviderOutputKind::ToolCallRequest,
            payload: json!({
                "turn_id": turn_id,
                "provider_output_kind": ProviderOutputKind::ToolCallRequest.as_str(),
                "sequence": sequence,
                "tool_name": tool_name,
                "arguments_summary": arguments_summary,
                "arguments_ref": arguments_ref
            }),
        }
    }
}

fn inline_text_or_ref(text: &str, decision: InlinePayloadDecision) -> (String, Value) {
    match decision {
        InlinePayloadDecision::Inline => (text.to_string(), Value::Null),
        InlinePayloadDecision::RequiresRef(payload_ref) => {
            (payload_ref.summary.clone(), json!(payload_ref))
        }
    }
}

impl ProviderDispatchStub {
    pub fn disabled() -> Self {
        Self {
            runtime_config: ProviderRuntimeConfig::disabled(),
        }
    }

    pub fn with_runtime_config(runtime_config: ProviderRuntimeConfig) -> Self {
        Self { runtime_config }
    }

    pub fn record_request(&self, input: &InputEvent, turn_id: &str) -> ProviderDispatchRecord {
        self.dispatch_request(input, turn_id)
    }
}

impl Default for ProviderDispatchStub {
    fn default() -> Self {
        Self::disabled()
    }
}

impl ProviderAdapter for ProviderDispatchStub {
    fn dispatch_request(&self, input: &InputEvent, turn_id: &str) -> ProviderDispatchRecord {
        let status = ProviderDispatchStatus::RecordedNotDispatched;
        let admission = ProviderAdapterAdmission::from_runtime_config(&self.runtime_config, None);
        ProviderDispatchRecord {
            status: status.clone(),
            provider_execution_enabled: admission.provider_execution_enabled,
            payload: json!({
                "turn_id": turn_id,
                "input_event_id": input.event_id,
                "provider_request_status": status.as_str(),
                "provider_execution_enabled": admission.provider_execution_enabled,
                "provider_runtime_status": self.runtime_config.status.as_str(),
                "provider_adapter_admission_status": admission.status.as_str(),
                "provider_adapter_kind": admission.adapter_kind,
                "provider": self.runtime_config.provider.clone(),
                "model": self.runtime_config.model.clone(),
                "thinking": self.runtime_config.thinking.clone(),
                "stream": self.runtime_config.stream,
                "provider_refusal_reason": admission.refusal_reason,
                "content_preview": input.content.chars().take(120).collect::<String>()
            }),
            outputs: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::parse_input_event;
    use std::collections::BTreeMap;

    const INPUT_FIXTURE: &str = include_str!("../../carrier-protocol/fixtures/input-event.json");

    #[test]
    fn provider_dispatch_statuses_have_canonical_strings() {
        assert_eq!(
            ProviderDispatchStatus::RecordedNotDispatched.as_str(),
            "recorded_not_dispatched"
        );
        assert_eq!(ProviderDispatchStatus::Dispatched.as_str(), "dispatched");
        assert_eq!(ProviderDispatchStatus::Completed.as_str(), "completed");
        assert_eq!(ProviderDispatchStatus::Failed.as_str(), "failed");
        assert_eq!(ProviderDispatchStatus::Interrupted.as_str(), "interrupted");
    }

    #[test]
    fn large_provider_output_records_payload_ref() {
        let text = ProviderOutputRecord::text_delta("turn_1", &"x".repeat(5000), 1);
        assert_eq!(
            text.payload["text_delta"],
            "provider text delta omitted from transcript"
        );
        assert_eq!(
            text.payload["text_delta_ref"]["reader_tool"],
            "mcp_payload_read"
        );

        let tool = ProviderOutputRecord::sensitive_tool_call_request(
            "turn_1",
            "site_loop_run_once",
            "secret args",
            2,
        );
        assert_eq!(
            tool.payload["arguments_summary"],
            "sensitive provider tool arguments omitted from transcript"
        );
        assert_eq!(
            tool.payload["arguments_ref"]["reader_tool"],
            "mcp_payload_read"
        );
    }

    #[test]
    fn provider_output_records_map_to_session_event_kinds() {
        let text = ProviderOutputRecord::text_delta("turn_1", "hello", 1);
        assert_eq!(text.kind, ProviderOutputKind::TextDelta);
        assert_eq!(
            text.kind.session_event_kind(),
            SessionEventKind::ProviderTextDeltaRecorded
        );
        assert_eq!(text.payload["provider_output_kind"], "text_delta");
        assert_eq!(text.payload["text_delta"], "hello");

        let tool = ProviderOutputRecord::tool_call_request("turn_1", "site_loop_run_once", "{}", 2);
        assert_eq!(tool.kind, ProviderOutputKind::ToolCallRequest);
        assert_eq!(
            tool.kind.session_event_kind(),
            SessionEventKind::ProviderToolCallRequested
        );
        assert_eq!(tool.payload["provider_output_kind"], "tool_call_request");
        assert_eq!(tool.payload["tool_name"], "site_loop_run_once");
    }

    #[test]
    fn stub_records_provider_request_without_dispatch() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        let dispatcher = ProviderDispatchStub::default();
        let adapter: &dyn ProviderAdapter = &dispatcher;
        let record = adapter.dispatch_request(&input, "turn_1");

        assert_eq!(record.status, ProviderDispatchStatus::RecordedNotDispatched);
        assert_eq!(record.provider_execution_enabled, false);
        assert_eq!(record.payload["turn_id"], "turn_1");
        assert_eq!(record.payload["input_event_id"], input.event_id);
        assert_eq!(
            record.payload["provider_request_status"],
            "recorded_not_dispatched"
        );
        assert_eq!(record.payload["provider_execution_enabled"], false);
        assert_eq!(record.payload["provider_runtime_status"], "disabled");
        assert_eq!(
            record.payload["provider_adapter_admission_status"],
            "disabled"
        );
        assert_eq!(record.payload["provider_adapter_kind"], Value::Null);
        assert_eq!(record.payload["provider_refusal_reason"], Value::Null);
        assert!(record.outputs.is_empty());
    }

    #[test]
    fn stub_records_configured_provider_runtime_refusal_without_dispatch() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        let runtime_config = ProviderRuntimeConfig::from_env_map(&BTreeMap::from([
            (
                "NARADA_AGENT_TUI_ENABLE_PROVIDER_EXECUTION".to_string(),
                "true".to_string(),
            ),
            (
                "NARADA_INTELLIGENCE_PROVIDER".to_string(),
                "codex-subscription".to_string(),
            ),
            ("NARADA_AI_MODEL".to_string(), "gpt-5.5".to_string()),
        ]));
        let dispatcher = ProviderDispatchStub::with_runtime_config(runtime_config);
        let record = dispatcher.dispatch_request(&input, "turn_1");

        assert_eq!(record.status, ProviderDispatchStatus::RecordedNotDispatched);
        assert_eq!(record.provider_execution_enabled, false);
        assert_eq!(
            record.payload["provider_runtime_status"],
            "configured_not_implemented"
        );
        assert_eq!(
            record.payload["provider_adapter_admission_status"],
            "configured_without_adapter"
        );
        assert_eq!(record.payload["provider_adapter_kind"], Value::Null);
        assert_eq!(record.payload["provider"], "codex-subscription");
        assert_eq!(record.payload["model"], "gpt-5.5");
        assert_eq!(
            record.payload["provider_refusal_reason"],
            "provider_adapter_not_admitted"
        );
    }
}
