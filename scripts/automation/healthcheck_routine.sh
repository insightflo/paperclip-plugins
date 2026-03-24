#!/bin/bash
set -euo pipefail

cd /Users/kwak/Projects/ai/alpha-prime-personal

# 평일 06:00~22:00 KST만 실행
DOW=$(date +%u)
HOUR=$(date +%H)
if [ "$DOW" -gt 5 ] || [ "$HOUR" -lt 6 ] || [ "$HOUR" -gt 21 ]; then
    exit 0
fi

RUNNER="./venv/bin/python scripts/automation/runner.py"
PY="./venv/bin/python"

# 업무 보드용 일일 이슈 생성 (07:00~08:00에만, 중복 방지 내장)
if [ "$HOUR" -eq 7 ]; then
    $RUNNER --job create_daily_issues --timeout 30 -- $PY scripts/healthcheck/create_daily_issues.py
fi

# Wake 후 보충: morning_routine이 오늘 안 돌았으면 즉시 실행
MORNING_LOG="logs/morning_routine_$(date +%Y%m%d)_summary.json"
if [ "$HOUR" -ge 7 ]; then
  if [ "$HOUR" -le 10 ]; then
    if [ ! -f "$MORNING_LOG" ]; then
      echo "[$(date)] Wake catch-up: morning_routine 미실행 감지"
      ./scripts/automation/morning_routine.sh
    fi
  fi
fi

# 적응형 heartbeat — 이슈 수에 따라 에이전트별 interval 자동 조정
$RUNNER --job adaptive_heartbeat --timeout 30 -- $PY scripts/healthcheck/adaptive_heartbeat.py

$RUNNER --job check_data              --timeout 120 --retries 2 -- $PY scripts/healthcheck/check_data.py
$RUNNER --job check_signal_chain      --timeout 60  --retries 1 -- $PY scripts/healthcheck/check_signal_chain.py
$RUNNER --job check_pending_actions   --timeout 60  --retries 1 -- $PY scripts/healthcheck/check_pending_actions.py
$RUNNER --job check_report            --timeout 30              -- $PY scripts/healthcheck/check_report.py
$RUNNER --job check_portfolio         --timeout 60  --retries 1 -- $PY scripts/healthcheck/check_portfolio.py
$RUNNER --job evaluate_signal_quality --timeout 30              -- $PY scripts/healthcheck/evaluate_signal_quality.py
$RUNNER --job check_paperclip_issues  --timeout 30              -- $PY scripts/healthcheck/check_paperclip_issues.py
PAPERCLIP_COMPANY_ID=9045933e-40ca-4a08-8dad-38a8a054bdf3 $RUNNER --job check_paperclip_issues_aid --timeout 30 -- $PY scripts/healthcheck/check_paperclip_issues.py

# 일일 요약은 10:00~11:00에만
if [ "$HOUR" -eq 10 ]; then
    $RUNNER --job daily_summary --timeout 30 -- $PY scripts/healthcheck/daily_summary.py
fi

# 자가 개선 사이클은 14:00~15:00에만 (주간회의 전 데이터 준비)
if [ "$HOUR" -eq 14 ]; then
    $RUNNER --job improvement_cycle --timeout 60 -- $PY scripts/healthcheck/improvement_cycle.py
fi

# 그림자 시뮬레이션 매도는 16:00~17:00에만 (장 마감 후)
if [ "$HOUR" -eq 16 ]; then
    $RUNNER --job shadow_autosell --timeout 60 -- $PY scripts/closing-bet/shadow_autosell.py
fi
