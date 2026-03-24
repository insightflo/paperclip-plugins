---
title: Paperclip 에이전트 운영 플랫폼 설계
date: 2026-03-24
status: reviewed
author: kwak
reviewed: 2026-03-24 (Gemini + Codex + Claude 3-AI review, B+ 78/100)
---

# Paperclip 에이전트 운영 플랫폼 설계

## 1. 의도

진짜 회사처럼 에이전트를 운영하고 싶다. 지금은 외부 Python 스크립트, launchd, git hook 등이 흩어져 있어서 경로가 바뀌면 깨지고, 관리가 안 된다.

**목표**: 관리 안 되는 외부 스크립트를 없애고, Paperclip 안에서 완결되는 에이전트 운영 체계를 만든다.

**비유**: 직원(에이전트)이 입사하면 역할을 받고, 업무 스킬을 익히고, 사내 프로그램 권한을 받고, 사내 규정집을 열람하고, 정해진 업무 프로세스대로 일한다.

---

## 2. 에이전트 역량 모델

```
에이전트 (직원)
├── role          직책/역할               (Paperclip 기본)
├── instructions  업무 지시서              (Paperclip 기본 — .paperclip/agents/*.md)
├── skills        업무 능력               (Paperclip 기본 — SKILL.md)
├── tools         사용 가능한 프로그램      (NEW — CLI Registry)
├── knowledge     업무 지식/규정           (NEW — Knowledge Base)
└── workflows     참여하는 업무 흐름        (NEW — Workflow Engine)
```

---

## 3. 설계 원칙

1. **Paperclip Plugin으로 구현** — 서버 소스 포크 없음. upstream 업데이트 영향 없음.
2. **이슈 기반 실행** — 모든 작업은 이슈로 추적. 에이전트는 이슈 할당 시 즉시 wakeup.
3. **heartbeat 의존 제거** — 이벤트 기반 wakeup + Reconciler cron(안전망). 빈 heartbeat 토큰 낭비 없음.
4. **기존 Routine 활용** — 반복 작업은 Paperclip Routine(cron/webhook/api)으로.
5. **구조화된 설정** — 프롬프트에 텍스트로 나열하던 것을 JSON/YAML로 구조화.
6. **배포 변동값 하드코딩 금지** — Company ID, Agent ID, Label ID 등 재설치 시 바뀌는 값을 코드에 직접 넣지 않는다. 반드시 환경변수 또는 API 조회(name/slug 기반 resolve)로 처리.
7. **이벤트는 at-least-once로 취급** — 모든 상태 전환은 멱등(idempotent)하게 설계. 이벤트 중복/유실에 안전.

---

## 4. 신규 기능 3가지

### 4.1 Workflow Engine

> "n8n처럼 업무 흐름을 정의하고, 정해진 순서로 자동 실행"

#### 개념

이슈의 parent-child 구조 위에 의존관계(DAG)를 추가한다. 이전 단계 완료 시 다음 단계가 자동 트리거된다.

#### 데이터 모델

```typescript
interface Workflow {
  id: string;
  companyId: string;
  name: string;                     // "가즈아 일일 루틴"
  description: string;
  status: "active" | "paused" | "archived";
  timeoutMinutes?: number;          // 워크플로우 전체 제한 시간
  maxConcurrentRuns?: number;       // 동시 실행 제한
  steps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;                       // "collect"
  title: string;                    // "데이터 수집"
  assigneeAgentId: string;
  description?: string;             // 이슈 설명으로 들어감
  dependsOn: string[];              // ["analyze", "portfolio"] — 이 step들이 모두 done이면 시작
  toolIds?: string[];               // 이 step에서 사용할 CLI 도구 (4.2 연동)
  knowledgeIds?: string[];          // 이 step에서 참조할 KB (4.3 연동)
  timeoutMinutes?: number;          // 스텝 타임아웃
  onFailure?: "retry" | "skip" | "abort_workflow" | "escalate";
  escalateTo?: string;              // onFailure: "escalate" 시 분기할 step ID
  maxRetries?: number;              // retry 시 최대 재시도 횟수 (기본 2)
  sessionMode?: "fresh" | "reuse";  // fresh: 새 세션(기본), reuse: 이전 세션 유지(확인/답변용)
  triggerOn?: "normal" | "escalation"; // normal(기본): dependsOn 충족 시, escalation: 에스컬레이션에서만
}
```

