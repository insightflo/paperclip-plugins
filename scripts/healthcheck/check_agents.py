#!/usr/bin/env python3
"""에이전트 상태 점검 — stuck/error 에이전트 감지, 자동 복구 시도."""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

API = "http://localhost:3100/api"
COMPANY_ID = "240b0239-36cb-44b8-833f-663c2b0ec783"
KST = ZoneInfo("Asia/Seoul")
STUCK_THRESHOLD_MIN = 120  # 2시간 이상 running이면 stuck


def api_get(path: str) -> list | dict:
    url = f"{API}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main() -> int:
    agents = api_get(f"/companies/{COMPANY_ID}/agents")
    now = datetime.now(KST)
    issues = []

    for a in agents:
        name = a["name"]
        status = a["status"]

        # error 상태 감지
        if status == "error":
            issues.append(f"🔴 {name}: error 상태")

        # stuck 감지 (running이 너무 오래됨)
        if status == "running" and a.get("lastHeartbeatAt"):
            last_hb = datetime.fromisoformat(a["lastHeartbeatAt"].replace("Z", "+00:00"))
            elapsed = (now - last_hb.astimezone(KST)).total_seconds() / 60
            if elapsed > STUCK_THRESHOLD_MIN:
                issues.append(f"🟡 {name}: {int(elapsed)}분째 running (stuck 의심)")

        # heartbeat 미실행 감지 (enabled인데 한번도 실행 안됨)
        rc = a.get("runtimeConfig") or {}
        hb_config = rc.get("heartbeat") or {}
        if hb_config.get("enabled") and not a.get("lastHeartbeatAt"):
            issues.append(f"🟡 {name}: heartbeat 활성화됨, 실행 이력 없음")

    if issues:
        print(f"에이전트 점검 결과: {len(issues)}건 이상")
        for issue in issues:
            print(f"  {issue}")
        return 1

    print(f"에이전트 점검 정상: {len(agents)}명 전원 정상")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
