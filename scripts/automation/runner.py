#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import fcntl

ROOT = Path(__file__).resolve().parents[2]
JOBS_DIR = ROOT / "logs" / "jobs"
REGISTRY_PATH = JOBS_DIR / "registry.json"
KST = ZoneInfo("Asia/Seoul")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from routine_common import get_telegram_sender, load_project_env


def now_kst() -> datetime:
    return datetime.now(KST)


def trim_output(text: str | None, limit: int = 4000) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[-limit:]


def ensure_dirs() -> None:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)


def json_log_path(job: str, stamp: datetime) -> Path:
    return JOBS_DIR / f"{job}_{stamp.strftime('%Y%m%d')}.jsonl"


def lock_path(job: str) -> Path:
    return JOBS_DIR / f"{job}.lock"


def load_registry() -> dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {}
    try:
        payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def save_registry(payload: dict[str, Any]) -> None:
    tmp_path = REGISTRY_PATH.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(REGISTRY_PATH)


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def update_registry(
    *,
    job: str,
    status: str,
    exit_code: int,
    command: list[str],
    duration_sec: float,
    stdout: str = "",
    stderr: str = "",
    alert_threshold: int,
) -> dict[str, Any]:
    registry = load_registry()
    entry = registry.get(job, {})
    if not isinstance(entry, dict):
        entry = {}

    timestamp = now_kst().isoformat(timespec="seconds")
    entry.update(
        {
            "job": job,
            "last_run_at": timestamp,
            "last_status": status,
            "last_exit_code": exit_code,
            "last_duration_sec": round(duration_sec, 3),
            "last_command": command,
            "last_stdout": stdout,
            "last_stderr": stderr,
        }
    )

    if status == "success":
        entry["last_success"] = timestamp
        entry["consecutive_failures"] = 0
    elif status in {"failure", "timeout"}:
        entry["last_failure"] = timestamp
        entry["consecutive_failures"] = int(entry.get("consecutive_failures", 0)) + 1
    elif status == "lock_conflict":
        entry["last_lock_conflict"] = timestamp

    if int(entry.get("consecutive_failures", 0)) >= alert_threshold:
        entry["last_alert_candidate_at"] = timestamp

    registry[job] = entry
    save_registry(registry)
    return entry


def maybe_send_failure_alert(
    *,
    job: str,
    entry: dict[str, Any],
    status: str,
    command: list[str],
    stderr: str,
    alert_threshold: int,
) -> None:
    failures = int(entry.get("consecutive_failures", 0))
    if status not in {"failure", "timeout"} or failures < alert_threshold:
        return

    sender = get_telegram_sender()
    if sender is None:
        return

    tail = trim_output(stderr, 600) or "(no stderr)"
    message = "\n".join(
        [
            f"[runner] {job} failure alert",
            f"consecutive_failures: {failures}",
            f"status: {status}",
            f"command: {' '.join(command)}",
            f"stderr: {tail}",
        ]
    )
    if sender(message):
        registry = load_registry()
        current = registry.get(job, {})
        if isinstance(current, dict):
            current["last_alert_at"] = now_kst().isoformat(timespec="seconds")
            current["last_alert_failures"] = failures
            registry[job] = current
            save_registry(registry)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Common job runner with lock/timeout/retry.")
    parser.add_argument("--job", required=True, help="Logical job name")
    parser.add_argument("--timeout", type=int, default=120, help="Per-attempt timeout seconds")
    parser.add_argument(
        "--retries",
        type=int,
        default=1,
        help="Retry count after the initial attempt",
    )
    parser.add_argument(
        "--backoff-base",
        type=int,
        default=5,
        help="Base seconds for exponential backoff",
    )
    parser.add_argument(
        "--alert-threshold",
        type=int,
        default=3,
        help="Send telegram alert when consecutive failures reach this threshold",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command after --, for example: -- python script.py",
    )
    args = parser.parse_args()
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if not args.command:
        parser.error("missing command after --")
    return args