**저장**: `ctx.entities` 사용 (구조화된 쿼리/감사 가능). `ctx.state`는 커서/체크포인트에만.

**DAG 검증**: 워크플로우 생성/수정 시 위상 정렬(topological sort)로 순환 의존성 검사. O(V+E), 런타임 교착 방지.

#### 실행 흐름

```
Workflow 트리거 (Routine cron / webhook / 수동)
│
├─ Step 1 이슈 생성 (status: todo, 에이전트 할당 → 즉시 wakeup)
├─ Step 2~N 이슈 생성 (status: backlog — 대기)
│
│  [Step 1 완료]
│  └─ Plugin이 issue.updated 이벤트 수신
│     └─ 멱등 확인: 이미 처리된 이벤트면 skip
│     └─ dependsOn 확인: Step 2, Step 3의 의존이 모두 충족?
│        ├─ Step 2: depends_on [step1] → ✅ → status: todo + wakeup
│        └─ Step 3: depends_on [step1] → ✅ → status: todo + wakeup
│                                              (Step 2, 3 병렬 실행)
│
│  [Step 2 + Step 3 모두 완료]
│  └─ Step 4: depends_on [step2, step3] → ✅ (join) → status: todo + wakeup
│
│  [모든 Step 완료]
│  └─ Workflow run 완료 → parent issue done
```

#### Reconciler (안전망)

Plugin manifest에 cron job 선언 (5분 주기):
- `todo` 상태인데 wakeup 안 된 이슈 스캔 → `ctx.agents.invoke`로 재트리거
- heartbeat의 "보험" 역할을 Plugin cron으로 대체
- 이벤트 유실, Plugin 재시작, 서버 재시작 후 복구 보장

#### Step 간 컨텍스트 전달

에이전트가 깨어났을 때 **왜 깨어났는지** 즉시 알아야 한다. step 전환 시 wakeup에 컨텍스트 주입:

```typescript
ctx.agents.invoke(agentId, prompt, companyId, {
  reason: "workflow:가즈아-일일루틴/step:analyze 시작",
  // contextSnapshot에 이전 step 결과 참조 포함
});
```

- `reason`: 워크플로우명 + step ID → 에이전트가 즉시 맥락 파악
- 이전 step 산출물: 이슈 코멘트 또는 `ctx.issues.documents`로 전달
- 이슈 코멘트 = 에이전트 간 비동기 메모장 (직접 대화 불가, 코멘트로 소통)

#### 에스컬레이션 경로

step 실패 시 다음 step이 아닌 **별도 에스컬레이션 step**으로 분기:

```yaml
steps:
  - id: develop
    agent: spiderman
    onFailure: escalate          # 실패 시 escalate-to-cto로 분기
    escalateTo: escalate-to-cto

  - id: escalate-to-cto
    agent: tony_stark
    triggerOn: escalation         # 정상 흐름이 아닌 에스컬레이션에서만 트리거
    dependsOn: []
```

에스컬레이션 체인: 담당자 실패 → 팀장 → CTO → 이사회 순으로 상위 에이전트에게 전달.

#### Agent Sessions 활용 (지연 최적화)

wakeup → 부팅 → 컨텍스트 로딩 → 작업 → 종료 사이클이 2~3분 걸리는 문제. 단순 확인/답변 chain은 **Agent Sessions**으로 최적화:

