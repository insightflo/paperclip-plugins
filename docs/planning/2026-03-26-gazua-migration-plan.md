# 가즈아 스크립트 마이그레이션 계획 (v2 — 리뷰 반영)

> 리뷰 점수: B- (68/100). Gemini + Codex 3-Stage 리뷰 반영.
> Score Card: `.claude/cmux-ai/review/final-scorecard.md`

## 배경

가즈아(투자·자금관리) 회사의 외부 자동화 인프라를 Paperclip Plugin 시스템으로 내장화한다.

**현재 상태:**
- 82개 Python 스크립트 (alpha-prime-personal/scripts/)
- 13개 launchd 작업 (30분 간격 ~ 일일)
- runner.py + healthcheck_routine.sh 기반 실행
- Telegram 봇 연동 (승인/알림)

**목표:**
- launchd 전량 삭제
- runner.py / self_healing_runner.py 삭제
- Workflow Engine(cron) + Tool Registry + Agent 조합으로 전체 대체
- 외부 의존 0

## 아키텍처

```
Workflow Engine (cron schedule, timezone: Asia/Seoul)
  → Tool step: 데이터 수집/스크리닝/매매 실행 (시스템)
  → Agent step: 분석/판단/리포트 작성 (에이전트)
  → Tool step: 알림 전송 (시스템, onFailure: skip)
```

## 선행 작업 (Phase 0)

리뷰에서 발견된 Workflow Engine 확장 필요 사항:

| 항목 | 설명 | 우선순위 |
|------|------|----------|
| `maxDailyRuns` | WF-6 등 다회 실행 워크플로우를 위한 Daily Guard 예외 | **Critical** |
| `timezone` | Workflow 정의에 타임존 명시 (기본: Asia/Seoul) | **Critical** |
| step별 timeout | Agent step에 hard timeout 설정 (WF-2용) | **Critical** |
| WF deadline | 전체 워크플로우 완료 시한 (WF-2: 15:10) | High |
| notify onFailure: skip | 알림 실패로 WF 전체가 failed 되지 않도록 | High |

## Workflow 정의

### WF-1: 모닝 루틴 (gazua-morning)
- **Schedule**: `0 7 * * 1-5` (평일 07:00 KST)
- **Timezone**: Asia/Seoul
- **목적**: 장전 시황 수집 + 시그널 분석 + 전략 브리핑

| Step | Type | 실행 | 도구/에이전트 | dependsOn | onFailure |
|------|------|------|-------------|-----------|-----------|
| collect-market | tool | 시장 데이터 수집 | collect-market-data | - | abort |
| collect-signals | tool | 시그널 집계 | collect-signals | - | abort |
| analyze | agent | 시황 분석 + 리서치 노트 | 셜록 (timeout: 5분) | collect-market, collect-signals | abort |
| strategy | agent | 전략 브리핑 + 워치리스트 | 제갈량 (timeout: 5분) | analyze | abort |
| notify | tool | 텔레그램 전략 전송 | send-telegram | strategy | **skip** |

### WF-2: 종가배팅 (gazua-closing-bet)
- **Schedule**: `0 14 * * 1-5` (평일 14:00 KST)
- **Timezone**: Asia/Seoul
- **Deadline**: 15:10 (초과 시 자동 취소)
- **목적**: 종가배팅 종목 선정 + 매매 실행
- **⚠️ 2단계 분리**: Agent 판단(14:00) → Tool-only 실행

| Step | Type | 실행 | 도구/에이전트 | dependsOn | timeout | onFailure |
|------|------|------|-------------|-----------|---------|-----------|
| screen | tool | 종목 스크리닝 | screen-stocks | - | 3분 | abort |
| signal-check | agent | 시그널 분석 + 위험도 | 코난 | screen | **3분** | abort |
| select | agent | 최종 종목 선정 (JSON 출력 필수) | 제갈량 | signal-check | **3분** | abort |
| execute | tool | 매매 실행 | closing-bet-select | select | 2분 | abort |
| notify | tool | 텔레그램 매매 결과 | send-telegram | execute | 1분 | **skip** |

**Agent output 계약** (select → execute):
```json
{
  "stocks": [
    { "code": "005930", "name": "삼성전자", "weight": 0.3, "reason": "..." }
  ],
  "mode": "shadow" | "real",
  "total_budget": 1000000
}
```

### WF-3: 종가배팅 후속 (gazua-closing-bet-followup)
- **Schedule**: `5 9 * * 2-6` (평일 다음날 **09:05 KST** — 동시호가 이후)
- **Timezone**: Asia/Seoul

