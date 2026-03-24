# ADR-2026-03-23: 가즈아 투자 대시보드 v1 로컬 게이트웨이 아키텍처

- 날짜: 2026-03-23
- 관련 이슈: AID-256
- 상태: 승인 제안
- 결정 유형: 가역

## 배경

가즈아 투자 대시보드는 Paperclip 관리자 화면이 아니라, 투자 산출물을 한눈에 보는 독립 웹앱이어야 한다. v1 요구사항은 세 가지 데이터 면을 동시에 다뤄야 한다.

- 파일 기반 투자 데이터: `portfolio/portfolio.json`, `portfolio/watchlist.json`, `data/market_signals/*.json`
- Markdown 보고서: 시황 리포트, 매매 전략, 종가 베팅 리포트
- Paperclip 운영 데이터: 에이전트 상태, 최근 산출물 타임라인

참고 구현인 `/Users/kwak/Projects/ai/alpha-prime-personal/Alpha_Prime_RPG_Status.html`은 UI 방향을 잘 보여주지만, 정적 HTML만으로는 위 세 면을 안정적으로 연결하기 어렵다.

- 브라우저 단독 실행은 저장소 바깥/상위 경로 파일 접근이 제한된다.
- Markdown/JSON 여러 디렉터리를 묶어 "최신 스냅샷"으로 정규화할 서버 계층이 필요하다.
- Paperclip API 응답을 UI 친화적인 카드/타임라인 형태로 가공할 어댑터가 필요하다.

동시에 기존 코드베이스는 Python 스크립트 중심이며, Node 측은 사실상 비어 있다. 즉 v1 최적해는 "무거운 풀스택 프레임워크"보다 "얇은 로컬 데이터 게이트웨이 + SPA"에 가깝다.

## 결정

가즈아 투자 대시보드 v1은 아래 아키텍처를 채택한다.

1. 프론트엔드는 `React 19 + TypeScript + Vite` SPA로 구현한다.
2. 백엔드는 `FastAPI` 기반 로컬 데이터 게이트웨이로 구현한다.
3. 게이트웨이는 파일 시스템과 Paperclip API를 읽어 UI 전용 JSON으로 정규화한다.
4. 데이터 갱신은 v1에서 OS 레벨 file watch 대신 `mtime 기반 polling + 짧은 캐시`로 처리한다.
5. 운영 형태는 "로컬 우선"으로 둔다. 개발 중에는 프론트/백을 분리 실행하고, 배포형 로컬 실행은 FastAPI가 빌드된 SPA를 함께 서빙한다.

## 상세 설계

### 1. 프론트엔드

- 목적: RPG 스타일 대시보드, 리포트 뷰어, 에이전트 타임라인
- 선택: React 19, TypeScript, Vite
- 상태 관리: 서버 상태 중심. 전역 앱 상태는 최소화하고 polling/caching은 `@tanstack/react-query`로 처리
- 스타일링: 참고 HTML의 RPG 톤을 유지하기 위해 CSS 변수 + 수동 스타일을 우선한다. v1에서 Tailwind는 필수로 도입하지 않는다.

이 조합은 초기 화면 개발 속도와 후속 디자인 반영 속도 사이 균형이 가장 좋다.

### 2. 백엔드 게이트웨이

FastAPI 게이트웨이는 "비즈니스 로직 서버"가 아니라 "로컬 집계기"로 둔다.

책임은 아래로 제한한다.

- 파일 읽기와 최신 파일 선택
- 간단한 파생 계산
- Paperclip API 호출과 요약
- 프론트엔드용 응답 스키마 고정

반대로 아래는 v1 범위에서 제외한다.

- DB 도입
- 사용자 인증
- 파일 쓰기/편집
- WebSocket 실시간 스트림

### 3. 파일 데이터 어댑터

게이트웨이는 아래 세 종류의 어댑터를 둔다.

1. Portfolio adapter
- 입력: `portfolio/portfolio.json`, `portfolio/watchlist.json`
- 출력: 요약 지표, 보유 종목, 워치리스트, 위험 구간 카드

2. Signal adapter
- 입력: `data/market_signals/*.json`, 대응 `.md`
- 출력: 최신 market top, macro regime, theme, FTD 요약

3. Report adapter
- 입력:
  - `reports/strategy/buy_sell_strategy_*.md`
  - `reports/blog/Public_Market_Report_*.md`
  - `closing_bet/**/*.md`
- 출력: 카테고리별 최신 문서 목록, 문서 본문, 날짜/경로 메타데이터

