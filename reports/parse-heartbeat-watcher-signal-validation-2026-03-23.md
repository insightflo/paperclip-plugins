# parse 장애 감시 신호·중복 규칙 검증

작성일: 2026-03-23
대상 이슈: `AID-242`

## 평가 질문

1. `process_lost`, `adapter_failed`, `timed_out`가 watcher 입력 신호로 충분한가?
2. `GET /api/companies/{companyId}/heartbeat-runs` polling 주기를 어떻게 잡아야 하는가?
3. `agentId:issueId:errorCode` dedupe key는 충분한가?

## 반증 조건 먼저

다음 중 하나라도 성립하면 "heartbeat-runs만 보고 바로 maintainer bug 이슈를 자동 생성한다"는 단순 설계를 기각한다.

1. 동일 `errorCode`라도 issue 연계가 없는 timer heartbeat 실패가 섞여 있다.
2. `timed_out`가 status와 errorCode에서 다른 문자열로 표현돼 key가 흔들린다.
3. 동일 장애가 여러 run으로 반복 노출되어 polling watcher가 중복 이슈를 쉽게 만든다.
4. `process_lost`가 서버 재시작 같은 집단 장애를 의미해 per-agent/per-issue dedupe만으로는 과다 생성이 발생한다.

## 근거 자료

- ADR: `/Users/kwak/Projects/ai/docs/adr/2026-03-23-domain-cli-executor-maintainer-poc.md`
- 아키텍처: `/Users/kwak/Projects/ai/docs/architecture/2026-03-23-domain-cli-separation-poc.md`
- 관련 코드:
  - `/Users/kwak/Projects/ai/paperclip/server/src/routes/agents.ts`
  - `/Users/kwak/Projects/ai/paperclip/server/src/services/heartbeat.ts`
  - `/Users/kwak/Projects/ai/paperclip/server/src/services/activity.ts`
  - `/Users/kwak/Projects/ai/scripts/healthcheck/check_heartbeats.py`

## 실측 요약

최근 `limit=500` 기준 집계:

- `process_lost`: `23건`
  - 최소 `17.629s`
  - 중앙값 `87.732s`
  - 최대 `1074.595s`
- `adapter_failed`: `9건`
  - 최소 `6.666s`
  - 중앙값 `37.029s`
  - 최대 `773.761s`
- `timed_out`: 최근 `500건`에서 `0건`

즉 `process_lost`, `adapter_failed`는 live data가 있고, `timed_out`는 이번 조사 시점에서는 코드 근거만 있고 field sample은 없다.

## 발견

### 1. `process_lost`는 watcher 입력 신호로 적합하지만 지연 특성을 이해해야 한다

코드:

- `heartbeat.ts`의 `reapOrphanedRuns()`가 실행 중 run을 `failed + errorCode=process_lost`로 마킹한다.
- `index.ts` 기준:
  - 서버 startup 시 1회 즉시 수행
  - 이후 `HEARTBEAT_SCHEDULER_INTERVAL_MS` 주기마다 수행
  - periodic reap에는 `5 * 60 * 1000` staleness threshold가 붙는다
- 기본 스케줄러 주기: `30000ms`

의미:

- 서버 재시작 직후에는 즉시 `process_lost`가 보일 수 있다.
- 평상시에는 최대 약 5분 + polling 지연 후에야 관측될 수 있다.

판정:

- watcher 입력 신호로는 적합하다.
- 단, "빠른 감지" 신호가 아니라 "사후 회복/후속 이슈 생성" 신호로 취급해야 한다.

### 2. `adapter_failed`는 raw signal만으로는 부적합하다

실제 샘플:

- run id: `0b741f7a-8262-497f-a4fb-6aa7ffd1c47f`
- status: `failed`
- errorCode: `adapter_failed`
- context:
  - `wakeReason=heartbeat_timer`
  - `source=scheduler`
  - linked issue 없음
- error:
  - `stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)`

반례:

- 이 실패는 `parse` 실행 장애가 아니라 timer heartbeat의 네트워크/adapter 장애다.
- 이런 run까지 maintainer bug 이슈로 넘기면 오탐이다.

판정:

