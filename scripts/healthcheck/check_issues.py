#!/usr/bin/env python3
"""이슈 상태 점검 — 멈춘 이슈, 오래된 todo, 미배정 이슈 감지."""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

API = "http://localhost:3100/api"
COMPANY_ID = "240b0239-36cb-44b8-833f-663c2b0ec783"
KST = ZoneInfo("Asia/Seoul")
STALE_DAYS = 3  # 3일 이상 todo면 경고


def api_get(path: str) -> list | dict:
    url = f"{API}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main() -> int:
    issues = api_get(f"/companies/{COMPANY_ID}/issues")
    now = datetime.now(KST)
    warnings = []

    for i in issues:
        status = i["status"]
        title = i["title"][:50]
        identifier = i.get("identifier", i["id"][:8])

        # 오래된 todo
        if status == "todo":
            created = datetime.fromisoformat(i["createdAt"].replace("Z", "+00:00"))
            age_days = (now - created.astimezone(KST)).days
            if age_days >= STALE_DAYS:
                warnings.append(f"🟡 {identifier}: todo {age_days}일째 — {title}")

        # in_progress인데 배정자 없음
        if status == "in_progress" and not i.get("assigneeAgentId"):
            warnings.append(f"🔴 {identifier}: in_progress인데 미배정 — {title}")

        # blocked
        if status == "blocked":
            warnings.append(f"🟠 {identifier}: blocked — {title}")

    active = [i for i in issues if i["status"] not in ("done", "cancelled")]

    if warnings:
        print(f"이슈 점검: {len(warnings)}건 주의 (활성 {len(active)}건)")
        for w in warnings:
            print(f"  {w}")
        return 1

    print(f"이슈 점검 정상: 활성 {len(active)}건, 완료 {len(issues) - len(active)}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