```typescript
// 세션 생성 (종료 없이 멀티턴)
const session = await ctx.agents.sessions.create(agentId, companyId);

// 추가 메시지 (부팅 없이 즉시)
await ctx.agents.sessions.sendMessage(session.id, "이전 step 결과 확인해주세요", companyId);
```

| 상황 | 방식 | 지연 |
|---|---|---|
| 독립 작업 (개발, 분석) | 이슈 할당 + wakeup | 2~3분 (부팅 포함) |
| 확인/답변/승인 | Agent Session sendMessage | ~30초 (부팅 없음) |
| 에스컬레이션 질의 | Agent Session sendMessage | ~30초 |

Workflow Engine이 step 성격에 따라 자동 판단: `sessionMode: "reuse"` (세션 유지) vs `sessionMode: "fresh"` (새 세션).

#### 실패 처리

| 정책 | 동작 |
|---|---|
| `retry` | 최대 `maxRetries`회 재시도 후 abort |
| `skip` | 해당 step 건너뛰고 다음 진행 |
| `abort_workflow` | 워크플로우 중단, 완료된 step은 보존, parent issue에 실패 기록 |
| `escalate` | `escalateTo`에 지정된 step으로 분기 |

**롤백 전략**: "이전 부수 효과 되돌리기"가 아닌 "하류 중단 + 완료분 보존 + 감사 로그" 방식. 진정한 보상이 필요한 step은 별도 보상 액션을 정의하여 역 위상 순서로 실행.

#### 예시: 가즈아 일일 루틴

```yaml
name: "가즈아 일일 루틴"
trigger: routine (cron "0 7 * * *")
timeoutMinutes: 180
steps:
  - id: collect
    title: "데이터 수집"
    agent: doraemon
    tools: [gazua-data-collector]

  - id: analyze
    title: "시그널 분석"
    agent: conan
    tools: [gazua-signal-analyzer]
    dependsOn: [collect]

  - id: portfolio
    title: "포트폴리오 점검"
    agent: scrooge
    tools: [gazua-portfolio-checker]
    dependsOn: [collect]

  - id: strategy
    title: "매매 전략 수립"
    agent: zhuge_liang
    dependsOn: [analyze, portfolio]     # join — 둘 다 완료 대기

  - id: report
    title: "리포트 발행"
    agent: harry
    tools: [gazua-report-generator]
    dependsOn: [strategy]
```

#### 크로스 컴퍼니 워크플로우: Service Request Bridge

회사 간 업무 위임 구조. 가즈아(현업)에서 CLI 에러 발생 시 개수라발발타(IT)에 유지보수를 요청하고, 완료 후 결과를 공유하는 흐름.

**설계 제약 (Codex 리뷰 반영):**

Paperclip V1의 핵심 테넌시 모델은 "모든 엔티티는 회사 스코프, 에이전트는 자기 회사 밖 접근 불가"이다. 서버 코드에서 명시적으로 강제됨:
```typescript
// server/src/services/issues.ts:338
if (assignee.companyId !== companyId)
  throw unprocessable("Assignee must belong to same company");
// server/src/routes/authz.ts:14
if (req.actor.companyId !== companyId)
  throw forbidden("Agent key cannot access another company");
```

따라서 ~~`crossCompany: true`로 외부 에이전트가 타사 이슈를 직접 수행~~ 하는 것은 불가. **티켓 연동은 좋고, 실행 권한 공유는 나쁘다.**

**Service Request Bridge 패턴:**

```
가즈아 에이전트 CLI 에러 발생
→ 가즈아에 [유지보수 요청] 이슈 생성 (requester issue)
→ Bridge Plugin이 issue.created 이벤트 감지 ([유지보수] 라벨)
→ 개수라발발타에 [작업 지시] 이슈 자동 생성 (provider work order)
  - 에러 내용, 관련 코드 경로 등 복사
  - linked_issue_id로 양사 이슈 연결
→ 스파이더맨이 자기 회사(개수라발발타) 이슈로 코드 수정
→ 완료 → Bridge가 산출물(patch/PR/report)을 가즈아 이슈에 코멘트 첨부
→ Bridge가 가즈아 이슈 상태 동기화 (in_review)
→ 가즈아 감찰관(포청천)이 검수 → done
→ Bridge가 개수라발발타 이슈도 done 동기화
```

