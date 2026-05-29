#!/usr/bin/env python3
"""
Measure a Kimi CLI session from its context.jsonl.

Reports turn count, message counts by role, tool call counts,
token usage trajectory, and file operation inventory.

Usage:
    python measure_kimi_session.py ~/.kimi/sessions/.../.../context.jsonl
    python measure_kimi_session.py --all-sessions
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


def _find_all_sessions() -> list[Path]:
    sessions_dir = Path.home() / ".kimi" / "sessions"
    if not sessions_dir.exists():
        return []
    return list(sessions_dir.rglob("context.jsonl"))


def _extract_file_paths_from_args(args_str: str) -> list[str]:
    """Heuristically extract file paths from Shell tool arguments JSON string."""
    paths = []
    try:
        obj = json.loads(args_str)
        if isinstance(obj, dict):
            for key in ("command", "path", "src", "dest", "old", "new"):
                val = obj.get(key)
                if isinstance(val, str):
                    # Very rough path extraction
                    for token in val.split():
                        if "/" in token or "\\" in token or "." in token:
                            if len(token) > 3:
                                paths.append(token.strip('"\''))
    except Exception:
        pass
    return paths


def measure(input_path: str) -> dict:
    stats = {
        "file": input_path,
        "total_lines": 0,
        "turns": 0,
        "messages_by_role": {},
        "tool_calls": 0,
        "tool_calls_by_name": {},
        "token_usage_points": [],
        "max_token_count": 0,
        "files_read": set(),
        "files_written": set(),
        "files_edited": set(),
        "checkpoints": 0,
        "session_start": None,
        "session_end": None,
    }

    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            stats["total_lines"] += 1
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            role = obj.get("role", "unknown")
            stats["messages_by_role"][role] = stats["messages_by_role"].get(role, 0) + 1

            if role == "user":
                stats["turns"] += 1

            elif role == "_checkpoint":
                stats["checkpoints"] += 1

            elif role == "_usage":
                tokens = obj.get("token_count", 0)
                stats["token_usage_points"].append(tokens)
                if tokens > stats["max_token_count"]:
                    stats["max_token_count"] = tokens

            elif role == "assistant":
                tool_calls = obj.get("tool_calls", [])
                if isinstance(tool_calls, list):
                    for tc in tool_calls:
                        if not isinstance(tc, dict):
                            continue
                        func = tc.get("function", {})
                        if not isinstance(func, dict):
                            continue
                        name = func.get("name", "unknown")
                        stats["tool_calls"] += 1
                        stats["tool_calls_by_name"][name] = stats["tool_calls_by_name"].get(name, 0) + 1
                        args = func.get("arguments", "")
                        if isinstance(args, str):
                            if name in ("ReadFile", "ReadMediaFile", "Glob"):
                                for p in _extract_file_paths_from_args(args):
                                    stats["files_read"].add(p)
                            elif name in ("WriteFile",):
                                for p in _extract_file_paths_from_args(args):
                                    stats["files_written"].add(p)
                            elif name in ("StrReplaceFile",):
                                for p in _extract_file_paths_from_args(args):
                                    stats["files_edited"].add(p)
                            elif name == "Shell":
                                # Shell may read/write files; record as reads for now
                                for p in _extract_file_paths_from_args(args):
                                    if any(cmd in p for cmd in ("cat ", "type ", "Get-Content", "read")):
                                        stats["files_read"].add(p)

    # Convert sets to sorted lists for JSON serialization
    stats["files_read"] = sorted(stats["files_read"])
    stats["files_written"] = sorted(stats["files_written"])
    stats["files_edited"] = sorted(stats["files_edited"])

    return stats


def _print_stats(stats: dict) -> None:
    print(f"File:              {stats['file']}")
    print(f"Total JSONL lines: {stats['total_lines']}")
    print(f"User turns:        {stats['turns']}")
    print(f"Checkpoints:       {stats['checkpoints']}")
    print(f"Messages by role:")
    for role, count in sorted(stats["messages_by_role"].items()):
        print(f"  {role}: {count}")
    print(f"Tool calls:        {stats['tool_calls']}")
    if stats["tool_calls_by_name"]:
        print("  By tool:")
        for name, count in sorted(stats["tool_calls_by_name"].items(), key=lambda x: -x[1]):
            print(f"    {name}: {count}")
    print(f"Token usage points: {len(stats['token_usage_points'])}")
    if stats["token_usage_points"]:
        print(f"  Max: {stats['max_token_count']}")
        print(f"  Last: {stats['token_usage_points'][-1]}")
    print(f"Files read:        {len(stats['files_read'])}")
    for p in stats["files_read"][:10]:
        print(f"    {p}")
    if len(stats["files_read"]) > 10:
        print(f"    ... and {len(stats['files_read']) - 10} more")
    print(f"Files written:     {len(stats['files_written'])}")
    for p in stats["files_written"][:10]:
        print(f"    {p}")
    if len(stats["files_written"]) > 10:
        print(f"    ... and {len(stats['files_written']) - 10} more")
    print(f"Files edited:      {len(stats['files_edited'])}")
    for p in stats["files_edited"][:10]:
        print(f"    {p}")
    if len(stats["files_edited"]) > 10:
        print(f"    ... and {len(stats['files_edited']) - 10} more")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Measure a Kimi CLI session from its context.jsonl"
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Input context.jsonl path (defaults to most recent session)",
    )
    parser.add_argument(
        "--all-sessions",
        action="store_true",
        help="Measure all sessions under ~/.kimi/sessions",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON instead of human-readable text",
    )
    args = parser.parse_args()

    if args.all_sessions:
        sessions = _find_all_sessions()
        if not sessions:
            print("No sessions found under ~/.kimi/sessions")
            exit(1)
        all_stats = []
        for session_path in sorted(sessions):
            stats = measure(str(session_path))
            all_stats.append(stats)
        if args.json:
            print(json.dumps(all_stats, indent=2))
        else:
            for stats in all_stats:
                _print_stats(stats)
                print()
        return

    input_path = args.input
    if not input_path:
        input_path = _find_latest_context_jsonl()
        if not input_path:
            print("No context.jsonl found under ~/.kimi/sessions")
            exit(1)
        print(f"Using latest session: {input_path}\n")

    stats = measure(input_path)
    if args.json:
        print(json.dumps(stats, indent=2))
    else:
        _print_stats(stats)


if __name__ == "__main__":
    main()
