# TASKS.md — Paperclip 에이전트 운영 플랫폼

> 설계 문서: `docs/planning/2026-03-24-agent-operating-platform.md`
> 프로젝트 루트: `/Users/kwak/Projects/paperclip/paperclip-addon`
> Plugin 개발 경로: `plugins/`
> Paperclip 원본: `/Users/kwak/Projects/paperclip/paperclip-orginal`

---

## Phase 0: 프로젝트 셋업

### P0-T1: Plugin 개발 환경 구성
- [ ] `plugins/` 디렉터리에 Plugin SDK 의존성 설정 (pnpm workspace 또는 standalone)
- [ ] `paperclip-orginal/packages/plugins/sdk` 참조 확인
- [ ] Plugin 빌드 스크립트 구성 (esbuild)
- [ ] kitchen-sink-example 참고하여 Plugin 템플릿 생성
- [ ] 로컬 Plugin 설치 테스트 (`paperclipai plugin install ./plugins/workflow-engine`)

### P0-T2: 테스트 환경 구성
- [ ] vitest 설정 (dag-engine 단위 테스트용)
- [ ] Plugin SDK mock 유틸리티 구성 (ctx.events, ctx.issues, ctx.entities mock)
- [ ] Paperclip 서버 로컬 실행 확인 (`pnpm dev:server`)

### P0-T3: 기존 Plugin 정리
- [ ] system-garden (`plugins/system-garden/`) — 빌드 확인, 서버 로드 테스트
- [ ] work-board (`plugins/work-board/`) — 빌드 확인, 중간본 상태 점검

---

## Phase 1: Workflow Engine Plugin

> 핵심 Plugin. DAG 기반 업무 흐름 + Reconciler + parentId fallback + Service Request Bridge

### P1-T1: DAG Engine 핵심 로직
- [ ] `dag-engine.ts` — 위상 정렬(topological sort) 구현 + cycle 감지
- [ ] dependsOn 해석: 모든 의존 step 완료 확인 → 다음 step 목록 반환
- [ ] join 판정: 여러 의존이 모두 충족될 때만 진행
- [ ] 단위 테스트: 순차, 병렬, join, cycle 감지, 빈 DAG

### P1-T2: Workflow Store
- [ ] `workflow-store.ts` — `ctx.entities` 기반 워크플로우 정의 CRUD
- [ ] WorkflowDefinition entity: name, steps[], status, timeoutMinutes, maxConcurrentRuns
- [ ] WorkflowRun entity: workflowId, status, startedAt, stepStatuses
- [ ] WorkflowStepRun entity: runId, stepId, issueId, status, startedAt, completedAt
- [ ] 멱등키 관리: 이벤트 중복 처리 방지
- [ ] name/slug 기반 조회 (ID 하드코딩 금지 — 설계 원칙 6)

### P1-T3: Worker 핵심 — 이벤트 핸들러
- [ ] `worker.ts` — `ctx.events.on("issue.updated")` 구독
- [ ] 이슈 status → done 변경 감지 → DAG engine에 완료 step 전달
- [ ] 다음 step 이슈 status: backlog → todo 전환 + `ctx.agents.invoke` wakeup
- [ ] wakeup 시 reason에 워크플로우명 + step ID + 이전 step 결과 참조 주입
- [ ] 멱등 처리: 이미 처리된 이벤트/전환은 skip
- [ ] `agent.run.failed` / `agent.run.cancelled` 이벤트 → onFailure 정책 실행
- [ ] escalate 정책: `escalateTo` step으로 분기

### P1-T4: Workflow 트리거 (시작)
- [ ] Routine 연동: cron 트리거 시 Workflow run 생성
- [ ] Webhook 트리거: 외부 시스템에서 workflow 시작
- [ ] 수동 트리거: UI 또는 API
- [ ] 시작 시: 첫 step(dependsOn 없는 것들) → todo + wakeup, 나머지 → backlog

### P1-T5: Reconciler (안전망)
- [ ] `reconciler.ts` — Plugin manifest에 cron job 선언 (5분 주기)
- [ ] `todo` 상태인데 wakeup 안 된 이슈 스캔 → `ctx.agents.invoke` 재트리거
- [ ] Workflow 전체 timeout 감시 → 초과 시 abort
- [ ] 로그 기록 (`ctx.logger`)

