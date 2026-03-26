# Paperclip Plugins

Community plugins for the [Paperclip](https://github.com/paperclipai/paperclip) AI agent platform.

![Paperclip](https://img.shields.io/badge/Paperclip-plugin-blue)

---

## Plugins

| Plugin | Description |
|--------|-------------|
| [`knowledge-base`](#knowledge-base) | Agent knowledge base — store, search, and grant documents per agent |
| [`system-garden`](#system-garden) | System health dashboard — agent graph, health scores, and meta questions |
| [`tool-registry`](#tool-registry) | Register external CLI tools and grant access per agent |
| [`work-board`](#work-board) | Mission Board — kanban-style issue tracking by label groups |
| [`workflow-engine`](#workflow-engine) | DAG-based workflow automation — schedule, trigger, and orchestrate multi-step agent tasks |

---

## Knowledge Base

에이전트 지식 저장소. 문서를 저장하고 에이전트에게 권한별로 제공합니다.

![Knowledge Base](docs/kb.png)

### Features

- **정적(static) / 동적(dynamic) KB** — 고정 가이드라인 또는 실시간 갱신 문서
- **토큰 버짓 제어** — KB당 Max Token Budget 설정으로 컨텍스트 크기 관리
- **에이전트-KB 연결** — 특정 에이전트에게만 KB 접근 권한 부여
- **보관(archive)** — 오래된 KB를 활성 목록에서 제거

### Installation

```bash
cd plugins/knowledge-base
npm install
npm run build
```

Paperclip UI → Settings → Plugins → Install 에서 빌드된 파일을 업로드하세요.

### Usage

1. **KB 생성** — 이름, 타입(static/dynamic), 설명, 토큰 버짓, 내용 입력 → KB 저장
2. **에이전트 연결** — "에이전트-KB 연결" 섹션에서 에이전트와 KB 선택 → 연결
3. **에이전트 활용** — 에이전트가 작업 시 해당 KB 내용을 컨텍스트로 자동 주입

---

## System Garden

에이전트 조직의 건강을 시각화하는 대시보드. 에이전트 그래프, 헬스 스코어, 메타 질문을 한 화면에서 확인합니다.

![System Garden](docs/system-garden.png)

### Features

- **에이전트 그래프** — 에이전트 간 reporting 구조와 도구 사용 관계를 노드 그래프로 시각화
- **헬스 스코어** — 각 에이전트의 완료율·연속 실패 수 기반 점수 (올창 / 성장 중 / 위험)
- **메타 질문** — 업무 편중, 병목 에이전트 등 조직 패턴을 자동 감지해 경고
- **3가지 그래프 뷰** — 전체 / 에이전트만 / 코드만 레이어 전환

### Installation

```bash
cd plugins/system-garden
npm install
npm run build
```

### Usage

플러그인 설치 후 사이드바 또는 대시보드 위젯에서 **System Garden** 진입.

- 노드 클릭 → 에이전트/도구 상세 정보 표시
- Refresh 버튼 → 최신 이슈·에이전트 데이터 재생성

---

## Tool Registry

외부 CLI 도구를 등록하고 에이전트별 실행 권한을 관리합니다.

![Tool Registry](docs/tool-registry.png)

### Features

- **도구 등록** — 이름, command, working directory, 환경변수, 설명, 에이전트 instructions 설정
- **에이전트 권한(Grant)** — 특정 에이전트에게만 도구 실행 권한 부여 / 회수
- **실행 로그** — 최근 실행 이력, exit code, 출력 요약 조회
- **보관(archive)** — 더 이상 사용하지 않는 도구를 목록에서 제거

### Installation

```bash
cd plugins/tool-registry
npm install
npm run build
```

### Usage

1. **도구 등록** — Tool Config 폼에 이름·command·설명 입력 → Create Tool
2. **권한 부여** — Agent Grants 섹션에서 에이전트와 도구 선택 → Grant Tool
3. **에이전트 호출** — 에이전트가 작업 시 허가된 도구를 직접 실행

> 환경변수(`env`) 필드에 토큰 등 민감 값을 저장하면 실행 시 자동 주입됩니다.

---

## Work Board

라벨 기반 주간 칸반 보드. 라벨이 칼럼이 됩니다.

![Work Board](docs/mission-board.png)

### Features

- **라벨 기반 동적 칼럼** — 라벨 만들면 보드에 칼럼 자동 생성
- **미션 단위 그룹화** — parent issue를 미션으로, 하위 이슈를 태스크로 묶어 표시
- **4개 버킷**: 🔴 지난주 미완료 / 🟠 대기 / 🔵 진행 중 / 🟢 완료
- **cancelled 제외** — 의도적 취소/이관은 보드에서 숨김
- **3가지 UI** — 대시보드 위젯 + 사이드바 링크 + 전체 페이지

### Installation

```bash
cd plugins/work-board
npm install
npm run build
```

또는 별도 저장소에서 설치:

```bash
git clone https://github.com/insightflo/paperclip-work-board.git
cd paperclip-work-board
pnpm install && pnpm build
pnpm paperclipai plugin install --api-base http://localhost:3100 .
```

### Usage

설치 후 `http://localhost:3100/{company-prefix}/work-board` 에서 확인.

---

## Workflow Engine

DAG 기반 워크플로우 자동화. 스케줄 또는 라벨 트리거로 멀티스텝 에이전트 작업을 오케스트레이션합니다.

![Workflow Engine](docs/workflow-engine.png)

### Features

- **DAG step 구성** — 에이전트 step 간 의존성 정의 (`dependsOn`)
- **cron 스케줄** — timezone 설정, 일일 최대 실행 횟수 제한
- **라벨 트리거** — 특정 라벨이 달린 이슈 생성 시 워크플로우 자동 시작
- **프로젝트 연결** — 워크플로우 실행 이슈를 특정 프로젝트에 생성
- **도구 연동** — 각 step에 에이전트가 사용할 tool 목록 지정
- **보관(archive)** — 비활성 워크플로우 관리

### Installation

```bash
cd plugins/workflow-engine
npm install
npm run build
```

### Usage

1. **워크플로우 정의** — "+ New Workflow" → 이름, cron, 프로젝트, 트리거 라벨 설정
2. **Step 추가** — "+ Add Step" → 에이전트 이름, 제목 템플릿, 도구 목록, 의존성 설정
3. **활성화** — Status를 `active`로 설정 → cron 또는 라벨 트리거 시 자동 실행

---

## Requirements

- [Paperclip](https://github.com/paperclipai/paperclip) v0.3.0+
- Node.js 18+
- `@paperclipai/plugin-sdk`

---

## License

MIT
