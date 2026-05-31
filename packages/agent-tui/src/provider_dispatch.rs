use crate::carrier_protocol::{
    create_provider_request_payload, create_provider_text_delta_payload,
    create_provider_tool_call_payload, InputEvent, SessionEventKind,
};
use crate::provider_adapter_admission::{ProviderAdapterAdmission, ProviderAdapterKind};
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
pub struct ProviderAdapterRequest {
    pub turn_id: String,
    pub input_event_id: String,
    pub content_preview: String,
    pub provider_runtime_status: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub stream: bool,
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
pub struct ScriptedProviderAdapter {
    runtime_config: ProviderRuntimeConfig,
    adapter_admission: ProviderAdapterAdmission,
    outputs: Vec<ProviderOutputRecord>,
}

#[derive(Debug, Clone)]
pub struct ProviderDispatchStub {
    runtime_config: ProviderRuntimeConfig,
    adapter_admission: ProviderAdapterAdmission,
}

impl ProviderAdapterRequest {
    pub fn from_input(
        input: &InputEvent,
        turn_id: impl Into<String>,
        runtime_config: &ProviderRuntimeConfig,
    ) -> Self {
        Self {
            turn_id: turn_id.into(),
            input_event_id: input.event_id.clone(),
            content_preview: input.content.chars().take(120).collect::<String>(),
            provider_runtime_status: runtime_config.status.as_str().to_string(),
            provider: runtime_config.provider.clone(),
            model: runtime_config.model.clone(),
            thinking: runtime_config.thinking.clone(),
            stream: runtime_config.stream,
        }
    }

    pub fn dispatch_payload(
        &self,
        status: &ProviderDispatchStatus,
        adapter_admission: &ProviderAdapterAdmission,
    ) -> Value {
        create_provider_request_payload(
            &self.turn_id,
            &self.input_event_id,
            status.as_str(),
            adapter_admission.provider_execution_enabled,
            &self.provider_runtime_status,
            adapter_admission.status.as_str(),
            adapter_admission.adapter_kind.clone(),
            self.provider.clone(),
            self.model.clone(),
            self.thinking.clone(),
            self.stream,
            provider_streaming_contract(adapter_admission.provider_execution_enabled, self.stream),
            adapter_admission.refusal_reason.clone(),
            &self.content_preview,
        )
    }
}

fn provider_streaming_contract(provider_execution_enabled: bool, stream: bool) -> &'static str {
    match (provider_execution_enabled, stream) {
        (true, true) => "streaming_text_delta_events",
        (true, false) => "single_provider_output_batch",
        (false, true) => "requested_but_not_dispatched",
        (false, false) => "not_requested",
    }
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
            payload: create_provider_text_delta_payload(
                turn_id,
                sequence,
                &text_delta,
                text_delta_ref,
            ),
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
            payload: create_provider_tool_call_payload(
                turn_id,
                sequence,
                tool_name,
                &arguments_summary,
                arguments_ref,
            ),
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

impl ScriptedProviderAdapter {
    pub fn try_new(
        runtime_config: ProviderRuntimeConfig,
        adapter_kind: ProviderAdapterKind,
        outputs: Vec<ProviderOutputRecord>,
    ) -> Result<Self, String> {
        let adapter_admission = ProviderAdapterAdmission::try_admit(&runtime_config, adapter_kind)?;
        Ok(Self {
            runtime_config,
            adapter_admission,
            outputs,
        })
    }
}

impl ProviderAdapter for ScriptedProviderAdapter {
    fn dispatch_request(&self, input: &InputEvent, turn_id: &str) -> ProviderDispatchRecord {
        let status = ProviderDispatchStatus::Completed;
        let request = ProviderAdapterRequest::from_input(input, turn_id, &self.runtime_config);
        ProviderDispatchRecord {
            status: status.clone(),
            provider_execution_enabled: self.adapter_admission.provider_execution_enabled,
            payload: request.dispatch_payload(&status, &self.adapter_admission),
            outputs: self.outputs.clone(),
        }
    }
}

pub fn provider_adapter_from_runtime_config(
    runtime_config: ProviderRuntimeConfig,
    adapter_admission: ProviderAdapterAdmission,
) -> Box<dyn ProviderAdapter> {
    Box::new(
        ProviderDispatchStub::with_runtime_config_and_adapter_admission(
            runtime_config,
            adapter_admission,
        ),
    )
}

impl ProviderDispatchStub {
    pub fn disabled() -> Self {
        let runtime_config = ProviderRuntimeConfig::disabled();
        let adapter_admission =
            ProviderAdapterAdmission::from_runtime_config(&runtime_config, None);
        Self {
            runtime_config,
            adapter_admission,
        }
    }

