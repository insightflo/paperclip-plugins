# Paperclip Work Board Plugin

미션 중심 주간 보드. parent issue를 미션으로 보고, 하위 issue를 태스크로 묶어 보드와 그래프로 보여줍니다.

![preview](https://img.shields.io/badge/Paperclip-plugin-blue)

---

## Features

- **미션 단위 그룹화** — parent issue를 미션으로, child issue를 태스크로 묶어 진행률 표시
- **라벨 기반 칼럼 배치** — 루트 이슈 또는 하위 이슈의 첫 유효 라벨을 칼럼명으로 사용
- **4개 버킷**: 🔴 지연 / 🟠 대기 / 🔵 진행 중 / 🟢 완료
- **미션 그래프 / spawn 그래프** — 미션 관계와 spawn 계보를 시각화
- **그래프 검색** — `cmpa-156` 같은 issue 번호로 그래프 노드 바로 선택
- **visible mode** — 관련 노드 trail 고정 및 토글 선택
- **cancelled 제외** — 의도적 취소/이관은 보드에서 숨김
- **프로젝트 그룹 지원** — 프로젝트별 섹션으로 미션을 분리
- **3가지 UI**: 대시보드 위젯 + 사이드바 링크 + 전체 페이지

---

## Prerequisites

- [Paperclip](https://github.com/paperclipai/paperclip) v0.3.0+
- Node.js 20+
- pnpm 9+

---

## Installation

```bash
# 1. 플러그인 저장소 클론
git clone https://github.com/insightflo/paperclip-plugins.git
cd paperclip-plugins/plugins/work-board

# 2. 의존성 설치 + 빌드
pnpm install
pnpm build

# 3. Paperclip에 설치
paperclipai plugin install --api-base http://localhost:3100 .
```

Paperclip 서버가 실행 중이어야 합니다.

---

## Setup (설치 후 해야 할 일)

### 1. parent issue를 미션으로 사용

미션을 대표하는 parent issue를 만들고, 관련 태스크를 child issue로 연결하세요.

### 2. 라벨로 칼럼 지정

업무 영역에 맞는 라벨을 루트 이슈 또는 태스크 이슈에 달면, 해당 미션이 그 라벨 칼럼으로 배치됩니다.

```bash
API="http://localhost:3100/api"
CID="your-company-id"

# 예시 (개발팀)
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"개발","color":"#3b82f6"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"QA","color":"#22c55e"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"인프라","color":"#f59e0b"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"디자인","color":"#ec4899"}'

# 예시 (투자팀)
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"데이터수집","color":"#34c759"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"리포팅","color":"#5856d6"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"전략매매","color":"#ff9500"}'
```

### 2. 이슈에 라벨 달기

새 이슈 생성 시 `labelIds`에 라벨 ID를 포함하세요.

```bash
curl -s -X POST "$API/companies/$CID/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"미션 루트", "assigneeAgentId":"...", "labelIds":["라벨ID"], "status":"todo"}'
```

child issue 예시:

```bash
curl -s -X POST "$API/companies/$CID/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"태스크 1", "parentId":"{미션루트이슈ID}", "status":"todo"}'
```

기존 이슈에 라벨 추가:

```bash
curl -s -X PATCH "$API/issues/{이슈ID}" \
  -H 'Content-Type: application/json' \
  -d '{"labelIds":["라벨ID"]}'
```

### 3. 보드 확인

`http://localhost:3100/{company-prefix}/work-board` 에서 확인.

- 대시보드에 위젯도 자동 추가됨
- 사이드바에 "Mission Board" 링크 추가됨
- Mission Graph에서 issue 번호 검색 가능

---

## Graph Usage

- `mission graph`: 현재 미션 관계를 표시
- `spawn graph`: spawn / reissue / parent 기반 계보만 표시
- `issue 검색`: `cmpa-156` 입력 시 해당 노드를 클릭한 것처럼 선택
- `visible mode on`: 클릭한 노드 trail을 유지하고, 이미 선택된 trail 노드를 다시 클릭하면 해제

## Customization

### 키워드 fallback (선택)

기본값은 비활성입니다. 라벨 없는 이슈를 제목/설명 키워드로 자동 분류하려면 `src/constants.ts`의 `WORKSTREAMS`를 수정하세요.

```typescript
export const WORKSTREAMS = [
  {
    name: "개발",        // 칼럼 이름 (라벨 이름과 동일 권장)
    description: "기능 개발, 버그 수정",
    keywords: ["개발", "dev", "feature", "bug", "fix"],
  },
  {
    name: "QA",
    description: "테스트, 품질 검증",
    keywords: ["QA", "test", "검증", "테스트"],
  },
];
```

수정 후 `pnpm build` → 플러그인 재설치.

### 기본 fallback 비우기

키워드 fallback 없이 **라벨만으로** 운영하려면:

```typescript
export const WORKSTREAMS = [];
```

---

## How It Works

```
이슈 수집
  → parent issue 기준으로 미션 묶음 생성
  → child issue를 태스크로 수집
  → 라벨이 있으면 미션 칼럼 결정
  → 이슈 상태에 따라 버킷 배정:
     - stale / 지난주 미완료 → "지연" (빨강)
     - todo / backlog → "대기" (주황)
     - in_progress / in_review / blocked → "진행 중" (파랑)
     - done → "완료" (초록)
  → cancelled → 보드에서 제외
  → 프로젝트별로 섹션 분리
  → mission graph / spawn graph 생성
```

---

## Development

```bash
pnpm install
pnpm dev          # watch builds
pnpm test         # run tests
pnpm build        # production build
```

---

## Uninstall

```bash
pnpm paperclipai plugin uninstall --api-base http://localhost:3100 paperclipai.work-board
```

---

## License

MIT