### 4. Paperclip adapter

v1에서 Paperclip 연동은 "운영 현황 카드 + 산출물 타임라인"에 집중한다.

- 에이전트 상태: `GET /api/companies/{companyId}/dashboard`, `GET /api/companies/{companyId}/agents`
- 타임라인: `GET /api/companies/{companyId}/issues`
  - 최근 `done`, `in_review` 이슈를 기준으로 정렬
  - `[보고]`, `[QA 요청]`, `[기술 이전]` 같은 접두사를 우선 노출
  - 최신 코멘트가 있으면 함께 요약해 "누가 언제 무엇을 냈는지" 카드로 변환

즉 v1 타임라인은 "별도 아티팩트 저장소"가 아니라 "이슈/코멘트 기반 산출물 피드"로 정의한다.

### 5. 갱신 전략

v1은 file watch보다 polling이 낫다.

- 파일 데이터: 서버가 10초 단위로 `mtime`을 확인하고 캐시를 갱신
- Paperclip 데이터: 서버가 30초 TTL 캐시로 API 응답을 재사용
- 프론트엔드: 15초 summary polling, 30초 timeline polling, 60초 reports index polling

이유는 단순하다.

1. 파일 소스가 여러 디렉터리에 흩어져 있다.
2. macOS/리눅스 차이를 가진 watch 계층은 초기 장애면이 넓다.
3. 투자 데이터는 초단위 트레이딩 시스템이 아니라, 수 초 내 갱신이면 충분하다.

### 6. 실행 모델

개발 모드:

- FastAPI: `uvicorn ... --reload`
- Frontend: `yarn dev`

로컬 배포 모드:

- `vite build`
- FastAPI가 `dist/` 정적 파일과 `/api/*`를 함께 서빙

`python -m http.server` 단독 방식은 v1 기본 실행으로 채택하지 않는다. 파일 시스템 집계와 Paperclip 프록시가 불가능하기 때문이다.

## 근거

1. 실제 데이터 소스가 JSON/Markdown 파일 중심이라 DB보다 파일 게이트웨이가 맞다.
2. `alpha-prime-personal`은 Python 런타임이 이미 중심이므로 FastAPI 추가 비용이 낮다.
3. 참고 HTML이 보여준 강한 시각 언어는 SPA로 옮기기 쉽고, 서버는 얇을수록 안전하다.
4. 정적 사이트만으로는 Paperclip API 요약과 보고서 인덱싱을 동시에 해결하기 어렵다.
5. polling은 watch보다 느리지만, v1에서 운영 복잡도를 크게 줄인다.

## 구현 경계

스파이더맨(개발) 구현 범위:

- `apps/gazua-dashboard/` 구조 생성
- FastAPI 게이트웨이 엔드포인트 구현
- React SPA 뷰 구현
- 파일/리포트/Paperclip 어댑터 연결

호크아이(QA) 검증 범위:

- 최신 파일 교체 후 30초 이내 UI 반영 확인
- Paperclip API 실패 시 fallback 카드/에러 배너 확인
- Markdown 보고서 뷰어 렌더링 확인
- 정적 빌드 + FastAPI 단일 실행 smoke test 확인

헐크(R&D) 후속 범위:

- polling 비용이 커질 때 watch 전환 기준선 수립
- 보고서 Markdown에서 구조화 메타데이터 자동 추출 고도화
- Paperclip 타임라인 relevance ranking 개선

## 보류한 대안

### 대안 1. 정적 HTML/JS만으로 구현

기각. 파일 집계와 Paperclip 연동이 취약하고, 최신 파일 선택 로직이 브라우저 코드에 과도하게 들어간다.

### 대안 2. Next.js/SvelteKit 같은 풀스택 프레임워크 도입

보류. 지금 필요한 것은 SSR이 아니라 로컬 파일 게이트웨이이며, 풀스택 프레임워크는 초기 설치면만 키운다.

### 대안 3. file watch를 기본 갱신 메커니즘으로 도입

기각. v1에서 운영 단순성이 더 중요하다. polling으로도 요구사항 충족이 가능하다.

## 결과

이 결정은 가역이다.

- 프론트엔드는 추후 다른 SPA 프레임워크로 교체 가능하다.
- FastAPI 게이트웨이는 계약만 유지하면 Node/Bun 서버로 옮길 수 있다.
- polling은 추후 watch 또는 SSE/WebSocket으로 대체 가능하다.

현재 최적 전략은 "React SPA + FastAPI 로컬 게이트웨이 + polling 기반 최신화"다.
