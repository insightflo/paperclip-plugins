# 가즈아 투자 대시보드 아키텍처 계획

- 작성일: 2026-03-23
- 관련 이슈: AID-256
- 참조 ADR: `docs/adr/2026-03-23-gazua-dashboard-local-gateway-architecture.md`
- 기준 코드베이스: `/Users/kwak/Projects/ai/alpha-prime-personal`

## 1. 목표

가즈아 투자 산출물을 브라우저에서 한 번에 보는 독립 웹앱을 만든다. 구현자가 바로 착수할 수 있도록 v1 기준선만 고정한다.

v1 목표:

- RPG 스타일 overview 대시보드
- portfolio/watchlist/signals 최신 스냅샷
- Markdown 보고서 뷰어
- Paperclip 에이전트 상태 + 산출물 타임라인

v1 비목표:

- 로그인/권한
- 파일 수정 기능
- WebSocket 실시간 스트리밍
- 모바일 네이티브 앱

## 2. 제안 저장소 구조

대상 경로:

`/Users/kwak/Projects/ai/alpha-prime-personal/apps/gazua-dashboard`

권장 구조:

```text
apps/gazua-dashboard/
  frontend/
    src/
      app/
      components/
      features/
      lib/
      styles/
  backend/
    app/
      main.py
      settings.py
      routers/
      services/
      adapters/
      schemas/
  shared/
    contracts/
```

이유:

- 기존 스크립트/리포트 디렉터리를 건드리지 않는다.
- 독립 앱 경계를 분명하게 유지한다.
- 후속 배포와 삭제가 쉽다.

## 3. 기술 스택

프론트엔드:

- React 19
- TypeScript
- Vite
- `@tanstack/react-query`
- `react-markdown`

백엔드:

- FastAPI
- Pydantic
- `uvicorn[standard]`
- `httpx`

스타일:

- CSS variables
- feature 단위 CSS 또는 CSS modules

선택하지 않은 것:

- Tailwind: v1 필수 아님
- Next.js: 과한 풀스택
- Zustand/Redux: v1에서 필요성 낮음

## 4. 데이터 소스 계약

### R1. Portfolio Resource

입력 파일:

- `portfolio/portfolio.json`
- `portfolio/watchlist.json`

핵심 출력:

- 총 자산 요약
- KR/US 계좌별 현금/평가액
- 보유 종목 목록
- 워치리스트 우선순위/서사 단계
- 위험 종목(danger/debuff) 카드

정규화 규칙:

- KR 계좌는 배열 합산
- US 계좌는 단일 객체
- watchlist의 `holding=true`를 기준으로 portfolio와 교차 검증

### R2. Market Signals Resource

입력 파일:

- `data/market_signals/market_top_*.json`
- `data/market_signals/macro_regime_*.json|.md`
- `data/market_signals/theme_*.json|.md`
- `data/market_signals/ftd_*.json|.md`

핵심 출력:

- 최신 레짐 카드
- risk budget / zone
- 주요 컴포넌트 점수
- narrative wheel용 단계별 요약

정규화 규칙:

- 파일명 날짜 기준 최신본 선택
- 같은 날짜의 `.json`과 `.md`가 공존하면 JSON을 구조 데이터, MD를 설명 텍스트로 사용

### R3. Reports Resource

입력 파일:

- `reports/blog/Public_Market_Report_*.md`
- `reports/strategy/buy_sell_strategy_*.md`
- `closing_bet/**/*.md`

카테고리:

- `market_report`
- `strategy_report`
- `closing_bet_report`

핵심 출력:

- 카테고리별 최신 문서 1건
- 최근 문서 목록
- 문서 본문 markdown
- 날짜, 제목, 상대 경로

정규화 규칙:

- 파일명 날짜를 우선 메타데이터로 사용
- frontmatter가 없어도 동작해야 함

### R4. Paperclip Resource

대상 회사:

- 가즈아: `11d0d62d-c2c5-439c-81ee-5d61ac178a55`

사용 API:

- `GET /api/companies/{companyId}/dashboard`
- `GET /api/companies/{companyId}/agents`
- `GET /api/companies/{companyId}/issues`
- 필요 시 `GET /api/issues/{issueId}/comments`

핵심 출력:

- 에이전트 상태 요약
- 최근 완료/검수중 이슈 타임라인
- 산출물 링크 후보

정규화 규칙:

- 타임라인 후보는 `done`, `in_review` 우선
- 제목 접두사 `[보고]`, `[QA 요청]`, `[기술 이전]`를 우선 노출
- 최신 코멘트가 있으면 미리보기 1개를 붙인다

## 5. API 초안

백엔드 base URL:

- dev: `http://localhost:8765`

필수 엔드포인트:

```text
GET /api/health
GET /api/overview
GET /api/portfolio
GET /api/watchlist
GET /api/signals
GET /api/reports
GET /api/reports/{category}/{slug}
GET /api/paperclip/status
GET /api/paperclip/timeline
```

