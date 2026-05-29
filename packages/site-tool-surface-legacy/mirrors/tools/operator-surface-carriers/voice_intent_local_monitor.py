#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import math
import os
import struct
import subprocess
import sys
import uuid
import wave
from pathlib import Path


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def event_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def emit_state_event(runtime_root, pc_site_root, run_id, state, reason=None, detail=None):
    observed_at = now_iso()
    event = {
        "schema": "narada.voice.capture_state_event.v0",
        "event_id": event_id("voice_capture_state"),
        "run_id": run_id,
        "state": state,
        "observed_at": observed_at,
    }
    if reason:
        event["reason"] = reason
    if detail is not None:
        event["detail"] = detail

    write_json(runtime_root / f"{event['event_id']}.json", event)

    state_dir = Path(pc_site_root) / "runtime" / "voice-intent-capture" / "state"
    current = {
        "schema": "narada.voice.capture_state_current.v0",
        "run_id": run_id,
        "state": state,
        "observed_at": observed_at,
        "event_id": event["event_id"],
    }
    if reason:
        current["reason"] = reason
    if detail is not None:
        current["detail"] = detail
    write_json(state_dir / "current.json", current)
    return event


def play_debug_cue(args, state):
    if args.debug_audio_cues == "disabled":
        return
    if os.name != "nt":
        return
    tones = {
        "sensing_started": (660, 90),
        "recording_started": (880, 90),
        "transcription_submitted": (1040, 110),
    }
    tone = tones.get(state)
    if not tone:
        return
    try:
        import winsound  # type: ignore
        winsound.Beep(*tone)
    except Exception:
        return


def rms_int16(values):
    if not values:
        return 0.0
    total = sum(int(v) * int(v) for v in values)
    return math.sqrt(total / len(values)) / 32768.0


def float_to_int16(value):
    clipped = max(-1.0, min(1.0, float(value)))
    return int(clipped * 32767)


def pcm_from_level(level, sample_rate, duration_ms):
    sample_count = max(1, int(sample_rate * duration_ms / 1000))
    amplitude = float_to_int16(level)
    return b"".join(struct.pack("<h", amplitude if index % 2 == 0 else -amplitude) for index in range(sample_count))


def vad_segments(frames, threshold, speech_start_ms, silence_end_ms):
    active = False
    above_ms = 0
    below_ms = 0
    start_ms = None
    segments = []

    for frame in frames:
        frame_ms = int(frame["duration_ms"])
        level = float(frame["rms"])
        if level >= threshold:
            above_ms += frame_ms
            below_ms = 0
        else:
            below_ms += frame_ms
            above_ms = 0

        if not active and above_ms >= speech_start_ms:
            active = True
            start_ms = int(frame["end_ms"] - above_ms)

        if active and below_ms >= silence_end_ms:
            end_ms = int(frame["end_ms"] - below_ms)
            if start_ms is not None and end_ms > start_ms:
                segments.append({"start_ms": start_ms, "end_ms": end_ms, "duration_ms": end_ms - start_ms})
            active = False
            start_ms = None

    if active and start_ms is not None:
        last_end = int(frames[-1]["end_ms"]) if frames else start_ms
        if last_end > start_ms:
            segments.append({"start_ms": start_ms, "end_ms": last_end, "duration_ms": last_end - start_ms})

    return segments


def rms_stats(frames):
    levels = sorted(float(frame["rms"]) for frame in frames)
    if not levels:
        return {
            "frame_count": 0,
            "min": None,
            "max": None,
            "mean": None,
            "p50": None,
            "p90": None,
            "p95": None,
            "p99": None,
        }

    def percentile(p):
        index = min(len(levels) - 1, max(0, int(round((len(levels) - 1) * p))))
        return levels[index]

    return {
        "frame_count": len(levels),
        "min": min(levels),
        "max": max(levels),
        "mean": sum(levels) / len(levels),
        "p50": percentile(0.50),
        "p90": percentile(0.90),
        "p95": percentile(0.95),
        "p99": percentile(0.99),
    }


