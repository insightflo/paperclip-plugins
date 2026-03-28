# Paperclip Work Board Plugin

업무 영역별 주간 칸반 보드. 이슈에 달린 **라벨이 칼럼**이 됩니다.

![preview](https://img.shields.io/badge/Paperclip-plugin-blue)

---

## Features

- **라벨 기반 동적 칼럼** — 라벨 만들면 보드에 칼럼 자동 생성
- **4개 버킷**: 🔴 지난주 미완료 / 🟠 이번주 해야 할 / 🔵 진행 중 / 🟢 이번주 완료
- **접기/펼치기** — 0건 버킷 자동 접힘
- **cancelled 제외** — 의도적 취소/이관은 보드에서 숨김
- **회사별 독립** — 여러 company에서 각각 다른 칼럼
- **키워드 fallback** — 라벨 없는 이슈도 키워드 매칭으로 분류
- **3가지 UI**: 대시보드 위젯 + 사이드바 링크 + 전체 페이지

---

## Prerequisites

- [Paperclip](https://github.com/paperclipai/paperclip) v0.3.0+
- Node.js 20+
- pnpm 9+

---

## Installation

```bash
# 1. 클론
git clone https://github.com/insightflo/paperclip-work-board.git
cd paperclip-work-board

# 2. 의존성 설치 + 빌드
pnpm install
pnpm build

# 3. Paperclip에 설치
pnpm paperclipai plugin install --api-base http://localhost:3100 .
```

Paperclip 서버가 실행 중이어야 합니다 (`pnpm dev` in paperclip repo).

---

## Setup (설치 후 해야 할 일)

### 1. 라벨 만들기

업무 영역에 맞는 라벨을 만드세요. 라벨 이름이 칸반 칼럼이 됩니다.

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
  -d '{"title":"버그 수정", "assigneeAgentId":"...", "labelIds":["라벨ID"], "status":"todo"}'
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
- 사이드바에 "업무 보드" 링크 추가됨

---

## Customization

### 키워드 매칭 (선택)

라벨 없는 이슈를 제목/설명 키워드로 자동 분류하려면 `src/constants.ts`의 `WORKSTREAMS`를 수정하세요.

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

### 기본 칼럼 비우기

키워드 매칭 없이 **라벨만으로** 운영하려면:

```typescript
export const WORKSTREAMS = [];
```

---

## How It Works

```
이슈 생성 (라벨 포함)
  → 보드가 라벨 이름으로 칼럼 자동 생성
  → 이슈 상태에 따라 버킷 배정:
     - todo/backlog → "이번주 해야 할" (주황)
     - in_progress → "진행 중" (파랑)
     - done (이번주) → "이번주 완료" (초록)
     - 지난주 생성 + 미완료 → "지난주 미완료" (빨강)
  → cancelled → 보드에서 제외
  → 7일 이전 done → 자동 숨김
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
