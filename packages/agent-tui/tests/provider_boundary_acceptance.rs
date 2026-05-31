use narada_agent_tui::carrier_protocol::{
    parse_input_event, parse_session_event, DeliveryMode, SessionEventKind,
};
use narada_agent_tui::input_queue::{InputQueue, SessionEvidenceContext};
use narada_agent_tui::turn_coordinator::{TurnCoordinator, TurnCoordinatorClock};
use std::fs::{read_to_string, remove_file};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const INPUT_FIXTURE: &str = include_str!("../../carrier-protocol/fixtures/input-event.json");

fn temp_session_path() -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock works")
        .as_nanos();
    std::env::temp_dir().join(format!("narada-agent-tui-provider-boundary-{unique}.jsonl"))
}

fn context() -> SessionEvidenceContext {
    SessionEvidenceContext {
        carrier_session_id: "carrier_fixture_1".to_string(),
        agent_id: "sonar.resident".to_string(),
        site_id: "sonar".to_string(),
        site_root: "D:/code/narada.sonar".to_string(),
    }
}

fn clock() -> TurnCoordinatorClock {
    TurnCoordinatorClock {
        occurred_at: "2026-05-30T00:00:04.000Z".to_string(),
        event_id_prefix: "session_event_turn".to_string(),
        turn_id_prefix: "turn".to_string(),
    }
}

#[test]
fn provider_boundary_acceptance_records_disabled_provider_posture() {
    let path = temp_session_path();
    let mut input = parse_input_event(INPUT_FIXTURE).expect("input fixture parses");
    input.delivery_mode = DeliveryMode::AdmitAfterActiveTurn;
    let mut queue = InputQueue::new();
    queue.admit_input_event(input.clone(), false);
    let mut coordinator = TurnCoordinator::new(&path, context());

    let completed = coordinator
        .run_one_ready_turn(&mut queue, &clock())
        .expect("turn run succeeds")
        .expect("turn completes at provider boundary");

    assert_eq!(completed.turn_id, "turn_1");
    assert_eq!(completed.input_event_id, input.event_id);
    assert_eq!(completed.evidence_written, 3);

    let session_jsonl = read_to_string(&path).expect("session jsonl exists");
    let lines: Vec<&str> = session_jsonl.lines().collect();
    assert_eq!(lines.len(), 3);

    let started = parse_session_event(lines[0]).expect("turn started parses");
    let provider_request = parse_session_event(lines[1]).expect("provider request parses");
    let terminal = parse_session_event(lines[2]).expect("terminal event parses");

    assert_eq!(started.event_kind, SessionEventKind::TurnStarted);
    assert_eq!(started.payload["turn_id"], "turn_1");
    assert_eq!(started.payload["input_event_id"], input.event_id);
    assert_eq!(started.payload["source_kind"], "operator");

    assert_eq!(
        provider_request.event_kind,
        SessionEventKind::ProviderRequestRecorded
    );
    assert_eq!(provider_request.payload["turn_id"], "turn_1");
    assert_eq!(provider_request.payload["input_event_id"], input.event_id);
    assert_eq!(
        provider_request.payload["provider_request_status"],
        "recorded_not_dispatched"
    );
    assert_eq!(
        provider_request.payload["provider_execution_enabled"],
        false
    );
    assert_eq!(provider_request.payload["content_preview"], input.content);

    assert_eq!(terminal.event_kind, SessionEventKind::TurnCompleted);
    assert_eq!(terminal.payload["turn_id"], "turn_1");
    assert_eq!(terminal.payload["input_event_id"], input.event_id);
    assert_eq!(
        terminal.payload["provider_request_status"],
        "recorded_not_dispatched"
    );
    assert_eq!(
        terminal.payload["terminal_status"],
        "completed_without_provider"
    );
    assert_eq!(terminal.payload["provider_execution_enabled"], false);

    remove_file(path).ok();
}