### P1-T6: parentId Filler
- [ ] `parent-id-filler.ts` — `ctx.events.on("issue.created")` 구독
- [ ] parentId 없고 assignee agent 있으면 → agent metadata에서 defaultParentIssueId 읽기
- [ ] `ctx.issues.update(issueId, { parentId })` 자동 설정
- [ ] CEO/CTO role은 null 허용 (최상위 이슈 생성 권한)

### P1-T7: Agent Sessions 연동
- [ ] step의 `sessionMode: "reuse"` → `ctx.agents.sessions.sendMessage` 사용
- [ ] step의 `sessionMode: "fresh"` (기본) → `ctx.agents.invoke` 사용
- [ ] 세션 ID 관리 (WorkflowStepRun에 sessionId 저장)

### P1-T8: Manifest + Plugin 등록
- [ ] `manifest.ts` — Plugin ID, 이벤트 구독, cron job, capabilities 선언
- [ ] `index.ts` — entrypoint
- [ ] `package.json` — `paperclipPlugin` 필드 (manifest, worker, ui 경로)
- [ ] 빌드 스크립트 (esbuild)

### P1-T9: UI — Workflow 관리 화면
- [ ] page 슬롯: Workflow 목록 (active/paused/archived)
- [ ] page 슬롯: Workflow 상세 — DAG 시각화 + 실행 현황
- [ ] dashboardWidget 슬롯: 현재 실행 중인 Workflow 요약
- [ ] detailTab 슬롯: 이슈에서 소속 Workflow step 표시

### P1-T10: 통합 테스트
- [ ] 가즈아 일일 루틴 YAML 정의 → 실제 서버에서 실행
- [ ] 병렬 step (analyze + portfolio) → join (strategy) 동작 확인
- [ ] 실패 시나리오: retry, skip, abort, escalate
- [ ] Reconciler: 이벤트 유실 시 재트리거 확인
- [ ] parentId filler 동작 확인

---

## Phase 2: Tool Registry Plugin

> CLI를 Plugin Tool로 래핑. 서버 측 파라미터 검증 + agentId allow-list

### P2-T1: Tool 정의 + Worker 핸들러
- [ ] `manifest.ts` — Plugin Tool 선언 (도구별 name, displayName, description, parametersSchema)
- [ ] `worker.ts` — `executeTool` 핸들러 구현
- [ ] `runContext.agentId` 기반 allow-list 체크 → 미허가 시 거부 응답
- [ ] 허가 시 실제 CLI 실행 (child_process.exec) → 결과 반환
- [ ] `requiresApproval: true` 도구 → Paperclip 승인 흐름 연동

### P2-T2: Tool Config Store
- [ ] `tool-config.ts` — `ctx.entities` 기반 도구 설정 CRUD
- [ ] ToolConfig entity: toolName, command, workingDirectory, env, requiresApproval
- [ ] AgentToolGrant entity: agentName(resolve 기반), toolName, grantedBy
- [ ] agent name → agentId resolve (API 조회, 하드코딩 금지)

### P2-T3: 사후 감사
- [ ] `audit.ts` — `ctx.events.on("agent.run.finished")` 구독
- [ ] 실행 로그에서 bash 직접 사용 패턴 감지 (정규식)
- [ ] 위반 감지 시 감찰관에게 감사 이슈 자동 생성 (`ctx.issues.create`)
- [ ] 반복 위반 시 `ctx.agents.pause(agentId)` 옵션

### P2-T4: UI — 도구 관리 화면
- [ ] page 슬롯: 도구 목록 + 등록/수정/삭제
- [ ] page 슬롯: 에이전트별 권한 매핑
- [ ] page 슬롯: 실행 로그 + 감사 결과
- [ ] sidebarPanel 슬롯: 도구 바로가기

### P2-T5: 가즈아 도구 등록
- [ ] gazua-data-collector → Plugin Tool 래핑
- [ ] gazua-signal-analyzer → Plugin Tool 래핑
- [ ] gazua-portfolio-checker → Plugin Tool 래핑
- [ ] gazua-trade-executor → Plugin Tool 래핑 (requiresApproval: true)
- [ ] gazua-report-generator → Plugin Tool 래핑
- [ ] 에이전트별 allow-list 설정 (도라에몽→수집기, 코난→분석기, ...)

### P2-T6: npm 배포 준비
- [ ] package.json 정리 (name: `@insightflo/paperclip-tool-registry`)
- [ ] README.md 작성 (설치 방법, 설정 가이드)
- [ ] `npm publish` 또는 GitHub Packages 배포

---

## Phase 3: Knowledge Base Plugin

