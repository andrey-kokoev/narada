#!/usr/bin/env python3
"""
Distill a Kimi CLI session context.jsonl into a compact role-takeover artifact.

Unlike Codex's JSONL rollout files, Kimi stores structured conversation context
in ~/.kimi/sessions/{hash}/{uuid}/context.jsonl. This script reads that file
and produces a compact JSONL with telemetry stripped and large outputs truncated.

Preserves:
- User messages
- Assistant messages (thoughts + tool calls)
- Tool results (truncated)
- Session checkpoints (as boundaries)
- Token usage (aggregated)

Discards:
- Full system prompt (replaced with placeholder)
- Encrypted reasoning chains (kept but truncated)
- Large tool outputs (truncated to preview)

Usage:
    python distill_kimi_session.py \
        ~/.kimi/sessions/.../.../context.jsonl \
        ./narada-andrey.architect.distilled.jsonl \
        --max-preview 400
"""
import argparse
import json
from pathlib import Path
from typing import Any, Optional


# When True, keep only the conversation (user + assistant + tool results)
_CONVERSATION_ONLY = False

# When True, drop all tool result content entirely
_DROP_TOOL_RESULTS = False


def _truncate(text: Any, max_len: int = 400) -> str:
    if not isinstance(text, str):
        text = str(text)
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"\n... [{len(text) - max_len} chars truncated]"


def _distill_entry(obj: dict[str, Any], max_preview: int) -> Optional[dict[str, Any]]:
    role = obj.get("role", "unknown")

    # System prompt: replace with placeholder
    if role == "_system_prompt":
        content = obj.get("content", "")
        preview = _truncate(content, max_preview)
        return {
            "role": "_system_prompt",
            "content_preview": preview,
            "original_length": len(content) if isinstance(content, str) else 0,
        }

    # Checkpoints: keep as boundaries
    if role == "_checkpoint":
        return obj

    # Usage: keep for aggregate stats
    if role == "_usage":
        return obj

    # User messages: keep verbatim
    if role == "user":
        return obj

    # Tool results: truncate large content
    if role == "tool":
        if _DROP_TOOL_RESULTS:
            return {
                "role": "tool",
                "tool_call_id": obj.get("tool_call_id"),
                "status": "dropped",
            }
        content = obj.get("content", "")
        if isinstance(content, list):
            distilled_content = []
            for item in content:
                if isinstance(item, dict) and "text" in item:
                    distilled_item = dict(item)
                    distilled_item["text"] = _truncate(item["text"], max_preview)
                    distilled_content.append(distilled_item)
                else:
                    distilled_content.append(item)
            return {**obj, "content": distilled_content}
        elif isinstance(content, str):
            return {**obj, "content": _truncate(content, max_preview)}
        return obj

    # Assistant messages: truncate thoughts, cap tool calls
    if role == "assistant":
        distilled = dict(obj)
        content = distilled.get("content", [])
        if isinstance(content, list):
            distilled_content = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "think" and "think" in item:
                        distilled_item = dict(item)
                        distilled_item["think"] = _truncate(item["think"], max_preview)
                        distilled_content.append(distilled_item)
                    else:
                        distilled_content.append(item)
                else:
                    distilled_content.append(item)
            distilled["content"] = distilled_content

        # Tool calls: keep arguments but truncate huge strings
        tool_calls = distilled.get("tool_calls", [])
        if isinstance(tool_calls, list):
            distilled_tools = []
            for tc in tool_calls:
                if isinstance(tc, dict) and "function" in tc:
                    func = tc["function"]
                    if isinstance(func, dict) and "arguments" in func:
                        args = func["arguments"]
                        if isinstance(args, str) and len(args) > max_preview * 2:
                            func = dict(func)
                            func["arguments"] = _truncate(args, max_preview * 2)
                            tc = dict(tc)
                            tc["function"] = func
                distilled_tools.append(tc)
            distilled["tool_calls"] = distilled_tools

        return distilled

    # Unknown roles: pass through but warn
    return obj


def distill(input_path: str, output_path: str, max_preview: int) -> None:
    total_in = 0
    total_out = 0
    kept = 0
    dropped = 0

    with open(input_path, "r", encoding="utf-8") as fin, open(
        output_path, "w", encoding="utf-8"
    ) as fout:
        for line in fin:
            total_in += len(line.encode("utf-8"))
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                dropped += 1
                continue

            role = obj.get("role", "unknown")

            if _CONVERSATION_ONLY:
                if role not in {"user", "assistant", "tool"}:
                    dropped += 1
                    continue

            distilled = _distill_entry(obj, max_preview)
            if distilled is None:
                dropped += 1
                continue

            out_line = json.dumps(distilled, ensure_ascii=False) + "\n"
            b = len(out_line.encode("utf-8"))
            total_out += b
            fout.write(out_line)
            kept += 1

    print(f"Input:     {total_in / 1024 / 1024:.2f} MB  ({total_in} bytes)")
    print(f"Output:    {total_out / 1024 / 1024:.2f} MB  ({total_out} bytes)")
    print(f"Kept:      {kept} lines")
    print(f"Dropped:   {dropped} lines")
    print(f"Reduction: {100 * (1 - total_out / total_in):.1f}%")


def _find_latest_context_jsonl() -> Optional[str]:
    """Find the most recently modified context.jsonl under ~/.kimi/sessions."""
    sessions_dir = Path.home() / ".kimi" / "sessions"
    if not sessions_dir.exists():
        return None
    candidates = list(sessions_dir.rglob("context.jsonl"))
    if not candidates:
        return None
    latest = max(candidates, key=lambda p: p.stat().st_mtime)
    return str(latest)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Distill a Kimi CLI context.jsonl into a compact role-takeover artifact"
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Input context.jsonl path (defaults to most recent session)",
    )
    parser.add_argument("output", help="Output .jsonl path")
    parser.add_argument(
        "--max-preview",
        type=int,
        default=400,
        help="Max chars for preview truncation (default: 400)",
    )
    parser.add_argument(
        "--drop-tool-results",
        action="store_true",
        help="Discard tool result content entirely (keep only status)",
    )
    parser.add_argument(
        "--conversation-only",
        action="store_true",
        help="Keep only user/assistant/tool roles. Drops system prompt, checkpoints, and usage.",
    )
    args = parser.parse_args()

    global _DROP_TOOL_RESULTS, _CONVERSATION_ONLY
    _DROP_TOOL_RESULTS = args.drop_tool_results
    _CONVERSATION_ONLY = args.conversation_only

    input_path = args.input
    if not input_path:
        input_path = _find_latest_context_jsonl()
        if not input_path:
            print("No context.jsonl found under ~/.kimi/sessions")
            exit(1)
        print(f"Using latest session: {input_path}")

    distill(input_path, args.output, args.max_preview)


if __name__ == "__main__":
    main()