**핵심 원칙:**
- 각 에이전트는 **자기 회사 이슈만** 수행 (Paperclip 테넌시 준수)
- Bridge Plugin이 **양사 이슈 상태를 동기화** (Plugin은 companyId를 넘겨서 양쪽 접근 가능)
- 산출물은 코멘트/document로 전달 (실행 권한 공유 아님)
- goal/budget/audit가 회사별로 분리 유지

**YAML 예시 — 양사에 각각 Workflow 정의:**

```yaml
# 가즈아 측: 유지보수 요청 Workflow
name: "유지보수 요청"
companyId: gazua
trigger: webhook (CLI 에러 시)
steps:
  - id: report
    title: "유지보수 요청 등록"
    agent: reporter (동적)
  - id: wait-fix
    title: "수정 대기"
    agent: none                         # Bridge가 상태 동기화할 때까지 대기
    dependsOn: [report]
    triggerOn: bridge_sync              # 외부 트리거
  - id: verify
    title: "검수"
    agent: inspector                    # 포청천
    dependsOn: [wait-fix]
```

```yaml
# 개수라발발타 측: 작업 지시 Workflow (Bridge가 자동 생성)
name: "유지보수 작업"
companyId: gaesura
trigger: bridge (가즈아 유지보수 요청 연동)
steps:
  - id: fix
    title: "코드 수정"
    agent: spiderman
    tools: [code-editor, test-runner]
  - id: deliver
    title: "산출물 전달"
    agent: spiderman
    dependsOn: [fix]
    sessionMode: reuse
    # 완료 시 Bridge가 가즈아 이슈에 결과 첨부
```

**데이터 모델 — Service Request Link:**

```typescript
// Bridge Plugin이 ctx.entities에 저장
interface ServiceRequestLink {
  id: string;
  requesterCompanyId: string;         // 가즈아
  requesterIssueId: string;           // 유지보수 요청 이슈
  providerCompanyId: string;          // 개수라발발타
  providerIssueId: string;            // 작업 지시 이슈
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
}
```

**장점 (vs 이전 crossCompany 직접 실행):**
- 회사 경계 유지 → Paperclip 테넌시 모델 준수
- goal/budget/audit 회사별 분리
- 향후 SLA, 승인, 과금 확장 가능
- provider/customer 관계 모델링 자연스러움

**장점 (vs 이전 외부 스크립트 폴링):**
- 이벤트 기반 (폴링 제거)
- 외부 스크립트 0
- 상태 동기화 자동화

---

### 4.2 Tool Registry (Plugin Tool 기반)

> "회계 담당자가 ERP 프로그램 권한을 받아서 쓰듯이"

#### 핵심 발견: Paperclip Plugin Tool System 활용

Paperclip에는 이미 **Plugin Tool** 시스템이 있다:
- Plugin이 manifest에 tool을 선언 → 서버가 `PluginToolRegistry`에 등록
- 에이전트가 `GET /api/plugins/tools`로 사용 가능한 도구 조회
- 에이전트가 `POST /api/plugins/tools/execute`로 도구 실행 요청
- **서버가 파라미터 스키마 검증 후 Plugin worker에서 실제 실행**

이 구조의 핵심: **에이전트가 bash를 직접 치지 않고, 서버 API를 통해 도구를 실행**한다.

```
Before: 에이전트 → bash → 아무 CLI 실행 (차단 불가)
After:  에이전트 → POST /plugins/tools/execute → 서버 검증 → Plugin worker 실행 (강제!)
```

#### 개념

