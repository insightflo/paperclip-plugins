#!/usr/bin/env python3
"""
Daily Tech Scout — TrendShift.io Top 5 분석 리포트 자동 생성
매일 오전 7시 실행. Claude Code를 통해 분석·작성.

사용법:
  python3 daily_tech_scout.py           # 오늘자 실행
  python3 daily_tech_scout.py --dry-run # 실행 없이 명령만 출력
"""

import subprocess
import shutil
import sys
import os
import json
import re
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

OBSIDIAN_BASE = Path.home() / "Personal" / "obsidian" / "600. Improvements" / "602.Tech"
PROMPT_PATH = Path.home() / "Projects" / "ai" / ".claude" / "prompts" / "tool-scout.md"
KAKAO_CHAT_ID = "160315573461240"  # 대표님 카톡 (MemoChat)
NOTION_TOKEN = "ntn_b64251655812DbrumaairEn4sj2k4FRrBdaBoyQWXTv82T"
NOTION_PARENT_PAGE_ID = "32917ef8-3f0d-8096-97b6-c158787a0735"  # Tech Scout 페이지

# claude CLI 후보 경로 — PATH 의존 없이 직접 탐색
CLAUDE_CANDIDATES = [
    "/Applications/cmux.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    str(Path.home() / ".claude" / "bin" / "claude"),
    str(Path.home() / ".local" / "bin" / "claude"),
]


def find_claude_binary():
    """claude CLI 바이너리를 PATH + 후보 경로에서 탐색"""
    # 1) PATH에서 찾기
    found = shutil.which("claude")
    if found:
        return found
    # 2) 후보 경로 직접 확인
    for candidate in CLAUDE_CANDIDATES:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


OPENKAKAO_CANDIDATES = [
    str(Path.home() / ".cargo" / "bin" / "openkakao-rs"),
    "/usr/local/bin/openkakao-rs",
    "/opt/homebrew/bin/openkakao-rs",
]


def find_binary(name, candidates):
    """바이너리를 PATH + 후보 경로에서 탐색"""
    found = shutil.which(name)
    if found:
        return found
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def md_to_pdf(md_path):
    """마크다운을 PDF로 변환"""
    pdf_path = md_path.with_suffix(".pdf")
    # pandoc 사용
    pandoc = find_binary("pandoc", ["/usr/local/bin/pandoc", "/opt/homebrew/bin/pandoc"])
    if pandoc:
        try:
            subprocess.run(
                [pandoc, str(md_path), "-o", str(pdf_path),
                 "--pdf-engine=typst",
                 "-V", "mainfont=AppleSDGothicNeo-Regular"],
                capture_output=True, timeout=60
            )
            if pdf_path.exists() and pdf_path.stat().st_size > 0:
                print(f"[Tech Scout] PDF 생성: {pdf_path}")
                return pdf_path
        except Exception as e:
            print(f"[Tech Scout] pandoc PDF 변환 실패: {e}")

    # fallback: cupsfilter (macOS 기본)
    try:
        html_path = md_path.with_suffix(".html")
        # 간단 HTML 변환
        with open(md_path, "r") as f:
            content = f.read()
        body_parts = []
        for line in content.split("\n"):
            if not line.strip():
                continue
            if line.startswith("#"):
                level = min(line.count("#", 0, 4), 3)
                text = line.lstrip("# ")
                body_parts.append(f"<h{level}>{text}</h{level}>")
            else:
                body_parts.append(f"<p>{line}</p>")
        body_html = "".join(body_parts)
        html = f"<html><head><meta charset='utf-8'><style>body{{font-family:AppleSDGothicNeo,sans-serif;padding:2em;line-height:1.6}}h1,h2,h3{{color:#1a1a2e}}pre{{background:#f5f5f5;padding:1em;overflow-x:auto}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ddd;padding:8px;text-align:left}}</style></head><body>{body_html}</body></html>"
        with open(html_path, "w") as f:
            f.write(html)
        # cupsfilter HTML → PDF
        result = subprocess.run(
            ["/usr/sbin/cupsfilter", str(html_path)],
            capture_output=True, timeout=30
        )
        if result.stdout:
            with open(pdf_path, "wb") as f:
                f.write(result.stdout)
            html_path.unlink(missing_ok=True)
            if pdf_path.exists() and pdf_path.stat().st_size > 0:
                print(f"[Tech Scout] PDF 생성 (cupsfilter): {pdf_path}")
                return pdf_path
        html_path.unlink(missing_ok=True)
    except Exception as e:
        print(f"[Tech Scout] cupsfilter PDF 변환 실패: {e}")

    return None