### `GET /api/overview`

한 번에 그릴 요약 카드 응답.

포함:

- portfolio summary
- latest regime summary
- top danger items 3~5개
- latest report pointers
- paperclip high-level counts

### `GET /api/portfolio`

포함:

- `lastUpdated`
- `accounts`
- `holdings`
- `allocationSummary`

### `GET /api/watchlist`

포함:

- `strategyPhase`
- `items`
- `priorityBuckets`
- `narrativeStageCounts`

### `GET /api/signals`

포함:

- `marketTop`
- `macroRegime`
- `theme`
- `ftd`

### `GET /api/reports`

포함:

- 카테고리별 최신 문서
- 최근 문서 목록

### `GET /api/paperclip/status`

포함:

- dashboard counts
- agent list

### `GET /api/paperclip/timeline`

포함:

- 최근 20개 이벤트
- `identifier`
- `title`
- `status`
- `updatedAt`
- `assigneeName`
- `latestCommentPreview`

## 6. 화면 구성

### S1. Overview HUD

참조:

- `Alpha_Prime_RPG_Status.html`

포함:

- Character card
- HP/MP/CASH/THREAT bars
- regime banner
- quick stats

### S2. Holdings + Danger Zone

포함:

- 보유 종목 파티 카드
- 위험 종목 존
- 국가/계좌 필터

### S3. Watchlist + Narrative Wheel

포함:

- priority scout cards
- cycle/stage 필터
- narrative wheel

### S4. Reports Viewer

포함:

- category tabs
- latest document cards
- markdown viewer

### S5. Agent Timeline

포함:

- agent status strip
- recent issue timeline
- 산출물/코멘트 링크

## 7. 갱신 주기

서버 캐시:

- portfolio/watchlist: 10초
- signals: 15초
- reports index: 60초
- Paperclip status/timeline: 30초

클라이언트 polling:

- overview: 15초
- timeline: 30초
- reports index: 60초
- 보고서 본문: on-demand

선택 이유:

- 파일 생성 주기가 초단타가 아니다.
- polling이면 구현과 장애 분석이 단순하다.
- v1에서는 watch miss보다 복잡도 증가가 더 큰 리스크다.

## 8. 로컬 실행 방법

개발 모드:

1. 백엔드

```bash
cd /Users/kwak/Projects/ai/alpha-prime-personal/apps/gazua-dashboard/backend
python -m uvicorn app.main:app --reload --port 8765
```

2. 프론트엔드

```bash
cd /Users/kwak/Projects/ai/alpha-prime-personal/apps/gazua-dashboard/frontend
yarn install
yarn dev --port 4173
```

프로덕션형 로컬 실행:

```bash
cd /Users/kwak/Projects/ai/alpha-prime-personal/apps/gazua-dashboard/frontend
yarn build

cd /Users/kwak/Projects/ai/alpha-prime-personal/apps/gazua-dashboard/backend
python -m uvicorn app.main:app --port 8765
```

정적 서버 단독(`python -m http.server`)은 v1 공식 실행 경로로 채택하지 않는다.

## 9. 구현 태스크 분해

`tasks-generator` 방식으로 Resource와 Screen을 분리한다.

### Phase 0

- `P0-R1-T1` 앱 디렉터리/설정 스캐폴드 생성
- `P0-S0-T1` Vite 앱 셸과 공통 레이아웃 생성

### Phase 1 Resources

- `P1-R1-T1` portfolio/watchlist adapter 구현
- `P1-R2-T1` market_signals 최신본 선택 adapter 구현
- `P1-R3-T1` reports index + document loader 구현
- `P1-R4-T1` Paperclip status/timeline adapter 구현

### Phase 2 Screens

- `P2-S1-T1` overview HUD 구현
- `P2-S2-T1` holdings/danger zone 구현
- `P2-S3-T1` watchlist/narrative wheel 구현
- `P2-S4-T1` reports viewer 구현
- `P2-S5-T1` agent timeline 구현

### Phase 3 Verification

- `P3-S1-V` 최신 파일 교체 후 polling 반영 검증
- `P3-S2-V` Paperclip API 실패 fallback 검증
- `P3-S3-V` build 후 단일 FastAPI 실행 smoke test

## 10. 오픈 이슈

현재 구현 전 확인이 필요한 항목:

1. 시황 리포트의 공식 소스 디렉터리를 `reports/blog/Public_Market_Report_*.md`로 고정해도 되는지
2. Paperclip 타임라인에서 가즈아 회사(`ALP`)만 볼지, 개수라발발타(`AID`) 일부도 합칠지
3. closing bet 문서 목록을 전체 노출할지, 최신 N개만 노출할지

## 11. 다음 조치

- 스파이더맨은 `Phase 0`과 `Phase 1`부터 바로 구현 시작
- 쉬리는 동일 데이터 계약 위에서 RPG 디자인 시스템 구체화
- 호크아이는 `Phase 3` 기준으로 검증 체크리스트 준비