CLI 도구를 Plugin Tool로 래핑하여 등록한다. 에이전트는 bash 직접 실행 대신 Plugin Tool API로만 도구를 사용한다. Plugin worker 내부에서 `runContext.agentId`를 확인하여 에이전트별 allow-list를 강제한다.

#### 동작 흐름

```
1. tool-registry Plugin manifest에 도구 선언 (name, description, parametersSchema)
2. Plugin worker에 실제 CLI 실행 핸들러 + 에이전트별 allow-list 등록
3. 에이전트 실행 시 instructions에 "bash 직접 실행 금지, Plugin Tool API만 사용" 주입
4. 에이전트가 POST /plugins/tools/execute 호출
5. 서버가 parametersSchema 검증 → Plugin worker로 전달
6. Worker가 runContext.agentId 확인 → allow-list에 없으면 거부
7. 통과하면 실제 CLI 실행 → 결과 반환
```

#### 강제력 수준

| 계층 | 강제력 | 설명 |
|---|---|---|
| Plugin Tool API | ✅ **기술적 강제** | 서버가 파라미터 스키마 검증, worker가 agentId 기반 allow-list 체크 |
| bash 직접 실행 금지 | ⚠️ 프롬프트 기반 | instructions에 "Plugin Tool API만 사용" 명시 |
| 사후 감사 | ✅ 보조 | `agent.run.finished` → 실행 로그에서 bash 직접 사용 감지 → 감찰관 이슈 |

**이전 "사후 감사만" 방식 대비 크게 개선**: Plugin Tool API를 거치면 서버 측에서 파라미터 검증 + agentId allow-list가 기술적으로 강제된다. bash 직접 실행은 여전히 프롬프트 기반이지만, 정상 경로(Plugin Tool)에서는 완전한 제어가 가능.

#### 데이터 모델

```typescript
// Plugin manifest에 tool로 선언
interface ToolDefinition {
  name: string;                    // "gazua-data-collector"
  displayName: string;             // "데이터 수집기"
  description: string;             // 에이전트에게 보이는 설명
  parametersSchema: JSONSchema;    // 인자 스키마 (서버가 검증)
}

// Plugin worker 내부 설정 (ctx.entities에 저장)
interface ToolConfig {
  toolName: string;
  command: string;                 // 실제 CLI 명령
  workingDirectory?: string;
  env?: Record<string, string>;
  requiresApproval?: boolean;      // Paperclip 승인 흐름 연동
}

// 에이전트별 allow-list (ctx.entities에 저장)
interface AgentToolGrant {
  agentId: string;                 // name 기반 resolve (ID 하드코딩 금지)
  toolName: string;
  grantedBy: string;
}
```

#### upstream 개선 가능 (선택)

현재 `ToolListFilter`에 `pluginId`만 있고 `agentId`가 없어서, `GET /plugins/tools`에서 에이전트별 필터링은 안 된다. 하지만 **execute 시점에서 worker가 거부하면 되므로 현재로도 동작**. 향후 upstream에 `agentId` 필터 PR 가능.

---

### 4.3 Knowledge Base (지식 관리)

> "사내 규정집, 업무 매뉴얼을 에이전트가 참조"

#### 개념

회사 수준에서 지식 소스를 등록하고, 에이전트/workflow step에서 참조할 수 있게 한다.

#### 데이터 모델

```typescript
interface KnowledgeBase {
  id: string;
  companyId: string;
  name: string;                    // "투자 규정집"
  type: "static" | "rag" | "ontology";
  description: string;
  maxTokenBudget?: number;         // 주입 시 토큰 상한 (기본 4096)

  staticConfig?: {
    filePath: string;
  };
  ragConfig?: {
    sourcePath: string;
    embeddingModel: string;
    chunkSize: number;
    topK?: number;                 // 검색 시 상위 N개 청크 (기본 5)
    mcpServerUrl?: string;
  };
  ontologyConfig?: {
    kgPath: string;
  };
}
```

#### 토큰 폭발 방지 (리뷰 반영)