    pub fn with_runtime_config(runtime_config: ProviderRuntimeConfig) -> Self {
        let adapter_admission =
            ProviderAdapterAdmission::from_runtime_config(&runtime_config, None);
        Self {
            runtime_config,
            adapter_admission,
        }
    }

    pub fn with_runtime_config_and_adapter_admission(
        runtime_config: ProviderRuntimeConfig,
        adapter_admission: ProviderAdapterAdmission,
    ) -> Self {
        Self {
            runtime_config,
            adapter_admission,
        }
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
        let admission = &self.adapter_admission;
        let request = ProviderAdapterRequest::from_input(input, turn_id, &self.runtime_config);
        ProviderDispatchRecord {
            status: status.clone(),
            provider_execution_enabled: admission.provider_execution_enabled,
            payload: request.dispatch_payload(&status, admission),
            outputs: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::carrier_protocol::{
        parse_input_event, PROVIDER_OUTPUT_PAYLOAD_SCHEMA, PROVIDER_REQUEST_PAYLOAD_SCHEMA,
    };
    use crate::provider_adapter_contract::provider_adapter_contract;
    use std::collections::BTreeMap;

    const INPUT_FIXTURE: &str = include_str!("../../carrier-protocol/fixtures/input-event.json");

    fn provider_runtime_env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        let contract = provider_adapter_contract();
        pairs
            .iter()
            .map(|(semantic_key, value)| {
                let env_key = match *semantic_key {
                    "execution_enabled" => &contract.provider_execution_env_var,
                    "provider" => &contract.intelligence_provider_env_var,
                    "model" => &contract.ai_model_env_var,
                    "thinking" => &contract.ai_thinking_env_var,
                    unexpected => panic!("unknown provider runtime env semantic key: {unexpected}"),
                };
                (env_key.clone(), value.to_string())
            })
            .collect()
    }

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
        assert_eq!(text.payload["schema"], PROVIDER_OUTPUT_PAYLOAD_SCHEMA);
        assert_eq!(text.payload["provider_output_kind"], "text_delta");
        assert_eq!(text.payload["text_delta"], "hello");

        let tool = ProviderOutputRecord::tool_call_request("turn_1", "site_loop_run_once", "{}", 2);
        assert_eq!(tool.kind, ProviderOutputKind::ToolCallRequest);
        assert_eq!(
            tool.kind.session_event_kind(),
            SessionEventKind::ProviderToolCallRequested
        );
        assert_eq!(tool.payload["schema"], PROVIDER_OUTPUT_PAYLOAD_SCHEMA);
        assert_eq!(tool.payload["provider_output_kind"], "tool_call_request");
        assert_eq!(tool.payload["tool_name"], "site_loop_run_once");
    }

    #[test]
    fn provider_adapter_request_has_stable_dispatch_payload_shape() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        let runtime_config = ProviderRuntimeConfig::from_env_map(&provider_runtime_env(&[
            ("execution_enabled", "true"),
            ("provider", "codex-subscription"),
            ("model", "gpt-5.5"),
            ("thinking", "medium"),
        ]));
        let admission = ProviderAdapterAdmission::from_runtime_config(&runtime_config, None);
        let request = ProviderAdapterRequest::from_input(&input, "turn_1", &runtime_config);
        let payload =
            request.dispatch_payload(&ProviderDispatchStatus::RecordedNotDispatched, &admission);

        assert_eq!(request.turn_id, "turn_1");
        assert_eq!(request.input_event_id, input.event_id);
        assert_eq!(request.provider_runtime_status, "configured");
        assert_eq!(payload["schema"], PROVIDER_REQUEST_PAYLOAD_SCHEMA);
        assert_eq!(
            payload["provider_request_status"],
            "recorded_not_dispatched"
        );
        assert_eq!(payload["provider_runtime_status"], "configured");
        assert_eq!(payload["provider"], "codex-subscription");
        assert_eq!(payload["model"], "gpt-5.5");
        assert_eq!(payload["thinking"], "medium");
        assert_eq!(
            payload["provider_adapter_admission_status"],
            "configured_without_adapter"
        );
        assert_eq!(payload["provider_execution_enabled"], false);
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
        assert_eq!(
            record.payload["provider_adapter_refusal_reason"],
            Value::Null
        );
        assert!(record.outputs.is_empty());
    }

