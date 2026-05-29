#!/usr/bin/env python3
"""
Measure composition of a Codex CLI session JSONL file.

Reports size and line counts by top-level type and payload type,
helping identify where bulk lies before filtering.

Usage:
    python measure_codex_session.py ~/.codex/sessions/2026/04/25/rollout-*.jsonl
"""
import argparse
import json
from collections import defaultdict


def analyze(path: str) -> None:
    total_lines = 0
    total_bytes = 0
    type_counts = defaultdict(int)
    type_bytes = defaultdict(int)
    payload_type_counts = defaultdict(int)
    payload_type_bytes = defaultdict(int)

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            total_lines += 1
            b = len(line.encode("utf-8"))
            total_bytes += b
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            t = obj.get("type", "unknown")
            type_counts[t] += 1
            type_bytes[t] += b

            payload = obj.get("payload", {})
            if isinstance(payload, dict):
                pt = payload.get("type", "none")
                payload_type_counts[pt] += 1
                payload_type_bytes[pt] += b

    print(f"TOTAL LINES: {total_lines}")
    print(f"TOTAL SIZE: {total_bytes / 1024 / 1024:.2f} MB")
    print()
    print("=== BY TOP-LEVEL TYPE ===")
    for t, size in sorted(type_bytes.items(), key=lambda x: -x[1]):
        print(
            f"{t:20s} {type_counts[t]:7d} lines  {size/1024/1024:7.2f} MB  ({100*size/total_bytes:5.1f}%)"
        )

    print()
    print("=== BY PAYLOAD TYPE ===")
    for pt, size in sorted(payload_type_bytes.items(), key=lambda x: -x[1]):
        print(
            f"{pt:25s} {payload_type_counts[pt]:7d} lines  {size/1024/1024:7.2f} MB  ({100*size/total_bytes:5.1f}%)"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze Codex session JSONL composition"
    )
    parser.add_argument("path", help="Path to .jsonl session file")
    args = parser.parse_args()
    analyze(args.path)


if __name__ == "__main__":
    main()