- static 전체 주입 시 `maxTokenBudget` 초과하면 요약/truncation
- rag는 기본이 top-k 청크 방식이라 bounded
- 여러 KB가 한 step에 붙으면 총합 토큰 캡 적용

#### 우선 구현: static → rag 순서

Phase 1: static 파일을 이슈 코멘트나 instructions에 주입 (단순, 토큰 캡 적용)
Phase 2: RAG MCP 서버 연동 (검색 기반)
Phase 3: 온톨로지 + UA 통합 (그래프 기반)

---

## 5. 서버 소스 수정 이력 및 복구 계획

### 확인 완료 (2026-03-24)

paperclip-orginal은 upstream master와 동일 (clean). 이전 포크(`Projects/ai/paperclip/`)에서 수정했던 것:

| 수정 | 내용 | upstream 상태 | 복구 방법 |
|---|---|---|---|
| parentId fallback 로직 | 이슈 생성 시 assignee의 defaultParentIssueId 자동 적용 | metadata 필드만 있고 **자동 fallback 없음** | Workflow Engine Plugin의 `issue.created` 이벤트에서 처리 |
| migration 0038 | defaultParentIssueId 컬럼 추가 | upstream 0038은 heartbeat_runs 관련 | metadata 방식으로 이미 대체됨 (별도 마이그레이션 불필요) |

**원칙: 서버 소스 포크 0. 모든 커스텀 로직은 Plugin으로.**

---

## 6. 다국어 지원 판단

### 결론: 당장은 안 함

Paperclip 기본 UI에 i18n이 없고 영어 하드코딩. Plugin 슬롯은 page/sidebar/widget 등 **추가**만 가능하고, 기존 UI 텍스트 교체 불가.

| 대상 | Plugin으로 가능? |
|---|---|
| Plugin 자체 UI (work-board, workflow 등) | ✅ 한국어로 개발 |
| Paperclip 기본 UI (Dashboard, Issues 등) | ❌ 포크 필요 |
| 에이전트 프롬프트/이슈 제목 | ✅ 이미 한글 사용 중 |

**향후**: upstream에 i18n PR 기여 검토. 그 전까지는 Plugin UI만 한국어, 기본 UI는 영어 유지.

---

## 7. 기존 커스터마이징 마이그레이션

| # | 기존 (외부 스크립트) | 이후 (플랫폼 내장) | 방식 |
|---|---|---|---|
| 1 | check_paperclip_issues.py | Routine → 비전(감찰관) wakeup | Routine + 이벤트 |
| 2 | create_daily_issues.py | Routine (cron) | Routine |
| 3 | work-board 플러그인 | Plugin (유지) | Plugin |
| 4 | system-garden 플러그인 | Plugin (유지) | Plugin |
| 8 | UA post-commit hook | Plugin job (cron) | Plugin |
| 9 | Feedback Loop | Workflow step + 비전 검수 | Workflow |
| 11 | action_executor → 제갈량 위임 | Routine (webhook) → Workflow | Routine + Workflow |
| 14 | adaptive_heartbeat.py | 삭제 (heartbeat OFF + Reconciler) | 불필요 |
| 16 | done 게이트키핑 | issue.updated 이벤트 → Plugin 로직 | Plugin |

**제거 가능한 외부 의존:**
- launchd plist 4개 → 삭제
- Python healthcheck 스크립트 7개 → Routine + Plugin으로 대체
- git hook → Plugin job으로 대체
- adaptive_heartbeat.py → 불필요 (heartbeat OFF + Reconciler)

**유지:**
- 텔레그램 /ask (Paperclip 외부 인터페이스)
- 에이전트 프롬프트 파일 (.paperclip/agents/) — 구조화 가능하나 단계적으로

---

## 8. 구현 계획

### Phase 1: Workflow Engine Plugin

**목표**: 이슈 상태 변화 → 다음 step 자동 트리거