def notion_api(endpoint, method="GET", data=None):
    """Notion API 호출 (urllib만 사용, 외부 의존성 없음)"""
    url = f"https://api.notion.com/v1/{endpoint}"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        print(f"[Notion] API 에러 {e.code}: {err_body[:300]}")
        return None


def parse_inline_md(text):
    """마크다운 인라인 서식을 Notion rich_text 배열로 변환
    지원: **볼드**, *이탤릭*, `코드`, [링크](url), [[옵시디언]]
    """
    # 옵시디언 링크 → 일반 텍스트
    text = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)

    tokens = []
    # 패턴: **볼드**, *이탤릭*, `코드`, [텍스트](url)
    pattern = re.compile(
        r"(\*\*(.+?)\*\*)"        # 볼드
        r"|(\*(.+?)\*)"           # 이탤릭
        r"|(`(.+?)`)"             # 코드
        r"|(\[([^\]]+)\]\(([^)]+)\))"  # 링크
    )

    pos = 0
    for m in pattern.finditer(text):
        # 매치 전 평문
        if m.start() > pos:
            plain = text[pos:m.start()]
            if plain:
                tokens.append({"type": "text", "text": {"content": plain[:2000]},
                               "annotations": _default_ann()})

        if m.group(2) is not None:  # 볼드
            ann = _default_ann()
            ann["bold"] = True
            tokens.append({"type": "text", "text": {"content": m.group(2)[:2000]},
                           "annotations": ann})
        elif m.group(4) is not None:  # 이탤릭
            ann = _default_ann()
            ann["italic"] = True
            tokens.append({"type": "text", "text": {"content": m.group(4)[:2000]},
                           "annotations": ann})
        elif m.group(6) is not None:  # 코드
            ann = _default_ann()
            ann["code"] = True
            tokens.append({"type": "text", "text": {"content": m.group(6)[:2000]},
                           "annotations": ann})
        elif m.group(8) is not None:  # 링크
            tokens.append({"type": "text",
                           "text": {"content": m.group(8)[:2000], "link": {"url": m.group(9)}},
                           "annotations": _default_ann()})

        pos = m.end()

    # 잔여 평문
    if pos < len(text):
        remaining = text[pos:]
        if remaining:
            tokens.append({"type": "text", "text": {"content": remaining[:2000]},
                           "annotations": _default_ann()})

    return tokens if tokens else [{"type": "text", "text": {"content": text[:2000]},
                                   "annotations": _default_ann()}]


def _default_ann():
    return {"bold": False, "italic": False, "strikethrough": False,
            "underline": False, "code": False, "color": "default"}


def _make_block(block_type, text):
    """인라인 파싱 적용된 블록 생성"""
    return {"type": block_type, block_type: {"rich_text": parse_inline_md(text)}}