def acquire_lock(job: str) -> tuple[int, Any] | tuple[None, None]:
    lock_file = lock_path(job)
    lock_file.touch(exist_ok=True)
    handle = lock_file.open("r+", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None, None
    return handle.fileno(), handle


def run_attempt(command: list[str], timeout: int) -> tuple[str, int | None, str, str, float]:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=os.environ.copy(),
        )
        duration = time.monotonic() - started
        status = "success" if completed.returncode == 0 else "failure"
        return (
            status,
            completed.returncode,
            trim_output(completed.stdout),
            trim_output(completed.stderr),
            duration,
        )
    except subprocess.TimeoutExpired as exc:
        duration = time.monotonic() - started
        return (
            "timeout",
            None,
            trim_output(exc.stdout),
            trim_output(exc.stderr),
            duration,
        )


def main() -> int:
    load_project_env()
    ensure_dirs()
    args = parse_args()

    stamp = now_kst()
    log_path = json_log_path(args.job, stamp)
    acquired_fd, lock_handle = acquire_lock(args.job)

    if lock_handle is None:
        payload = {
            "ts": stamp.isoformat(timespec="seconds"),
            "event": "lock_conflict",
            "job": args.job,
            "command": args.command,
        }
        append_jsonl(log_path, payload)
        update_registry(
            job=args.job,
            status="lock_conflict",
            exit_code=3,
            command=args.command,
            duration_sec=0.0,
            alert_threshold=args.alert_threshold,
        )
        return 3

    append_jsonl(
        log_path,
        {
            "ts": stamp.isoformat(timespec="seconds"),
            "event": "run_started",
            "job": args.job,
            "timeout_sec": args.timeout,
            "retries": args.retries,
            "backoff_base_sec": args.backoff_base,
            "command": args.command,
        },
    )

    max_attempts = max(1, args.retries + 1)
    final_status = "failure"
    final_exit_code = 1
    final_stdout = ""
    final_stderr = ""
    total_duration = 0.0

    try:
        for attempt in range(1, max_attempts + 1):
            status, returncode, stdout, stderr, duration = run_attempt(args.command, args.timeout)
            total_duration += duration
            event = {
                "ts": now_kst().isoformat(timespec="seconds"),
                "event": "attempt_finished",
                "job": args.job,
                "attempt": attempt,
                "max_attempts": max_attempts,
                "status": status,
                "returncode": returncode,
                "duration_sec": round(duration, 3),
                "stdout": stdout,
                "stderr": stderr,
            }
            append_jsonl(log_path, event)

            final_status = status
            final_stdout = stdout
            final_stderr = stderr

            if status == "success":
                final_exit_code = 0
                break

            final_exit_code = 2 if status == "timeout" else 1
            if attempt >= max_attempts:
                break

            backoff = args.backoff_base * (2 ** (attempt - 1))
            append_jsonl(
                log_path,
                {
                    "ts": now_kst().isoformat(timespec="seconds"),
                    "event": "retry_scheduled",
                    "job": args.job,
                    "attempt": attempt,
                    "sleep_sec": backoff,
                },
            )
            time.sleep(backoff)
    finally:
        if acquired_fd is not None and lock_handle is not None:
            fcntl.flock(acquired_fd, fcntl.LOCK_UN)
            lock_handle.close()

    entry = update_registry(
        job=args.job,
        status=final_status,
        exit_code=final_exit_code,
        command=args.command,
        duration_sec=total_duration,
        stdout=final_stdout,
        stderr=final_stderr,
        alert_threshold=args.alert_threshold,
    )
    maybe_send_failure_alert(
        job=args.job,
        entry=entry,
        status=final_status,
        command=args.command,
        stderr=final_stderr,
        alert_threshold=args.alert_threshold,
    )
    append_jsonl(
        log_path,
        {
            "ts": now_kst().isoformat(timespec="seconds"),
            "event": "run_finished",
            "job": args.job,
            "status": final_status,
            "exit_code": final_exit_code,
            "duration_sec": round(total_duration, 3),
        },
    )
    return final_exit_code


if __name__ == "__main__":
    raise SystemExit(main())
