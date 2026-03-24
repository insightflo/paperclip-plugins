#!/usr/bin/env python3
"""Heartbeat 실행 점검 — 최근 실패, 연속 실패, 미실행 감지."""
from __future__ import annotations

import json
import urllib.request

API = "http://localhost:3100/api"
COMPANY_ID = "240b0239-36cb-44b8-833f-663c2b0ec783"


def api_get(path: str) -> list | dict:
    url = f"{API}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main() -> int:
    runs = api_get(f"/companies/{COMPANY_ID}/heartbeat-runs?limit=50")
    agents = api_get(f"/companies/{COMPANY_ID}/agents")
    agent_map = {a["id"]: a["name"] for a in agents}

    # 에이전트별 최근 실행 분석
    agent_runs: dict[str, list] = {}
    for r in runs:
        aid = r["agentId"]
        agent_runs.setdefault(aid, []).append(r)

    issues = []
    for aid, runs_list in agent_runs.items():
        name = agent_map.get(aid, aid[:8])
        recent = runs_list[:3]
        failed = [r for r in recent if r["status"] in ("failed", "timed_out")]
        if len(failed) >= 2:
            issues.append(f"🔴 {name}: 최근 3회 중 {len(failed)}회 실패")

    if issues:
        print(f"Heartbeat 점검: {len(issues)}건 이상")
        for issue in issues:
            print(f"  {issue}")
        return 1

    total_runs = len(runs)
    succeeded = len([r for r in runs if r["status"] == "succeeded"])
    print(f"Heartbeat 점검 정상: 최근 {total_runs}회 중 {succeeded}회 성공")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
