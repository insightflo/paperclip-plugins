#!/usr/bin/env python3
"""
[파일 목적] 매일 아침 업무 이슈 자동 생성 — 업무 보드용
[주요 흐름]
  1. 오늘 날짜 이슈가 이미 있는지 Paperclip API로 확인
  2. 없으면 업무별 todo 이슈 생성 (라벨 자동 태깅)
  3. 에이전트가 heartbeat에서 이슈를 잡아 처리
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
KST = ZoneInfo("Asia/Seoul")

PAPERCLIP_API = "http://localhost:3100/api"
PAPERCLIP_COMPANY_ID = "9045933e-40ca-4a08-8dad-38a8a054bdf3"

# 에이전트 ID
AGENTS = {
    "doraemon": "f697ea51-ecb2-4629-96b1-671a99f2f1e3",
    "conan": "5a4cd481-92b2-4d4c-9cb4-b21291398a08",
    "t800": "ba1cb53d-25aa-44e4-abe8-a3548e8e6def",
    "harry": "1836aba4-98a1-4ce9-be73-2816d88812ec",
    "scrooge": "1aba652f-bee7-4173-9750-11849085f8bf",
    "ceo": "e21cef2e-425e-48a8-9231-b7d02eba332b",
    "sherlock": "f5dc3d8a-1ea8-4223-a9f9-99a95bea0a20",
    "inspector": "4d6492d4-9558-498e-b674-93a625718f23",
}

# 라벨 ID
LABELS = {
    "데이터수집": "ea84f697-0c2a-4c36-9916-2c1ea965300e",
    "리포팅": "ffe7f138-3e5e-44d2-a48f-44ebe7b8dd4a",
    "전략매매": "c13b3b8c-a782-42d3-80fd-5cad5015fd8d",
    "시그널분석": "51bf2ddf-404a-47a8-a913-8136d16a8991",
    "포트폴리오": "9c8eaeef-7131-471b-a722-887512e9529d",
    "주간활동": "217735b3-9b01-46cc-8b83-53efbb0c56e8",
}


def _today() -> str:
    return datetime.now(KST).strftime("%m/%d")


def _today_dash() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def _weekday() -> int:
    """0=월 ~ 6=일"""
    return datetime.now(KST).weekday()


def _api_get(path: str):
    try:
        url = f"{PAPERCLIP_API}{path}"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _api_post(path: str, data: dict) -> dict | None:
    try:
        url = f"{PAPERCLIP_API}{path}"
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _issue_exists_today(keyword: str) -> bool:
    """오늘 날짜 키워드가 제목에 포함된 이슈가 이미 있는지."""
    issues = _api_get(f"/companies/{PAPERCLIP_COMPANY_ID}/issues")
    if not issues:
        return False
    today = _today()
    for issue in issues:
        title = issue.get("title", "")
        if today in title and keyword in title and issue.get("status") != "cancelled":
            return True
    return False


def _create_issue(title: str, description: str, agent: str, label: str, priority: str = "medium") -> str | None:
    label_id = LABELS.get(label)
    result = _api_post(f"/companies/{PAPERCLIP_COMPANY_ID}/issues", {
        "title": title,
        "description": description,
        "status": "todo",
        "priority": priority,
        "assigneeAgentId": AGENTS.get(agent, ""),
        "labelIds": [label_id] if label_id else [],
    })
    if result:
        return result.get("identifier")
    return None


# ============================================================
# 일일 이슈 정의
# ============================================================

def daily_issues() -> list[dict]:
    """매일 생성할 이슈 목록."""
    today = _today()
    today_dash = _today_dash()

    issues = [
        {
            "keyword": "인프라 에러 점검",
            "title": f"[{today}] 인프라 에러 점검",
            "description": f"launchd 에러 로그 확인:\n- `tail -20 logs/launchd_healthcheck_err.log`\n- `tail -20 logs/morning_routine_err.log` (있으면)\n\n에러 있으면 내용을 이슈 코멘트에 기록하고 in_review 전환.\n에러 없으면 코멘트에 '에러 없음' 기록 후 in_review.",
            "agent": "doraemon",
            "label": "데이터수집",
        },
        {
            "keyword": "데이터 수집",
            "title": f"[{today}] 데이터 수집",
            "description": f"{today_dash} 데이터 14개 수집 확인. 누락 시 해당 스크립트 재실행.\n\n확인: logs/jobs/registry.json의 check_data 결과 참조.",
            "agent": "doraemon",
            "label": "데이터수집",
        },
        {
            "keyword": "블로그 발행",
            "title": f"[{today}] 블로그 발행 검수",
            "description": f"{today_dash} 블로그 리포트 검수.\n1. reports/blog/Public_Market_Report_{today_dash}.md 존재 확인\n2. 필수 섹션 6개 확인 (선물해석/US·KR레짐/섹터로테이션/옥석분석/전문가2+/전략)\n3. 슬라이드 존재 확인 (reports/blog/slides/{today_dash}/)\n\n직접 스크립트 실행 금지 — 검수만. 미충족 항목 코멘트에 명시 후 in_review.",
            "agent": "harry",
            "label": "리포팅",
            "priority": "high",
        },
        {
            "keyword": "매매 전략",
            "title": f"[{today}] 매매 전략",
            "description": f"{today_dash} 매매 전략 확인.\nreports/strategy/buy_sell_strategy_{today_dash.replace('-','')}.md 존재 확인.\n미생성이면 strategy 스킬로 생성 + watchlist 반영.",
            "agent": "ceo",
            "label": "전략매매",
        },
        {
            "keyword": "포트폴리오 점검",
            "title": f"[{today}] 포트폴리오 점검",
            "description": f"portfolio.json ↔ watchlist.json 정합성 확인.\nSL gap Danger 종목 체크.\n어제 전략 반영 여부 확인.",
            "agent": "scrooge",
            "label": "포트폴리오",
        },
        {
            "keyword": "시그널 점검",
            "title": f"[{today}] 시그널 점검",
            "description": f"signal_aggregator 최신 판정 확인.\nGate 결과 합리성 검토.\n시그널 기준 평가 결과 확인 (logs/jobs/signal_quality.json).",
            "agent": "conan",
            "label": "시그널분석",
        },
        {
            "keyword": "테마 리서치",
            "title": f"[{today}] 테마 리서치",
            "description": f"data/market_signals/theme_*.json, data/sns/sns_digest_*.md 확인.\n새 Whisper 테마 발견 시 watchlist 추가.\n기존 서사 재평가 (narrative_status 검토).",
            "agent": "sherlock",
            "label": "시그널분석",
        },
        {
            "keyword": "시그널 기준 평가",
            "title": f"[{today}] 시그널 기준 평가",
            "description": f"evaluate_signal_quality.py 실행 결과 확인.\nlogs/jobs/signal_quality.json에서 오탐/미탐율 확인.\n오탐율 30% 이상이면 보고.",
            "agent": "conan",
            "label": "시그널분석",
        },
        {
            "keyword": "자가 개선",
            "title": f"[{today}] 자가 개선 확인",
            "description": f"improvement_cycle.py 실행 결과 확인.\nlogs/jobs/improvement_cycle.json 확인.\n발견된 개선 항목이 Paperclip 이슈로 등록됐는지 확인.",
            "agent": "ceo",
            "label": "주간활동",
        },
        {
            "keyword": "종가 시뮬 매도",
            "title": f"[{today}] 종가 시뮬 매도 확인",
            "description": f"shadow_autosell.py 실행 결과 확인.\ndata/closing_bet/kr_closing_bet_shadow_ohmystock.json에서 오늘 매도 결과 확인.\n매도 대상 없으면 정상.",
            "agent": "scrooge",
            "label": "전략매매",
        },
    ]

    return issues


def weekly_issues() -> list[dict]:
    """금요일에만 추가 생성할 이슈."""
    today = _today()
    return [
        {
            "keyword": "주간 회고",
            "title": f"[{today}] 주간 회고",
            "description": "이번 주 팀 성과 종합.\nimprovement_cycle 결과 읽고 분석.\n다음 주 우선순위 설정 + 팀원 업무 분장.",
            "agent": "ceo",
            "label": "주간활동",
            "priority": "high",
        },
        {
            "keyword": "데이터 아카이빙",
            "title": f"[{today}] 데이터 아카이빙 확인",
            "description": "launchd가 archive_old_data.py를 실행한 결과 확인.\nbackups/ 폴더에 이번 주 백업 생성됐는지.\nlogs/jobs/registry.json의 archive_old_data 결과 확인.\n문제 있으면 보고.",
            "agent": "doraemon",
            "label": "데이터수집",
        },
    ]


def main() -> int:
    issues = _api_get(f"/companies/{PAPERCLIP_COMPANY_ID}/issues")
    if issues is None:
        print("SKIP — Paperclip 연결 불가")
        return 0

    created = []
    skipped = []

    all_issues = daily_issues()
    if _weekday() == 4:  # 금요일
        all_issues.extend(weekly_issues())

    for item in all_issues:
        if _issue_exists_today(item["keyword"]):
            skipped.append(item["keyword"])
            continue

        ident = _create_issue(
            title=item["title"],
            description=item["description"],
            agent=item["agent"],
            label=item["label"],
            priority=item.get("priority", "medium"),
        )
        if ident:
            created.append(f"{ident} {item['title']}")

    if created:
        print(f"CREATED {len(created)}건: " + ", ".join(created))
    elif skipped:
        print(f"SKIP — 이미 존재: {', '.join(skipped)}")
    else:
        print("PASS")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
