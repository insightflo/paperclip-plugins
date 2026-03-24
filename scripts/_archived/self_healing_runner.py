#!/usr/bin/env python3
"""
Self-Healing Automation Runner — alpha-prime-personal 자동화 자가 복구 래퍼

모든 자동화 스크립트를 이 래퍼를 통해 실행하면:
1. 바이너리 경로 자동 탐색 (PATH 의존 제거)
2. 환경 사전 검증 (필수 디렉토리, 권한, 디스크 공간)
3. 실패 시 자동 진단 + 복구 시도
4. 복구 실패 시 CEO(닉 퓨리)에게 Paperclip 이슈 생성

사용법:
  python3 self_healing_runner.py <script_path> [args...]
  python3 self_healing_runner.py --check  # 환경 점검만
"""

import subprocess
import shutil
import sys
import os
import json
import socket
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import URLError

# === 설정 ===
PAPERCLIP_API = "http://localhost:3100/api"
COMPANY_ID = "9045933e-40ca-4a08-8dad-38a8a054bdf3"
CEO_AGENT_ID = "e21cef2e-425e-48a8-9231-b7d02eba332b"  # 제갈량
INFRA_AGENT_ID = "ba1cb53d-25aa-44e4-abe8-a3548e8e6def"  # 터미네이터
LABEL_IDS = ["ea84f697-0c2a-4c36-9916-2c1ea965300e"]  # 데이터수집
LOG_DIR = Path.home() / "Projects" / "ai" / "alpha-prime-personal" / "logs"
OPEN_ISSUE_STATUSES = {"todo", "in_progress", "blocked", "in_review"}

CLAUDE_CANDIDATES = [
    "/Applications/cmux.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    str(Path.home() / ".claude" / "bin" / "claude"),
    str(Path.home() / ".local" / "bin" / "claude"),
]

PYTHON_CANDIDATES = [
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3",
    str(Path.home() / ".pyenv" / "shims" / "python3"),
]


def find_binary(name, candidates):
    """PATH + 후보 경로에서 바이너리 탐색"""
    found = shutil.which(name)
    if found:
        return found
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def check_environment():
    """환경 사전 검증"""
    issues = []

    # claude CLI
    if not find_binary("claude", CLAUDE_CANDIDATES):
        issues.append("claude CLI를 찾을 수 없음")

    # python3
    if not find_binary("python3", PYTHON_CANDIDATES):
        issues.append("python3를 찾을 수 없음")

    # 로그 디렉토리
    if not LOG_DIR.exists():
        try:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            issues.append(f"로그 디렉토리 생성 실패: {e}")

    # 디스크 공간 (최소 100MB)
    try:
        stat = os.statvfs(str(Path.home()))
        free_mb = (stat.f_bavail * stat.f_frsize) / (1024 * 1024)
        if free_mb < 100:
            issues.append(f"디스크 공간 부족: {free_mb:.0f}MB")
    except Exception:
        pass

    # Paperclip API
    try:
        req = Request(f"{PAPERCLIP_API}/health", method="GET")
        urlopen(req, timeout=5)
    except Exception:
        issues.append("Paperclip API 연결 불가 (localhost:3100)")

    return issues


