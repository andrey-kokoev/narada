import os
import argparse
import json
import math
import shutil
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


DIRECTIONS = {"left", "right", "up", "down"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def read_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def dependency_status():
    result = {}
    for name in ("cv2", "mediapipe"):
        try:
            module = __import__(name)
            result[name] = {"available": True, "version": getattr(module, "__version__", "unknown")}
        except Exception as exc:
            result[name] = {"available": False, "error": f"{type(exc).__name__}: {exc}"}
    return result


def load_catalog(user_site_root):
    path = Path(user_site_root) / "operator-surfaces" / "camera-gesture-intent-catalog.json"
    if not path.exists():
        raise RuntimeError(f"Camera gesture intent catalog not found: {path}")
    return json.loads(path.read_text(encoding="utf-8")), path


def current_state_path(pc_site_root):
    return Path(pc_site_root) / "runtime" / "camera-gesture-events" / "state" / "current.json"


def cooldown_state_path(pc_site_root):
    return Path(pc_site_root) / "runtime" / "camera-gesture-events" / "state" / "cooldown.json"


def emit_state(pc_site_root, run_id, state, detail=None):
    value = {
        "schema": "narada.camera_gesture.active_sensing_state.v0",
        "run_id": run_id,
        "observed_at": now_iso(),
        "state": state,
        "detail": detail or {},
        "privacy": {
            "local_processing_only": True,
            "remote_video_allowed": False,
            "recording_enabled": False,
            "face_recognition": False,
            "identity_recognition": False,
        },
    }
    write_json(current_state_path(pc_site_root), value)
    return value


def interpret_direction_from_landmarks(landmarks):
    wrist = landmarks[0]
    index_tip = landmarks[8]
    dx = index_tip.x - wrist.x
    dy = index_tip.y - wrist.y
    magnitude = math.sqrt((dx * dx) + (dy * dy))
    if magnitude < 0.16:
        return None, 0.0
    if abs(dx) >= abs(dy):
        return ("right" if dx > 0 else "left"), min(0.99, magnitude * 2.5)
    return ("down" if dy > 0 else "up"), min(0.99, magnitude * 2.5)


def detect_live_gesture(args, deps):
    if not deps["cv2"]["available"] or not deps["mediapipe"]["available"]:
        blockers = {k: v for k, v in deps.items() if not v["available"]}
        raise RuntimeError(f"camera_dependency_blocked: {json.dumps(blockers, sort_keys=True)}")

    import cv2
    import mediapipe as mp

    cap = cv2.VideoCapture(args.device_index)
    if not cap.isOpened():
        raise RuntimeError(f"camera_not_opened: device_index={args.device_index}")

    mp_hands = mp.solutions.hands
    deadline = time.time() + (args.max_seconds or 5.0)
    best = None
    try:
        with mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7, min_tracking_confidence=0.7) as hands:
            while time.time() < deadline:
                ok, frame = cap.read()
                if not ok:
                    continue
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = hands.process(rgb)
                if not results.multi_hand_landmarks:
                    continue
                direction, confidence = interpret_direction_from_landmarks(results.multi_hand_landmarks[0].landmark)
                if direction:
                    candidate = {"direction": direction, "confidence": confidence, "basis": "mediapipe_hand_vector"}
                    if best is None or candidate["confidence"] > best["confidence"]:
                        best = candidate
                    if confidence >= args.min_confidence:
                        return candidate
    finally:
        cap.release()
    return best


def admission_for(candidate, catalog, args, pc_site_root):
    intent = next((item for item in catalog.get("intents", []) if item.get("intent_kind") == "komorebi.focus_direction" and item.get("enabled")), None)
    if not candidate:
        return "no_gesture_detected", False, False
    if not intent:
        return "rejected_catalog_intent_disabled", False, False
    direction = candidate.get("direction")
    if direction not in intent.get("directions", []):
        return "rejected_direction_not_allowlisted", False, False
    min_confidence = float(intent.get("auto_execute_when", {}).get("min_confidence", 0.85))
    if float(candidate.get("confidence", 0.0)) < min_confidence:
        return "requires_confirmation_low_confidence", False, False
    cooldown_ms = int(intent.get("auto_execute_when", {}).get("cooldown_ms", args.cooldown_ms))
    cooldown_path = cooldown_state_path(pc_site_root)
    cooldown = read_json(cooldown_path, {})
    now_ms = int(time.time() * 1000)
    prior_ms = int(cooldown.get("last_admitted_at_epoch_ms", 0) or 0)
    if prior_ms and now_ms - prior_ms < cooldown_ms:
        return "cooldown_suppressed", True, False
    if not args.execute:
        return "dry_run_admitted", False, True
    if not args.allow_komorebi_focus_direction:
        return "rejected_execute_without_allowlist", False, False
    return "execute_admitted", False, True