def synthetic_frames(frame_ms):
    # silence, speech, silence, speech, silence
    pattern = [
        (500, 0.002),
        (900, 0.080),
        (800, 0.003),
        (700, 0.070),
        (900, 0.002),
    ]
    frames = []
    cursor = 0
    for duration_ms, level in pattern:
        count = max(1, int(duration_ms / frame_ms))
        for _ in range(count):
            cursor += frame_ms
            frames.append({
                "duration_ms": frame_ms,
                "end_ms": cursor,
                "rms": level,
                "pcm16": pcm_from_level(level, 16000, frame_ms),
            })
    return frames


def wav_frames(path, sample_rate, frame_ms):
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        rate = source.getframerate()
        if width != 2:
            raise ValueError(f"Only 16-bit PCM WAV is supported for InputWav; got sample width {width}.")
        samples_per_frame = max(1, int(rate * frame_ms / 1000))
        frames = []
        cursor = 0
        while True:
            raw = source.readframes(samples_per_frame)
            if not raw:
                break
            values = []
            mono = bytearray()
            for index in range(0, len(raw), 2 * channels):
                sample = int.from_bytes(raw[index:index + 2], byteorder="little", signed=True)
                values.append(sample)
                mono.extend(raw[index:index + 2])
            duration_ms = int(len(values) * 1000 / rate) if rate else frame_ms
            cursor += duration_ms
            frames.append({"duration_ms": duration_ms, "end_ms": cursor, "rms": rms_int16(values), "pcm16": bytes(mono)})
        return frames, rate


def live_frames(args):
    try:
        import sounddevice as sd  # type: ignore
        import numpy as np  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "Live microphone capture requires the Python package 'sounddevice' in this Python environment. "
            "Run the synthetic self-test path until the live audio dependency is installed."
        ) from exc

    frame_samples = max(1, int(args.sample_rate * args.frame_ms / 1000))
    collected = []
    total_frames = max(1, int(args.duration_seconds * 1000 / args.frame_ms))

    def callback(indata, frame_count, time_info, status):
        if status:
            pass
        mono = indata[:, 0] if len(indata.shape) > 1 else indata
        pcm = b"".join(struct.pack("<h", float_to_int16(value)) for value in mono)
        collected.append({"rms": float(np.sqrt(np.mean(np.square(mono)))), "pcm16": pcm})

    device = args.device
    if isinstance(device, str) and device.strip().lstrip("-").isdigit():
        device = int(device)

    with sd.InputStream(
        samplerate=args.sample_rate,
        channels=1,
        dtype="float32",
        blocksize=frame_samples,
        device=device,
        callback=callback,
    ):
        import time

        while len(collected) < total_frames:
            time.sleep(args.frame_ms / 1000.0)

    frames = []
    cursor = 0
    for frame in collected[:total_frames]:
        cursor += args.frame_ms
        frames.append({"duration_ms": args.frame_ms, "end_ms": cursor, "rms": frame["rms"], "pcm16": frame["pcm16"]})
    return frames