def create_paperclip_issue(title, body, agent_id=None):
    """Paperclip에 이슈 생성"""
    target = agent_id or INFRA_AGENT_ID

    try:
        req = Request(
            f"{PAPERCLIP_API}/companies/{COMPANY_ID}/issues?q={quote(title)}",
            method="GET",
        )
        with urlopen(req, timeout=10) as response:
            existing_issues = json.loads(response.read().decode("utf-8"))
        for issue in existing_issues:
            if (
                issue.get("title") == title
                and issue.get("assigneeAgentId") == target
                and issue.get("status") in OPEN_ISSUE_STATUSES
            ):
                issue_ref = issue.get("identifier") or issue.get("id")
                print(f"[Self-Heal] 기존 열린 이슈 재사용: {issue_ref}")
                return True
    except Exception:
        pass

    data = json.dumps({
        "title": title,
        "body": body,
        "assigneeAgentId": target,
        "labelIds": LABEL_IDS,
        "priority": "high",
        "status": "todo"
    }).encode("utf-8")

    try:
        req = Request(
            f"{PAPERCLIP_API}/companies/{COMPANY_ID}/issues",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urlopen(req, timeout=10)
        print(f"[Self-Heal] Paperclip 이슈 생성 완료: {title}")
        return True
    except Exception as e:
        print(f"[Self-Heal] Paperclip 이슈 생성 실패: {e}")
        return False


def diagnose_failure(script_path, stderr, returncode):
    """실패 원인 자동 진단"""
    diagnosis = []
    normalized_script_path = str(Path(script_path))

    if (
        "can't open file" in stderr
        and normalized_script_path in stderr
        and "No such file or directory" in stderr
    ):
        diagnosis.append(f"스크립트 파일 없음: {normalized_script_path}")
        return diagnosis

    if "No such file or directory" in stderr:
        # 바이너리 못 찾는 문제
        missing = None
        for binary in ["claude", "python3", "node", "gh"]:
            if binary in stderr:
                missing = binary
                break
        if missing:
            found = find_binary(missing, CLAUDE_CANDIDATES if missing == "claude" else PYTHON_CANDIDATES)
            if found:
                diagnosis.append(f"PATH 문제: {missing}가 {found}에 있지만 PATH에 없음")
            else:
                diagnosis.append(f"바이너리 미설치: {missing}")

    if "Permission denied" in stderr:
        diagnosis.append(f"권한 문제: {script_path}에 실행 권한 없음")

    if "ModuleNotFoundError" in stderr:
        module = stderr.split("ModuleNotFoundError: No module named '")[1].split("'")[0] if "No module named" in stderr else "unknown"
        diagnosis.append(f"Python 모듈 누락: {module}")

    if "ConnectionRefusedError" in stderr or "Connection refused" in stderr:
        diagnosis.append("네트워크 연결 거부 — 대상 서비스 미실행")

    if "TimeoutError" in stderr or "timed out" in stderr:
        diagnosis.append("타임아웃 — 네트워크 또는 서비스 응답 지연")

    if not diagnosis:
        diagnosis.append(f"미분류 오류 (exit code: {returncode}): {stderr[:300]}")

    return diagnosis


def attempt_recovery(diagnosis, script_path):
    """자동 복구 시도"""
    recovered = []

    for issue in diagnosis:
        if "권한 문제" in issue:
            try:
                os.chmod(script_path, 0o755)
                recovered.append(f"실행 권한 부여: {script_path}")
            except Exception as e:
                pass

        if "Python 모듈 누락" in issue:
            module = issue.split(": ")[1] if ": " in issue else None
            if module:
                try:
                    subprocess.run(
                        [sys.executable, "-m", "pip", "install", module],
                        capture_output=True, timeout=60
                    )
                    recovered.append(f"모듈 설치: {module}")
                except Exception:
                    pass

        if "로그 디렉토리" in issue:
            try:
                LOG_DIR.mkdir(parents=True, exist_ok=True)
                recovered.append("로그 디렉토리 생성")
            except Exception:
                pass

    return recovered


def log_result(script_name, success, details):
    """실행 결과 로그"""
    log_file = LOG_DIR / "self-healing.log"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status = "SUCCESS" if success else "FAILURE"
    with open(log_file, "a") as f:
        f.write(f"[{timestamp}] [{status}] {script_name}: {details}\n")


def run_script(script_path, args=None):
    """스크립트 실행 + 자가 복구"""
    script_path = str(script_path)
    script_name = Path(script_path).name
    args = args or []

    print(f"[Self-Heal] 실행: {script_name}")

    # 1단계: 환경 사전 검증
    env_issues = check_environment()
    if env_issues:
        print(f"[Self-Heal] 환경 문제 감지: {env_issues}")
        recovered = attempt_recovery([f"환경: {i}" for i in env_issues], script_path)
        if recovered:
            print(f"[Self-Heal] 자동 복구: {recovered}")

    # 2단계: 실행 (최대 3회)
    for attempt in range(1, 4):
        print(f"[Self-Heal] 시도 {attempt}/3")

        # 실행 환경 구성 — PATH에 모든 후보 경로 포함
        env = os.environ.copy()
        extra_paths = [str(Path(c).parent) for c in CLAUDE_CANDIDATES + PYTHON_CANDIDATES if os.path.isfile(c)]
        env["PATH"] = ":".join(extra_paths) + ":" + env.get("PATH", "")

        try:
            if script_path.endswith(".sh"):
                cmd = ["/bin/bash", script_path] + args
            else:
                cmd = [sys.executable, script_path] + args
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
                env=env,
                cwd=str(Path.home() / "Projects" / "ai" / "alpha-prime-personal")
            )

            if result.returncode == 0:
                print(f"[Self-Heal] 성공: {script_name}")
                log_result(script_name, True, "정상 완료")
                return 0

            # 실패 — 진단
            diagnosis = diagnose_failure(script_path, result.stderr, result.returncode)
            print(f"[Self-Heal] 진단: {diagnosis}")

            # 복구 시도
            recovered = attempt_recovery(diagnosis, script_path)
            if recovered:
                print(f"[Self-Heal] 복구 시도: {recovered}")
                continue  # 재시도

            if any(item.startswith("스크립트 파일 없음:") for item in diagnosis):
                print("[Self-Heal] 대상 스크립트가 없어 재시도하지 않음")
                break

            if attempt < 3:
                print(f"[Self-Heal] {attempt}회 실패, 재시도...")
                continue

        except subprocess.TimeoutExpired:
            diagnosis = ["타임아웃 (10분 초과)"]
            print(f"[Self-Heal] 타임아웃")
        except Exception as e:
            diagnosis = [str(e)]
            print(f"[Self-Heal] 예외: {e}")

    # 3단계: 복구 실패 — Paperclip 이슈 생성
    failure_detail = f"스크립트: {script_name}\n진단: {'; '.join(diagnosis)}\n시각: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    create_paperclip_issue(
        f"[긴급] 자동화 실패 — {script_name}",
        failure_detail,
        INFRA_AGENT_ID
    )
    log_result(script_name, False, f"최대 재시도 초과. 진단: {diagnosis}")
    print(f"[Self-Heal] 최종 실패. 터미네이터에게 이슈 생성됨.")
    return 1


def main():
    if len(sys.argv) < 2:
        print("사용법: self_healing_runner.py <script_path> [args...]")
        print("        self_healing_runner.py --check")
        return 1

    if sys.argv[1] == "--check":
        issues = check_environment()
        if issues:
            print(f"환경 문제 발견: {issues}")
            return 1
        else:
            print("환경 정상")
            return 0

    script_path = sys.argv[1]
    args = sys.argv[2:]
    return run_script(script_path, args)


if __name__ == "__main__":
    sys.exit(main())
