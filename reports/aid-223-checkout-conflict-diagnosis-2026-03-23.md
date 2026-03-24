# AID-223 checkout conflict 진단

- 진단 시각: 2026-03-23 09:35:33 KST
- 대상 이슈: `AID-185`
- 진단 담당: 자비스 (인프라)

## 확인 결과

- 현재 `AID-185` 상태는 `done`
- `checkoutRunId = null`
- `executionLockedAt = null`
- `executionRunId = 011255a5-0620-4ef1-9a4c-f08e543ac030`

## 재현 결과

`POST /api/issues/f6802e76-ccd9-4173-96aa-9b076be4efc4/checkout`

- HTTP `409 Conflict`
- 응답 details
  - `status = done`
  - `assigneeAgentId = c3df8f39-aa06-45b0-be1f-36949314b21a`
  - `checkoutRunId = null`
  - `executionRunId = 011255a5-0620-4ef1-9a4c-f08e543ac030`

## 판단

- 현재 충돌 원인은 stale checkout lock이 아니라 종료된 이슈(`done`)에 대한 정상 충돌이다.
- lock이 살아 있었다면 `checkoutRunId` 또는 `executionLockedAt`가 남아 있어야 하는데 둘 다 비어 있다.
- 따라서 별도 lock 해제 조치는 불필요하다.

## 다음 조치

- `AID-223`에는 "run lock 잔존 아님"으로 회신 후 `in_review` 전환
- 재작업이 필요하면 `AID-185` 재checkout이 아니라 신규 후속 이슈 또는 공식 재오픈 절차로 진행
