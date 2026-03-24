#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
KST = ZoneInfo("Asia/Seoul")
JOBS_DIR = ROOT / "logs" / "jobs"
REGISTRY_PATH = JOBS_DIR / "registry.json"

sys.path.insert(0, str(ROOT / "scripts" / "automation"))
from routine_common import VENV_PYTHON, find_latest, get_telegram_sender, load_project_env


def now_kst() -> datetime:
    return datetime.now(KST)


def today_compact() -> str:
    return now_kst().strftime("%Y%m%d")


def today_dash() -> str:
    return now_kst().strftime("%Y-%m-%d")


def trim_output(text: str | None, limit: int = 1200) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[-limit:]


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(path)


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip().replace("Z", "+00:00")
    for candidate in (normalized, normalized.replace(" ", "T")):
        try:
            parsed = datetime.fromisoformat(candidate)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=KST)
            return parsed.astimezone(KST)
        except ValueError:
            continue
    return None


def age_minutes(path: Path) -> float:
    return max(0.0, (now_kst().timestamp() - path.stat().st_mtime) / 60.0)


def run_project_script(
    script_rel: str,
    args: list[str] | None = None,
    *,
    timeout: int = 300,
) -> subprocess.CompletedProcess[str]:
    load_project_env()
    command = [str(VENV_PYTHON), str(ROOT / script_rel)]
    if args:
        command.extend(args)
    return subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=None,
    )


def load_registry() -> dict[str, Any]:
    payload = read_json(REGISTRY_PATH, {})
    return payload if isinstance(payload, dict) else {}


def save_registry(payload: dict[str, Any]) -> None:
    write_json(REGISTRY_PATH, payload)


def telegram_send(text: str) -> bool:
    load_project_env()
    sender = get_telegram_sender()
    if sender is None:
        return False
    return bool(sender(text))
