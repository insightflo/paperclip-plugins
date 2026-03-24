# 현업/IT 분리 PoC 아키텍처

- 작성일: 2026-03-23
- 소스 이슈: AID-240
- 대상 CLI: `parse`

## 목적

현업 에이전트는 CLI 계약만 알고 실행하고, 유지보수 에이전트는 그 CLI의 내부 구현과 장애를 책임지는 구조를 `parse`에서 먼저 검증한다.

## 역추적 결과

### `parse` 경계는 이미 존재한다

- `scripts/parse`는 입력 타입을 보고 `hyocr`, `webparse`, `opendataloader-pdf`로 라우팅하는 얇은 통합 CLI다.
- 최근 AID-154, AID-155, AID-166, AID-175, AID-185로 PDF/렌더/가드레일이 이미 축적돼 있어 PoC 대상의 안정성이 상대적으로 높다.

### Paperclip에 필요한 최소 표면은 있다

- `agent.metadata`는 현재 `GET /api/agents/me` 응답과 `PATCH /api/agents/:id`에서 지원된다.
- heartbeat failure는 `GET /api/companies/:companyId/heartbeat-runs`와 `GET /api/heartbeat-runs/:runId`로 읽을 수 있다.
- `process_lost` 같은 에러 코드는 heartbeat 서비스가 직접 기록한다.

### 아직 비어 있는 부분도 있다

- plugin event 타입에는 `agent.run.failed`가 정의돼 있다.
- 하지만 현재 서버 코드에서 그 이벤트를 명시적으로 emit하는 경로는 즉시 확인되지 않았다.
- 따라서 "plugin event만 믿고 자동화"는 PoC 시작점으로는 불안정하다.

## 결정표

| 항목 | 결정 | 가역/비가역 |
|------|------|-------------|
| 분리 경계 | 코드베이스가 아니라 `parse` 같은 도메인 CLI 계약으로 분리 | 가역 |
| 역할 저장 위치 | 프롬프트가 아니라 `agent.metadata`에 역할/소유권 저장 | 가역 |
| 장애 자동화 | Paperclip 코어 수정 대신 외부 watcher가 heartbeat-runs API를 polling | 가역 |

이번 PoC에서는 비가역 결정을 하지 않는다.

## 역할 모델

### Executor

- 책임: 입력 수집, `parse` 호출, 결과 확인, 사용자/상위 이슈에 전달
- 금지: `parse` 내부 코드 수정, 라우팅 로직 변경, 의존성 수리
- 필요 메타데이터:
  - `workRole=executor`
  - `domainCli.key=parse`
  - `domainCli.maintainerAgentId=<스파이더맨>`

### Maintainer

- 책임: `parse` 내부 구현 수정, 장애 분석, 후속 QA 요청
- 금지: 현업 이슈를 executor 대신 장기 점유
- 필요 메타데이터:
  - `workRole=maintainer`
  - `domainCli.key=parse`
  - `domainCli.owner=true`

## 실패 처리 흐름

1. executor heartbeat run 실패
2. watcher가 최근 failed/timed_out run 조회
3. run의 `issueId`, `agentId`, `errorCode`를 기준으로 dedupe
4. 실행 agent metadata에서 maintainer 매핑 확인
5. `[버그 수정] parse 실행 장애` 이슈를 maintainer에게 생성
6. maintainer가 수정 후 `[QA 요청]`으로 호크아이에게 전달

## watcher 최소 요구사항

- 입력:
  - company id
  - 감시 대상 agent id 목록 또는 `metadata.domainCli.key=parse` 필터 결과
- 판정:
  - `status in (failed, timed_out)`
  - `errorCode`별 dedupe
  - 동일 source issue에 열린 후속 장애 이슈가 있으면 재생성 금지
- 출력:
  - 개발 라벨 이슈 생성
  - 원본 이슈 코멘트
  - maintainer agent 할당

## 작업 분해

### 헐크

- watcher 신호원 검증
- `process_lost`, `adapter_failed`, `timed_out` 케이스별 중복 규칙 실험
- polling 주기와 오탐률 보고

### 스파이더맨

- metadata patch 유틸 또는 운영 스크립트 작성
- parse executor/maintainer PoC wiring 구현
- watcher 초안 구현

### 호크아이

- 메타데이터 반영 확인
- 실패 주입 후 후속 이슈 자동 생성 검증
- maintainer 할당과 QA 핸드오프 경로 검증

## 성공 기준

- executor가 `parse` 내부 구현을 몰라도 운영 가능하다.
- maintainer 소유권이 metadata만으로 판별된다.
- 실패 run 1건이 maintainer용 후속 이슈 1건으로 안정적으로 라우팅된다.
- 중복 장애 이슈가 무한 생성되지 않는다.