| Step | Type | 실행 | 도구/에이전트 | dependsOn | onFailure |
|------|------|------|-------------|-----------|-----------|
| check-positions | tool | 보유 종목 수익률 조회 | sync-portfolio | - | abort |
| auto-sell | tool | 자동 매도 실행 | closing-bet-sell | check-positions | abort |
| settle | agent | 정산 기록 + 손익 분석 | 스크루지 | auto-sell | abort |
| notify | tool | 텔레그램 정산 결과 | send-telegram | settle | **skip** |

### WF-4: 이브닝 루틴 (gazua-evening)
- **Schedule**: `0 18 * * 1-5` (평일 18:00 KST)

| Step | Type | 실행 | 도구/에이전트 | dependsOn | onFailure |
|------|------|------|-------------|-----------|-----------|
| collect-closing | tool | 종가 데이터 수집 | collect-market-data | - | abort |
| report | agent | 일일 리포트 작성 | 해리포터 | collect-closing | abort |
| notify | tool | 텔레그램 일일 요약 | send-telegram | report | **skip** |

### WF-5: 주간 회고 (gazua-weekly)
- **Schedule**: `0 17 * * 5` (금요일 17:00 KST)

| Step | Type | 실행 | 도구/에이전트 | dependsOn | onFailure |
|------|------|------|-------------|-----------|-----------|
| collect-weekly | tool | 주간 성과 데이터 수집 | collect-market-data --weekly | - | abort |
| analyze | agent | 주간 분석 + 전략 평가 | 셜록 | collect-weekly | abort |
| blog | agent | 블로그 포스트 작성 | 해리포터 | analyze | abort |
| upload | tool | 네이버 블로그 업로드 | upload-blog | blog | **skip** |
| notify | tool | 텔레그램 주간 회고 | send-telegram | upload | **skip** |

### WF-6: 매크로 센티널 (gazua-macro-sentinel)
- **Schedule**: `*/30 9-15 * * 1-5` (장중 30분 간격)
- **maxDailyRuns**: unlimited (Daily Guard 예외)

| Step | Type | 실행 | 도구/에이전트 | dependsOn | onFailure |
|------|------|------|-------------|-----------|-----------|
| scan | tool | 매크로 이벤트 스캔 | macro-sentinel | - | skip |
| evaluate | agent | 이벤트 영향도 평가 | 셜록 (timeout: 3분) | scan | skip |
| notify | tool | 텔레그램 긴급 알림 | send-telegram | evaluate | **skip** |

## Tool Registry 등록

### 신규 도구 (10개)

| Tool Name | Command | Working Dir | 설명 | 비고 |
|-----------|---------|-------------|------|------|
| collect-market-data | `python3 scripts/data-collection/collect_daily_delta.py --json` | alpha-prime-personal | 시장 데이터 수집 | `--json` 출력 추가 필요 |
| collect-signals | `python3 scripts/automation/signal_aggregator.py --json` | alpha-prime-personal | 시그널 집계 | `--json` 출력 추가 필요 |
| screen-stocks | `python3 scripts/screening/screen_market.py --json` | alpha-prime-personal | 종목 스크리닝 | `--json` 출력 추가 필요 |
| sync-portfolio | `python3 scripts/portfolio/sync_prices.py --json` | alpha-prime-personal | 포트폴리오 동기화 | |
| closing-bet-select | `python3 scripts/closing-bet/closing_bet_selection.py --json` | alpha-prime-personal | 종가배팅 종목 선정+실행 | Secret ref로 KIS 토큰 주입 |
| closing-bet-sell | `python3 scripts/closing-bet/closing_bet_auto_sell.py --json` | alpha-prime-personal | 자동 매도 | Secret ref로 KIS 토큰 주입 |
| macro-sentinel | `python3 scripts/automation/macro_sentinel.py --json` | alpha-prime-personal | 매크로 이벤트 스캔 | |
| upload-blog | `python3 scripts/blog/upload_to_naver_blog.py` | alpha-prime-personal | 네이버 블로그 업로드 | **Playwright headless 설정 필요** |
| send-telegram | `python3 scripts/automation/send_telegram_wrapper.py` | alpha-prime-personal | 텔레그램 메시지 전송 | **신규 wrapper CLI 작성 필요** (routine_common.py는 CLI가 아님) |
| kill-switch | `python3 scripts/automation/kill_switch.py` | alpha-prime-personal | 긴급 전체 매매 중단 | **신규 작성 필요** |

### 보안: Secret Reference
- KIS API 토큰: Paperclip Secrets에 중앙 저장, Tool env에서 `$KIS_TOKEN` 참조
- Telegram 봇 토큰: Paperclip Secrets에 저장
- 토큰 평문 저장 금지 — stdout/stderr 로그 마스킹 필수

## 에이전트 역할 매핑

