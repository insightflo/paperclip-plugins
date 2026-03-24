# 토니 스타크 학습 기록

## 실수 기록
(아직 없음)

## 결정 기록 (ADR)
- 2026-03-23: `parse` PDF 경로는 기본 교체 대신 선택형 어댑터로 확장한다. 가역 결정. 상세: `/Users/kwak/Projects/ai/docs/adr/2026-03-23-parse-pdf-adapter-strategy.md`
- 2026-03-23: `codex_local` 집단 `process_lost`는 개별 설정 변경보다 timer/wake 재실행으로 먼저 복구 확인한다. 가역 결정. 상세: `/Users/kwak/Projects/ai/docs/adr/2026-03-23-codex-local-process-lost-recovery.md`
- 2026-03-23: 현업/IT 분리 PoC는 `parse` CLI를 경계로 하고 역할은 `agent.metadata`에 저장하며, 실패 자동화는 외부 watcher polling으로 시작한다. 가역 결정. 상세: `/Users/kwak/Projects/ai/docs/adr/2026-03-23-domain-cli-executor-maintainer-poc.md`
- 2026-03-23: 가즈아 투자 대시보드 v1은 `React 19 + Vite SPA`와 `FastAPI` 로컬 게이트웨이, `mtime polling` 기준선으로 시작한다. 가역 결정. 상세: `/Users/kwak/Projects/ai/docs/adr/2026-03-23-gazua-dashboard-local-gateway-architecture.md`
