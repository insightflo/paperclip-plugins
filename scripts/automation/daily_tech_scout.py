#!/usr/bin/env python3
"""
Daily Tech Scout — TrendShift.io Top 5 데이터 수집기
Workflow Engine의 tool step으로 실행. 분석은 에이전트가 수행.

사용법:
  python3 daily_tech_scout.py           # TrendShift Top 5 수집 → JSON 출력
  python3 daily_tech_scout.py --limit 3 # 상위 3개만
"""

import sys
import json
import re
import urllib.request
import urllib.error
from datetime import datetime


TRENDSHIFT_URL = "https://trendshift.io"


def fetch_page(url, timeout=30):
    """URL에서 HTML을 가져온다."""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) TechScout/1.0",
        "Accept": "text/html,application/xhtml+xml",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[Tech Scout] fetch 실패: {url} — {e}", file=sys.stderr)
        return None


def parse_trendshift_html(html, limit=5):
    """TrendShift HTML에서 트렌딩 레포 목록을 추출한다."""
    repos = []
    # <a href="/repositories/{id}">owner/repo</a> 패턴
    pattern = re.compile(
        r'<a\s+[^>]*href=["\']\/repositories\/(\d+)["\'][^>]*>(.*?)<\/a>',
        re.DOTALL
    )
    seen = set()
    for match in pattern.finditer(html):
        repo_id = match.group(1)
        if repo_id in seen:
            continue
        seen.add(repo_id)

        inner_text = re.sub(r'<[^>]+>', '', match.group(2)).strip()
        # owner/repo 패턴 매칭
        repo_match = re.match(r'([a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+)', inner_text)
        if not repo_match:
            continue

        full_name = repo_match.group(1)
        parts = full_name.split("/")
        repos.append({
            "rank": len(repos) + 1,
            "trendshift_id": repo_id,
            "name": parts[1] if len(parts) >= 2 else full_name,
            "full_name": full_name,
            "owner": parts[0] if len(parts) >= 2 else "",
            "repo": parts[1] if len(parts) >= 2 else full_name,
            "url": f"{TRENDSHIFT_URL}/repositories/{repo_id}",
            "github_url": f"https://github.com/{full_name}",
        })
        if len(repos) >= limit:
            break

    return repos


def fetch_github_readme(owner_repo, timeout=15):
    """GitHub API로 README 내용을 가져온다."""
    url = f"https://api.github.com/repos/{owner_repo}/readme"
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github.v3.raw",
        "User-Agent": "TechScout/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read().decode("utf-8", errors="replace")
            return content[:5000]  # 처음 5000자만
    except Exception:
        return None


def fetch_repo_detail(trendshift_id, timeout=15):
    """TrendShift 레포 상세 페이지에서 추가 정보를 추출한다."""
    url = f"{TRENDSHIFT_URL}/repositories/{trendshift_id}"
    html = fetch_page(url, timeout)
    if not html:
        return {}

    detail = {}

    # GitHub URL 추출
    gh_match = re.search(r'href="(https://github\.com/[^"]+)"', html)
    if gh_match:
        detail["github_url"] = gh_match.group(1)
        # owner/repo 추출
        parts = gh_match.group(1).replace("https://github.com/", "").split("/")
        if len(parts) >= 2:
            detail["owner"] = parts[0]
            detail["repo"] = parts[1]
            detail["full_name"] = f"{parts[0]}/{parts[1]}"

    # 설명 추출
    desc_match = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
    if desc_match:
        detail["description"] = desc_match.group(1).strip()

    # 언어/스타 등 메타데이터
    star_match = re.search(r'([\d,]+)\s*(?:stars?|⭐)', html, re.IGNORECASE)
    if star_match:
        detail["stars"] = star_match.group(1).replace(",", "")

    lang_match = re.search(r'(?:language|lang)["\s:]+([A-Za-z+#]+)', html, re.IGNORECASE)
    if lang_match:
        detail["language"] = lang_match.group(1)

    return detail


def collect(limit=5):
    """TrendShift Top N 데이터를 수집한다."""
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"[Tech Scout] {today} TrendShift Top {limit} 수집 시작...", file=sys.stderr)

    html = fetch_page(TRENDSHIFT_URL)
    if not html:
        return {"error": "TrendShift 페이지를 가져올 수 없습니다.", "date": today, "repos": []}

    repos = parse_trendshift_html(html, limit)
    print(f"[Tech Scout] {len(repos)}개 레포 발견", file=sys.stderr)

    for repo in repos:
        detail = fetch_repo_detail(repo["trendshift_id"])
        repo.update(detail)

        # GitHub README 가져오기
        if repo.get("full_name"):
            readme = fetch_github_readme(repo["full_name"])
            if readme:
                repo["readme_excerpt"] = readme

    result = {
        "date": today,
        "source": "trendshift.io",
        "collected_at": datetime.now().isoformat(),
        "count": len(repos),
        "repos": repos,
    }

    print(f"[Tech Scout] 수집 완료: {len(repos)}개", file=sys.stderr)
    return result


def main():
    limit = 5
    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--limit" and i < len(sys.argv) - 1:
            try:
                limit = int(sys.argv[i + 1])
            except ValueError:
                pass

    result = collect(limit)

    # stdout으로 JSON 출력 (Workflow Engine이 이걸 캡처)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()  # trailing newline

    if result.get("error"):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