def write_selected_wav(frames, selected, sample_rate, output_path):
    if not selected:
        return None

    selected_bytes = bytearray()
    for frame in frames:
        frame_start = int(frame["end_ms"]) - int(frame["duration_ms"])
        frame_end = int(frame["end_ms"])
        if frame_end <= selected["start_ms"] or frame_start >= selected["end_ms"]:
            continue
        selected_bytes.extend(frame.get("pcm16", b""))

    if not selected_bytes:
        return None

    with wave.open(str(output_path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        target.writeframes(bytes(selected_bytes))

    return str(output_path)


def check_live_audio(args):
    try:
        import sounddevice as sd  # type: ignore
    except Exception as exc:
        return {
            "status": "unavailable",
            "reason": (
                "Live microphone capture requires the Python package 'sounddevice' "
                "in this Python environment."
            ),
            "detail": str(exc),
        }

    devices = sd.query_devices()
    default_input = sd.default.device[0] if sd.default.device else None
    input_devices = []
    for index, device in enumerate(devices):
        if int(device.get("max_input_channels", 0)) > 0:
            input_devices.append({
                "index": index,
                "name": device.get("name"),
                "max_input_channels": int(device.get("max_input_channels", 0)),
                "default_sample_rate": int(float(device.get("default_samplerate", 0))),
                "is_default_input": index == default_input,
            })

    return {
        "status": "available" if input_devices else "no_input_devices",
        "sounddevice_version": getattr(sd, "__version__", "unknown"),
        "default_input": default_input,
        "input_devices": input_devices,
    }


def invoke_transcript_harness(args, transcript, source_device):
    harness = Path(args.user_site_root) / "tools" / "operator-surface-carriers" / "Invoke-VoiceIntentCapturePrototype.ps1"
    if not harness.exists():
        raise FileNotFoundError(f"Voice intent harness not found: {harness}")

    command = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(harness),
        "-TranscriptText",
        transcript,
        "-RecognitionAdapter",
        "sample-text",
        "-SourceDevice",
        source_device,
        "-UserSiteRoot",
        args.user_site_root,
        "-PcSiteRoot",
        args.pc_site_root,
        "-PassThru",
    ]
    if args.dispatch_dry_run:
        command.append("-DispatchDryRun")

    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    return {
        "exit_code": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def invoke_recognition_adapter(args, audio_path, source_device):
    adapter = Path(args.user_site_root) / "tools" / "operator-surface-carriers" / "Invoke-VoiceRecognitionAdapter.ps1"
    if not adapter.exists():
        raise FileNotFoundError(f"Voice recognition adapter not found: {adapter}")

    command = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(adapter),
        "-Adapter",
        args.recognition_adapter,
        "-AudioFile",
        audio_path,
        "-SourceDevice",
        source_device,
        "-UserSiteRoot",
        args.user_site_root,
        "-PcSiteRoot",
        args.pc_site_root,
        "-ContinueToIntent",
        "-PassThru",
    ]
    if args.dispatch_dry_run:
        command.append("-DispatchDryRun")

    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    return {
        "exit_code": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def main():
    parser = argparse.ArgumentParser(description="Narada local voice intent monitor boundary.")
    parser.add_argument("--user-site-root", default=os.environ.get("NARADA_USER_SITE_ROOT", str(Path.home() / "Narada")))
    parser.add_argument("--pc-site-root", default=os.environ.get("NARADA_PC_SITE_ROOT", r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"))
    parser.add_argument("--duration-seconds", type=int, default=30)
    parser.add_argument("--sample-rate", type=int, default=16000)
    parser.add_argument("--frame-ms", type=int, default=50)
    parser.add_argument("--threshold", type=float, default=0.020)
    parser.add_argument("--speech-start-ms", type=int, default=180)
    parser.add_argument("--silence-end-ms", type=int, default=700)
    parser.add_argument("--pre-roll-ms", type=int, default=400)
    parser.add_argument("--post-roll-ms", type=int, default=500)
    parser.add_argument("--device", default="")
    parser.add_argument("--input-wav", default="")
    parser.add_argument("--self-test-synthetic", action="store_true")
    parser.add_argument("--check-live-audio", action="store_true")
    parser.add_argument("--calibrate", action="store_true")
    parser.add_argument("--transcript-text", default="")
    parser.add_argument("--transcript-file", default="")
    parser.add_argument("--recognition-adapter", choices=["none", "local-whisper", "openai-transcriptions", "cloudflare-worker"], default="none")
    parser.add_argument("--dispatch-dry-run", action="store_true")
    parser.add_argument("--retain-audio", action="store_true")
    parser.add_argument("--debug-audio-cues", choices=["enabled", "disabled"], default="enabled")
    args = parser.parse_args()

    if args.check_live_audio:
        print(json.dumps({
            "schema": "narada.voice.local_audio_dependency_check.v0",
            "observed_at": now_iso(),
            "python": sys.executable,
            "check": check_live_audio(args),
        }, indent=2))
        return 0

    run_id = event_id("local_voice_monitor")
    observed_at = now_iso()
    runtime_root = Path(args.pc_site_root) / "runtime" / "voice-intent-capture" / run_id
    runtime_root.mkdir(parents=True, exist_ok=True)
    state_events = []
    state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "sensing_started"))
    play_debug_cue(args, "sensing_started")

    source_mode = "live_microphone"
    source_device = args.device or "default_microphone"
    actual_sample_rate = args.sample_rate

    try:
        if args.self_test_synthetic:
            frames = synthetic_frames(args.frame_ms)
            source_mode = "synthetic_vad_self_test"
            source_device = "synthetic_voice_fixture"
        elif args.input_wav:
            frames, actual_sample_rate = wav_frames(Path(args.input_wav), args.sample_rate, args.frame_ms)
            source_mode = "local_wav_file"
            source_device = args.input_wav
        else:
            frames = live_frames(args)
    except Exception as exc:
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "blocked", reason="capture_failed", detail=str(exc)))
        failure = {
            "schema": "narada.voice.local_monitor_failure.v0",
            "run_id": run_id,
            "observed_at": observed_at,
            "status": "failed_closed",
            "reason": str(exc),
            "source": {
                "mode": source_mode,
                "device": source_device,
            },
        }
        write_json(runtime_root / "failure.json", failure)
        print(json.dumps(failure, indent=2))
        return 3

    stats = rms_stats(frames)
    if args.calibrate:
        calibration = {
            "schema": "narada.voice.local_audio_calibration.v0",
            "run_id": run_id,
            "observed_at": observed_at,
            "runtime_path": str(runtime_root),
            "source": {
                "mode": source_mode,
                "device": source_device,
                "sample_rate": actual_sample_rate,
                "duration_seconds": args.duration_seconds,
                "frame_ms": args.frame_ms,
            },
            "rms": stats,
            "suggested_thresholds": {
                "quiet_room": max(0.001, (stats["p95"] or 0.0) * 2.0),
                "sensitive": max(0.0005, (stats["p90"] or 0.0) * 1.5),
            },
            "dispatch": {
                "attempted": False,
                "reason": "calibration_mode_never_dispatches",
            },
        }
        write_json(runtime_root / "calibration.json", calibration)
        print(json.dumps(calibration, indent=2))
        return 0

    segments = vad_segments(frames, args.threshold, args.speech_start_ms, args.silence_end_ms)
    selected = max(segments, key=lambda item: item["duration_ms"]) if segments else None
    selected_audio = None
    if selected:
        total_duration_ms = int(frames[-1]["end_ms"]) if frames else selected["end_ms"]
        selected_audio = {
            **selected,
            "start_ms": max(0, int(selected["start_ms"]) - max(0, args.pre_roll_ms)),
            "end_ms": min(total_duration_ms, int(selected["end_ms"]) + max(0, args.post_roll_ms)),
        }
        selected_audio["duration_ms"] = selected_audio["end_ms"] - selected_audio["start_ms"]
    confidence = min(0.99, max(0.0, (selected["duration_ms"] / 1000.0) / 3.0)) if selected else 0.0
    retained_audio_path = None
    if selected:
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "recording_started", detail={"segment": selected, "retained_segment": selected_audio}))
        play_debug_cue(args, "recording_started")
    if args.retain_audio and selected:
        retained_audio_path = write_selected_wav(frames, selected_audio, actual_sample_rate, runtime_root / "utterance.wav")
    if selected:
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "recording_stopped", detail={"retained_audio_path": retained_audio_path}))

    privacy = {
        "raw_audio_retained": bool(retained_audio_path),
        "raw_audio_retention": "bounded_utterance_wav_until_operator_cleanup" if retained_audio_path else "none",
        "transcript_retained": bool(args.transcript_text or args.transcript_file),
        "transcript_retention": "pc_site_runtime_until_operator_cleanup" if args.transcript_text or args.transcript_file else "none",
        "remote_audio_allowed": args.recognition_adapter in ("openai-transcriptions", "cloudflare-worker"),
        "remote_audio_note": "Local monitor only detects bounded speech. Remote recognition remains behind a separate admitted adapter.",
    }

    segment_event = {
        "schema": "narada.voice.local_speech_segment_observed.v0",
        "event_id": event_id("local_speech_segment"),
        "run_id": run_id,
        "observed_at": observed_at,
        "source": {
            "mode": source_mode,
            "device": source_device,
            "sample_rate": actual_sample_rate,
        },
        "detector": {
            "kind": "local_rms_vad",
            "implementation": "voice_intent_local_monitor.py",
            "threshold": args.threshold,
            "speech_start_ms": args.speech_start_ms,
            "silence_end_ms": args.silence_end_ms,
            "confidence": confidence,
        },
        "segment": {
            "bounded": selected is not None,
            "start_ms": selected["start_ms"] if selected else None,
            "end_ms": selected["end_ms"] if selected else None,
            "duration_ms": selected["duration_ms"] if selected else None,
            "retained_start_ms": selected_audio["start_ms"] if selected_audio else None,
            "retained_end_ms": selected_audio["end_ms"] if selected_audio else None,
            "retained_duration_ms": selected_audio["duration_ms"] if selected_audio else None,
            "candidate_count": len(segments),
            "audio_path": retained_audio_path,
        },
        "privacy": privacy,
    }
    write_json(runtime_root / f"{segment_event['event_id']}.json", segment_event)

    transcript = args.transcript_text
    if args.transcript_file:
        transcript = Path(args.transcript_file).read_text(encoding="utf-8")
    transcript = " ".join(transcript.split())

    downstream = None
    if selected and transcript:
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "transcription_submitted", reason="transcript_text"))
        play_debug_cue(args, "transcription_submitted")
        downstream = invoke_transcript_harness(args, transcript, source_device)
    elif selected and retained_audio_path and args.recognition_adapter != "none":
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "transcription_submitted", reason=args.recognition_adapter, detail={"audio_path": retained_audio_path}))
        play_debug_cue(args, "transcription_submitted")
        downstream = invoke_recognition_adapter(args, retained_audio_path, source_device)
    elif selected and args.recognition_adapter != "none":
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "blocked", reason="recognition_adapter_requires_retained_audio"))

    if downstream is not None and int(downstream.get("exit_code", 0)) != 0:
        blocked_detail = {"exit_code": downstream.get("exit_code"), "stderr": downstream.get("stderr")}
        try:
            adapter_result = json.loads(downstream.get("stdout") or "{}")
            if adapter_result.get("closed"):
                blocked_detail["closed"] = adapter_result.get("closed")
        except Exception:
            pass
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "blocked", reason="recognition_downstream_closed", detail=blocked_detail))
    elif downstream is not None:
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "idle", reason="transcription_handoff_completed"))
    elif not selected:
        state_events.append(emit_state_event(runtime_root, args.pc_site_root, run_id, "idle", reason="no_speech_detected"))

    summary = {
        "schema": "narada.voice.local_monitor_run.v0",
        "run_id": run_id,
        "created_at": observed_at,
        "runtime_path": str(runtime_root),
        "source_mode": source_mode,
        "speech_detected": selected is not None,
        "segment_event_id": segment_event["event_id"],
        "segment_count": len(segments),
        "selected_segment_duration_ms": selected["duration_ms"] if selected else None,
        "rms": stats,
        "recognition_continued": downstream is not None,
        "retained_audio_path": retained_audio_path,
        "recognition_adapter": args.recognition_adapter,
        "state_event_ids": [event["event_id"] for event in state_events],
        "downstream": downstream,
    }
    write_json(runtime_root / "run.json", summary)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