def md_to_notion_blocks(md_path):
    """마크다운을 Notion 블록 배열로 변환 (인라인 서식 + 테이블 + 콜아웃 지원)"""
    with open(md_path, "r") as f:
        content = f.read()

    blocks = []
    # YAML frontmatter 제거
    if content.startswith("---"):
        end = content.find("---", 3)
        if end > 0:
            content = content[end + 3:].strip()

    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]

        # 테이블 처리
        if "|" in line and line.strip().startswith("|"):
            table_lines = []
            while i < len(lines) and "|" in lines[i] and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                table_lines.append(cells)
                i += 1
            # 구분선 행 제거
            table_lines = [r for r in table_lines
                           if not all(re.match(r"^-+:?$|^:?-+:?$", c.strip()) for c in r if c.strip())]
            if len(table_lines) >= 1:
                width = max(len(r) for r in table_lines)
                table_block = {
                    "type": "table",
                    "table": {
                        "table_width": width,
                        "has_column_header": True,
                        "has_row_header": False,
                        "children": [],
                    }
                }
                for row in table_lines:
                    while len(row) < width:
                        row.append("")
                    table_block["table"]["children"].append({
                        "type": "table_row",
                        "table_row": {
                            "cells": [parse_inline_md(c) for c in row[:width]]
                        }
                    })
                blocks.append(table_block)
            continue

        # 빈 줄
        if not line.strip():
            i += 1
            continue

        # 헤딩
        if line.startswith("### "):
            blocks.append(_make_block("heading_3", line[4:].strip()))
        elif line.startswith("## "):
            blocks.append(_make_block("heading_2", line[3:].strip()))
        elif line.startswith("# "):
            blocks.append(_make_block("heading_1", line[2:].strip()))
        # 인용 / 콜아웃
        elif line.startswith("> "):
            blocks.append(_make_block("quote", line[2:].strip()))
        # 리스트
        elif line.startswith("- ") or line.startswith("* "):
            blocks.append(_make_block("bulleted_list_item", line[2:].strip()))
        elif re.match(r"^\d+\.\s", line):
            text = re.sub(r"^\d+\.\s", "", line).strip()
            blocks.append(_make_block("numbered_list_item", text))
        # 구분선
        elif line.strip() == "---":
            blocks.append({"type": "divider", "divider": {}})
        # 일반 텍스트
        else:
            blocks.append(_make_block("paragraph", line.strip()))

        i += 1

    return blocks


def upload_to_notion(md_path):
    """마크다운 리포트를 Notion 페이지로 업로드, URL 반환"""
    today = datetime.now().strftime("%Y-%m-%d")
    title = f"Tech Scout 리포트 ({today})"

    # 기존 동일 제목 페이지 검색 → 중복 방지
    search_result = notion_api("search", "POST", {
        "query": title,
        "filter": {"value": "page", "property": "object"},
        "page_size": 5,
    })
    if search_result:
        for page in search_result.get("results", []):
            page_title = ""
            for t in page.get("properties", {}).get("title", {}).get("title", []):
                page_title += t.get("plain_text", "")
            if page_title == title and not page.get("in_trash"):
                url = page["url"]
                print(f"[Notion] 기존 페이지 존재: {url}")
                return url

    # 블록 생성
    all_blocks = md_to_notion_blocks(md_path)

    # 페이지 생성 (첫 100블록만 — Notion API 제한)
    page_data = {
        "parent": {"page_id": NOTION_PARENT_PAGE_ID},
        "icon": {"type": "emoji", "emoji": "🧭"},
        "properties": {
            "title": {"title": [{"type": "text", "text": {"content": title}}]}
        },
        "children": all_blocks[:100],
    }

    result = notion_api("pages", "POST", page_data)
    if not result:
        print("[Notion] 페이지 생성 실패")
        return None

    page_id = result["id"]
    url = result["url"]
    print(f"[Notion] 페이지 생성: {url}")

    # 100블록 초과분 추가
    for chunk_start in range(100, len(all_blocks), 100):
        chunk = all_blocks[chunk_start:chunk_start + 100]
        notion_api(f"blocks/{page_id}/children", "PATCH", {"children": chunk})

    return url