```
paperclip-addon/plugins/workflow-engine/
├── src/
│   ├── manifest.ts         # 이벤트 구독 + Reconciler cron job 선언
│   ├── worker.ts           # issue.updated 이벤트 → 흐름 제어 (멱등)
│   ├── workflow-store.ts   # ctx.entities 기반 CRUD
│   ├── dag-engine.ts       # 위상 정렬 검증, 의존 해석, join 판정
│   ├── reconciler.ts       # 5분 cron — todo인데 wakeup 안 된 이슈 재트리거
│   ├── parent-id-filler.ts # issue.created → defaultParentIssueId fallback
│   └── ui/index.tsx        # workflow 목록, 실행 현황, DAG 시각화
├── workflows/              # 초기 workflow YAML 정의
└── package.json
```

**산출물**: 가즈아 일일 루틴이 Workflow로 돌아감 + parentId 자동 설정 복구

### Phase 2: Tool Registry Plugin (Plugin Tool 기반)

**목표**: CLI를 Plugin Tool로 래핑 → 에이전트는 API로만 도구 실행 → 서버 측 강제

```
paperclip-addon/plugins/tool-registry/
├── src/
│   ├── manifest.ts         # Plugin Tool 선언 (도구별 name + parametersSchema)
│   ├── worker.ts           # executeTool 핸들러 (agentId allow-list 체크 + CLI 실행)
│   ├── tool-config.ts      # ctx.entities 기반 도구 설정/allow-list CRUD
│   ├── audit.ts            # agent.run.finished → bash 직접 사용 감지 → 감찰관 이슈
│   └── ui/index.tsx        # 도구 관리, 에이전트별 권한, 실행 로그 UI
└── package.json
```

**산출물**: 에이전트가 Plugin Tool API로만 도구 실행 (서버 측 파라미터 검증 + agentId allow-list)

### Phase 3: Knowledge Base Plugin

**목표**: 지식 소스 등록 → 에이전트별 접근 권한 → 토큰 캡 적용

```
paperclip-addon/plugins/knowledge-base/
├── src/
│   ├── manifest.ts
│   ├── worker.ts           # agent.run.started → 관련 KB 주입 (토큰 캡)
│   ├── kb-store.ts         # ctx.entities 기반 CRUD
│   └── ui/index.tsx        # KB 목록, 에이전트 연결 UI
└── package.json
```

**산출물**: 에이전트가 업무 규정/매뉴얼 참조 가능

### Phase 4: 통합 및 외부 스크립트 제거

- Routine으로 일일/주간 작업 이관
- launchd plist 삭제
- Python 스크립트 아카이브
- 옵시디언/메모리 업데이트

---

## 9. 기술 판단

### Plugin SDK 적합성 확인 (2026-03-24)

| 필요 기능 | Plugin SDK 지원 | 비고 |
|---|---|---|
| issue.updated 이벤트 수신 | ✅ `ctx.events.on("issue.updated")` | 핵심 |
| 이슈 생성/상태 변경 | ✅ `ctx.issues.create/update` | 핵심 |
| 에이전트 wakeup | ✅ `ctx.agents.invoke` | 핵심 |
| 구조화 저장 | ✅ `ctx.entities.upsert/list` | ctx.state 대신 사용 |
| cron 스케줄 job | ✅ manifest에 jobs 선언 | Reconciler + Routine 대체 |
| 에이전트 정지 | ✅ `ctx.agents.pause` | bash 위반 시 사용 |
| Plugin Tool 선언 | ✅ manifest에 tools 선언 | CLI를 Plugin Tool로 래핑 |
| Plugin Tool 실행 | ✅ executeTool 핸들러 | agentId 기반 allow-list 강제 |
| 파라미터 스키마 검증 | ✅ 서버가 JSON Schema 검증 | CLI 인자 안전성 보장 |
| 커스텀 REST endpoint | ❌ | webhook으로 우회 가능 |
| Plugin → UI 실시간 업데이트 | ✅ `ctx.streams` (SSE) | UI 시각화 |
| 에이전트 명령 실행 차단 | ❌ | 사후 감사로 대응 |

