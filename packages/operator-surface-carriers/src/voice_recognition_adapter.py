#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path


def event_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


def normalize(text):
    return " ".join((text or "").split())


def invoke_harness(args, transcript, source_device):
    harness = Path(args.user_site_root) / "tools" / "operator-surface-carriers" / "Invoke-VoiceIntentCapturePrototype.ps1"
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


def local_whisper(audio_file):
    try:
        import whisper  # type: ignore
    except Exception as exc:
        return None, {
            "status": "closed",
            "reason": "local_whisper_unavailable",
            "detail": str(exc),
            "repair": "Install a complete local Whisper runtime, including torch, before admitting this provider.",
        }

    try:
        model = whisper.load_model("base")
        result = model.transcribe(str(audio_file))
        return normalize(result.get("text", "")), None
    except Exception as exc:
        return None, {
            "status": "closed",
            "reason": "local_whisper_transcription_failed",
            "detail": str(exc),
        }


def openai_transcription(audio_file, model):
    if not os.environ.get("OPENAI_API_KEY"):
        return None, {
            "status": "closed",
            "reason": "openai_api_key_missing",
            "repair": "Set OPENAI_API_KEY in the process environment or configure an admitted secret provider before using this adapter.",
        }

    try:
        from openai import OpenAI  # type: ignore
    except Exception as exc:
        return None, {
            "status": "closed",
            "reason": "openai_package_unavailable",
            "detail": str(exc),
        }

    try:
        client = OpenAI()
        with open(audio_file, "rb") as source:
            result = client.audio.transcriptions.create(model=model, file=source)
        text = result.text if hasattr(result, "text") else str(result)
        return normalize(text), None
    except Exception as exc:
        return None, {
            "status": "closed",
            "reason": "openai_transcription_failed",
            "detail": str(exc),
        }


def cloudflare_worker_transcription(audio_file):
    url = os.environ.get("HARMONIA_VOICE_TRANSCRIPTION_URL", "https://harmonia-voice-transcription.andrei-kokoev.workers.dev/transcribe")
    token = os.environ.get("HARMONIA_VOICE_TRANSCRIPTION_TOKEN")
    if not token:
        return None, {
            "status": "closed",
            "reason": "harmonia_voice_transcription_token_missing",
            "repair": "Set HARMONIA_VOICE_TRANSCRIPTION_TOKEN in the process environment or configure an admitted secret provider.",
        }

    try:
        body = Path(audio_file).read_bytes()
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "content-type": "audio/wav",
                "authorization": f"Bearer {token}",
                "user-agent": "narada-voice-recognition-adapter/0.1",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return None, {
            "status": "closed",
            "reason": "harmonia_voice_transcription_http_error",
            "detail": f"HTTP {exc.code}: {detail}",
        }
    except Exception as exc:
        return None, {
            "status": "closed",
            "reason": "harmonia_voice_transcription_failed",
            "detail": str(exc),
        }

    if not payload.get("ok"):
        return None, {
            "status": "closed",
            "reason": "harmonia_voice_transcription_rejected",
            "detail": payload,
        }

    data = payload.get("data") or {}
    return normalize(data.get("text", "")), None


def main():
    parser = argparse.ArgumentParser(description="Narada voice recognition adapter.")
    parser.add_argument("--audio-file", default="")
    parser.add_argument(
        "--adapter",
        choices=["local-whisper", "openai-transcriptions", "cloudflare-worker", "transcript-text", "transcript-file"],
        required=True,
    )
    parser.add_argument("--transcript-text", default="")
    parser.add_argument("--transcript-file", default="")
    parser.add_argument("--openai-model", default="gpt-4o-mini-transcribe")
    parser.add_argument("--source-device", default="unknown_voice_source")
    parser.add_argument("--user-site-root", default=os.environ.get("NARADA_USER_SITE_ROOT", str(Path.home() / "Narada")))
    parser.add_argument("--pc-site-root", default=os.environ.get("NARADA_PC_SITE_ROOT", r"C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"))
    parser.add_argument("--continue-to-intent", action="store_true")
    parser.add_argument("--dispatch-dry-run", action="store_true")
    args = parser.parse_args()

    audio_file = Path(args.audio_file) if args.audio_file else None
    if args.adapter in ("local-whisper", "openai-transcriptions", "cloudflare-worker"):
        if not audio_file or not audio_file.exists():
            print(json.dumps({
                "schema": "narada.voice.recognition_adapter_result.v0",
                "status": "closed",
                "reason": "audio_file_missing",
                "audio_file": str(audio_file) if audio_file else None,
            }, indent=2))
            return 3

    transcript = None
    closed = None
    provider = {
        "adapter": args.adapter,
        "remote": args.adapter in ("openai-transcriptions", "cloudflare-worker"),
    }

    if args.adapter == "local-whisper":
        transcript, closed = local_whisper(audio_file)
    elif args.adapter == "openai-transcriptions":
        provider["model"] = args.openai_model
        transcript, closed = openai_transcription(audio_file, args.openai_model)
    elif args.adapter == "cloudflare-worker":
        provider["url"] = os.environ.get(
            "HARMONIA_VOICE_TRANSCRIPTION_URL",
            "https://harmonia-voice-transcription.andrei-kokoev.workers.dev/transcribe",
        )
        provider["model"] = "@cf/openai/whisper"
        transcript, closed = cloudflare_worker_transcription(audio_file)
    elif args.adapter == "transcript-text":
        transcript = normalize(args.transcript_text)
    elif args.adapter == "transcript-file":
        if not args.transcript_file:
            closed = {"status": "closed", "reason": "transcript_file_missing"}
        else:
            transcript = normalize(Path(args.transcript_file).read_text(encoding="utf-8"))

    result = {
        "schema": "narada.voice.recognition_adapter_result.v0",
        "event_id": event_id("recognition_adapter"),
        "status": "closed" if closed else "transcribed",
        "provider": provider,
        "audio_file": str(audio_file) if audio_file else None,
        "transcript": {
            "text": transcript,
            "present": bool(transcript),
        },
        "closed": closed,
        "privacy": {
            "remote_audio_allowed": args.adapter in ("openai-transcriptions", "cloudflare-worker"),
            "remote_audio_provider": (
                "openai"
                if args.adapter == "openai-transcriptions"
                else "cloudflare-workers-ai"
                if args.adapter == "cloudflare-worker"
                else None
            ),
            "raw_audio_retained_by_adapter": False,
        },
        "downstream": None,
    }

    if transcript and args.continue_to_intent:
        result["downstream"] = invoke_harness(args, transcript, args.source_device)

    print(json.dumps(result, indent=2))
    return 0 if transcript else 3


if __name__ == "__main__":
    sys.exit(main())