def send_to_kakao(md_path, notion_url=None):
    """Notion 링크를 카카오톡으로 전송"""
    openkakao = find_binary("openkakao-rs", OPENKAKAO_CANDIDATES)
    if not openkakao:
        print("[Tech Scout] openkakao-rs를 찾을 수 없음")
        return False

    today = datetime.now().strftime("%Y-%m-%d")
    if notion_url:
        message = f"📊 Tech Scout 리포트 ({today})\n\n{notion_url}"
    else:
        message = f"📊 Tech Scout 리포트 ({today}) — Notion 업로드 실패, Obsidian 602.Tech 확인"

    try:
        result = subprocess.run(
            [openkakao, "send", KAKAO_CHAT_ID, message, "-y", "--no-prefix"],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            print(f"[Tech Scout] 카톡 전송 완료")
            return True
        else:
            print(f"[Tech Scout] 카톡 전송 실패: {result.stderr[:300]}")
            return False
    except Exception as e:
        print(f"[Tech Scout] 카톡 전송 에러: {e}")
        return False


def get_today_path():
    now = datetime.now()
    folder = OBSIDIAN_BASE / now.strftime("%Y%m")
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{now.strftime('%Y%m%d')}.md"


def already_done_today():
    path = get_today_path()
    return path.exists() and path.stat().st_size > 500


def run_scout(dry_run=False):
    today = datetime.now().strftime("%Y-%m-%d")
    output_path = get_today_path()

    if already_done_today():
        print(f"[Tech Scout] {today} 리포트 이미 존재: {output_path}")
        return True

    prompt = f"""오늘은 {today}이야.

https://trendshift.io/ 에서 상위 5개 트렌딩 레포를 가져와서 분석 리포트를 작성해줘.

## 분석 절차
1. WebFetch로 https://trendshift.io/ 접속 → 상위 5개 repo 추출
2. 각 repo의 GitHub README를 gh CLI로 읽기
3. 핵심 기능, 아키텍처, 강점, 제약, 우리 스택(Paperclip/ClawTeam/cmux/개수라발발타)과의 접점 분석
4. MCP 메모리에서 이전 분석 이력 검색 → 중복 제외

## 출력 형식
- 옵시디언 마크다운 — [[내부링크]] 사용
- 파일 경로: {output_path}
- 구조: 한 줄 정의 → 각 도구별(포지션/강점/전제/우리 스택 접점/레퍼런스) → 종합 비교표 → 스카우트 판정
- YAML frontmatter 포함 (date, source, type, tags)
- 이전/다음 데일리 링크 포함

## 완료 후
MCP 메모리에 분석 이력 저장:
save_memory(title="tool-scout: {today}", text="TrendShift Top5 분석 완료: [도구목록] / {today}")

파일을 {output_path}에 Write해줘."""

    if dry_run:
        print(f"[Dry Run] 실행할 프롬프트:\n{prompt[:200]}...")
        print(f"[Dry Run] 출력 경로: {output_path}")
        return True

    claude_bin = find_claude_binary()
    if not claude_bin:
        print("[Tech Scout] 에러: claude CLI를 찾을 수 없음. 후보 경로 모두 실패.")
        return False

    cmd = [
        claude_bin,
        "--print",
        "--dangerously-skip-permissions",
        "-p", prompt
    ]

    print(f"[Tech Scout] {today} 리포트 생성 시작... (claude: {claude_bin})")
    try:
        result = subprocess.run(
            cmd,
            cwd=str(Path.home() / "Projects" / "ai"),
            capture_output=True,
            text=True,
            timeout=600  # 10분 타임아웃
        )
        if result.returncode == 0:
            print(f"[Tech Scout] 완료: {output_path}")
            # 파일이 생성되었는지 확인
            if output_path.exists() and output_path.stat().st_size > 500:
                print(f"[Tech Scout] 검증 통과: {output_path.stat().st_size} bytes")
                # PDF 보관 + Notion 업로드 + 카톡 링크 전송
                md_to_pdf(output_path)
                notion_url = upload_to_notion(output_path)
                send_to_kakao(output_path, notion_url)
                return True
            else:
                print(f"[Tech Scout] 파일 미생성 또는 크기 부족")
                return False
        else:
            print(f"[Tech Scout] 실패: {result.stderr[:500]}")
            return False
    except subprocess.TimeoutExpired:
        print("[Tech Scout] 타임아웃 (10분 초과)")
        return False
    except Exception as e:
        print(f"[Tech Scout] 에러: {e}")
        return False


def main():
    dry_run = "--dry-run" in sys.argv

    # 최대 3회 재시도
    max_retries = 1 if dry_run else 3
    for attempt in range(1, max_retries + 1):
        print(f"[Tech Scout] 시도 {attempt}/{max_retries}")
        if run_scout(dry_run=dry_run):
            print("[Tech Scout] 성공")
            return 0
        if attempt < max_retries:
            print(f"[Tech Scout] {attempt}회 실패. 재시도...")

    print("[Tech Scout] 최대 재시도 초과. 실패.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