> 에이전트가 업무 지식/규정 참조. static부터 시작.

### P3-T1: KB Store
- [ ] `kb-store.ts` — `ctx.entities` 기반 KnowledgeBase CRUD
- [ ] KnowledgeBase entity: name, type, description, maxTokenBudget, config
- [ ] AgentKBGrant entity: agentName, kbName

### P3-T2: Static KB 주입
- [ ] `worker.ts` — `ctx.events.on("agent.run.started")` 구독
- [ ] agent의 KB grant 목록 조회 → static 파일 읽기
- [ ] maxTokenBudget 초과 시 truncation/요약
- [ ] 이슈 코멘트 또는 instructions에 주입

### P3-T3: UI — KB 관리 화면
- [ ] page 슬롯: KB 목록 + 등록/수정/삭제
- [ ] page 슬롯: 에이전트별 KB 연결

### P3-T4: npm 배포 준비
- [ ] package.json 정리
- [ ] README.md 작성
- [ ] 배포

---

## Phase 4: Service Request Bridge Plugin

> 크로스 컴퍼니 유지보수 요청. 양사 이슈 연결 + 상태 동기화.

### P4-T1: Bridge 핵심 로직
- [ ] `worker.ts` — `ctx.events.on("issue.created")` 구독
- [ ] [유지보수] 라벨 감지 → provider 회사에 미러 이슈 자동 생성 (`ctx.issues.create`)
- [ ] ServiceRequestLink entity: requester/provider company+issue ID, status
- [ ] 양사 이슈 연결 (linked_issue_id 또는 entity로 관리)

### P4-T2: 상태 동기화
- [ ] `ctx.events.on("issue.updated")` — provider 이슈 done → requester 이슈 in_review
- [ ] 산출물 전달: provider 이슈 코멘트 → requester 이슈 코멘트 복사 (`ctx.issues.createComment`)
- [ ] requester 감찰관 검수 → done → provider 이슈도 done 동기화
- [ ] 멱등 처리: 무한 루프 방지 (bridge가 변경한 건 무시)

### P4-T3: UI
- [ ] dashboardWidget: 활성 유지보수 요청 현황
- [ ] detailTab: 이슈에서 연결된 상대 회사 이슈 표시

### P4-T4: npm 배포 준비
- [ ] package.json 정리
- [ ] README.md 작성
- [ ] 배포

---

## Phase 5: 기존 Plugin 복구 + 배포

### P5-T1: work-board Plugin 재구축
- [ ] GitHub 중간본 기반 → 최종 스펙 반영 (미션 그룹, 부모 라벨 상속, 고유업무 필터)
- [ ] Plugin SDK 최신 버전 적용
- [ ] 빌드 + 서버 로드 테스트
- [ ] npm 배포 준비

### P5-T2: system-garden Plugin 정비
- [ ] 빌드 확인 + 서버 로드 테스트
- [ ] UA knowledge-graph 연동 확인
- [ ] npm 배포 준비

---

## Phase 6: 통합 + 외부 스크립트 제거

### P6-T1: Routine 이관
- [ ] create_daily_issues.py → Paperclip Routine (cron "0 7 * * *")으로 대체
- [ ] 가즈아 에이전트별 일일 Routine 설정

### P6-T2: 외부 스크립트 아카이브
- [ ] check_paperclip_issues.py → Workflow + Reconciler + 감찰관으로 대체 확인
- [ ] adaptive_heartbeat.py → heartbeat OFF + Reconciler로 대체 확인
- [ ] action_executor.py → Routine (webhook) + Workflow로 대체 확인
- [ ] launchd plist 4개 삭제
- [ ] `paperclip-addon/scripts/` → `paperclip-addon/scripts/_archived/`로 이동

### P6-T3: 문서 업데이트
- [ ] 옵시디언 Paperclip 현황 업데이트
- [ ] 옵시디언 커스터마이징 현황 업데이트 (마이그레이션 완료 반영)
- [ ] Claude 메모리 업데이트
- [ ] alpha-prime `_paperclip-migrated/` 삭제 확인

### P6-T4: E2E 검증
- [ ] 가즈아 일일 루틴 Workflow 실행 — 전체 흐름 확인
- [ ] 크로스 컴퍼니 유지보수 — Bridge 동작 확인
- [ ] Tool Registry — Plugin Tool API 실행 + 감사 로그 확인
- [ ] KB — static 주입 + 토큰 캡 확인
- [ ] 외부 스크립트 0 확인 (텔레그램 봇 제외)
