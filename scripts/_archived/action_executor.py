#!/usr/bin/env python3
"""
[파일 목적] Action Executor — Telegram 승인된 액션을 자동 실행
[주요 흐름]
  1. pending_actions.json에서 status="approved" 액션 조회
  2. EXECUTABLE_ACTIONS 맵으로 실행 방법 결정
  3. requires_claude=False → Python 스크립트 직접 실행
  4. requires_claude=True → Claude CLI headless 실행 (subprocess)
  5. 실행 완료 후 status="executed", executed_at 기록
[외부 연결] data/events/pending_actions.json, telegram_action_bot.py (파일 공유)
[수정시 주의] 파일 lock 필수 (fcntl). telegram_action_bot과 동일 파일 접근.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any

import fcntl

# routine_common 재사용
sys.path.insert(0, str(Path(__file__).resolve().parent))
from routine_common import (
    ROOT,
    VENV_PYTHON,
    configure_logging,
    load_project_env,
    now_kst,
    trim_output,
)

PENDING_ACTIONS_PATH = ROOT / "data" / "events" / "pending_actions.json"
LOG_FILE = ROOT / "logs" / "action_executor.log"

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# EXECUTABLE_ACTIONS 맵
# requires_claude=False → 스크립트 직접 실행
# requires_claude=True → Claude CLI headless 실행
# ---------------------------------------------------------------------------
EXECUTABLE_ACTIONS: dict[str, dict[str, Any]] = {
    "blog_update": {
        "requires_claude": True,
        "claude_prompt": "오늘 블로그 리포트를 최신 이벤트(GTC 등) 내용을 반영하여 업데이트하고 저장하세요. /blog",
        "timeout": 900,
    },
    "report_update": {
        "requires_claude": True,
        "claude_prompt": "최신 카탈리스트를 반영하여 오늘 리포트를 업데이트하세요. 변경 내용을 요약해서 알려주세요.",
        "timeout": 900,
    },
    "strategy_update": {
        "requires_claude": True,
        "claude_prompt": "최신 카탈리스트를 반영한 오늘 매매 전략을 업데이트하세요. /strategy",
        "timeout": 900,
    },
    "watchlist_review": {
        "requires_claude": False,
        "script": "scripts/portfolio/watchlist_review.py",
        "timeout": 120,
    },
    "delta_update": {
        "requires_claude": False,
        "script": "scripts/data-collection/collect_daily_delta.py",
        "timeout": 180,
    },
    "regime_alert": {
        "requires_claude": False,
        "script": None,  # Telegram 메시지만 (별도 처리)
        "timeout": 30,
    },
}


# ---------------------------------------------------------------------------
# 파일 Lock 기반 IO (telegram_action_bot.locked_actions와 동일 패턴)
# ---------------------------------------------------------------------------
def load_pending_actions() -> list[dict[str, Any]]:
    """pending_actions.json 로드 (fcntl shared lock)."""
    if not PENDING_ACTIONS_PATH.exists():
        return []
    with PENDING_ACTIONS_PATH.open("r", encoding="utf-8") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_SH)
        raw = fh.read().strip()
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    if not raw:
        return []
    try:
        loaded = json.loads(raw)
        return loaded if isinstance(loaded, list) else []
    except json.JSONDecodeError:
        logger.warning("pending_actions.json 파싱 실패")
        return []


def save_pending_actions(actions: list[dict[str, Any]]) -> None:
    """pending_actions.json 저장 (fcntl exclusive lock, atomic write)."""
    PENDING_ACTIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    PENDING_ACTIONS_PATH.touch(exist_ok=True)
    with PENDING_ACTIONS_PATH.open("r+", encoding="utf-8") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        fh.seek(0)
        json.dump(actions, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
        fh.truncate()
        fh.flush()
        os.fsync(fh.fileno())
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


# ---------------------------------------------------------------------------
# 실행 함수
# ---------------------------------------------------------------------------
def run_python_script(script_rel: str, timeout: int) -> tuple[int, str]:
    """ROOT/script_rel을 venv python으로 실행.
    반환: (returncode, output_summary)
    """
    script_path = ROOT / script_rel
    if not script_path.exists():
        return 1, f"스크립트 없음: {script_rel}"

    cmd = [str(VENV_PYTHON), str(script_path)]
    logger.info("스크립트 실행: %s", " ".join(cmd))

    try:
        result = subprocess.run(
            cmd,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
            env=os.environ.copy(),
        )
        output = trim_output(result.stdout + result.stderr, 200)
        return result.returncode, output
    except subprocess.TimeoutExpired:
        return -1, f"타임아웃 ({timeout}s)"
    except Exception as exc:
        return -1, str(exc)[:200]


def _followup_report_type(action: dict[str, Any]) -> str | None:
    action_type = str(action.get("type", "")).strip()
    if action_type in {"blog_update", "report_update"}:
        return "blog"
    return None


def _run_followup_telegram_send(action: dict[str, Any], timeout: int = 120) -> tuple[bool, str]:
    """launched 완료 후 필요한 리포트 텔레그램 전송을 시도한다."""
    report_type = _followup_report_type(action)
    if report_type is None:
        return True, "follow-up not required"

    script_path = ROOT / "scripts" / "send_telegram_report.py"
    if not script_path.exists():
        return False, f"telegram script missing: {script_path.relative_to(ROOT)}"

    cmd = [
        str(VENV_PYTHON),
        str(script_path),
        "--type",
        report_type,
        "--latest",
    ]
    logger.info("후속 텔레그램 전송: %s", " ".join(cmd))

    try:
        result = subprocess.run(
            cmd,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
            env=os.environ.copy(),
        )
        output = trim_output(result.stdout + result.stderr, 200)
        if result.returncode == 0:
            return True, output or f"{report_type} telegram sent"
        return False, output or f"{report_type} telegram send failed"
    except subprocess.TimeoutExpired:
        return False, f"telegram send timeout ({timeout}s)"
    except Exception as exc:
        return False, str(exc)[:200]


def _extract_delegated_issue_identifier(action: dict[str, Any]) -> str | None:
    identifier = str(action.get("paperclip_issue_identifier", "")).strip()
    if identifier:
        return identifier

    execution_result = str(action.get("execution_result", ""))
    match = re.search(r"delegated to .*?:\s*([A-Z]+-\d+)", execution_result)
    if not match:
        return None
    return match.group(1)


def _fetch_paperclip_issue(action: dict[str, Any]) -> dict[str, Any] | None:
    issue_id = str(action.get("paperclip_issue_id", "")).strip()
    identifier = _extract_delegated_issue_identifier(action)

    try:
        import urllib.request

        if issue_id:
            with urllib.request.urlopen(f"{PAPERCLIP_API}/issues/{issue_id}", timeout=10) as resp:
                issue = json.loads(resp.read().decode("utf-8"))
                if isinstance(issue, dict):
                    return issue
                return None

        if not identifier:
            return None

        query = urllib.parse.quote(identifier)
        url = f"{PAPERCLIP_API}/companies/{PAPERCLIP_COMPANY_ID}/issues?q={query}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            issues = json.loads(resp.read().decode("utf-8"))
            if not isinstance(issues, list):
                return None
            for issue in issues:
                if issue.get("identifier") == identifier:
                    return issue
    except Exception as exc:
        logger.warning("Paperclip delegated issue 조회 실패: %s", exc)

    return None


def find_claude_cli() -> str | None:
    """claude CLI 경로 찾기.

    우선순위: 1) PATH에서 검색, 2) 고정 경로 후보 순회.
    """
    found = shutil.which("claude")
    if found:
        return found
    candidates = [
        Path.home() / ".local" / "bin" / "claude",
        Path.home() / "node_modules" / ".bin" / "claude",
        Path("/usr/local/bin/claude"),
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


PAPERCLIP_API = "http://localhost:3100/api"
PAPERCLIP_COMPANY_ID = "9045933e-40ca-4a08-8dad-38a8a054bdf3"
PAPERCLIP_CEO_ID = "e21cef2e-425e-48a8-9231-b7d02eba332b"


def _delegate_to_paperclip(action: dict[str, Any], spec: dict[str, Any]) -> tuple[int, str]:
    """승인된 액션을 Paperclip 제갈량(CEO)에게 이슈로 위임.

    제갈량이 서사/레짐을 확인한 후 판단 기반으로 실행한다.
    Paperclip 서버 미응답 시 (-1, error) 반환 → caller가 headless fallback.
    """
    action_type = action.get("type", "unknown")
    title = action.get("title", "")
    description = action.get("description", "")
    action_id = action.get("id", "?")

    issue_title = f"[승인됨] {title}"
    issue_desc = (
        f"텔레그램에서 승인된 액션입니다. 서사/레짐을 확인하고 실행 여부를 최종 판단해줘.\n\n"
        f"## 액션 정보\n"
        f"- 유형: {action_type}\n"
        f"- ID: {action_id}\n"
        f"- 설명: {description}\n\n"
        f"## 실행 방법\n"
    )

    if action_type == "strategy_update":
        issue_desc += (
            "1. 현재 레짐(data/regime/regime_state.json) 확인\n"
            "2. 최신 시그널(delta_tracker.json) 검토\n"
            "3. 전략 업데이트가 정말 필요한지 서사 관점에서 판단\n"
            "4. 필요하면 /strategy 실행\n"
            "5. 불필요하면 이유를 코멘트로 남기고 done 처리\n"
        )
    elif action_type == "report_update":
        issue_desc += (
            "1. 카탈리스트 내용 검토 (위 설명 참조)\n"
            "2. 기존 블로그 리포트에 반영이 필요한지 판단\n"
            "3. 필요하면 리포트 업데이트 실행\n"
            "4. 이미 반영됐거나 불필요하면 done 처리\n"
        )
    else:
        issue_desc += f"적절한 방법으로 {action_type}을 실행해줘.\n"

    payload = {
        "title": issue_title,
        "description": issue_desc,
        "status": "todo",
        "priority": "critical",
        "assigneeAgentId": PAPERCLIP_CEO_ID,
    }

    try:
        import urllib.request
        import urllib.error

        url = f"{PAPERCLIP_API}/companies/{PAPERCLIP_COMPANY_ID}/issues"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            issue_id = str(result.get("id", "")).strip()
            issue_identifier = str(result.get("identifier", "?")).strip()
            if issue_id:
                action["paperclip_issue_id"] = issue_id
            if issue_identifier and issue_identifier != "?":
                action["paperclip_issue_identifier"] = issue_identifier
            logger.info("Paperclip 위임: %s → %s (제갈량)", action_id, issue_identifier)
            return 0, f"delegated to 제갈량: {issue_identifier}"
    except Exception as exc:
        logger.warning("Paperclip 위임 실패: %s", exc)
        return -1, str(exc)[:200]


def run_claude_headless(prompt: str, timeout: int) -> tuple[int, str]:
    """Claude CLI를 detached 프로세스로 실행 (non-blocking).

    - subprocess.Popen + start_new_session=True → 부모 종료 후에도 생존
    - stdout/stderr를 log 파일로 redirect
    - PID 파일 기록: logs/claude_action_{timestamp}.pid
    - 즉시 (0, "launched pid=XXXXX") 반환

    반환: (returncode, output_summary)
      - CLI 없음 → (-2, "claude CLI not found")
      - Popen 실패 → (-3, error message)
      - 성공 → (0, "launched pid=XXXXX log=YYYYY")
    """
    claude_bin = find_claude_cli()
    if not claude_bin:
        return -2, "claude CLI not found"

    ts = int(time.time())
    log_path = ROOT / "logs" / f"claude_action_{ts}.log"
    status_path = ROOT / "logs" / f"claude_action_{ts}.status"
    log_path.parent.mkdir(exist_ok=True)

    claude_cmd = " ".join(
        [
            shlex.quote(claude_bin),
            "--dangerously-skip-permissions",
            "-p",
            shlex.quote(prompt),
        ]
    )
    shell_cmd = (
        f"cd {shlex.quote(str(ROOT))} && "
        f"{claude_cmd}; "
        "rc=$?; "
        f"printf '%s' \"$rc\" > {shlex.quote(str(status_path))}"
    )
    cmd = ["bash", "-lc", shell_cmd]
    logger.info("Claude headless 시작: prompt=%s...", prompt[:60])

    try:
        log_fh = open(log_path, "w")
        proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT),
            stdout=log_fh,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env={**os.environ},
        )
        logger.info("Claude headless 시작: pid=%d, log=%s", proc.pid, log_path.name)
        return 0, f"launched pid={proc.pid} log={log_path.name} status={status_path.name}"
    except Exception as exc:
        return -3, str(exc)[:200]


def _extract_field(raw: str, key: str) -> str | None:
    match = re.search(rf"{re.escape(key)}=([^\s]+)", raw)
    if not match:
        return None
    value = match.group(1).strip()
    return value if value else None


def _parse_kst_datetime(raw: Any) -> datetime | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _is_process_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _terminate_process_group(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except Exception as exc:
        logger.warning("프로세스 종료 실패(pid=%s): %s", pid, exc)
        return

    time.sleep(0.5)
    if _is_process_running(pid):
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            return
        except Exception as exc:
            logger.warning("프로세스 강제종료 실패(pid=%s): %s", pid, exc)


def _coerce_positive_int(raw: Any) -> int | None:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _coerce_int(raw: Any) -> int | None:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def reconcile_launched_actions(actions: list[dict[str, Any]]) -> int:
    """launched 상태 액션을 executed/failed로 확정한다."""
    now = now_kst()
    updated = 0

    for action in actions:
        if action.get("status") != "launched":
            continue

        execution_result = str(action.get("execution_result", ""))
        pid = _coerce_positive_int(action.get("launched_pid"))
        timeout_sec = _coerce_positive_int(action.get("launched_timeout_sec")) or 0
        launched_at = _parse_kst_datetime(action.get("launched_at"))

        log_name = str(action.get("launched_log") or _extract_field(execution_result, "log") or "").strip()
        status_name = str(
            action.get("launched_status_file") or _extract_field(execution_result, "status") or ""
        ).strip()
        status_path = (ROOT / "logs" / status_name) if status_name else None

        if status_path and status_path.exists():
            raw = status_path.read_text(encoding="utf-8").strip()
            rc = _coerce_int(raw)
            if rc is not None:
                action["status"] = "executed" if rc == 0 else "failed"
                action["executed_at"] = now.isoformat(timespec="seconds")
                suffix = f" log={log_name}" if log_name else ""
                action["execution_result"] = f"claude completed rc={rc}{suffix}"
                if rc == 0:
                    followup_ok, followup_msg = _run_followup_telegram_send(action)
                    action["followup_telegram_status"] = "sent" if followup_ok else "failed"
                    action["followup_telegram_result"] = followup_msg
                    if not followup_ok:
                        action["execution_result"] += " | telegram follow-up failed"
                updated += 1
                continue

        is_running = bool(pid and _is_process_running(pid))
        if is_running:
            if timeout_sec > 0 and launched_at:
                elapsed = (now - launched_at).total_seconds()
                if elapsed > timeout_sec:
                    _terminate_process_group(pid)
                    action["status"] = "failed"
                    action["executed_at"] = now.isoformat(timespec="seconds")
                    action["execution_result"] = f"launched timeout ({timeout_sec}s)"
                    updated += 1
            continue

        # 프로세스가 끝났는데 상태 파일이 없다면 실패로 확정
        action["status"] = "failed"
        action["executed_at"] = now.isoformat(timespec="seconds")
        suffix = f" log={log_name}" if log_name else ""
        action["execution_result"] = f"launched process ended without status{suffix}"
        updated += 1

    return updated


def reconcile_delegated_actions(actions: list[dict[str, Any]]) -> int:
    """delegated 상태 액션을 조회해 위임된 이슈 완료 시 후속 전송까지 마무리한다."""
    now = now_kst()
    updated = 0

    for action in actions:
        if action.get("status") != "delegated":
            continue

        issue = _fetch_paperclip_issue(action)
        if not issue:
            continue

        identifier = str(issue.get("identifier") or _extract_delegated_issue_identifier(action) or "?")
        status = str(issue.get("status", "")).strip()

        if status != "done":
            continue

        action["paperclip_issue_id"] = issue.get("id")
        action["paperclip_issue_identifier"] = identifier
        action["status"] = "executed"
        action["executed_at"] = now.isoformat(timespec="seconds")
        action["execution_result"] = f"delegated issue completed: {identifier}"

        followup_ok, followup_msg = _run_followup_telegram_send(action)
        action["followup_telegram_status"] = "sent" if followup_ok else "failed"
        action["followup_telegram_result"] = followup_msg
        if not followup_ok:
            action["execution_result"] += " | telegram follow-up failed"

        updated += 1

    return updated


def build_claude_prompt(action: dict[str, Any], spec: dict[str, Any]) -> str:
    """Claude 실행 프롬프트 조립.

    report_update / strategy_update 등 승인된 액션 메타데이터를 함께 넘겨
    headless 실행 시 제안 근거를 유지한다.
    """
    base_prompt = str(spec.get("claude_prompt", "")).strip()
    title = str(action.get("title", "")).strip()
    description = str(action.get("description", "")).strip()

    details: list[str] = []
    if title:
        details.append(f"액션 제목: {title}")
    if description:
        details.append(f"액션 설명: {description}")

    if not details:
        return base_prompt

    return f"{base_prompt}\n\n승인된 자동화 액션 컨텍스트:\n" + "\n".join(details)


# ---------------------------------------------------------------------------
# 메인 처리 루프
# ---------------------------------------------------------------------------
def process_approved_actions(*, dry_run: bool = False) -> int:
    """승인된 액션 처리 루프. 반환: 처리된 액션 수."""
    actions = load_pending_actions()
    reconciled = 0
    if not dry_run:
        reconciled = reconcile_launched_actions(actions)
        reconciled += reconcile_delegated_actions(actions)
    processed = 0

    for action in actions:
        if action.get("status") != "approved":
            continue

        action_type = action.get("type", "")
        spec = EXECUTABLE_ACTIONS.get(action_type)

        if not spec:
            logger.warning("알 수 없는 액션 타입: %s (id=%s)", action_type, action.get("id"))
            action["status"] = "unknown"
            action["executed_at"] = now_kst().isoformat(timespec="seconds")
            action["execution_result"] = f"알 수 없는 액션 타입: {action_type}"
            processed += 1
            continue

        action_id = action.get("id", "?")
        logger.info("실행: %s (id=%s)", action_type, action_id)

        if dry_run:
            logger.info("[DRY-RUN] 실행 건너뜀: %s", action_type)
            continue

        if spec["requires_claude"]:
            # Paperclip 제갈량에게 위임 (headless 맹목 실행 대신 판단 기반 실행)
            rc, out = _delegate_to_paperclip(action, spec)
            if rc == 0:
                action["status"] = "delegated"
            else:
                # Paperclip 연결 실패 시 기존 headless fallback
                logger.warning("Paperclip 위임 실패, headless fallback: %s", out)
                prompt = build_claude_prompt(action, spec)
                rc, out = run_claude_headless(prompt, spec["timeout"])
                if rc == 0:
                    action["status"] = "launched"
                    pid_str = _extract_field(out, "pid")
                    action["launched_pid"] = int(pid_str) if pid_str and pid_str.isdigit() else None
                    action["launched_log"] = _extract_field(out, "log")
                    action["launched_status_file"] = _extract_field(out, "status")
                    action["launched_timeout_sec"] = int(spec["timeout"])
                    action["launched_at"] = now_kst().isoformat(timespec="seconds")
                else:
                    action["status"] = "failed"
            action["executed_at"] = now_kst().isoformat(timespec="seconds")
            action["execution_result"] = out[:200]
        elif spec.get("script"):
            rc, out = run_python_script(spec["script"], spec["timeout"])
            action["status"] = "executed" if rc == 0 else "failed"
            action["executed_at"] = now_kst().isoformat(timespec="seconds")
            action["execution_result"] = out[:200]
        else:
            # alert-only (regime_alert 등)
            rc, out = 0, "alert-only (실행 불필요)"
            action["status"] = "executed"
            action["executed_at"] = now_kst().isoformat(timespec="seconds")
            action["execution_result"] = out[:200]

        processed += 1
        logger.info(
            "결과: %s → %s (rc=%s)", action_type, action["status"], rc
        )

    if (processed or reconciled) and not dry_run:
        save_pending_actions(actions)

    return processed + reconciled


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Action Executor — 승인된 액션 자동 실행")
    parser.add_argument("--dry-run", action="store_true", help="실행하지 않고 대상만 표시")
    parser.add_argument("--once", action="store_true", default=True, help="1회 실행 후 종료 (기본값)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    configure_logging(LOG_FILE)
    load_project_env()

    logger.info("Action Executor 시작 (dry_run=%s)", args.dry_run)
    n = process_approved_actions(dry_run=args.dry_run)
    logger.info("처리된 액션: %d건", n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
