#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import logging
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT / "scripts"
VENV_PYTHON = ROOT / "venv" / "bin" / "python"
LOG_DIR = ROOT / "logs"
KST = ZoneInfo("Asia/Seoul")


def now_kst() -> datetime:
    return datetime.now(KST)


def configure_logging(log_file: Path) -> logging.Logger:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(logging.INFO)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(formatter)

    root_logger.addHandler(stream_handler)
    root_logger.addHandler(file_handler)
    return root_logger


def load_project_env() -> None:
    path_prefix = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ]
    existing = os.environ.get("PATH", "")
    merged = path_prefix + ([existing] if existing else [])
    os.environ["PATH"] = ":".join(part for part in merged if part)

    env_file = ROOT / ".env"
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def trim_output(text: str, limit: int = 1200) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[-limit:]


def run_python_script(
    name: str,
    script: str,
    args: list[str] | None = None,
    *,
    timeout: int = 120,
    retries: int = 0,
    retry_delay_sec: int = 5,
    success_returncodes: list[int] | None = None,
    dry_run: bool = False,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    script_path = ROOT / script
    cmd = [str(VENV_PYTHON), str(script_path)]
    if args:
        cmd.extend(args)

    if dry_run:
        if logger:
            logger.info("[DRY-RUN] %s: %s", name, " ".join(cmd))
        return {
            "name": name,
            "script": script,
            "args": args or [],
            "command": cmd,
            "status": "skipped",
            "returncode": None,
            "duration_sec": 0.0,
            "stdout": "",
            "stderr": "",
            "attempts": 0,
            "max_attempts": retries + 1,
        }

    max_attempts = max(1, retries + 1)
    allowed_codes = set(success_returncodes or [0])

    for attempt in range(1, max_attempts + 1):
        if logger:
            if max_attempts > 1:
                logger.info("▶ %s (attempt %d/%d)", name, attempt, max_attempts)
            else:
                logger.info("▶ %s", name)

        started = time.time()
        try:
            completed = subprocess.run(
                cmd,
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=timeout,
                env=os.environ.copy(),
            )
            duration = round(time.time() - started, 1)
            status = "success" if completed.returncode in allowed_codes else "failed"
            result = {
                "name": name,
                "script": script,
                "args": args or [],
                "command": cmd,
                "status": status,
                "returncode": completed.returncode,
                "duration_sec": duration,
                "stdout": trim_output(completed.stdout),
                "stderr": trim_output(completed.stderr),
                "attempts": attempt,
                "max_attempts": max_attempts,
            }
            if status == "success":
                if logger:
                    logger.info("✅ %s 완료 (%.1fs)", name, duration)
                return result

            if logger:
                logger.warning("⚠️ %s 실패 (exit=%s)", name, completed.returncode)
                if result["stderr"]:
                    logger.warning("stderr tail: %s", result["stderr"])
            if attempt >= max_attempts:
                return result
        except subprocess.TimeoutExpired as exc:
            duration = round(time.time() - started, 1)
            result = {
                "name": name,
                "script": script,
                "args": args or [],
                "command": cmd,
                "status": "timeout",
                "returncode": None,
                "duration_sec": duration,
                "stdout": trim_output(exc.stdout or ""),
                "stderr": trim_output(exc.stderr or ""),
                "attempts": attempt,
                "max_attempts": max_attempts,
            }
            if logger:
                logger.warning("⏰ %s 타임아웃 (%ss)", name, timeout)
            if attempt >= max_attempts:
                return result

        if logger:
            logger.warning("↻ %s 재시도 %ds 후 진행", name, retry_delay_sec)
        time.sleep(retry_delay_sec)

    return {
        "name": name,
        "script": script,
        "args": args or [],
        "command": cmd,
        "status": "failed",
        "returncode": None,
        "duration_sec": 0.0,
        "stdout": "",
        "stderr": "unreachable: retry loop exhausted unexpectedly",
        "attempts": max_attempts,
        "max_attempts": max_attempts,
    }


def find_latest(patterns: list[str]) -> Path | None:
    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(path for path in ROOT.glob(pattern) if path.is_file())
    if not matches:
        return None
    return max(matches, key=lambda path: path.stat().st_mtime)


def load_json(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    try:
        import json

        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_module_from_path(module_name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def get_telegram_sender() -> Callable[[str], bool] | None:
    try:
        module = load_module_from_path(
            "send_telegram_report_runtime",
            SCRIPTS_DIR / "send_telegram_report.py",
        )
    except Exception:
        return None

    fn = getattr(module, "telegram_send", None)
    return fn if callable(fn) else None


def get_action_proposer() -> Callable[..., Any] | None:
    candidates = [
        SCRIPTS_DIR / "telegram_action_bot.py",
        ROOT / "scripts" / "automation" / "telegram_action_bot.py",
        ROOT / "telegram_action_bot.py",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            module = load_module_from_path(f"action_bot_{path.stem}", path)
        except Exception:
            continue
        fn = getattr(module, "propose", None)
        if callable(fn):
            return fn
        fn = getattr(module, "propose_action", None)
        if callable(fn):
            return fn
    return None


def format_pct(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "N/A"
    return f"{value:+.{decimals}f}%"


def format_num(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "N/A"
    return f"{value:.{decimals}f}"
