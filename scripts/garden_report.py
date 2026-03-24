#!/usr/bin/env python3
"""시스템 가든 대시보드 생성기.

수집 소스
- logs/jobs/registry.json
- Paperclip API (agents/issues)
- .paperclip/agents/learnings/*.md
- data/ 폴더
- scripts/ 폴더

출력
- reports/garden/system_garden.html
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "reports" / "garden" / "system_garden.html"
DEFAULT_API_BASE = f"{os.environ.get('PAPERCLIP_API_URL', 'http://localhost:3100').rstrip('/')}/api"
DEFAULT_COMPANY_ID = os.environ.get("PAPERCLIP_COMPANY_ID", "240b0239-36cb-44b8-833f-663c2b0ec783")

LAYER_ORDER = ["execution", "agents", "data", "analysis", "outputs"]
LAYER_LABELS = {
    "execution": "실행(launchd)",
    "agents": "에이전트(Paperclip)",
    "data": "데이터(data/)",
    "analysis": "분석(scripts/)",
    "outputs": "산출물(reports/)",
}

STATUS_CLASS = {"울창": "lush", "성장": "growth", "싹": "sprout", "시듦": "wither"}


@dataclass
class GraphNode:
    id: str
    name: str
    type: str
    layer: str
    size: float = 10.0
    status: str = "info"
    meta: dict[str, Any] | None = None


@dataclass
class GraphEdge:
    source: str
    target: str
    relation: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="시스템 가든 HTML 대시보드 생성")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="출력 HTML 경로")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="Paperclip API base URL")
    parser.add_argument("--company-id", default=DEFAULT_COMPANY_ID, help="Paperclip company ID")
    parser.add_argument("--no-api", action="store_true", help="Paperclip API 수집 비활성화")
    return parser.parse_args()


def clamp(value: float, min_value: int = 0, max_value: int = 100) -> int:
    return int(max(min_value, min(max_value, round(value))))


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def api_get(api_base: str, path: str, api_key: str | None) -> Any:
    url = f"{api_base.rstrip('/')}{path}"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def discover_scripts() -> list[Path]:
    scripts_dir = ROOT / "scripts"
    if not scripts_dir.exists():
        return []
    files: list[Path] = []
    for path in scripts_dir.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        files.append(path)
    return sorted(files)


def load_registry() -> dict[str, Any]:
    registry_path = ROOT / "logs" / "jobs" / "registry.json"
    data = read_json(registry_path)
    if isinstance(data, dict):
        return data
    return {}


def collect_learnings() -> dict[str, Any]:
    learnings_dir = ROOT / ".paperclip" / "agents" / "learnings"
    files = sorted(learnings_dir.glob("*.md")) if learnings_dir.exists() else []

    total_mistakes = 0
    file_stats: list[dict[str, Any]] = []

    for file in files:
        if file.name == "_index.md":
            continue

        lines = file.read_text(encoding="utf-8", errors="ignore").splitlines()
        in_mistake_section = False
        mistakes = 0

        for line in lines:
            stripped = line.strip()
            if stripped.startswith("## "):
                in_mistake_section = stripped == "## 실수 기록"
                continue
            if not in_mistake_section:
                continue
            if stripped.startswith("## "):
                break
            if stripped.startswith("- "):
                mistakes += 1

        total_mistakes += mistakes
        file_stats.append({"file": str(file.relative_to(ROOT)), "mistakes": mistakes})

    return {
        "files": file_stats,
        "total_files": len(file_stats),
        "total_mistakes": total_mistakes,
    }


def collect_directory_stats(path: Path, pattern: str = "*") -> dict[str, Any]:
    if not path.exists():
        return {"exists": False, "total_files": 0, "recent_24h": 0, "latest_mtime": None}

    now = utc_now()
    files = [p for p in path.rglob(pattern) if p.is_file()]
    latest: datetime | None = None
    recent_24h = 0

    for file in files:
        mtime = datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc)
        if latest is None or mtime > latest:
            latest = mtime
        if now - mtime <= timedelta(hours=24):
            recent_24h += 1

    return {
        "exists": True,
        "total_files": len(files),
        "recent_24h": recent_24h,
        "latest_mtime": latest.isoformat() if latest else None,
    }


def read_script_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def build_script_module_map(scripts: list[Path]) -> dict[str, str]:
    module_to_node: dict[str, str] = {}
    for script in scripts:
        rel = script.relative_to(ROOT).as_posix()
        rel_no_ext = rel[:-3] if rel.endswith(".py") else rel
        node_id = f"script:{rel}"
        module_to_node[rel_no_ext.replace("/", ".")] = node_id

        parts = rel_no_ext.split("/")
        if parts and parts[-1] != "__init__":
            module_to_node.setdefault(parts[-1], node_id)

    return module_to_node


def extract_script_dependencies(script: Path, module_map: dict[str, str]) -> dict[str, list[str]]:
    text = read_script_text(script)
    rel = script.relative_to(ROOT).as_posix()

    dependencies: list[str] = []
    refs_data: list[str] = []
    refs_reports: list[str] = []
    refs_config: list[str] = []

    try:
        tree = ast.parse(text)
    except SyntaxError:
        tree = None

    if tree is not None:
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    target = module_map.get(alias.name) or module_map.get(alias.name.split(".")[0])
                    if target:
                        dependencies.append(target)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    target = module_map.get(node.module) or module_map.get(node.module.split(".")[0])
                    if target:
                        dependencies.append(target)

    path_pattern = re.compile(r"(?:logs|reports|data|\.paperclip)/[A-Za-z0-9_./-]+")
    for match in path_pattern.findall(text):
        if match.startswith("reports/"):
            refs_reports.append(match)
        elif match.startswith(".paperclip/"):
            refs_config.append(match)
        else:
            refs_data.append(match)

    if "registry.json" in text and "logs/jobs/registry.json" not in refs_data:
        refs_data.append("logs/jobs/registry.json")
    if "learnings" in text and ".paperclip/agents/learnings" not in refs_data:
        refs_data.append(".paperclip/agents/learnings")

    return {
        "script_node": f"script:{rel}",
        "dependencies": sorted(set(dependencies)),
        "data_refs": sorted(set(refs_data)),
        "report_refs": sorted(set(refs_reports)),
        "config_refs": sorted(set(refs_config)),
    }


def status_from_score(score: int) -> str:
    if score >= 80:
        return "울창"
    if score >= 60:
        return "성장"
    if score >= 40:
        return "싹"
    return "시듦"


def compute_health_areas(
    registry: dict[str, Any],
    agents: list[dict[str, Any]],
    issues: list[dict[str, Any]],
    learnings: dict[str, Any],
    data_stats: dict[str, Any],
    reports_stats: dict[str, Any],
    logs_stats: dict[str, Any],
) -> list[dict[str, Any]]:
    now = utc_now()

    jobs_total = len(registry)
    job_failures = sum(1 for item in registry.values() if item.get("last_status") != "success")
    latest_run = None
    for item in registry.values():
        parsed = parse_iso(item.get("last_run_at"))
        if parsed and (latest_run is None or parsed > latest_run):
            latest_run = parsed

    stale_hours = (now - latest_run).total_seconds() / 3600 if latest_run else 999.0
    data_collection_score = clamp(92 - (job_failures * 14) - (18 if stale_hours > 48 else 0) - (15 if jobs_total == 0 else 0))

    consecutive_failures = sum(int(item.get("consecutive_failures", 0) or 0) for item in registry.values())
    signal_score = clamp(
        88
        - min(40, consecutive_failures * 3)
        - (15 if logs_stats["recent_24h"] == 0 else 0)
        + min(8, logs_stats["total_files"] // 4)
    )

    reporting_score = clamp(
        24
        + min(48, reports_stats["total_files"] * 4)
        + min(18, reports_stats["recent_24h"] * 6)
    )

    portfolio_score = clamp(
        (18 if data_stats["exists"] else 8)
        + min(52, data_stats["total_files"] * 3)
        + (18 if data_stats["recent_24h"] > 0 else 0)
    )

    if agents:
        running = sum(1 for a in agents if a.get("status") == "running")
        open_issues = sum(1 for i in issues if i.get("status") not in {"done", "cancelled"})
        blocked_issues = sum(1 for i in issues if i.get("status") == "blocked")
        agent_score = clamp(((running / len(agents)) * 72 + 28) - min(24, blocked_issues * 6) - max(0, open_issues - 10))
    else:
        running = 0
        open_issues = 0
        blocked_issues = 0
        agent_score = 35

    areas = [
        {
            "name": "데이터수집",
            "score": data_collection_score,
            "status": status_from_score(data_collection_score),
            "summary": f"잡 {jobs_total}개, 실패 {job_failures}개, 최근 실행 {stale_hours:.1f}시간 전",
            "metrics": {
                "jobs_total": jobs_total,
                "job_failures": job_failures,
                "stale_hours": round(stale_hours, 1),
            },
        },
        {
            "name": "시그널",
            "score": signal_score,
            "status": status_from_score(signal_score),
            "summary": f"로그 파일 {logs_stats['total_files']}개, 24시간 내 {logs_stats['recent_24h']}개",
            "metrics": {
                "consecutive_failures": consecutive_failures,
                "log_files": logs_stats["total_files"],
                "log_recent_24h": logs_stats["recent_24h"],
            },
        },
        {
            "name": "리포팅",
            "score": reporting_score,
            "status": status_from_score(reporting_score),
            "summary": f"리포트 파일 {reports_stats['total_files']}개, 24시간 내 {reports_stats['recent_24h']}개",
            "metrics": {
                "report_files": reports_stats["total_files"],
                "report_recent_24h": reports_stats["recent_24h"],
            },
        },
        {
            "name": "포트폴리오",
            "score": portfolio_score,
            "status": status_from_score(portfolio_score),
            "summary": (
                f"data/ {data_stats['total_files']}개 파일"
                if data_stats["exists"]
                else "data/ 폴더 없음"
            ),
            "metrics": {
                "data_exists": data_stats["exists"],
                "data_files": data_stats["total_files"],
                "data_recent_24h": data_stats["recent_24h"],
            },
        },
        {
            "name": "에이전트",
            "score": agent_score,
            "status": status_from_score(agent_score),
            "summary": (
                f"에이전트 {len(agents)}명 중 running {running}명, 오픈 이슈 {open_issues}건"
                if agents
                else "Paperclip API 연결 실패"
            ),
            "metrics": {
                "agents_total": len(agents),
                "agents_running": running,
                "issues_open": open_issues,
                "issues_blocked": blocked_issues,
                "learning_mistakes": learnings.get("total_mistakes", 0),
            },
        },
    ]
    return areas


def build_metacognitive_questions(
    nodes: dict[str, GraphNode],
    edges: list[GraphEdge],
    health_areas: list[dict[str, Any]],
    registry: dict[str, Any],
    issues: list[dict[str, Any]],
) -> list[str]:
    degree = Counter()
    for edge in edges:
        degree[edge.source] += 1
        degree[edge.target] += 1

    isolated = [
        node.name
        for node in nodes.values()
        if node.layer in {"agents", "data", "analysis", "outputs"} and degree[node.id] == 0
    ]

    withered = [area for area in health_areas if area["status"] == "시듦"]
    growing_risks = [
        key
        for key, item in registry.items()
        if int(item.get("consecutive_failures", 0) or 0) >= 3 or item.get("last_status") == "failure"
    ]
    open_issues = [item for item in issues if item.get("status") in {"todo", "in_progress", "blocked", "in_review"}]

    questions: list[str] = []

    if isolated:
        target = ", ".join(isolated[:3])
        questions.append(f"연결 지도의 고립 노드({target})를 이번 주 어떤 자동화 흐름에 묶을까요?")
    else:
        questions.append("현재 연결이 과도하게 집중된 허브(단일 실패점)는 어디이며, 어떻게 분산할까요?")

    if growing_risks or len(open_issues) > 12:
        hotspot = growing_risks[0] if growing_risks else "이슈 백로그"
        questions.append(f"과성장 징후({hotspot})를 줄이기 위해 어떤 작업을 정리·병합해야 할까요?")
    else:
        questions.append("활동량이 높아진 영역에서 품질 저하를 막기 위한 선제 검증은 무엇일까요?")

    if withered:
        target_area = withered[0]["name"]
        questions.append(f"시듦 상태인 {target_area}를 7일 안에 회복할 최소 실행 항목 1개는 무엇인가요?")
    else:
        questions.append("방치되기 시작한 영역을 조기 감지할 지표를 하나 추가한다면 무엇이 좋을까요?")

    return questions[:3]


def render_health_cards(areas: list[dict[str, Any]]) -> str:
    cards = []
    for area in areas:
        css_class = STATUS_CLASS.get(area["status"], "growth")
        metrics = "".join(
            f"<li><span>{key}</span><strong>{value}</strong></li>"
            for key, value in list(area["metrics"].items())[:3]
        )
        cards.append(
            f"""
            <article class=\"health-card {css_class}\">
              <header>
                <h3>{area['name']}</h3>
                <span class=\"badge\">{area['status']}</span>
              </header>
              <div class=\"score\">점수 {area['score']}</div>
              <p>{area['summary']}</p>
              <ul>{metrics}</ul>
            </article>
            """.strip()
        )
    return "\n".join(cards)


def render_questions(questions: list[str]) -> str:
    return "\n".join(f"<li>{q}</li>" for q in questions)


def render_html(payload: dict[str, Any], health_cards: str, questions_html: str) -> str:
    payload_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    generated_at = payload["meta"]["generated_at"]

    return f"""<!doctype html>