- `adapter_failed`는 단독 신호로는 기각.
- 최소한 아래 보조 조건이 있어야 한다.
  1. run이 issue와 연결돼 있어야 한다
  2. 감시 대상 agent가 `workRole=executor`, `domainCli.key=parse`여야 한다
  3. timer heartbeat(`wakeReason=heartbeat_timer`)는 기본 제외가 안전하다

### 3. `timed_out`는 status와 errorCode가 다르다

코드:

- outcome이 timeout이면 run status는 `timed_out`
- 하지만 저장되는 `errorCode`는 `timeout`

즉 아래 둘은 같은 장애를 가리키지만 문자열이 다르다.

- `status == "timed_out"`
- `errorCode == "timeout"`

판정:

- dedupe key에 `timed_out`를 그대로 넣으면 timeout 계열과 어긋난다.
- watcher는 먼저 아래처럼 정규화해야 한다.

```text
if status == timed_out or errorCode == timeout -> failureClass = timeout
```

### 4. run list의 `issueId`는 비어 있어도 실제 linked issue는 존재할 수 있다

실측:

- `GET /companies/{companyId}/heartbeat-runs` 응답의 `issueId`는 여러 failed run에서 `null`
- 그러나 `GET /heartbeat-runs/{runId}`의 `contextSnapshot.issueId`
- 또는 `GET /heartbeat-runs/{runId}/issues`
  에서는 실제 연결 이슈를 찾을 수 있다

예:

- run id: `4c349e54-84b8-4838-943c-ede79636b1f1`
- list 응답: `issueId=null`
- detail/context: `issueId=AID-242`
- issuesForRun: `[AID-242]`

판정:

- watcher가 list API의 `issueId`만 믿으면 false negative가 난다.
- failed candidate를 잡은 뒤 run detail 또는 `issuesForRun`를 한 번 더 읽는 2단계 조회가 필요하다.

## 장애 유형별 watcher 입력 신호 표

| failureClass | live 근거 | 원 신호 | watcher 적합성 | 주의점 |
|---|---|---|---|---|
| `process_lost` | 있음 | `status=failed`, `errorCode=process_lost` | 조건부 적합 | 5분 staleness + 집단 장애 가능성 |
| `adapter_failed` | 있음 | `status=failed`, `errorCode=adapter_failed` 또는 adapter별 코드 | 단독 부적합 | timer/network 오류가 섞임 |
| `timeout` | live 없음, code 근거만 있음 | `status=timed_out` 또는 `errorCode=timeout` | 조건부 적합 | 문자열 정규화 필요 |

## polling 주기 후보

### 후보 1. 15초

장점:

- adapter failure 감지를 가장 빨리 볼 수 있다.

단점:

- 서버 기본 heartbeat scheduler가 `30초`라 더 자주 읽어도 새 정보가 없을 때가 많다.
- `process_lost`는 어차피 5분 staleness threshold가 있어 조기 감지 이득이 거의 없다.
- 같은 failed run을 더 자주 다시 보게 되어 dedupe 부담만 늘어난다.

판정:

- PoC 기본값으로는 기각.

### 후보 2. 30초

장점:

- 서버 scheduler 기본값과 정렬된다.
- adapter failure와 timeout을 1 polling 주기 안에 따라갈 수 있다.

단점:

- 24/7 watcher에서 API 호출량과 동일 run 재스캔 빈도가 높다.

판정:

- 적극적 모드 후보.

### 후보 3. 60초

장점:

- 30초 대비 호출량을 절반으로 줄인다.
- `adapter_failed` 중앙값이 약 `37초`, `process_lost`는 훨씬 늦게 보이므로 실용 손실이 작다.
- PoC 운영 부담 대비 감지 속도 균형이 가장 낫다.

단점:

- 빠른 장애 대응이 절대 목표면 30초보다 느리다.

판정:

- PoC 기본 추천값.

### 후보 4. 120초

장점:

- 비용과 중복 스캔이 가장 적다.

단점:

- adapter failure 후속 이슈 생성이 체감상 늦다.

판정:

- 저빈도 야간 모드 정도로만 고려.

## dedupe key 검증

기존 초안:

```text
agentId:issueId:errorCode
```

### 왜 부족한가

1. `timed_out` vs `timeout`
   - 같은 timeout 계열이 status와 errorCode에서 다른 문자열을 쓴다.

2. issueId 부재
   - list API에서는 `issueId=null`인 경우가 많다.
   - 그대로 쓰면 key가 `agentId:null:errorCode`로 뭉개진다.

