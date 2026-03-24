# ADR-2026-03-23: 도메인 CLI 기준 executor/maintainer 분리 PoC

- 날짜: 2026-03-23
- 관련 이슈: AID-240
- 상태: 승인 제안
- 결정 유형: 가역

## 배경

현업 에이전트와 유지보수 에이전트를 분리하려면 경계가 단순하고 재사용 가능해야 한다. 현재 `scripts/parse`는 이미지/PDF/HTML 입력을 각 구현체로 라우팅하는 얇은 CLI이며, 이미 여러 차례 PoC와 QA 이관을 거친 상태다.

동시에 Paperclip 쪽 표면은 다음이 확인된다.

- `agent.metadata`는 이미 DB와 API에서 지원된다.
- `PATCH /api/agents/:id`로 metadata를 갱신할 수 있다.
- `GET /api/companies/:companyId/heartbeat-runs`와 `GET /api/heartbeat-runs/:runId`로 실패한 run과 `errorCode`를 조회할 수 있다.
- orphaned run은 `process_lost`로 마킹된다.
- 반면 `agent.run.failed` 같은 plugin event 타입은 상수로 정의돼 있지만, 현재 서버 emit 경로는 즉시 확인되지 않았다.

즉, 역할 분리는 지금 바로 붙일 수 있지만, "실패 시 자동 유지보수 이슈 생성"은 기존 API를 재사용할지 Paperclip 코어 이벤트를 늘릴지 선택이 필요하다.

## 결정

PoC v1은 아래 세 가지를 채택한다.

1. 분리 단위는 "도메인 코드베이스"가 아니라 "도메인 CLI 계약"으로 둔다.
2. 역할 구분은 에이전트 프롬프트가 아니라 `agent.metadata`에 기록한다.
3. 실패 감지는 Paperclip 코어 수정 대신 외부 watcher가 heartbeat-runs API를 polling하는 방식으로 시작한다.

## 상세 설계

### 1. 역할 계약

PoC 메타데이터 표준은 아래처럼 둔다.

```json
{
  "workRole": "executor",
  "domainCli": {
    "key": "parse",
    "maintainerAgentId": "c3df8f39-aa06-45b0-be1f-36949314b21a",
    "allowedCommands": ["parse --image", "parse --render"]
  },
  "failurePolicy": {
    "source": "heartbeat_run_poll",
    "createIssueOn": ["failed", "timed_out"],
    "dedupeKey": "agentId:issueId:errorCode",
    "assigneeAgentId": "c3df8f39-aa06-45b0-be1f-36949314b21a"
  }
}
```

- `workRole=executor`는 코드 수정 권한이 아니라 CLI 호출 책임을 뜻한다.
- `workRole=maintainer`는 해당 CLI 내부 구현 변경과 장애 처리 책임을 뜻한다.
- 유지보수 소유자는 metadata에 명시해 자동 라우팅 기준으로 사용한다.

### 2. 실패 자동화

PoC watcher는 아래 흐름으로 둔다.

1. heartbeat-runs API에서 최근 실패 run을 조회한다.
2. 관련 issue/run/errorCode를 읽어 중복 여부를 판정한다.
3. 실행 주체 agent의 metadata에서 `maintainerAgentId`를 찾는다.
4. `[버그 수정]` 이슈를 생성해 maintainer에게 할당한다.
5. 원본 실행 이슈에는 생성된 후속 이슈 링크를 코멘트로 남긴다.

## 근거

1. `scripts/parse`는 이미 얇은 라우터라서 executor가 "도구 사용법만 안다"는 경계와 잘 맞는다.
2. metadata는 기존 API/DB 표면에 있으므로 별도 스키마 마이그레이션이 필요 없다.
3. watcher 방식은 `/Users/kwak/Projects/ai/paperclip/` 수정 금지 제약을 피하면서도 자동 이슈 생성을 실험할 수 있다.
4. `agent.run.failed` emit이 실제로 연결되지 않은 상태에서 코어 이벤트를 전제로 설계를 고정하면 PoC 착수가 늦어진다.

## 보류한 대안

### 대안 1. Paperclip 코어에 `agent.run.failed` emit 추가 후 plugin으로 처리

장점은 깔끔하지만, 현재 PoC의 병목은 이벤트 연결 확인과 코어 변경 승인이다. 수정 금지 제약 하에서는 바로 실행할 수 없다.

### 대안 2. 역할 구분을 agent instructions에만 둔다

기각. 자동 라우팅과 장애 처리 기준으로 읽을 구조화 데이터가 없다.

### 대안 3. executor가 실패 시 직접 maintainer 이슈를 생성한다

기각. executor가 실패한 순간 동일 runtime/session이 불안정할 수 있어 실패 감지와 후속 이슈 생성을 한 프로세스에 묶지 않는 편이 안전하다.

## 결과

이 결정은 가역이다.

- watcher가 과도한 polling 비용이나 중복 이슈를 유발하면 코어 이벤트 방식으로 전환할 수 있다.
- metadata key 구조가 불편하면 기존 JSONB 범위 안에서 쉽게 바꿀 수 있다.
- `parse` PoC가 안정화되면 같은 패턴을 `customsFlo` 같은 다른 도메인 CLI로 확장할 수 있다.

현재 최적 전략은 "CLI 계약을 경계로 삼고, metadata로 소유권을 선언하며, 실패 자동화는 외부 watcher로 시작"이다.
