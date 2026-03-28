#!/usr/bin/env python3
"""
Notion 페이지 업로드 CLI.
마크다운 파일 또는 stdin 텍스트를 Notion 페이지로 생성.

Usage:
  python3 upload_notion.py --title "Tool Scout 2026-03-26" --date 2026-03-26 --source "Trendshift, Product Hunt" --file report.md
  python3 upload_notion.py --title "제목" "본문 텍스트"
  echo "내용" | python3 upload_notion.py --title "제목" --stdin

마크다운 규칙:
  `> 텍스트`  → callout 블록 (⚠️)
  `---`       → divider
  `# ## ###`  → heading 1/2/3
  `- * 1.`    → bullet / numbered list

환경변수:
  NOTION_TOKEN        — Notion Integration 토큰
  NOTION_PARENT_PAGE  — 부모 페이지 ID
"""
import sys
import os
import json
import re
import urllib.request

# 스크립트와 같은 디렉토리의 .env 로드
_env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_env_file):
    with open(_env_file, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _, _v = _line.partition("=")
            _k = _k.strip()
            _v = _v.strip().strip('"').strip("'")
            if _k and _k not in os.environ:
                os.environ[_k] = _v

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_PARENT_PAGE = os.environ.get("NOTION_PARENT_PAGE", "")
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


def notion_request(method, path, body=None):
    url = f"{NOTION_API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def rich_text(text):
    """Notion rich_text 배열. 2000자 제한 준수."""
    chunks = []
    for start in range(0, len(text), 2000):
        chunks.append({"type": "text", "text": {"content": text[start:start + 2000]}})
    return chunks


def heading_block(level, text):
    key = f"heading_{level}"
    return {"object": "block", "type": key, key: {"rich_text": rich_text(text)}}


def paragraph_block(text):
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rich_text(text)}}


def bullet_block(text):
    return {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {"rich_text": rich_text(text)}}


def numbered_block(text):
    return {"object": "block", "type": "numbered_list_item", "numbered_list_item": {"rich_text": rich_text(text)}}


def code_block(text, language="plain text"):
    return {"object": "block", "type": "code", "code": {"rich_text": rich_text(text), "language": language}}


def callout_block(text):
    return {
        "object": "block",
        "type": "callout",
        "callout": {
            "rich_text": rich_text(text),
            "icon": {"type": "emoji", "emoji": "⚠️"},
            "color": "gray_background",
        },
    }


def date_mention_block(date_str):
    """기준일: [Notion date mention] 형식의 bullet 블록."""
    return {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
            "rich_text": [
                {"type": "text", "text": {"content": "기준일: "}},
                {
                    "type": "mention",
                    "mention": {
                        "type": "date",
                        "date": {"start": date_str, "end": None, "time_zone": None},
                    },
                },
            ]
        },
    }


def md_to_blocks(text):
    """마크다운 텍스트를 Notion block 배열로 변환."""
    blocks = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]

        # 헤딩
        if line.startswith("### "):
            blocks.append(heading_block(3, line[4:].strip()))
        elif line.startswith("## "):
            blocks.append(heading_block(2, line[3:].strip()))
        elif line.startswith("# "):
            blocks.append(heading_block(1, line[2:].strip()))
        # 코드 블록
        elif line.startswith("```"):
            lang = line[3:].strip()
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            blocks.append(code_block("\n".join(code_lines), lang or "plain text"))
        # callout (blockquote)
        elif line.startswith("> "):
            blocks.append(callout_block(line[2:].strip()))
        # 리스트
        elif line.startswith("- ") or line.startswith("* "):
            blocks.append(bullet_block(line[2:].strip()))
        elif re.match(r"^\d+\.\s", line):
            blocks.append(numbered_block(re.sub(r"^\d+\.\s", "", line).strip()))
        # 구분선
        elif line.strip() == "---":
            blocks.append({"object": "block", "type": "divider", "divider": {}})
        # 빈 줄 무시
        elif not line.strip():
            pass
        # 테이블 행 (| col | col |)
        elif line.strip().startswith("|") and line.strip().endswith("|"):
            blocks.append(paragraph_block(line.strip()))
        # 일반 텍스트
        else:
            blocks.append(paragraph_block(line))

        i += 1

    return blocks


