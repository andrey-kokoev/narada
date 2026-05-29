#!/usr/bin/env python3
"""
Convert a distilled Codex conversation JSONL into a readable markdown chapter.

Groups turns around user inputs, filters commentary noise, and preserves the
meta-architectural evolution: decisions, pivots, user intent, and conceptual
framework changes.

Usage:
    python convert_codex_conversation_to_markdown.py \
        ./narada-andrey.architect.conv-only.jsonl \
        ./.ai/chapters/20260425-narada-andrey-architect-evolution.md
"""
import argparse
import json
from datetime import datetime
from typing import Any


def _extract_text(payload: dict[str, Any]) -> str:
    """Pull readable text from message payloads."""
    if not isinstance(payload, dict):
        return str(payload)

    # user_message / agent_message
    if "message" in payload:
        return str(payload["message"])

    # message with content array
    content = payload.get("content", [])
    if isinstance(content, list):
        texts = []
        for block in content:
            if isinstance(block, dict):
                t = block.get("type", "")
                if t == "input_text":
                    texts.append(block.get("text", ""))
                elif t == "text":
                    texts.append(block.get("text", ""))
        return "\n".join(texts)

    return ""


def _is_system_injection(text: str) -> bool:
    """Detect repeated Codex system prompt injections."""
    markers = [
        "<permissions instructions>",
        "<collaboration_mode>",
        "<apps_instructions>",
        "<skills_instructions>",
        "<environment_context>",
    ]
    return any(m in text for m in markers)


def _is_real_user_message(payload: dict[str, Any]) -> bool:
    """True if this is an actual user turn, not a system injection."""
    text = _extract_text(payload)
    if not text:
        return False
    return not _is_system_injection(text)


def convert(input_path: str, output_path: str) -> None:
    events: list[dict[str, Any]] = []

    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            payload = obj.get("payload", {})
            pt = payload.get("type", "none")
            if pt not in {"message", "agent_message", "user_message"}:
                continue

            text = _extract_text(payload)
            if not text or _is_system_injection(text):
                continue

            events.append({
                "timestamp": obj.get("timestamp", ""),
                "type": pt,
                "role": payload.get("role", ""),
                "phase": payload.get("phase", ""),
                "text": text,
            })

    # Group into turns: each user message starts a new turn
    turns: list[dict[str, Any]] = []
    current_turn: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal current_turn
        if current_turn and (current_turn["user"] or current_turn["responses"]):
            turns.append(current_turn)
        current_turn = None

    for ev in events:
        is_user = (ev["type"] == "user_message" or
                   (ev["type"] == "message" and ev["role"] == "user"))

        if is_user:
            flush()
            current_turn = {
                "timestamp": ev["timestamp"],
                "user": ev["text"],
                "responses": [],
            }
        else:
            if current_turn is None:
                # orphan agent message before first user message
                current_turn = {
                    "timestamp": ev["timestamp"],
                    "user": None,
                    "responses": [],
                }
            current_turn["responses"].append(ev)

    flush()

    # Generate markdown
    lines: list[str] = []
    lines.append("# Narada-Andrey.Architect: Meta-Architectural Evolution")
    lines.append("")
    lines.append(f"*Extracted from Codex session on {datetime.now().isoformat()}Z*")
    lines.append("")
    lines.append("## Session Arc")
    lines.append("")
    lines.append(
        "This chapter captures the high-level conceptual evolution of the "
        "`narada-andrey.architect` session. It preserves the meta-architecture "
        "of decisions, intent shifts, and design trajectories — not implementation "
        "details."
    )
    lines.append("")

    for i, turn in enumerate(turns, 1):
        ts = turn["timestamp"]
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                ts_str = dt.strftime("%Y-%m-%d %H:%M UTC")
            except Exception:
                ts_str = ts
        else:
            ts_str = "unknown"

        lines.append("---")
        lines.append("")
        lines.append(f"### Turn {i} — {ts_str}")
        lines.append("")

        if turn["user"]:
            lines.append("**User Intent:**")
            lines.append("")
            lines.append(turn["user"])
            lines.append("")

        # Separate final answers from commentary
        finals = [r for r in turn["responses"] if r["phase"] == "final_answer"]
        commentaries = [r for r in turn["responses"] if r["phase"] != "final_answer"]

        if finals:
            # If there are multiple finals, concatenate; usually there's one
            text = "\n\n".join(f["text"] for f in finals)
            lines.append("**Architect Response:**")
            lines.append("")
            lines.append(text)
            lines.append("")

        if commentaries:
            # Only keep commentary that reveals a decision or pivot
            filtered = [c["text"] for c in commentaries if len(c["text"].strip()) > 20]
            if filtered:
                lines.append("**Architect Commentary (selected):**")
                lines.append("")
                for c in filtered[:3]:
                    lines.append(f"- {c.strip()}")
                lines.append("")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Turns extracted: {len(turns)}")
    print(f"Output written: {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert distilled Codex conversation into a narrative markdown chapter"
    )
    parser.add_argument("input", help="Input distilled .jsonl path")
    parser.add_argument("output", help="Output .md path")
    args = parser.parse_args()
    convert(args.input, args.output)


if __name__ == "__main__":
    main()
