#!/usr/bin/env python3
"""에이전트 프롬프트에 Paperclip API 규칙 추가."""
import re
from pathlib import Path

CID = "240b0239-36cb-44b8-833f-663c2b0ec783"
AGENTS_DIR = Path("/Users/kwak/Projects/ai/.paperclip/agents")

RULE = f"""## Paperclip API 사용 규칙
- URL: `http://localhost:3100/api`
- 인증: **불필요** (local_trusted 모드). Authorization 헤더 넣지 마.
- Company ID: `{CID}`
- 이슈 조회: `curl -s http://localhost:3100/api/companies/{CID}/issues`
- 이슈 생성: `curl -s -X POST http://localhost:3100/api/companies/{CID}/issues -H 'Content-Type: application/json' -d '{{"title":"...", "assigneeAgentId":"...", "status":"todo"}}'`
- 이슈 상태 변경: `curl -s -X PATCH http://localhost:3100/api/issues/{{issueId}} -H 'Content-Type: application/json' -d '{{"status":"done"}}'`
- **절대 하지 말 것**: API key 생성 시도, 토큰 인증 시도, Settings 변경 시도
"""

for agent in ["compliance", "cto", "design", "dev", "education", "hr", "infra", "qa", "research"]:
    path = AGENTS_DIR / f"{agent}.md"
    content = path.read_text(encoding="utf-8")
    # 기존 불완전한 API 섹션 제거
    content = re.sub(r"\n*## Paperclip API.*", "", content, flags=re.DOTALL).rstrip()
    # 새 규칙 추가
    content += "\n\n" + RULE
    path.write_text(content, encoding="utf-8")
    print(f"  ✅ {agent}.md")