def strip_internal_sections(text):
    """내부 전용 섹션 제거 (우리 스택 접점, 스킬 연관성 등)."""
    lines = text.split("\n")
    result = []
    skip = False
    for line in lines:
        if re.match(r"^#{1,3}\s.*(우리 스택 접점|스킬 연관|내부 메모|스카우트 판정|Internal)", line, re.IGNORECASE):
            skip = True
            continue
        if skip and re.match(r"^#{1,2}\s", line):
            skip = False
        if not skip:
            result.append(line)
    return "\n".join(result)


def create_page(title, blocks, parent_page_id=None):
    parent_page_id = parent_page_id or NOTION_PARENT_PAGE
    body = {
        "parent": {"page_id": parent_page_id},
        "properties": {
            "title": {"title": [{"text": {"content": title}}]}
        },
        "children": blocks[:100],  # Notion API limit: 100 blocks per request
    }
    result = notion_request("POST", "/pages", body)

    # 100개 초과 블록은 append로 추가
    page_id = result["id"]
    remaining = blocks[100:]
    while remaining:
        batch = remaining[:100]
        remaining = remaining[100:]
        notion_request("PATCH", f"/blocks/{page_id}/children", {"children": batch})

    return result


def main():
    if not NOTION_TOKEN:
        print(json.dumps({"success": False, "error": "NOTION_TOKEN not set"}))
        sys.exit(1)

    title = ""
    content = ""
    parent_id = NOTION_PARENT_PAGE
    public_mode = True  # 기본: 외부 배포용 (내부 섹션 제거)
    date_str = None
    source_str = None

    args = sys.argv[1:]
    i = 0
    positional = []
    while i < len(args):
        if args[i] == "--title" and i + 1 < len(args):
            title = args[i + 1]
            i += 2
        elif args[i] == "--file" and i + 1 < len(args):
            with open(args[i + 1]) as f:
                content = f.read()
            i += 2
        elif args[i] == "--parent" and i + 1 < len(args):
            parent_id = args[i + 1]
            i += 2
        elif args[i] == "--date" and i + 1 < len(args):
            date_str = args[i + 1]
            i += 2
        elif args[i] == "--source" and i + 1 < len(args):
            source_str = args[i + 1]
            i += 2
        elif args[i] == "--stdin":
            content = sys.stdin.read()
            i += 1
        elif args[i] == "--internal":
            public_mode = False
            i += 1
        elif args[i] == "--json":
            i += 1
        else:
            positional.append(args[i])
            i += 1

    if not content and positional:
        content = " ".join(positional)
    if not content and not sys.stdin.isatty():
        content = sys.stdin.read()

    if not content.strip():
        print(json.dumps({"success": False, "error": "empty content"}))
        sys.exit(1)

    if not title:
        from datetime import datetime
        title = f"Tech Scout 리포트 ({datetime.now().strftime('%Y-%m-%d')})"

    if public_mode:
        content = strip_internal_sections(content)

    # 메타 블록 (기준일 date mention, 소스) — 마크다운 본문 앞에 삽입
    meta_blocks = []
    if date_str:
        meta_blocks.append(date_mention_block(date_str))
    if source_str:
        meta_blocks.append(bullet_block(f"소스: {source_str}"))

    try:
        body_blocks = md_to_blocks(content.strip())
        all_blocks = meta_blocks + body_blocks
        result = create_page(title, all_blocks, parent_id)
        page_url = result.get("url", "")
        print(json.dumps({
            "success": True,
            "page_id": result["id"],
            "url": page_url,
            "title": title,
            "block_count": len(all_blocks),
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