3. timer heartbeat 오탐
   - issue가 없는 timer run의 `adapter_failed`가 CLI 장애와 섞인다.

4. 집단 장애 fan-out
   - 서버 재시작 한 번에 여러 agent/run이 `process_lost`로 찍힐 수 있다.
   - `agentId:issueId:errorCode`는 maintainer 관점에서 같은 outage를 여러 건으로 분할한다.

5. 재발 관리 부재
   - 같은 agent/issue/errorCode라도 하루 뒤 재발이면 새 이슈를 만들 수 있어야 한다.
   - 영구 dedupe key는 재발 탐지를 막는다.

### 살아남은 제안

dedupe는 2단계로 분리한다.

#### 1단계: run 처리 dedupe

```text
runSeenKey = runId
```

- 동일 run을 polling에서 여러 번 읽어도 한 번만 처리

#### 2단계: maintainer incident dedupe

```text
incidentKey = maintainerAgentId:domainCliKey:sourceIssueKey:failureClass:errorFingerprint:timeBucket
```

권장 세부값:

- `maintainerAgentId`: metadata에서 읽음
- `domainCliKey`: 예: `parse`
- `sourceIssueKey`:
  - `issuesForRun` 첫 issue identifier
  - 없으면 `no-issue`
- `failureClass`:
  - `process_lost`
  - `adapter_failed`
  - `timeout`
- `errorFingerprint`:
  - `process_lost`는 고정값
  - `adapter_failed`는 `errorCode` 또는 `error` 앞 120자 정규화 해시
  - `timeout`은 고정값
- `timeBucket`:
  - `process_lost`는 10분 bucket 권장
  - `adapter_failed`, `timeout`은 열린 후속 이슈 존재 여부 우선, 없으면 30분 bucket

## 구현-ready 규칙

1. `GET /companies/{companyId}/heartbeat-runs?limit=N`으로 최근 run을 poll한다.
2. `status in (failed, timed_out)` 또는 `errorCode in (process_lost, adapter_failed, timeout)`만 후보로 본다.
3. 후보마다 `runId` 기준 1차 dedupe를 한다.
4. 각 후보에 대해 `GET /heartbeat-runs/{runId}` 또는 `GET /heartbeat-runs/{runId}/issues`로 issue linkage를 보강한다.
5. 아래 조건을 모두 만족할 때만 maintainer 이슈를 만든다.
   - 감시 agent가 executor metadata를 가짐
   - `domainCli.key=parse`
   - run이 issue-linked이거나, 최소한 운영 정책상 후속 이슈 가치가 있는 실패
   - `wakeReason != heartbeat_timer` 또는 timer 전용 규칙을 따로 둠
6. timeout은 반드시 `failureClass=timeout`으로 정규화한다.
7. 후속 `[버그 수정]` 이슈 생성 전, 열린 maintainer 이슈 중 같은 `incidentKey`가 있으면 재생성하지 않는다.

## 살아남은 결론

1. `process_lost`는 watcher 입력 신호로 살아남지만, 빠른 탐지 신호가 아니라 사후 회복 신호다.
2. `adapter_failed`는 raw signal만으로는 기각한다. issue linkage와 executor/domain metadata 없이는 오탐이 크다.
3. `timed_out`는 live sample이 없으므로 code-contract 기반으로만 채택하며, `status=timed_out`와 `errorCode=timeout` 정규화가 필수다.
4. polling 기본값은 `60초`가 가장 균형이 좋고, `30초`는 공격적 모드, `15초`는 PoC 기본값으로 기각한다.
5. `agentId:issueId:errorCode`는 충분하지 않다. `runId` 기반 1차 dedupe + normalized incident key 2차 dedupe가 필요하다.

## 권고

1. 스파이더맨 구현은 `heartbeat-runs` list만으로 끝내지 말고 `run detail/issuesForRun` 보강 조회를 넣을 것
2. timeout 정규화(`timed_out` -> `timeout`)를 첫 단계에서 고정할 것
3. timer heartbeat 실패는 기본적으로 maintainer bug 자동 생성 대상에서 제외할 것
4. PoC 기본 polling 주기는 `60초`, 운영 검증이 끝나면 `30초`로 내릴지 재검토할 것
