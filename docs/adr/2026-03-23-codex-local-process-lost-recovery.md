# ADR-2026-03-23: codex_local `process_lost` 집단 장애 복구 전략

- 날짜: 2026-03-23
- 관련 이슈: AID-237
- 상태: 승인 제안
- 결정 유형: 가역

## 배경

2026-03-23 01:09~01:11 UTC 구간에 `codex_local` 에이전트 8개가 동시에 `error` 상태로 전환됐다.

- 대상: 호크아이, 콜슨, 캡틴 아메리카, 스파이더맨, 블랙 위도우, 쉬리, 헐크, 자비스
- 공통 실패 코드: `process_lost`
- 공통 에러 메시지: `Process lost -- server may have restarted`
- 동일 어댑터를 쓰는 토니 스타크, 비전은 이후 heartbeat에서 정상 실행되었다.
- 각 에이전트의 `adapterConfig`는 `cwd`, `instructionsFilePath`, `model` 외에 특이 차이가 없고, OpenClaw 전용 설정도 없다.

즉, 이번 장애는 개별 에이전트 설정 불량보다 런타임 레벨 사건일 가능성이 높다.

## 근거

1. 8개 에이전트가 거의 같은 시각에 동일한 `process_lost`로 실패했다.
2. Paperclip 서버는 고아 `running` run을 수거할 때 해당 메시지로 실패 처리한다.
3. 근거 코드: `paperclip/server/src/services/heartbeat.ts`의 `reapOrphanedRuns()`
4. 동일한 `codex_local` 계열인 비전은 01:14 UTC timer run에서 다시 성공했고, 장애 에이전트들도 01:41~01:42 UTC timer run에서 순차 복구됐다.
5. 따라서 원인은 API key, instructions path, OpenClaw 연결, 개별 모델 설정보다는 서버 재시작 또는 프로세스 추적 상태 유실에 가깝다.

## 결정

`codex_local` 에이전트 다수가 동시에 `process_lost`로 전환될 경우, 1차 대응은 "설정 수정"이 아니라 "재기동 확인 기반 복구"로 처리한다.

- 에이전트별 `adapterConfig` 수정은 즉시 하지 않는다.
- API key 재발급, instructions path 재설정, 모델 교체를 기본 대응으로 삼지 않는다.
- 다음 timer heartbeat 또는 명시적 wake 이후 성공 실행 여부를 먼저 확인한다.
- 같은 어댑터의 정상 실행 사례가 있으면 개별 설정 원인 가설은 후순위로 내린다.
- 동일 증상이 반복될 때만 런타임 서비스 재시작, wake queue, 프로세스 추적 로직을 심층 조사한다.

## 운영 절차

1. `GET /api/companies/{companyId}/agents`로 영향 범위를 확인한다.
2. `GET /api/companies/{companyId}/heartbeat-runs?limit=N`으로 공통 실패 시각과 에러 코드를 확인한다.
3. `process_lost`가 동시다발이면 서버 레벨 사건으로 분류한다.
4. 다음 timer run 또는 wake 후 성공 여부를 확인한다.
5. 성공 run이 확인되면 복구 완료로 본다.
6. 동일 에이전트가 연속으로 `process_lost`를 반복할 때만 개별 설정/권한/경로를 점검한다.

## 보류한 대안

### 대안 1. 영향 에이전트 전원의 설정을 즉시 재저장한다

기각. 동시다발 `process_lost` 패턴과 맞지 않고, 무관한 설정 드리프트를 만들 수 있다.

### 대안 2. API key 문제로 가정하고 일괄 재발급한다

기각. 인증 실패 흔적이 없고, 후속 timer run 성공 사례와 모순된다.

### 대안 3. OpenClaw 연결 문제로 가정한다

기각. 대상은 `codex_local`이며 OpenClaw 게이트웨이 어댑터가 아니다.

## 결과

이 결정은 가역이다.

- 같은 장애가 반복되면 후속 ADR에서 "자동 wake" 또는 "error 상태 자동 클리어" 정책을 추가 검토할 수 있다.
- 현 시점의 최적 대응은 "공통 원인 확인 후 timer run 복구 검증"이다.