def maybe_execute(direction, args):
    if not args.execute:
        return {"attempted": False, "command": ["komorebic", "focus", direction], "exit_code": None, "stdout": "", "stderr": ""}
    if shutil.which("komorebic") is None:
        raise RuntimeError("komorebic_not_found")
    completed = subprocess.run(["komorebic", "focus", direction], capture_output=True, text=True, timeout=5)
    return {
        "attempted": True,
        "command": ["komorebic", "focus", direction],
        "exit_code": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-site-root", default=os.environ.get("NARADA_USER_SITE_ROOT", str(Path.home() / "Narada")))
    parser.add_argument("--pc-site-root", default=os.environ.get("NARADA_PC_SITE_ROOT", r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"))
    parser.add_argument("--device-index", type=int, default=0)
    parser.add_argument("--source-device", default="default_camera")
    parser.add_argument("--max-seconds", type=float, default=5.0)
    parser.add_argument("--min-confidence", type=float, default=0.85)
    parser.add_argument("--cooldown-ms", type=int, default=1200)
    parser.add_argument("--self-test-direction", choices=sorted(DIRECTIONS), default="")
    parser.add_argument("--self-test-confidence", type=float, default=0.95)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--allow-komorebi-focus-direction", action="store_true")
    parser.add_argument("--pass-thru", action="store_true")
    args = parser.parse_args()

    run_id = "camera_gesture_" + uuid.uuid4().hex
    run_root = Path(args.pc_site_root) / "runtime" / "camera-gesture-events" / run_id
    deps = dependency_status()
    catalog, catalog_path = load_catalog(args.user_site_root)
    emit_state(args.pc_site_root, run_id, "sensing_started", {"enabled": bool(args.self_test_direction), "dry_run": not args.execute})

    if args.self_test_direction:
        candidate = {
            "gesture_kind": "directional_hand_gesture",
            "direction": args.self_test_direction,
            "confidence": args.self_test_confidence,
            "basis": "synthetic_self_test",
        }
    else:
        candidate = detect_live_gesture(args, deps)
        if candidate:
            candidate["gesture_kind"] = "directional_hand_gesture"

    status, cooldown_active, admitted = admission_for(candidate, catalog, args, args.pc_site_root)
    execution = {"attempted": False, "command": ["komorebic", "focus", candidate["direction"]] if candidate else None}
    if candidate and status == "execute_admitted":
        execution = maybe_execute(candidate["direction"], args)
    if candidate and admitted and not cooldown_active:
        write_json(cooldown_state_path(args.pc_site_root), {
            "last_admitted_at_epoch_ms": int(time.time() * 1000),
            "direction": candidate["direction"],
            "run_id": run_id,
        })

    event = {
        "schema": "narada.camera_gesture.event.v0",
        "event_id": "camera_gesture_event_" + uuid.uuid4().hex,
        "run_id": run_id,
        "observed_at": now_iso(),
        "source_device": args.source_device,
        "gesture_kind": candidate.get("gesture_kind") if candidate else None,
        "direction": candidate.get("direction") if candidate else None,
        "confidence": candidate.get("confidence") if candidate else 0.0,
        "basis": candidate.get("basis") if candidate else "none",
        "cooldown": {
            "active": cooldown_active,
            "cooldown_ms": args.cooldown_ms,
        },
        "interpretation": {
            "intent_kind": "komorebi.focus_direction" if candidate else None,
            "admission_recommendation": status,
            "admitted": admitted,
            "catalog_path": str(catalog_path),
        },
        "execution": execution,
        "dependencies": deps,
        "privacy": {
            "local_processing_only": True,
            "remote_video_allowed": False,
            "recording_enabled": False,
            "video_retained": False,
            "face_recognition": False,
            "identity_recognition": False,
        },
    }

    write_json(run_root / (event["event_id"] + ".json"), event)
    summary = {
        "schema": "narada.camera_gesture.run.v0",
        "run_id": run_id,
        "created_at": now_iso(),
        "runtime_path": str(run_root),
        "event_id": event["event_id"],
        "status": status,
        "dry_run": not args.execute,
        "execute": args.execute,
        "gesture_detected": candidate is not None,
        "direction": event["direction"],
        "confidence": event["confidence"],
        "dependencies": deps,
    }
    write_json(run_root / "run.json", summary)
    emit_state(args.pc_site_root, run_id, "idle", {"last_status": status, "last_direction": event["direction"]})
    print(json.dumps(summary, indent=2))

    if not args.self_test_direction and (not deps["cv2"]["available"] or not deps["mediapipe"]["available"]):
        return 3
    return 0 if status in {"dry_run_admitted", "execute_admitted", "cooldown_suppressed", "requires_confirmation_low_confidence"} else 2


if __name__ == "__main__":
    sys.exit(main())