    #[test]
    fn stub_records_configured_provider_runtime_refusal_without_dispatch() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        let runtime_config = ProviderRuntimeConfig::from_env_map(&provider_runtime_env(&[
            ("execution_enabled", "true"),
            ("provider", "codex-subscription"),
            ("model", "gpt-5.5"),
        ]));
        let dispatcher = ProviderDispatchStub::with_runtime_config(runtime_config);
        let record = dispatcher.dispatch_request(&input, "turn_1");

        assert_eq!(record.status, ProviderDispatchStatus::RecordedNotDispatched);
        assert_eq!(record.provider_execution_enabled, false);
        assert_eq!(record.payload["provider_runtime_status"], "configured");
        assert_eq!(
            record.payload["provider_adapter_admission_status"],
            "configured_without_adapter"
        );
        assert_eq!(record.payload["provider_adapter_kind"], Value::Null);
        assert_eq!(record.payload["provider"], "codex-subscription");
        assert_eq!(record.payload["model"], "gpt-5.5");
        assert_eq!(
            record.payload["provider_adapter_refusal_reason"],
            "provider_adapter_not_admitted"
        );
    }

    #[test]
    fn provider_adapter_factory_preserves_withheld_dispatch_boundary() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        let runtime_config = ProviderRuntimeConfig::from_env_map(&provider_runtime_env(&[
            ("execution_enabled", "true"),
            ("provider", "codex-subscription"),
            ("model", "gpt-5.5"),
        ]));
        let adapter_admission = ProviderAdapterAdmission::from_runtime_config(
            &runtime_config,
            Some(
                provider_adapter_contract()
                    .production_provider_adapter_kind
                    .as_str(),
            ),
        );
        let adapter = provider_adapter_from_runtime_config(runtime_config, adapter_admission);
        let record = adapter.dispatch_request(&input, "turn_1");

        assert_eq!(record.status, ProviderDispatchStatus::RecordedNotDispatched);
        assert!(!record.provider_execution_enabled);
        assert_eq!(
            record.payload["provider_adapter_admission_status"],
            "refused"
        );
        assert_eq!(
            record.payload["provider_adapter_kind"],
            provider_adapter_contract().production_provider_adapter_kind
        );
        assert_eq!(
            record.payload["provider_adapter_refusal_reason"],
            format!(
                "provider_adapter_not_implemented:{}",
                provider_adapter_contract().production_provider_adapter_kind
            )
        );
    }

    #[test]
    fn scripted_adapter_records_admitted_completed_dispatch_with_outputs() {
        let input = parse_input_event(INPUT_FIXTURE).expect("input parses");
        let runtime_config = ProviderRuntimeConfig::from_env_map(&provider_runtime_env(&[
            ("execution_enabled", "true"),
            ("provider", "codex-subscription"),
            ("model", "gpt-5.5"),
        ]));
        let dispatcher = ScriptedProviderAdapter::try_new(
            runtime_config,
            ProviderAdapterKind::Scripted,
            vec![ProviderOutputRecord::text_delta("turn_1", "hello", 1)],
        )
        .expect("scripted adapter admits configured runtime");
        let record = dispatcher.dispatch_request(&input, "turn_1");

        assert_eq!(record.status, ProviderDispatchStatus::Completed);
        assert!(record.provider_execution_enabled);
        assert_eq!(record.payload["provider_request_status"], "completed");
        assert_eq!(record.payload["provider_execution_enabled"], true);
        assert_eq!(
            record.payload["provider_adapter_admission_status"],
            "admitted"
        );
        assert_eq!(
            record.payload["provider_adapter_kind"],
            provider_adapter_contract().scripted_provider_adapter_kind
        );
        assert_eq!(
            record.payload["provider_adapter_refusal_reason"],
            Value::Null
        );
        assert_eq!(record.outputs.len(), 1);
        assert_eq!(record.outputs[0].payload["text_delta"], "hello");
    }
}
