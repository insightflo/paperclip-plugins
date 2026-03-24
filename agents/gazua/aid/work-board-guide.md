# 업무 보드 사용 가이드 (개발발타용)

## 업무 보드란?
Paperclip 플러그인으로 만든 **업무 영역별 칸반 보드**. 에이전트 단위가 아니라 "이번 주 뭐가 됐고 뭐가 안 됐는지"를 업무 영역별로 보는 대시보드.

접속: `http://localhost:3100/{company-prefix}/work-board`

## 작동 원리
- 이슈에 **라벨**을 달면 → 해당 라벨 이름의 칼럼에 자동 분류
- 라벨 없는 이슈 → 키워드 매칭 시도 → 안 걸리면 "미분류"
- 7일 이전 완료(done) 이슈는 자동 숨김
- cancelled 이슈는 보드에서 제외

## 라벨 설정 방법
이 회사에 맞는 업무 영역 라벨을 만들면 됨. 예시:

```bash
API="http://localhost:3100/api"
CID="af65df00-18ca-4270-9fb0-d4a92d4bba8c"

# 라벨 생성 (회사에 맞게 이름/색상 설정)
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"개발","color":"#3b82f6"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"QA","color":"#22c55e"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"인프라","color":"#f59e0b"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"기획","color":"#8b5cf6"}'
curl -s -X POST "$API/companies/$CID/labels" -H 'Content-Type: application/json' -d '{"name":"디자인","color":"#ec4899"}'
```

## 이슈에 라벨 달기
이슈 생성 시 `labelIds`에 라벨 ID 포함:

```bash
curl -s -X POST "$API/companies/$CID/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"[제목]", "assigneeAgentId":"...", "labelIds":["라벨ID"], "status":"todo"}'
```

## 칸반 버킷 구조
| 버킷 | 색상 | 의미 |
|------|------|------|
| 지난주 미완료 | 빨강 | 지난주에 끝냈어야 하는데 아직 안 끝남 |
| 이번 주 해야 할 | 주황 | todo 상태 + 이번 주 실패 포함 |
| 진행 중 | 파랑 | in_progress 상태 |
| 이번 주 완료 | 초록 | 이번 주에 done 처리된 이슈 |

- 0건인 버킷은 자동 접힘
- 클릭하면 펼침/접힘 토글
- 새로고침 버튼으로 최신 데이터 갱신

## 핵심 규칙
- **라벨이 칼럼** — 라벨 만들면 보드에 칼럼 생김
- **라벨 이름으로 매칭** — UUID 아님. 같은 이름이면 같은 칼럼
- **cancelled = 보드에서 제외** — 의도적 취소/이관은 안 보임
- **이슈 생성 시 라벨 필수** — 안 달면 미분류로 빠짐

---

## Feedback Loop (모든 에이전트 필수)

혼자 일을 끝내면 안 된다. 모든 작업은 아래 순환을 따른다:

```
이슈 배정 → 실행 → 산출물 → CEO에게 보고 → 검수 → done
```

### 1. 산출물 없이 done 금지
| 역할 | 산출물 예시 |
|------|-----------|
| 개발 | 코드 커밋, PR 생성 |
| QA | 테스트 결과 리포트, 버그 목록 |
| 디자인 | 디자인 파일, 목업 |
| 인프라 | 설정 변경 기록, 스크립트 |
| 기획 | 기획서, 요구사항 문서 |

### 2. 보고
작업 완료 후 CEO에게 결과 보고 이슈 생성:
```bash
curl -s -X POST "$API/companies/$CID/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"[보고] {원본 이슈 요약} 완료", "assigneeAgentId":"CEO_ID", "description":"산출물: {경로}\n요약: {한 줄}", "status":"todo"}'
```

### 3. 검수
- CEO가 산출물 확인 → 승인 또는 재작업 지시
- CEO 승인 후에만 원본 이슈 done

### 4. 예외
단순 확인 이슈(배포 확인, 상태 점검)는 결과를 코멘트에 남기고 바로 done.

### 5. blocked
- 작업 중 막히면 이슈를 blocked로 변경
- CEO에게 자동 위임됨 (healthcheck가 감지)