<html lang=\"ko\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>System Garden Dashboard</title>
  <style>
    :root {{
      --bg: #081427;
      --panel: #0f213b;
      --panel-soft: #132743;
      --text: #e8f1ff;
      --muted: #94a9cc;
      --line: #2d4266;
      --execution: #ffb703;
      --agents: #8ecae6;
      --data: #4cc9f0;
      --analysis: #7ae582;
      --outputs: #f28482;
      --trigger: #f6bd60;
      --dependency: #b8c0ff;
      --generate: #5dd39e;
      --consume: #9bc53d;
      --lush: #22c55e;
      --growth: #84cc16;
      --sprout: #f59e0b;
      --wither: #ef4444;
    }}

    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--text);
      font-family: "Pretendard", "Apple SD Gothic Neo", "Segoe UI", sans-serif;
      background:
        radial-gradient(1200px 800px at 10% -10%, #1c3560, transparent 60%),
        radial-gradient(1000px 700px at 90% -20%, #122740, transparent 55%),
        var(--bg);
    }}

    .page {{
      max-width: 1440px;
      margin: 0 auto;
      padding: 28px;
      display: grid;
      gap: 22px;
    }}

    .head {{
      background: linear-gradient(145deg, rgba(17,38,65,0.94), rgba(10,25,44,0.9));
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 20px;
    }}

    .head h1 {{ margin: 0 0 8px 0; font-size: 28px; letter-spacing: -0.02em; }}
    .head p {{ margin: 0; color: var(--muted); }}

    .chip-row {{
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}

    .chip {{
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 999px;
      padding: 6px 10px;
      color: #d5e4ff;
      font-size: 12px;
    }}

    .main {{
      display: grid;
      grid-template-columns: minmax(640px, 2fr) minmax(340px, 1fr);
      gap: 18px;
    }}

    .panel {{
      background: linear-gradient(180deg, rgba(15, 33, 59, 0.94), rgba(10, 24, 44, 0.9));
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }}

    .panel h2 {{
      margin: 0;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      font-size: 15px;
      letter-spacing: 0.01em;
    }}

    #graph-shell {{
      height: 560px;
      position: relative;
      background: linear-gradient(180deg, rgba(11, 29, 52, 0.35), rgba(11, 29, 52, 0.0));
    }}

    #garden-graph {{ width: 100%; height: 100%; display: block; }}

    .legend {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 14px 14px;
    }}

    .legend span {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
    }}

    .dot {{ width: 8px; height: 8px; border-radius: 50%; display: inline-block; }}

    .side {{ display: grid; gap: 16px; }}

    .health-grid {{
      padding: 14px;
      display: grid;
      gap: 10px;
    }}

    .health-card {{
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: var(--panel-soft);
    }}

    .health-card header {{ display: flex; justify-content: space-between; align-items: center; }}
    .health-card h3 {{ margin: 0; font-size: 14px; }}
    .health-card .badge {{ font-size: 12px; color: var(--text); opacity: 0.9; }}
    .health-card .score {{ margin-top: 6px; font-weight: 700; font-size: 17px; }}
    .health-card p {{ margin: 8px 0; color: var(--muted); font-size: 12px; line-height: 1.45; }}
    .health-card ul {{ margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }}
    .health-card li {{ display: flex; justify-content: space-between; font-size: 12px; color: #c7d6f0; }}

    .health-card.lush {{ border-left: 4px solid var(--lush); }}
    .health-card.growth {{ border-left: 4px solid var(--growth); }}
    .health-card.sprout {{ border-left: 4px solid var(--sprout); }}
    .health-card.wither {{ border-left: 4px solid var(--wither); }}

    .questions {{ padding: 14px 16px 16px; }}
    .questions ol {{ margin: 0; padding-left: 18px; display: grid; gap: 8px; }}
    .questions li {{ color: #d9e8ff; line-height: 1.45; font-size: 13px; }}

    @media (max-width: 1100px) {{
      .main {{ grid-template-columns: 1fr; }}
      #graph-shell {{ height: 480px; }}
    }}
  </style>
</head>
<body>
  <div class=\"page\">
    <section class=\"head\">
      <h1>System Garden Dashboard</h1>
      <p>Alpha-Prime 운영 생태계의 구조·건강도·메타인지 질문을 한 화면에서 추적합니다.</p>
      <div class=\"chip-row\">
        <span class=\"chip\">생성 시각: {generated_at}</span>
        <span class=\"chip\">노드 {payload['meta']['node_count']}개</span>
        <span class=\"chip\">엣지 {payload['meta']['edge_count']}개</span>
        <span class=\"chip\">learnings 실수 항목 {payload['meta']['learning_mistakes']}개</span>
      </div>
    </section>

    <section class=\"main\">
      <article class=\"panel\">
        <h2>연결 지도 (Force Graph)</h2>
        <div id=\"graph-shell\"><svg id=\"garden-graph\"></svg></div>
        <div class=\"legend\">
          <span><i class=\"dot\" style=\"background:var(--execution)\"></i>실행</span>
          <span><i class=\"dot\" style=\"background:var(--agents)\"></i>에이전트</span>
          <span><i class=\"dot\" style=\"background:var(--data)\"></i>데이터</span>
          <span><i class=\"dot\" style=\"background:var(--analysis)\"></i>분석</span>
          <span><i class=\"dot\" style=\"background:var(--outputs)\"></i>산출물</span>
        </div>
      </article>

      <aside class=\"side\">
        <article class=\"panel\">
          <h2>건강도 맵</h2>
          <div class=\"health-grid\">{health_cards}</div>
        </article>

        <article class=\"panel\">
          <h2>메타인지 질문 (주간 3개)</h2>
          <div class=\"questions\"><ol>{questions_html}</ol></div>
        </article>
      </aside>
    </section>
  </div>

  <script id=\"garden-data\" type=\"application/json\">{payload_json}</script>
  <script src=\"https://cdn.jsdelivr.net/npm/d3@7\"></script>
  <script>
    const payload = JSON.parse(document.getElementById("garden-data").textContent);
    const nodes = payload.graph.nodes.map((d) => ({{ ...d }}));
    const links = payload.graph.edges.map((d) => ({{ ...d }}));

    const layerOrder = ["execution", "agents", "data", "analysis", "outputs"];
    const layerLabels = payload.meta.layer_labels;

    const typeColor = {{
      launchd: "var(--execution)",
      config: "#ffc857",
      agent: "var(--agents)",
      data: "var(--data)",
      script: "var(--analysis)",
      report: "var(--outputs)",
    }};

    const relationColor = {{
      trigger: "var(--trigger)",
      dependency: "var(--dependency)",
      generate: "var(--generate)",
      consume: "var(--consume)",
    }};

    const svg = d3.select("#garden-graph");
    const shell = document.getElementById("graph-shell");
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    svg.attr("viewBox", `0 0 ${{width}} ${{height}}`);

    const layerX = new Map(layerOrder.map((layer, index) => [layer, ((index + 0.5) * width) / layerOrder.length]));

    const bg = svg.append("g").attr("opacity", 0.35);
    layerOrder.forEach((layer) => {{
      const x = layerX.get(layer);
      bg.append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 24)
        .attr("y2", height - 12)
        .attr("stroke", "#39537f")
        .attr("stroke-dasharray", "4 6");
      bg.append("text")
        .attr("x", x)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .attr("fill", "#8ea8d0")
        .attr("font-size", 11)
        .text(layerLabels[layer]);
    }});

    const link = svg
      .append("g")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => relationColor[d.relation] || "#9aa7bf")
      .attr("stroke-width", 1.25);

    const node = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(
        d3
          .drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    node
      .append("circle")
      .attr("r", (d) => Math.max(5, Math.min(16, d.size)))
      .attr("fill", (d) => typeColor[d.type] || "#dddddd")
      .attr("stroke", "#0d1c33")
      .attr("stroke-width", 1.4);

    node
      .append("text")
      .text((d) => d.name)
      .attr("font-size", 10)
      .attr("fill", "#dbe7ff")
      .attr("dx", 8)
      .attr("dy", 3)
      .attr("paint-order", "stroke")
      .attr("stroke", "#0b1a31")
      .attr("stroke-width", 2);

    node.append("title").text((d) => `${{d.name}}\n${{d.layer}} / ${{d.type}}`);

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((d) => (d.relation === "trigger" ? 90 : 70))
          .strength((d) => (d.relation === "trigger" ? 0.4 : 0.55))
      )
      .force("charge", d3.forceManyBody().strength(-230))
      .force("x", d3.forceX((d) => layerX.get(d.layer) || width / 2).strength(0.42))
      .force("y", d3.forceY(height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius((d) => Math.max(12, d.size + 8)))
      .on("tick", ticked);

    function ticked() {{
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("transform", (d) => `translate(${{d.x}},${{d.y}})`);
    }}

    function dragstarted(event) {{
      if (!event.active) sim.alphaTarget(0.35).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }}

    function dragged(event) {{
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }}

    function dragended(event) {{
      if (!event.active) sim.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }}
  </script>
</body>
</html>
"""


def main() -> int:
    args = parse_args()

    api_key = os.environ.get("PAPERCLIP_API_KEY")
    registry = load_registry()
    learnings = collect_learnings()
    scripts = discover_scripts()

    agents: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    if not args.no_api:
        agents_resp = api_get(args.api_base, f"/companies/{args.company_id}/agents", api_key)
        issues_resp = api_get(args.api_base, f"/companies/{args.company_id}/issues", api_key)
        if isinstance(agents_resp, list):
            agents = agents_resp
        if isinstance(issues_resp, list):
            issues = issues_resp

    data_stats = collect_directory_stats(ROOT / "data")
    reports_stats = collect_directory_stats(ROOT / "reports")
    logs_stats = collect_directory_stats(ROOT / "logs" / "jobs", pattern="*.jsonl")

    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    def add_node(node: GraphNode) -> None:
        if node.id not in nodes:
            nodes[node.id] = node

    def add_edge(edge: GraphEdge) -> None:
        if edge.source == edge.target:
            return
        key = (edge.source, edge.target, edge.relation)
        if not hasattr(add_edge, "seen"):
            add_edge.seen = set()  # type: ignore[attr-defined]
        if key in add_edge.seen:  # type: ignore[attr-defined]
            return
        add_edge.seen.add(key)  # type: ignore[attr-defined]
        edges.append(edge)

    launchd_id = "exec:launchd"
    add_node(GraphNode(id=launchd_id, name="launchd scheduler", type="launchd", layer="execution", size=15))

    for config_rel in [".paperclip/agents/_shared.md", ".paperclip/agents/dev.md"]:
        config_path = ROOT / config_rel
        if config_path.exists():
            node_id = f"config:{config_rel}"
            add_node(GraphNode(id=node_id, name=config_rel, type="config", layer="execution", size=10))
            add_edge(GraphEdge(source=node_id, target=launchd_id, relation="dependency"))

    if agents:
        for agent in agents:
            node_id = f"agent:{agent['id']}"
            add_node(
                GraphNode(
                    id=node_id,
                    name=agent.get("name", agent["id"]),
                    type="agent",
                    layer="agents",
                    size=12,
                    status=agent.get("status", "unknown"),
                )
            )
            add_edge(GraphEdge(source=launchd_id, target=node_id, relation="trigger"))
    else:
        fallback_agents = [
            "닉 퓨리", "토니 스타크", "스파이더맨", "호크아이", "헐크", "쉬리", "자비스", "포청천",
        ]
        for name in fallback_agents:
            node_id = f"agent:fallback:{name}"
            add_node(GraphNode(id=node_id, name=name, type="agent", layer="agents", size=9))
            add_edge(GraphEdge(source=launchd_id, target=node_id, relation="trigger"))

    data_nodes = {
        "data:registry": ("logs/jobs/registry.json", 13),
        "data:logs": ("logs/jobs/*.jsonl", 11),
        "data:learnings": (".paperclip/agents/learnings/", 12),
        "data:data-folder": ("data/", 10),
    }
    for node_id, (name, size) in data_nodes.items():
        add_node(GraphNode(id=node_id, name=name, type="data", layer="data", size=size))

    add_edge(GraphEdge(source=launchd_id, target="data:registry", relation="generate"))
    add_edge(GraphEdge(source=launchd_id, target="data:logs", relation="generate"))

    script_module_map = build_script_module_map(scripts)
    script_by_rel = {script.relative_to(ROOT).as_posix(): script for script in scripts}

    for script in scripts:
        rel = script.relative_to(ROOT).as_posix()
        node_id = f"script:{rel}"
        add_node(GraphNode(id=node_id, name=rel, type="script", layer="analysis", size=9.5))

    for key, item in registry.items():
        command = item.get("last_command") or []
        for part in command:
            if not isinstance(part, str) or "scripts/" not in part:
                continue
            idx = part.find("scripts/")
            script_rel = part[idx:]
            script_rel = script_rel.replace("\\", "/")
            if script_rel in script_by_rel:
                script_id = f"script:{script_rel}"
                add_edge(GraphEdge(source=launchd_id, target=script_id, relation="trigger"))
                add_edge(GraphEdge(source=script_id, target="data:registry", relation="consume"))
                if key in {"daily_summary", "weekly_retro"}:
                    add_edge(GraphEdge(source=script_id, target="report:reports", relation="generate"))

    for script in scripts:
        dep_info = extract_script_dependencies(script, script_module_map)
        script_node = dep_info["script_node"]

        for dep in dep_info["dependencies"]:
            add_edge(GraphEdge(source=script_node, target=dep, relation="dependency"))

        for _ref in dep_info["data_refs"]:
            if "registry.json" in _ref:
                add_edge(GraphEdge(source=script_node, target="data:registry", relation="consume"))
            elif "learnings" in _ref:
                add_edge(GraphEdge(source=script_node, target="data:learnings", relation="consume"))
            elif _ref.startswith("data/"):
                add_edge(GraphEdge(source=script_node, target="data:data-folder", relation="consume"))
            else:
                add_edge(GraphEdge(source=script_node, target="data:logs", relation="consume"))

        if dep_info["report_refs"]:
            add_edge(GraphEdge(source=script_node, target="report:reports", relation="generate"))

        if dep_info["config_refs"]:
            for config_ref in dep_info["config_refs"][:2]:
                config_id = f"config:{config_ref}"
                add_node(GraphNode(id=config_id, name=config_ref, type="config", layer="execution", size=8.5))
                add_edge(GraphEdge(source=script_node, target=config_id, relation="dependency"))

        if script_node.endswith("garden_report.py"):
            add_edge(GraphEdge(source=script_node, target="data:registry", relation="consume"))
            add_edge(GraphEdge(source=script_node, target="data:learnings", relation="consume"))
            add_edge(GraphEdge(source=script_node, target="report:system-garden", relation="generate"))

    add_node(GraphNode(id="report:reports", name="reports/", type="report", layer="outputs", size=12))
    add_node(
        GraphNode(
            id="report:system-garden",
            name="reports/garden/system_garden.html",
            type="report",
            layer="outputs",
            size=14,
        )
    )
    add_edge(GraphEdge(source="report:reports", target="report:system-garden", relation="dependency"))

    health_areas = compute_health_areas(
        registry=registry,
        agents=agents,
        issues=issues,
        learnings=learnings,
        data_stats=data_stats,
        reports_stats=reports_stats,
        logs_stats=logs_stats,
    )

    questions = build_metacognitive_questions(nodes, edges, health_areas, registry, issues)

    graph_nodes = [
        {
            "id": node.id,
            "name": node.name,
            "type": node.type,
            "layer": node.layer,
            "size": node.size,
            "status": node.status,
            "meta": node.meta or {},
        }
        for node in nodes.values()
    ]
    graph_edges = [{"source": edge.source, "target": edge.target, "relation": edge.relation} for edge in edges]

    payload = {
        "meta": {
            "generated_at": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z"),
            "node_count": len(graph_nodes),
            "edge_count": len(graph_edges),
            "learning_mistakes": learnings.get("total_mistakes", 0),
            "layer_labels": LAYER_LABELS,
        },
        "graph": {
            "nodes": graph_nodes,
            "edges": graph_edges,
        },
        "health_areas": health_areas,
        "questions": questions,
    }

    html = render_html(
        payload=payload,
        health_cards=render_health_cards(health_areas),
        questions_html=render_questions(questions),
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html, encoding="utf-8")

    print(f"[OK] 시스템 가든 대시보드 생성: {args.output}")
    print(f"      - nodes: {len(graph_nodes)}")
    print(f"      - edges: {len(graph_edges)}")
    health_summary = ", ".join(f"{a['name']}={a['status']}" for a in health_areas)
    print(f"      - health: {health_summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
