#!/usr/bin/env python3
"""
Distill a Codex CLI session JSONL into a compact role-takeover artifact.

Preserves:
- Conversation (user / assistant / developer messages)
- Agent lifecycle events (task start/complete, thread names)
- Tool calls (what was invoked and with what arguments)
- File edits (patch_apply_end)
- A brief trail of command outputs and function results

Discards:
- Repeated system telemetry (token_count, turn_context)
- Encrypted reasoning chains
- Full stdout/stderr dumps from exploratory commands
- Context compaction blobs

Usage:
    python distill_codex_session.py ~/.codex/sessions/.../rollout-*.jsonl \
                                    ./andrey-user.architect.distilled.jsonl \
                                    --max-preview 400
"""
import argparse
import json
from typing import Any, Optional


# Payload types we always keep verbatim (usually small and semantically load-bearing)
_KEEP_VERBATIM_PAYLOAD = {
    "message",
    "user_message",
    "agent_message",
    "thread_name_updated",
    "task_started",
    "task_complete",
    "turn_aborted",
    "context_compacted",
    "custom_tool_call",
    "web_search_call",
    "web_search_end",
    "tool_search_call",
    "tool_search_output",
    "view_image_tool_call",
}

# Top-level types we drop entirely
_DISCARD_TOP_LEVEL = {"turn_context", "compacted"}

# Payload types we drop entirely
_DISCARD_PAYLOAD = {"token_count", "reasoning"}

# When True, shell command outputs are dropped entirely (not even a trail)
_DROP_COMMANDS = False

# When True, keep only the conversation transcript (messages + agent/user messages)
_CONVERSATION_ONLY = False


def _truncate(text: Any, max_len: int = 400) -> str:
    if not isinstance(text, str):
        text = str(text)
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"\n... [{len(text) - max_len} chars truncated]"


def _distill_payload(obj: dict[str, Any], max_preview: int) -> Optional[dict[str, Any]]:
    top_type = obj.get("type", "unknown")
    payload = obj.get("payload")

    # Strip base_instructions from session_meta
    if top_type == "session_meta" and isinstance(payload, dict):
        distilled_payload = dict(payload)
        if "base_instructions" in distilled_payload:
            del distilled_payload["base_instructions"]
        return {**obj, "payload": distilled_payload}

    if not isinstance(payload, dict):
        return obj

    pt = payload.get("type", "none")

    if pt in _DISCARD_PAYLOAD:
        return None

    if _CONVERSATION_ONLY:
        if pt in {"message", "agent_message", "user_message"}:
            return obj
        return None

    if _DROP_COMMANDS and pt == "exec_command_end":
        return None

    if pt in _KEEP_VERBATIM_PAYLOAD:
        return obj

    # Tool calls: keep arguments but truncate any huge string fields
    if pt == "function_call":
        distilled = dict(payload)
        args = distilled.get("arguments")
        if isinstance(args, dict):
            for k, v in list(args.items()):
                if isinstance(v, str) and len(v) > max_preview:
                    args[k] = _truncate(v, max_preview)
        return {**obj, "payload": distilled}

    # Tool outputs: keep status and a preview only
    if pt == "function_call_output":
        distilled = {
            "type": pt,
            "call_id": payload.get("call_id"),
            "status": "ok" if payload.get("error") is None else "error",
        }
        if payload.get("error"):
            distilled["error_preview"] = _truncate(payload["error"], max_preview // 2)
        output = payload.get("output") or payload.get("content") or ""
        distilled["output_preview"] = _truncate(output, max_preview)
        return {**obj, "payload": distilled}

    # Shell commands: keep command preview, exit code, brief output
    if pt == "exec_command_end":
        cmd = payload.get("command", [])
        cmd_preview = cmd if isinstance(cmd, str) else json.dumps(cmd)
        distilled = {
            "type": pt,
            "call_id": payload.get("call_id"),
            "command_preview": _truncate(cmd_preview, max_preview),
            "exit_code": payload.get("exit_code"),
        }
        out = payload.get("aggregated_output") or payload.get("stdout") or ""
        if out:
            distilled["output_preview"] = _truncate(out, max_preview)
        return {**obj, "payload": distilled}

    # File edits: usually small; keep but cap diff size
    if pt == "patch_apply_end":
        distilled = dict(payload)
        changes = distilled.get("changes", {})
        if isinstance(changes, dict):
            for path, change in list(changes.items()):
                if isinstance(change, dict) and isinstance(change.get("unified_diff"), str):
                    diff = change["unified_diff"]
                    if len(diff) > max_preview * 2:
                        change["unified_diff"] = _truncate(diff, max_preview * 2)
        return {**obj, "payload": distilled}

    # Custom tool outputs: distill
    if pt == "custom_tool_call_output":
        distilled = dict(payload)
        if "output" in distilled:
            distilled["output_preview"] = _truncate(distilled.pop("output"), max_preview)
        return {**obj, "payload": distilled}

    # Default: pass through but warn if unknown
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

            top_type = obj.get("type", "unknown")

            if top_type in _DISCARD_TOP_LEVEL:
                dropped += 1
                continue

            # event_msg filter: only keep known valuable types
            if top_type == "event_msg":
                pt = obj.get("payload", {}).get("type", "none")
                if pt not in _KEEP_VERBATIM_PAYLOAD and pt not in {
                    "exec_command_end",
                    "function_call",
                    "function_call_output",
                    "patch_apply_end",
                    "custom_tool_call",
                    "custom_tool_call_output",
                }:
                    dropped += 1
                    continue

            distilled = _distill_payload(obj, max_preview)
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Distill a Codex session JSONL into a compact role-takeover artifact"
    )
    parser.add_argument("input", help="Input .jsonl path")
    parser.add_argument("output", help="Output .jsonl path")
    parser.add_argument(
        "--max-preview",
        type=int,
        default=400,
        help="Max chars for preview truncation (default: 400)",
    )
    parser.add_argument(
        "--drop-commands",
        action="store_true",
        help="Discard exec_command_end events entirely (no shell command trail)",
    )
    parser.add_argument(
        "--conversation-only",
        action="store_true",
        help="Keep only the conversation (message, agent_message, user_message). "
             "Drops all tool calls, file edits, and task events.",
    )
    args = parser.parse_args()

    global _DROP_COMMANDS, _CONVERSATION_ONLY
    _DROP_COMMANDS = args.drop_commands
    _CONVERSATION_ONLY = args.conversation_only

    distill(args.input, args.output, args.max_preview)


if __name__ == "__main__":
    main()
