#!/usr/bin/env python3
"""에이전트 프롬프트에 이슈 생명주기 규칙 추가."""
from pathlib import Path

CID = "240b0239-36cb-44b8-833f-663c2b0ec783"
AGENTS_DIR = Path("/Users/kwak/Projects/ai/.paperclip/agents")

RULE = """## 이슈 생명주기 규칙
- 작업 시작 시: `todo` → `in_progress`로 변경
  ```bash
  curl -s -X PATCH http://localhost:3100/api/issues/{issueId} -H 'Content-Type: application/json' -d '{"status":"in_progress"}'
  ```
- 작업 완료 시: `in_progress` → `done`으로 변경 + 결과 코멘트
  ```bash
  curl -s -X POST http://localhost:3100/api/issues/{issueId}/comments -H 'Content-Type: application/json' -d '{"body":"완료: {결과 요약}"}'
  curl -s -X PATCH http://localhost:3100/api/issues/{issueId} -H 'Content-Type: application/json' -d '{"status":"done"}'
  ```
- 차단 시: `in_progress` → `blocked`로 변경 + 사유 코멘트
- **절대 하지 말 것**: done인 이슈를 다시 열기, 남의 이슈 상태 변경
"""

for agent in ["ceo", "compliance", "cto", "design", "dev", "education", "hr", "infra", "qa", "research"]:
    path = AGENTS_DIR / f"{agent}.md"
    content = path.read_text(encoding="utf-8")
    if "이슈 생명주기 규칙" in content:
        print(f"  ⏭ {agent}.md — 이미 있음")
        continue
    # Paperclip API 규칙 바로 앞에 삽입
    anchor = "## Paperclip API 사용 규칙"
    if anchor in content:
        content = content.replace(anchor, RULE + "\n" + anchor)
    else:
        content = content.rstrip() + "\n\n" + RULE
    path.write_text(content, encoding="utf-8")
    print(f"  ✅ {agent}.md")
