#!/usr/bin/env python3
from __future__ import annotations

from common import (
    ROOT,
    load_registry,
    save_registry,
    telegram_send,
    today_dash,
    read_json,
)

REGIME_STATE_PATH = ROOT / "data" / "regime" / "regime_state.json"


def build_message() -> str:
    registry = load_registry()
    regime = read_json(REGIME_STATE_PATH, {})
    meta = registry.get("_meta", {})
    jobs = {key: value for key, value in registry.items() if key != "_meta" and isinstance(value, dict)}

    regime_label = regime.get("label", "Unknown") if isinstance(regime, dict) else "Unknown"
    regime_score = regime.get("score", "n/a") if isinstance(regime, dict) else "n/a"
    us = regime.get("us", {}) if isinstance(regime, dict) else {}
    kr = regime.get("kr", {}) if isinstance(regime, dict) else {}

    # 사람 친화적 이름 매핑
    friendly = {
        "check_data": "데이터 수집",
        "check_signal_chain": "시그널 체인",
        "check_pending_actions": "액션 실행",
        "check_report": "리포트 생성",
        "check_portfolio": "포트폴리오 정합성",
        "evaluate_signal_quality": "시그널 기준 평가",
        "check_paperclip_issues": "팀 이슈 정리",
        "daily_summary": "일일 요약",
        "improvement_cycle": "자가 개선",
        "shadow_autosell": "종가 시뮬 매도",
        "smoke_runner": "러너 테스트",
    }

    # 성공/실패 분류
    ok_jobs = []
    fail_jobs = []
    for name in sorted(jobs):
        entry = jobs[name]
        status = entry.get("last_status", "unknown")
        failures = entry.get("consecutive_failures", 0)
        label = friendly.get(name, name)
        if status == "success" and failures == 0:
            ok_jobs.append(label)
        else:
            fail_jobs.append((label, status, failures))

    lines = [
        f"📊 Alpha-Prime 일일 요약 ({today_dash()})",
        "",
        f"레짐: US {us.get('label', '?')} / KR {kr.get('label', '?')}",
        "",
    ]

    if fail_jobs:
        lines.append(f"⚠️ 이상 {len(fail_jobs)}건:")
        for name, status, failures in fail_jobs:
            lines.append(f"  • {name} — {status} (연속실패 {failures}회)")
        lines.append("")

    lines.append(f"✅ 정상 {len(ok_jobs)}건")

    if len(ok_jobs) <= 6:
        for name in ok_jobs:
            lines.append(f"  • {name}")
    else:
        lines.append(f"  • {', '.join(ok_jobs[:4])} 외 {len(ok_jobs)-4}건")

    if not fail_jobs:
        lines.append("")
        lines.append("💡 전체 정상 — 추가 확인 불필요")

    return "\n".join(lines)


def main() -> int:
    registry = load_registry()
    meta = registry.get("_meta", {})
    if not isinstance(meta, dict):
        meta = {}

    if meta.get("daily_summary_last_sent") == today_dash():
        print("SKIP")
        return 0

    if not telegram_send(build_message()):
        return 1

    meta["daily_summary_last_sent"] = today_dash()
    registry["_meta"] = meta
    save_registry(registry)
    print("SENT")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