**결론: 서버 포크 없이 Plugin만으로 구현 가능. CLI 도구는 Plugin Tool로 래핑하여 서버 측 강제.**

---

## 10. 설계 리뷰 결과 (2026-03-24)

### 3-AI Review (Gemini + Codex + Claude Chairman)

**Grade: B+ (78/100)**

| Dimension | Score | Key Finding |
|---|---|---|
| 방향/의도 | 23/25 | 회사 비유, 외부 스크립트 제거 의도 명확 |
| 실현 가능성 | 15/25 | ctx.state → ctx.entities 변경으로 해결 |
| 보안/강제력 | 12→20/25 | Plugin Tool 발견으로 서버 측 강제 확보 |
| 완성도 | 28/25 | 테스트 전략, 비용 집계 등 보완 |

### Critical Issues → 반영 완료

| 이슈 | 대응 | 반영 위치 |
|---|---|---|
| ctx.state race condition | ctx.entities로 변경 | 4.1 데이터 모델, 8장 구현 계획 |
| 이벤트 유실 시 영구 대기 | Reconciler cron job 추가 | 3장 원칙 3, 4.1 Reconciler, 8장 Phase 1 |
| CLI 강제력 없음 | → Plugin Tool 기반으로 전환 (서버 측 강제 확보) | 4.2 Plugin Tool 활용 |
| DAG cycle 미감지 | 위상 정렬 검증 추가 | 4.1 DAG 검증 |
| KB 토큰 폭발 | maxTokenBudget 추가 | 4.3 토큰 폭발 방지 |
| 워크플로우 무한 루프 | timeoutMinutes + maxRetries | 4.1 데이터 모델 |
| 롤백 전략 미명세 | 보상 모델 명세 | 4.1 실패 처리 |

### 미해결 (향후)

| 이슈 | 대응 시점 |
|---|---|
| Plugin SDK API 파괴적 변경 위험 | SDK 버전 고정 + 변경 모니터링 |
| 워크플로우 단위 비용 집계 | Phase 4에서 issue metadata 태깅으로 구현 |
| 에이전트별 동시 실행 제한 | Phase 1에서 maxConcurrentSteps 추가 검토 |
| 테스트 전략 | Phase 1 구현 시 dag-engine 단위 + mock SDK 통합 |
| 시각적 DAG 편집기 | Phase 1 이후 UI 개선 |
| upstream tool allow-list RFC | CLI 위반이 실제 문제가 되면 제안 |

---

## 11. 최종 아키텍처

```
┌──────────────────────────────────────────────────────┐
│                   Paperclip Server                    │
│                   (upstream 그대로)                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Routine  │→│ Workflow   │→│  Issue + Wakeup   │  │
│  │ (cron)   │  │ Engine    │  │  (이벤트 기반)    │  │
│  └──────────┘  │ Plugin    │  └────────┬─────────┘  │
│                │ +Reconciler│           │             │
│                └───────────┘           ▼             │
│              ┌─────────────────────────────────┐     │
│              │        Agent Runtime             │     │
│              │  ┌────────┐ ┌──────┐ ┌────────┐ │     │
│              │  │ Skills │ │Tools │ │  KB    │ │     │
│              │  │(기존)  │ │Plugin│ │Plugin  │ │     │
│              │  │        │ │+감사 │ │+토큰캡 │ │     │
│              │  └────────┘ └──────┘ └────────┘ │     │
│              └─────────────────────────────────┘     │
│                                                      │
│  Plugins: workflow-engine, tool-registry,            │
│           knowledge-base, work-board, system-garden  │
└──────────────────────────────────────────────────────┘
```

**서버 포크: 0 | 외부 스크립트: 0** (텔레그램 봇 제외)
