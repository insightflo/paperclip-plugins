#!/usr/bin/env python3
"""
적응형 Heartbeat 관리자

3계층 구조에 맞게 heartbeat intervalSec를 자동 조정:
  - 리더 (CEO/팀리더/감찰관): 항상 heartbeat 유지, 이슈 수에 따라 조정
  - 멤버 (실행자): 이슈 0건이면 heartbeat OFF, 있으면 ON

실행: healthcheck plist에서 30분 간격으로 호출
"""
from __future__ import annotations

import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import now_kst

API = "http://localhost:3100/api"

# 구간 설정
INTERVAL_BUSY = 300       # 5분 — 이슈 3건 이상
INTERVAL_NORMAL = 1800    # 30분 — 이슈 1~2건
INTERVAL_LEADER_IDLE = 3600   # 1시간 — 리더 대기
INTERVAL_CEO_MAX = 1800       # CEO/감찰관 최대 (30분)

# 리더 역할 키워드 (heartbeat 항상 유지)
LEADER_KEYWORDS = {"CEO", "팀리더", "컴플라이언스", "리서치", "리포팅"}

# 두 회사
COMPANY_IDS = [
    "9045933e-40ca-4a08-8dad-38a8a054bdf3",  # 가즈아
    "240b0239-36cb-44b8-833f-663c2b0ec783",  # 개수라발발타
]

WORK_STATUSES = {"todo", "in_progress", "in_review"}


def api_get(path: str):
    req = urllib.request.Request(f"{API}{path}", headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=10).read())


def api_patch(path: str, data: dict):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{API}{path}", data=body, headers={"Content-Type": "application/json"}, method="PATCH"
    )
    return json.loads(urllib.request.urlopen(req, timeout=10).read())


def is_leader(agent_name: str) -> bool:
    """CEO, 팀리더, 감찰관은 리더"""
    return any(kw in agent_name for kw in LEADER_KEYWORDS)


def desired_config(agent_name: str, work_count: int) -> tuple[bool, int]:
    """(heartbeat_enabled, intervalSec) 반환"""
    if is_leader(agent_name):
        # 리더: 항상 heartbeat ON
        if work_count >= 3:
            sec = INTERVAL_BUSY
        elif work_count >= 1:
            sec = INTERVAL_NORMAL
        else:
            sec = INTERVAL_LEADER_IDLE
        # CEO는 최대 30분, 감찰관은 이슈 3건+ 시 5분 허용
        if "CEO" in agent_name:
            sec = min(sec, INTERVAL_CEO_MAX)
        return True, sec
    else:
        # 멤버: 이슈 없으면 OFF
        if work_count >= 3:
            return True, INTERVAL_BUSY
        elif work_count >= 1:
            return True, INTERVAL_NORMAL
        else:
            return False, 0  # OFF — issue_assigned로만 기상


def interval_label(enabled: bool, sec: int) -> str:
    if not enabled:
        return "OFF"
    if sec >= 3600:
        return f"{sec // 3600}시간"
    return f"{sec // 60}분"


def run_for_company(company_id: str) -> list[str]:
    logs = []

    agents = api_get(f"/companies/{company_id}/agents")
    issues = api_get(f"/companies/{company_id}/issues")

    # 에이전트별 작업 이슈 수
    agent_work: dict[str, int] = defaultdict(int)
    for issue in issues:
        if issue.get("status") in WORK_STATUSES:
            assignee = issue.get("assigneeAgentId")
            if assignee:
                agent_work[assignee] += 1

    for agent in agents:
        aid = agent["id"]
        name = agent.get("name", "?")
        rc = agent.get("runtimeConfig") or {}
        hb = rc.get("heartbeat") or {}
        cur_enabled = hb.get("enabled", True)
        cur_interval = hb.get("intervalSec", 1800)

        work_count = agent_work.get(aid, 0)
        target_enabled, target_interval = desired_config(name, work_count)

        # running 에이전트는 건드리지 않음
        if agent.get("status") == "running":
            continue

        if cur_enabled != target_enabled or cur_interval != target_interval:
            api_patch(f"/agents/{aid}", {
                "runtimeConfig": {"heartbeat": {"enabled": target_enabled, "intervalSec": target_interval}}
            })
            cur_label = interval_label(cur_enabled, cur_interval)
            tgt_label = interval_label(target_enabled, target_interval)
            logs.append(f"  {name}: {cur_label} → {tgt_label} (이슈 {work_count}건)")

    return logs


def main():
    ts = now_kst().strftime("%H:%M:%S")
    print(f"[{ts}] adaptive_heartbeat 실행")

    all_logs: list[str] = []
    for cid in COMPANY_IDS:
        try:
            logs = run_for_company(cid)
            all_logs.extend(logs)
        except Exception as e:
            all_logs.append(f"  ❌ company {cid[:8]}: {e}")

    if all_logs:
        print("\n".join(all_logs))
    else:
        print("  변경 없음")


if __name__ == "__main__":
    main()
