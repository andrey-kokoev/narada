#!/usr/bin/env python3
"""
Convert a Kimi CLI context.jsonl into a readable Markdown transcript.

Usage:
    python convert_kimi_conversation_to_markdown.py \
        ~/.kimi/sessions/.../.../context.jsonl \
        ./session.md
"""
import argparse
import json
from pathlib import Path
from typing import Optional


def _find_latest_context_jsonl() -> Optional[str]:
    sessions_dir = Path.home() / ".kimi" / "sessions"
    if not sessions_dir.exists():
        return None
    candidates = list(sessions_dir.rglob("context.jsonl"))
    if not candidates:
        return None
    latest = max(candidates, key=lambda p: p.stat().st_mtime)
    return str(latest)


def _render_content(content) -> str:
    """Render assistant content array to markdown string."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content)
    parts = []
    for item in content:
        if not isinstance(item, dict):
            parts.append(str(item))
            continue
        item_type = item.get("type", "")
        if item_type == "think":
            think_text = item.get("think", "")
            parts.append(f"<thinking>\n{think_text}\n</thinking>")
        elif item_type == "text":
            parts.append(item.get("text", ""))
        else:
            parts.append(str(item))
    return "\n\n".join(parts)


def _render_tool_calls(tool_calls) -> str:
    """Render tool calls as markdown code blocks."""
    if not isinstance(tool_calls, list) or not tool_calls:
        return ""
    lines = ["\n**Tool calls:**"]
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        func = tc.get("function", {})
        name = func.get("name", "unknown") if isinstance(func, dict) else "unknown"
        args = func.get("arguments", "") if isinstance(func, dict) else ""
        tc_id = tc.get("id", "")
        lines.append(f"\n- `{name}` (`{tc_id}`)")
        lines.append(f"```json\n{args}\n```")
    return "\n".join(lines)


def _render_tool_result(obj) -> str:
    """Render a tool result entry."""
    content = obj.get("content", "")
    tc_id = obj.get("tool_call_id", "")
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict) and "text" in item:
                texts.append(item["text"])
            else:
                texts.append(str(item))
        content = "\n".join(texts)
    elif not isinstance(content, str):
        content = str(content)
    preview = content[:800]
    if len(content) > 800:
        preview += f"\n\n... [{len(content) - 800} chars truncated]"
    return f"**Tool result** (`{tc_id}`):\n```\n{preview}\n```"


def convert(input_path: str, output_path: str) -> None:
    lines = []
    lines.append("# Kimi Session Transcript\n")
    lines.append(f"*Source: `{input_path}`*\n")

    turn_count = 0
    message_count = 0
    tool_call_count = 0

    with open(input_path, "r", encoding="utf-8") as f:
        for raw_line in f:
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                obj = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            role = obj.get("role", "unknown")

            if role == "_system_prompt":
                content = obj.get("content", "")
                preview = content[:500]
                if len(content) > 500:
                    preview += f"\n... [{len(content) - 500} chars truncated]"
                lines.append("## System Prompt\n")
                lines.append(f"```\n{preview}\n```\n")

            elif role == "_checkpoint":
                cid = obj.get("id", "?")
                lines.append(f"\n---\n*Checkpoint {cid}*\n---\n")

            elif role == "user":
                turn_count += 1
                message_count += 1
                content = obj.get("content", "")
                if isinstance(content, list):
                    texts = []
                    for item in content:
                        if isinstance(item, dict) and "text" in item:
                            texts.append(item["text"])
                        else:
                            texts.append(str(item))
                    content = "\n".join(texts)
                elif not isinstance(content, str):
                    content = str(content)
                lines.append(f"## Turn {turn_count} — User\n")
                lines.append(f"{content}\n")

            elif role == "assistant":
                message_count += 1
                content = _render_content(obj.get("content"))
                tool_calls = obj.get("tool_calls", [])
                if tool_calls:
                    tool_call_count += len(tool_calls)
                tool_section = _render_tool_calls(tool_calls)
                lines.append(f"## Turn {turn_count} — Assistant\n")
                lines.append(f"{content}{tool_section}\n")

            elif role == "tool":
                message_count += 1
                lines.append(_render_tool_result(obj) + "\n")

            elif role == "_usage":
                tokens = obj.get("token_count", "?")
                lines.append(f"\n*Tokens: {tokens}*\n")

    lines.append(f"\n---\n**Summary:** {turn_count} turns, {message_count} messages, {tool_call_count} tool calls.\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Wrote {turn_count} turns, {message_count} messages, {tool_call_count} tool calls to {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a Kimi CLI context.jsonl into a Markdown transcript"
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Input context.jsonl path (defaults to most recent session)",
    )
    parser.add_argument("output", help="Output .md path")
    args = parser.parse_args()

    input_path = args.input
    if not input_path:
        input_path = _find_latest_context_jsonl()
        if not input_path:
            print("No context.jsonl found under ~/.kimi/sessions")
            exit(1)
        print(f"Using latest session: {input_path}")

    convert(input_path, args.output)


if __name__ == "__main__":
    main()
