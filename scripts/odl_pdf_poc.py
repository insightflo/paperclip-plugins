#!/usr/bin/env python3
"""Run an OpenDataLoader PDF PoC and emit a compact benchmark summary.

This wrapper is intentionally thin:
- calls the official `opendataloader-pdf` CLI
- records elapsed time and stdout/stderr
- inspects generated JSON/Markdown outputs
- writes a summary JSON for R&D handoff

It does not modify the main `parse` router. The goal is reproducible evaluation.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="odl_pdf_poc",
        description="Run an OpenDataLoader PDF PoC and write a summary JSON.",
    )
    parser.add_argument("inputs", nargs="+", help="PDF file paths to process")
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory where OpenDataLoader outputs and the summary file are written",
    )
    parser.add_argument(
        "--format",
        default="json,markdown",
        help="OpenDataLoader output formats. Default: json,markdown",
    )
    parser.add_argument("--pages", help='Optional page selector, e.g. "1-2"')
    parser.add_argument("--hybrid", choices=["docling-fast"], help="Optional hybrid backend")
    parser.add_argument("--hybrid-url", help="Hybrid server URL")
    parser.add_argument("--hybrid-timeout", help="Hybrid timeout in milliseconds")
    parser.add_argument(
        "--hybrid-fallback",
        action="store_true",
        help="Opt in to Java fallback if hybrid backend fails",
    )
    parser.add_argument(
        "--summary-file",
        default="summary.json",
        help="Summary filename relative to --output-dir. Default: summary.json",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Pass --quiet to opendataloader-pdf",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    cli = shutil.which("opendataloader-pdf")
    if not cli:
        print("opendataloader-pdf is not on PATH", file=sys.stderr)
        return 127

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [cli, *args.inputs, "--output-dir", str(output_dir), "--format", args.format]
    if args.pages:
        cmd += ["--pages", args.pages]
    if args.hybrid:
        cmd += ["--hybrid", args.hybrid]
    if args.hybrid_url:
        cmd += ["--hybrid-url", args.hybrid_url]
    if args.hybrid_timeout:
        cmd += ["--hybrid-timeout", args.hybrid_timeout]
    if args.hybrid_fallback:
        cmd.append("--hybrid-fallback")
    if args.quiet:
        cmd.append("--quiet")

    started_at = time.time()
    started_perf = time.perf_counter()
    completed = subprocess.run(cmd, capture_output=True, text=True)
    elapsed_sec = round(time.perf_counter() - started_perf, 3)

    summary = {
        "tool": "opendataloader-pdf",
        "command": cmd,
        "cwd": str(Path.cwd()),
        "started_at_epoch": started_at,
        "elapsed_sec": elapsed_sec,
        "returncode": completed.returncode,
        "stdout_tail": tail(completed.stdout, 4000),
        "stderr_tail": tail(completed.stderr, 4000),
        "inputs": [str(Path(item).expanduser().resolve()) for item in args.inputs],
        "outputs": inspect_outputs(output_dir),
    }

    summary_path = output_dir / args.summary_file
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return completed.returncode


def inspect_outputs(output_dir: Path) -> dict[str, Any]:
    json_files = sorted(output_dir.glob("*.json"))
    markdown_files = sorted(output_dir.glob("*.md"))
    image_dirs = sorted(path for path in output_dir.iterdir() if path.is_dir())

    return {
        "json_files": [summarize_json(path) for path in json_files],
        "markdown_files": [summarize_markdown(path) for path in markdown_files],
        "image_dirs": [summarize_dir(path) for path in image_dirs],
    }


def summarize_json(path: Path) -> dict[str, Any]:
    summary = {
        "path": str(path),
        "size_bytes": path.stat().st_size,
        "parse_ok": False,
    }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - diagnostic only
        summary["error"] = repr(exc)
        return summary

    counter: Counter[str] = Counter()
    walk_types(payload, counter)
    summary["parse_ok"] = True
    summary["type_counts"] = dict(counter)
    if isinstance(payload, dict):
        summary["top_level_keys"] = list(payload.keys())[:12]
        summary["kids_count"] = len(payload.get("kids", [])) if isinstance(payload.get("kids"), list) else None
    elif isinstance(payload, list):
        summary["list_len"] = len(payload)
    return summary


def summarize_markdown(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    return {
        "path": str(path),
        "size_bytes": path.stat().st_size,
        "line_count": len(text.splitlines()),
        "preview": text[:600],
    }


def summarize_dir(path: Path) -> dict[str, Any]:
    files = sorted(item for item in path.rglob("*") if item.is_file())
    return {
        "path": str(path),
        "file_count": len(files),
        "sample_files": [str(item) for item in files[:10]],
    }


def walk_types(node: Any, counter: Counter[str]) -> None:
    if isinstance(node, dict):
        node_type = node.get("type") or node.get("label")
        if isinstance(node_type, str):
            counter[node_type] += 1
        for value in node.values():
            if isinstance(value, (dict, list)):
                walk_types(value, counter)
        return

    if isinstance(node, list):
        for item in node:
            walk_types(item, counter)


def tail(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


if __name__ == "__main__":
    raise SystemExit(main())
