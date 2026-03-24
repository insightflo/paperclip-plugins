#!/usr/bin/env python3
"""주간 회고 — 금요일이면 각 부서에 회고 이슈 자동 생성."""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

API = "http://localhost:3100/api"
COMPANY_ID = "240b0239-36cb-44b8-833f-663c2b0ec783"
GOAL_ID = "f5e40e7e-fb1c-4436-ade2-80f00d057469"
KST = ZoneInfo("Asia/Seoul")

# 에이전트별 회고 이슈
RETRO_TASKS = [
    ("6500cec4-5100-4e10-9bc7-5cdff623605c", "[주간 회고] 이번 주 아키텍처 결정·기술 부채 점검"),
    ("79f97389-9b40-4217-a162-312b8fd83a46", "[주간 회고] 이번 주 디자인 리뷰 결과·UX 이슈 정리"),
    ("c3df8f39-aa06-45b0-be1f-36949314b21a", "[주간 회고] 이번 주 구현 완료·실패 태스크 원인 분석"),
    ("e6b03897-11c5-4c39-aee0-d74a67a093e3", "[주간 회고] 이번 주 QA 통과율·반복 버그 패턴 분석"),
    ("1591b2dd-578d-4431-9ef7-073fa2848c30", "[주간 회고] 이번 주 연구 진행·발견 사항 정리"),
    ("3e479bc9-b569-4343-aaa3-4aebafaee788", "[주간 회고] 이번 주 에이전트 가동률·비용·장애 분석"),
    ("278e2f26-b769-440a-a85b-3dc0ee372c48", "[주간 회고] 이번 주 보안 이슈·정책 위반 점검"),
]

CEO_ID = "58ac3d48-faba-4921-acc6-de0b76e04591"
CEO_RETRO = "[금요일] 팀 주간 회고 종합하고 다음 주 방향 설정"


def api_get(path: str) -> list | dict:
    url = f"{API}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def api_post(path: str, data: dict) -> dict:
    url = f"{API}{path}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main() -> int:
    now = datetime.now(KST)

    # 금요일(5)만 실행
    if now.isoweekday() != 5:
        print(f"금요일이 아님 (오늘: {now.strftime('%A')}). 건너뜀.")
        return 0

    # 이번 주 중복 체크
    issues = api_get(f"/companies/{COMPANY_ID}/issues")
    week_start = now.replace(hour=0, minute=0, second=0) - __import__("datetime").timedelta(days=now.weekday())
    existing_retros = [
        i for i in issues
        if "[주간 회고]" in i["title"]
        and datetime.fromisoformat(i["createdAt"].replace("Z", "+00:00")).astimezone(KST) >= week_start
    ]

    if existing_retros:
        print(f"이번 주 회고 이슈 {len(existing_retros)}건 이미 존재. 건너뜀.")
        return 0

    # 각 부서에 회고 이슈 생성
    created = 0
    for agent_id, title in RETRO_TASKS:
        try:
            result = api_post(f"/companies/{COMPANY_ID}/issues", {
                "title": title,
                "priority": "medium",
                "status": "todo",
                "assigneeAgentId": agent_id,
                "goalId": GOAL_ID,
            })
            print(f"  생성: {result.get('identifier', '?')}: {title}")
            created += 1
        except Exception as e:
            print(f"  실패: {title} — {e}")

    # CEO 종합 회고 이슈
    try:
        result = api_post(f"/companies/{COMPANY_ID}/issues", {
            "title": CEO_RETRO,
            "description": "각 부서 주간 회고가 done 되면 gstack /retro를 실행하여 종합 회고 리포트 작성. 다음 주 우선순위 설정.",
            "priority": "high",
            "status": "todo",
            "assigneeAgentId": CEO_ID,
            "goalId": GOAL_ID,
        })
        print(f"  생성: {result.get('identifier', '?')}: {CEO_RETRO}")
        created += 1
    except Exception as e:
        print(f"  실패: CEO 종합 회고 — {e}")

    print(f"\n주간 회고 이슈 {created}건 생성 완료.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