| 에이전트 | Workflow 역할 | 담당 step |
|----------|-------------|-----------|
| **제갈량** (CEO) | 전략 결정, 종목 최종 선정 | WF-1/strategy, WF-2/select |
| **셜록** (Research) | 시황 분석, 주간 분석, 매크로 평가 | WF-1/analyze, WF-5/analyze, WF-6/evaluate |
| **코난** (QA/Signal) | 시그널 검증 | WF-2/signal-check |
| **스크루지** (Finance) | 정산, 손익 기록 | WF-3/settle |
| **해리포터** (Marketing) | 리포트/블로그 작성 | WF-4/report, WF-5/blog |
| **포청천** (Inspector) | 산출물 검수 (audit.ts 기반) | 모든 WF 완료 후 |

## 삭제 대상

### launchd (13개 + 2개 = 15개 전량 삭제)
```
alpha-prime-personal/launchd/ 내 13개 plist
paperclip-addon의 com.ai-dev-factory.check-paperclip.plist
paperclip-addon의 com.alpha-prime.check-paperclip.plist
```

### 스크립트
- runner.py, self_healing_runner.py — Workflow Engine 대체
- adaptive_heartbeat.py — heartbeat OFF 정책
- healthcheck/ 전체 — Paperclip 내장 기능 대체
- healthcheck_routine.sh — Workflow cron 대체

## 구현 순서 (리뷰 반영: 읽기전용 먼저 → shadow → real)

### Phase 0: Workflow Engine 확장 (0.5일)
1. `maxDailyRuns` 필드 + Daily Guard 예외 처리
2. `timezone` 필드 + cron 매칭 시 TZ 적용
3. step별 `timeout` 필드 + WF `deadline` 필드
4. 한국 증시 휴장일 캘린더 체크 (Tool 내부 또는 cron 조건)

### Phase 1: 읽기전용 Workflow (1일)
1. send-telegram **wrapper CLI** 신규 작성
2. collect-market-data, collect-signals Tool 등록 (--json 출력 추가)
3. **gazua-morning** Workflow 생성 + 테스트
4. **gazua-evening** Workflow 생성 + 테스트
5. **gazua-macro-sentinel** Workflow 생성 + 테스트 (maxDailyRuns 확인)
6. 모닝/이브닝/매크로 launchd 삭제

### Phase 2: 종가배팅 — Shadow 모드 (1일)
1. screen-stocks, closing-bet-select, closing-bet-sell Tool 등록 (--json + Secret ref)
2. sync-portfolio Tool 등록
3. kill-switch Tool 신규 작성
4. **gazua-closing-bet** Workflow 생성 (mode: shadow)
5. **gazua-closing-bet-followup** Workflow 생성 (09:05)
6. Agent output schema 검증 (select → execute JSON 계약)
7. 1주 shadow 병행 운영

### Phase 3: 종가배팅 — Real 전환 (shadow 검증 후)
1. shadow 결과 분석 (체결 타이밍, 정합성, 에러율)
2. closing-bet-select mode를 real로 전환
3. 종가배팅 launchd 3개 삭제

### Phase 4: 주간 회고 + 블로그 (0.5일)
1. upload-blog Tool 등록 (Playwright headless 설정)
2. **gazua-weekly** Workflow 생성
3. 주간 launchd 삭제

### Phase 5: 정리 (0.5일)
1. 남은 launchd 전량 삭제 확인
2. healthcheck/ 삭제
3. runner.py, self_healing_runner.py 삭제
4. 전체 E2E 테스트

## 일정

| Phase | 기간 | 비고 |
|-------|------|------|
| Phase 0 | 0.5일 | Workflow Engine 확장 |
| Phase 1 | 1일 | 읽기전용 WF |
| Phase 2 | 1일 | 종가배팅 shadow |
| **Shadow 검증** | **1주** | 병행 운영 |
| Phase 3 | 0.5일 | Real 전환 |
| Phase 4 | 0.5일 | 주간/블로그 |
| Phase 5 | 0.5일 | 정리 |
| **총** | **약 2주** (구현 4일 + shadow 1주 + 전환 1일) |

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Daily Guard가 WF-6 차단 | 매크로 센티널 하루 1회만 | maxDailyRuns 선행 구현 (Phase 0) |
| 종가배팅 Agent 지연 | 15:20 매수 마감 초과 | step timeout 3분 + WF deadline 15:10 |
| Agent output 파싱 실패 | 매매 실행 불가 | select→execute JSON schema 명시 |
| KIS API 토큰 만료 | 매매 실행 실패 | Secret ref 중앙관리 + Tool 내 갱신 |
| send-telegram CLI 미존재 | 알림 불가 | wrapper CLI 신규 작성 (Phase 1) |
| upload-blog Playwright | headless 실패 | 환경 설정 검증 (Phase 4) |
| WF-3 동시호가 충돌 | 자동매도 실패 | 09:05로 스케줄 변경 |
| 셜록 동시 세션 경합 | WF-1 + WF-6 겹침 | Workflow Engine 동시 실행 제한 검토 |
