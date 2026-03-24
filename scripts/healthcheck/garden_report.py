#!/usr/bin/env python3
"""System Garden health dashboard generator."""
from __future__ import annotations

import json
import os
import re
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "logs" / "jobs" / "registry.json"
JOBS_DIR = ROOT / "logs" / "jobs"
LEARNINGS_DIR = ROOT / ".paperclip" / "agents" / "learnings"
WATCHLIST_PATH = ROOT / "portfolio" / "watchlist.json"
DATA_DIR = ROOT / "data"
OUTPUT_PATH = ROOT / "reports" / "garden" / "system_garden.html"
PREV_PAYLOAD_PATH = ROOT / "reports" / "garden" / "system_garden_prev.json"

PAPERCLIP_API = os.environ.get("PAPERCLIP_API", "http://localhost:3100/api").rstrip("/")
PAPERCLIP_COMPANY_ID = os.environ.get("PAPERCLIP_COMPANY_ID", "9045933e-40ca-4a08-8dad-38a8a054bdf3")

SCHEDULES = [
    "morning_routine",
    "healthcheck",
    "signal_aggregator",
    "event_scanner",
    "evening_routine",
    "action_executor",
]

AGENTS = ["제갈량", "셜록", "해리포터", "코난", "스크루지", "도라에몽", "터미네이터", "포청천"]

DATA_NODES = [
    "data/futures",
    "data/insights",
    "data/macro",
    "data/sns",
    "data/market_signals",
    "data/signals",
]

OUTPUT_NODES = [
    "reports/blog",
    "reports/strategy",
    "reports/deep_dive",
    "portfolio/watchlist.json",
]

CORE_FRESHNESS_DIRS = ["futures", "insights", "macro", "sns", "market_signals"]
OPEN_STATUSES = {"todo", "in_progress", "blocked", "in_review"}

LEARNING_AGENT_ALIAS = {
    "ceo": "제갈량",
    "sherlock": "셜록",
    "harry": "해리포터",
    "conan": "코난",
    "scrooge": "스크루지",
    "doraemon": "도라에몽",
    "t800": "터미네이터",
    "inspector": "포청천",
}


def clamp(value: float, lower: int = 0, upper: int = 100) -> int:
    return max(lower, min(upper, int(round(value))))


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def api_get(path: str) -> Any:
    try:
        req = urllib.request.Request(
            f"{PAPERCLIP_API}{path}",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def fmt_dt(value: datetime | None) -> str:
    if value is None:
        return "-"
    return value.astimezone().strftime("%Y-%m-%d %H:%M")


def normalize_api_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return [x for x in items if isinstance(x, dict)]
    return []


def canonical_agent_name(name: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*$", "", (name or "")).strip()


def is_success_status(status: str | None) -> bool:
    return (status or "").lower() == "success"


def collect_job_stats(registry: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=14)
    jobs: list[dict[str, Any]] = []

    for job_name, meta in sorted(registry.items()):
        if job_name.startswith("_") or not isinstance(meta, dict):
            continue

        success_runs = 0
        fail_runs = 0
        for log_path in sorted(JOBS_DIR.glob(f"{job_name}_*.jsonl")):
            try:
                lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
            except Exception:
                continue
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if row.get("event") != "run_finished":
                    continue
                ts = parse_dt(row.get("ts"))
                if ts is not None and ts < cutoff:
                    continue
                status = str(row.get("status", "")).lower()
                if status == "success":
                    success_runs += 1
                else:
                    fail_runs += 1

        if success_runs == 0 and fail_runs == 0:
            if is_success_status(meta.get("last_status")):
                success_runs = 1
            else:
                fail_runs = 1

        total_runs = success_runs + fail_runs
        success_rate = (success_runs / total_runs) * 100 if total_runs else 0.0
        failure_rate = (fail_runs / total_runs) * 100 if total_runs else 0.0

        last_success = parse_dt(meta.get("last_success"))
        last_failure = parse_dt(meta.get("last_failure"))
        last_run = parse_dt(meta.get("last_run_at")) or max(
            [d for d in [last_success, last_failure] if d is not None],
            default=None,
        )
        stale_days = None
        if last_run is not None:
            stale_days = (now - last_run).total_seconds() / 86400.0

        jobs.append(
            {
                "name": job_name,
                "success_runs": success_runs,
                "fail_runs": fail_runs,
                "total_runs": total_runs,
                "success_rate": success_rate,
                "failure_rate": failure_rate,
                "consecutive_failures": int(meta.get("consecutive_failures") or 0),
                "last_run": last_run,
                "last_success": last_success,
                "last_failure": last_failure,
                "stale_days": stale_days,
            }
        )

    return {"jobs": jobs}


def collect_learnings() -> dict[str, Any]:
    per_agent: dict[str, int] = {}
    repeat_patterns: list[dict[str, Any]] = []
    shared_patterns: list[dict[str, Any]] = []
    total_mistakes = 0

    if not LEARNINGS_DIR.exists():
        return {
            "per_agent": per_agent,
            "total_mistakes": total_mistakes,
            "repeat_patterns": repeat_patterns,
            "shared_patterns": shared_patterns,
            "repeated_line_count": 0,
        }

    repeated_line_count = 0
    pattern_agents: defaultdict[str, set[str]] = defaultdict(set)
    pattern_total_counts: Counter[str] = Counter()

    for path in sorted(LEARNINGS_DIR.glob("*.md")):
        agent = LEARNING_AGENT_ALIAS.get(path.stem, path.stem)
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        mistakes: list[str] = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("- "):
                mistakes.append(stripped[2:].strip())

        per_agent[agent] = len(mistakes)
        total_mistakes += len(mistakes)

        normalized = Counter()
        for text in mistakes:
            norm = re.sub(r"^\d{4}-\d{2}-\d{2}:\s*", "", text)
            norm = re.sub(r"\bALP-\d+\b", "", norm)
            norm = re.sub(r"\s+", " ", norm).strip()
            if norm:
                normalized[norm] += 1
                pattern_agents[norm].add(agent)
                pattern_total_counts[norm] += 1

        for pattern, count in normalized.items():
            if count >= 2:
                repeated_line_count += count
                repeat_patterns.append({"agent": agent, "pattern": pattern, "count": count})

    for pattern, agents in pattern_agents.items():
        if len(agents) < 2:
            continue
        shared_patterns.append(
            {
                "pattern": pattern,
                "agents": sorted(agents),
                "agent_count": len(agents),
                "total_count": int(pattern_total_counts.get(pattern, 0)),
            }
        )

    repeat_patterns.sort(key=lambda x: x["count"], reverse=True)
    shared_patterns.sort(key=lambda x: (x["agent_count"], x["total_count"]), reverse=True)
    return {
        "per_agent": per_agent,
        "total_mistakes": total_mistakes,
        "repeat_patterns": repeat_patterns,
        "shared_patterns": shared_patterns,
        "repeated_line_count": repeated_line_count,
    }


def latest_file_mtime(folder: Path) -> datetime | None:
    latest_ts = None
    for path in folder.rglob("*"):
        if not path.is_file():
            continue
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        if latest_ts is None or mtime > latest_ts:
            latest_ts = mtime
    if latest_ts is None:
        return None
    return datetime.fromtimestamp(latest_ts, tz=timezone.utc)


def count_files(folder: Path) -> int:
    total = 0
    for path in folder.rglob("*"):
        if path.is_file():
            total += 1
    return total


def latest_file_info(path: Path) -> dict[str, Any]:
    if path.is_file():
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        except OSError:
            mtime = None
        return {"latest_file": path.name, "latest": mtime, "file_count": 1 if path.exists() else 0}

    if not path.exists() or not path.is_dir():
        return {"latest_file": "-", "latest": None, "file_count": 0}

    latest_ts = None
    latest_name = "-"
    total = 0
    for child in path.rglob("*"):
        if not child.is_file():
            continue
        total += 1
        try:
            mtime = child.stat().st_mtime
        except OSError:
            continue
        if latest_ts is None or mtime > latest_ts:
            latest_ts = mtime
            try:
                latest_name = str(child.relative_to(path))
            except ValueError:
                latest_name = child.name

    latest = datetime.fromtimestamp(latest_ts, tz=timezone.utc) if latest_ts is not None else None
    return {"latest_file": latest_name, "latest": latest, "file_count": total}


def collect_data_freshness() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    folders: dict[str, Any] = {}

    if not DATA_DIR.exists():
        return {"folders": folders, "core": {}, "stale_three_plus": []}

    for child in sorted(DATA_DIR.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        latest = latest_file_mtime(child)
        stale_days = None
        if latest is not None:
            stale_days = (now - latest).total_seconds() / 86400.0
        folders[child.name] = {
            "latest": latest,
            "stale_days": stale_days,
            "file_count": count_files(child),
        }

    core = {name: folders.get(name, {"latest": None, "stale_days": None}) for name in CORE_FRESHNESS_DIRS}
    stale_three_plus = []
    for name, info in folders.items():
        days = info.get("stale_days")
        if days is not None and days >= 3:
            stale_three_plus.append({"folder": name, "days": days})

    stale_three_plus.sort(key=lambda x: x["days"], reverse=True)
    return {"folders": folders, "core": core, "stale_three_plus": stale_three_plus}


def collect_output_freshness() -> dict[str, Any]:
    outputs: dict[str, Any] = {}
    for node in OUTPUT_NODES:
        info = latest_file_info(ROOT / node)
        outputs[node] = info
    return outputs


def collect_watchlist_danger() -> dict[str, Any]:
    watchlist = read_json(WATCHLIST_PATH, {})
    items = watchlist.get("watchlist") if isinstance(watchlist, dict) else []
    danger_items: list[str] = []

    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            if not item.get("holding"):
                continue
            gap = item.get("sl_gap_percent")
            if isinstance(gap, (int, float)) and gap < 10:
                name = item.get("ticker") or item.get("name") or "UNKNOWN"
                danger_items.append(str(name))

    return {"count": len(danger_items), "items": sorted(danger_items)}


def collect_agents_and_issues() -> dict[str, Any]:
    agents = normalize_api_payload(api_get(f"/companies/{PAPERCLIP_COMPANY_ID}/agents"))
    issues = normalize_api_payload(api_get(f"/companies/{PAPERCLIP_COMPANY_ID}/issues"))

    agents_by_id = {a.get("id"): a for a in agents if a.get("id")}
    issue_stats = defaultdict(lambda: {"done": 0, "open": 0, "recent": None})

    for issue in issues:
        aid = issue.get("assigneeAgentId")
        if not aid:
            continue
        status = str(issue.get("status", "")).lower()
        if status == "done":
            issue_stats[aid]["done"] += 1
        elif status in OPEN_STATUSES:
            issue_stats[aid]["open"] += 1

        updated = parse_dt(issue.get("updatedAt"))
        recent = issue_stats[aid]["recent"]
        if updated and (recent is None or updated > recent):
            issue_stats[aid]["recent"] = updated

    agent_rows = []
    for agent in agents:
        runtime = agent.get("runtimeConfig") or {}
        heartbeat = runtime.get("heartbeat") if isinstance(runtime, dict) else {}
        interval_sec = heartbeat.get("intervalSec") if isinstance(heartbeat, dict) else None
        agent_rows.append(
            {
                "id": agent.get("id"),
                "name": agent.get("name", "unknown"),
                "status": agent.get("status", "unknown"),
                "heartbeat_interval": interval_sec,
                "last_heartbeat": parse_dt(agent.get("lastHeartbeatAt")),
            }
        )

    issue_rows = []
    for aid, stats in issue_stats.items():
        agent_name = agents_by_id.get(aid, {}).get("name", aid)
        issue_rows.append(
            {
                "agent_id": aid,
                "agent_name": agent_name,
                "done": stats["done"],
                "open": stats["open"],
                "recent": stats["recent"],
            }
        )

    issue_rows.sort(key=lambda x: (x["open"], x["done"]), reverse=True)
    return {"agents": agent_rows, "issues": issues, "issue_rows": issue_rows}


def classify_card(score: int) -> str:
    if score >= 80:
        return "울창"
    if score >= 50:
        return "성장"
    return "시듦"


def issues_for_keywords(issues: list[dict[str, Any]], keywords: list[str]) -> tuple[int, int]:
    done = 0
    opened = 0
    for issue in issues:
        title = str(issue.get("title") or "")
        desc = str(issue.get("description") or "")
        blob = f"{title} {desc}".lower()
        if not any(k in blob for k in keywords):
            continue
        status = str(issue.get("status") or "").lower()
        if status == "done":
            done += 1
        elif status in OPEN_STATUSES:
            opened += 1
    return done, opened


def build_cards(
    job_stats: dict[str, Any],
    issues: list[dict[str, Any]],
    data_freshness: dict[str, Any],
    watchlist_danger: dict[str, Any],
    agents: list[dict[str, Any]],
    learnings: dict[str, Any],
) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []

    core = data_freshness["core"]
    core_total = len(CORE_FRESHNESS_DIRS)
    core_fresh = 0
    for folder in CORE_FRESHNESS_DIRS:
        stale_days = core.get(folder, {}).get("stale_days")
        if stale_days is not None and stale_days <= 1:
            core_fresh += 1
    data_score = clamp((core_fresh / max(1, core_total)) * 100)
    cards.append(
        {
            "name": "데이터 수집",
            "score": data_score,
            "state": classify_card(data_score),
            "detail": f"core freshness {core_fresh}/{core_total} (24h 기준)",
        }
    )

    signal_jobs = []
    for job in job_stats["jobs"]:
        name = job["name"]
        if "signal" in name or name in {"check_signal_chain", "evaluate_signal_quality", "signal_aggregator"}:
            signal_jobs.append(job)
    signal_success = sum(j["success_runs"] for j in signal_jobs)
    signal_total = sum(j["total_runs"] for j in signal_jobs)
    signal_score = clamp((signal_success / signal_total) * 100) if signal_total else 0
    cards.append(
        {
            "name": "시그널 분석",
            "score": signal_score,
            "state": classify_card(signal_score),
            "detail": f"signal job success {signal_success}/{signal_total}",
        }
    )

    reporting_done, reporting_open = issues_for_keywords(
        issues,
        ["report", "blog", "리포트", "블로그", "발행", "deep_dive"],
    )
    reporting_total = reporting_done + reporting_open
    reporting_score = clamp((reporting_done / reporting_total) * 100) if reporting_total else 100
    cards.append(
        {
            "name": "리포팅",
            "score": reporting_score,
            "state": classify_card(reporting_score),
            "detail": f"done/open {reporting_done}/{reporting_open}",
        }
    )

    portfolio_done, portfolio_open = issues_for_keywords(
        issues,
        ["portfolio", "watchlist", "포트폴리오", "리밸런싱", "매매", "strategy", "전략"],
    )
    portfolio_total = portfolio_done + portfolio_open
    portfolio_completion = (portfolio_done / portfolio_total) * 100 if portfolio_total else 100
    danger_count = int(watchlist_danger["count"])
    portfolio_score = clamp(portfolio_completion - min(50, danger_count * 5))
    cards.append(
        {
            "name": "포트폴리오",
            "score": portfolio_score,
            "state": classify_card(portfolio_score),
            "detail": f"done/open {portfolio_done}/{portfolio_open}, danger {danger_count}",
        }
    )

    if agents:
        operational = 0
        for agent in agents:
            status = str(agent.get("status") or "").lower()
            if status in {"active", "running", "idle"}:
                operational += 1
        uptime = (operational / len(agents)) * 100
        total_mistakes = learnings["total_mistakes"]
        repeated_lines = learnings["repeated_line_count"]
        repeat_rate = (repeated_lines / total_mistakes) if total_mistakes else 0
        agent_score = clamp((uptime * 0.7) + ((100 - repeat_rate * 100) * 0.3))
        detail = f"가동 {operational}/{len(agents)}, 반복실수율 {repeat_rate * 100:.1f}%"
    else:
        agent_score = 50
        detail = "Paperclip API unavailable"

    cards.append(
        {
            "name": "에이전트",
            "score": agent_score,
            "state": classify_card(agent_score),
            "detail": detail,
        }
    )

    return cards


def build_graph_elements() -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    label_to_id: dict[str, str] = {}

    def add_node(kind: str, label: str) -> None:
        node_id = f"{kind}:{label}"
        label_to_id[label] = node_id
        nodes.append({"data": {"id": node_id, "label": label, "kind": kind}})

    for name in SCHEDULES:
        add_node("schedule", name)
    for name in AGENTS:
        add_node("agent", name)
    for name in DATA_NODES:
        add_node("data", name)
    for name in OUTPUT_NODES:
        add_node("output", name)

    raw_edges = []
    raw_edges.extend(
        [
            ("morning_routine", "data/futures", "collect"),
            ("morning_routine", "data/insights", "collect"),
            ("morning_routine", "data/macro", "collect"),
            ("signal_aggregator", "data/signals", "analyze"),
            ("data/signals", "action_executor", "trigger"),
            ("코난", "data/market_signals", "분석"),
            ("셜록", "reports/deep_dive", "리포트"),
            ("셜록", "portfolio/watchlist.json", "watchlist"),
            ("해리포터", "reports/blog", "작성"),
            ("스크루지", "portfolio/watchlist.json", "관리"),
        ]
    )

    for target in DATA_NODES:
        raw_edges.append(("도라에몽", target, "수집"))

    for target in AGENTS:
        if target != "제갈량":
            raw_edges.append(("제갈량", target, "위임"))
        if target != "포청천":
            raw_edges.append(("포청천", target, "검수"))

    for target in SCHEDULES:
        if target != "healthcheck":
            raw_edges.append(("healthcheck", target, "모니터링"))

    seen = set()
    for source_label, target_label, relation in raw_edges:
        source_id = label_to_id.get(source_label)
        target_id = label_to_id.get(target_label)
        if not source_id or not target_id:
            continue
        key = (source_id, target_id, relation)
        if key in seen:
            continue
        seen.add(key)
        edges.append(
            {
                "data": {
                    "id": f"{source_id}->{target_id}:{relation}",
                    "source": source_id,
                    "target": target_id,
                    "relation": relation,
                }
            }
        )

    return {"nodes": nodes, "edges": edges}


def build_node_details(
    job_stats: dict[str, Any],
    agents: list[dict[str, Any]],
    issues: list[dict[str, Any]],
    learnings: dict[str, Any],
    data_freshness: dict[str, Any],
    output_freshness: dict[str, Any],
) -> dict[str, Any]:
    details: dict[str, Any] = {}

    jobs_by_name = {str(job.get("name")): job for job in job_stats.get("jobs", [])}
    agents_by_name: dict[str, dict[str, Any]] = {}
    agent_name_by_id: dict[str, str] = {}
    for agent in agents:
        raw_name = str(agent.get("name") or "")
        canonical = canonical_agent_name(raw_name)
        if canonical:
            agents_by_name[canonical] = agent
        if raw_name:
            agents_by_name[raw_name] = agent
        aid = str(agent.get("id") or "")
        if aid and canonical:
            agent_name_by_id[aid] = canonical

    recent_issues_by_agent: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for issue in issues:
        aid = str(issue.get("assigneeAgentId") or "")
        if not aid:
            continue
        updated_at = parse_dt(issue.get("updatedAt")) or parse_dt(issue.get("createdAt"))
        recent_issues_by_agent[aid].append(
            {
                "title": str(issue.get("title") or issue.get("id") or "Untitled issue"),
                "status": str(issue.get("status") or "unknown"),
                "updated_at": fmt_dt(updated_at),
                "_sort": updated_at or datetime.min.replace(tzinfo=timezone.utc),
            }
        )

    for aid in list(recent_issues_by_agent.keys()):
        recent_issues_by_agent[aid].sort(key=lambda item: item["_sort"], reverse=True)
        for item in recent_issues_by_agent[aid]:
            item.pop("_sort", None)

    mistakes_by_agent = learnings.get("per_agent") or {}

    for name in SCHEDULES:
        node_id = f"schedule:{name}"
        row = jobs_by_name.get(name, {})
        details[node_id] = {
            "kind": "schedule",
            "job": name,
            "last_success": fmt_dt(row.get("last_success")) if isinstance(row, dict) else "-",
            "last_failure": fmt_dt(row.get("last_failure")) if isinstance(row, dict) else "-",
            "consecutive_failures": int(row.get("consecutive_failures") or 0) if isinstance(row, dict) else 0,
        }

    for name in AGENTS:
        node_id = f"agent:{name}"
        agent = agents_by_name.get(name, {})
        aid = str(agent.get("id") or "")
        details[node_id] = {
            "kind": "agent",
            "name": name,
            "status": str(agent.get("status") or "unknown"),
            "heartbeat_interval": agent.get("heartbeat_interval"),
            "recent_issues": recent_issues_by_agent.get(aid, [])[:3],
            "mistake_count": int(mistakes_by_agent.get(name) or 0),
        }

    folders = data_freshness.get("folders") or {}
    for node in DATA_NODES:
        folder_name = node.split("/", 1)[-1]
        info = folders.get(folder_name, {})
        details[f"data:{node}"] = {
            "kind": "data",
            "folder": node,
            "latest_file_date": fmt_dt(info.get("latest")) if isinstance(info, dict) else "-",
            "file_count": int(info.get("file_count") or 0) if isinstance(info, dict) else 0,
        }

    for node in OUTPUT_NODES:
        info = output_freshness.get(node, {})
        details[f"output:{node}"] = {
            "kind": "output",
            "artifact": node,
            "latest_file": str(info.get("latest_file") or "-"),
            "latest_file_date": fmt_dt(info.get("latest")),
        }

    for aid, items in recent_issues_by_agent.items():
        agent_name = agent_name_by_id.get(aid)
        if not agent_name:
            continue
        node_id = f"agent:{agent_name}"
        if node_id in details:
            details[node_id]["recent_issues"] = items[:3]

    return details


def question_text(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("text") or "").strip()
    return str(item).strip()


def calc_delta_label(diff: int) -> dict[str, Any]:
    if diff > 0:
        return {"direction": "up", "label": f"↑{diff} 개선"}
    if diff < 0:
        return {"direction": "down", "label": f"↓{abs(diff)} 악화"}
    return {"direction": "flat", "label": "→ 변동없음"}


def build_delta(current_payload: dict[str, Any], prev_payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not prev_payload or not isinstance(prev_payload, dict):
        return None

    prev_cards = {str(card.get("name")): int(card.get("score") or 0) for card in prev_payload.get("cards", [])}
    current_cards = current_payload.get("cards", [])
    card_deltas: dict[str, Any] = {}
    for card in current_cards:
        name = str(card.get("name") or "")
        if not name or name not in prev_cards:
            continue
        current_score = int(card.get("score") or 0)
        diff = current_score - prev_cards[name]
        card_deltas[name] = {"diff": diff, **calc_delta_label(diff)}

    prev_scores = [int(card.get("score") or 0) for card in prev_payload.get("cards", [])]
    curr_scores = [int(card.get("score") or 0) for card in current_cards]
    overall_prev = round(sum(prev_scores) / len(prev_scores)) if prev_scores else None
    overall_curr = round(sum(curr_scores) / len(curr_scores)) if curr_scores else None
    overall_delta = None
    if overall_prev is not None and overall_curr is not None:
        overall_delta = {"diff": overall_curr - overall_prev, **calc_delta_label(overall_curr - overall_prev)}

    prev_questions = {question_text(item) for item in prev_payload.get("questions", []) if question_text(item)}
    new_questions = []
    for item in current_payload.get("questions", []):
        text = question_text(item)
        if text and text not in prev_questions:
            new_questions.append(text)

    prev_agents = {
        str(row.get("name")): str(row.get("status") or "unknown")
        for row in prev_payload.get("details", {}).get("agent_rows", [])
    }
    current_agents = {
        str(row.get("name")): str(row.get("status") or "unknown")
        for row in current_payload.get("details", {}).get("agent_rows", [])
    }
    status_changes = []
    for name, status in current_agents.items():
        prev_status = prev_agents.get(name)
        if prev_status is None or prev_status == status:
            continue
        status_changes.append({"name": name, "from": prev_status, "to": status})

    return {
        "overall_health": {
            "current": overall_curr,
            "previous": overall_prev,
            "change": overall_delta,
        },
        "card_deltas": card_deltas,
        "new_questions": new_questions,
        "agent_status_changes": status_changes,
    }


def build_questions(
    job_stats: dict[str, Any],
    learnings: dict[str, Any],
    data_freshness: dict[str, Any],
    cards: list[dict[str, Any]] | None = None,
    agents: list[dict[str, Any]] | None = None,
    issues: list[dict[str, Any]] | None = None,
    watchlist_danger: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    _ = job_stats  # reserved for future scoring extensions
    cards = cards or []
    agents = agents or []
    issues = issues or []
    watchlist_danger = watchlist_danger or {}
    max_questions = 5

    withered_hint = "Danger 종목 리밸런싱 또는 SL 재검토"
    repeat_hint = "_shared.md 규칙 강화 또는 코드 강제 로직 추가 검토"
    stale_hint = "수집 스크립트 확인 또는 폐기 검토"
    idle_hint = "이슈 할당 필요 또는 heartbeat 비활성화 검토"
    overgrowth_hint = "업무 재분배 또는 에이전트 추가 고려"

    withered_questions: list[dict[str, str]] = []
    repeat_questions: list[dict[str, str]] = []
    stale_data_questions: list[dict[str, str]] = []
    idle_agent_questions: list[dict[str, str]] = []
    overgrowth_questions: list[dict[str, str]] = []

    def add_question(bucket: list[dict[str, str]], text: str, action_hint: str) -> None:
        bucket.append({"text": text, "action_hint": action_hint})

    # 1) 건강도 시듦 카드
    danger_count = int(watchlist_danger.get("count") or 0)
    for idx, card in enumerate(cards):
        score = int(card.get("score") or 0)
        if score >= 50:
            continue
        name = str(card.get("name") or "영역")
        detail = str(card.get("detail") or "").strip()
        if name == "포트폴리오":
            add_question(
                withered_questions,
                f"{name} 영역이 시듦 상태({score}점)입니다. Danger {danger_count}종목 리밸런싱이 필요합니다.",
                withered_hint,
            )
            continue
        if idx % 2 == 0:
            add_question(
                withered_questions,
                f"{name} 영역이 시듦 상태({score}점)입니다. 어떤 복구 액션을 먼저 실행할까요?",
                withered_hint,
            )
        else:
            add_question(
                withered_questions,
                f"{name} 카드가 {score}점으로 내려갔습니다. {detail or '핵심 지표'} 기준으로 우선순위를 재정렬해야 하지 않을까요?",
                withered_hint,
            )

    # 2) 반복 실수(패턴 단위로 묶어 에이전트 집계)
    shared_patterns = learnings.get("shared_patterns") or []
    if not shared_patterns and learnings.get("repeat_patterns"):
        grouped: dict[str, dict[str, Any]] = {}
        for repeated in learnings["repeat_patterns"]:
            pattern = str(repeated.get("pattern") or "").strip()
            agent = str(repeated.get("agent") or "").strip()
            count = int(repeated.get("count") or 0)
            if not pattern or not agent:
                continue
            bucket = grouped.setdefault(pattern, {"agents": set(), "total_count": 0})
            bucket["agents"].add(agent)
            bucket["total_count"] += count
        shared_patterns = [
            {
                "pattern": pattern,
                "agents": sorted(list(info["agents"])),
                "agent_count": len(info["agents"]),
                "total_count": int(info["total_count"]),
            }
            for pattern, info in grouped.items()
            if len(info["agents"]) >= 2
        ]
        shared_patterns.sort(key=lambda x: (x["agent_count"], x["total_count"]), reverse=True)

    for idx, repeated in enumerate(shared_patterns):
        agents_joined = ", ".join(repeated["agents"])
        agent_count = int(repeated.get("agent_count") or 0)
        pattern = str(repeated.get("pattern") or "")
        short = pattern[:70] + ("..." if len(pattern) > 70 else "")
        if idx % 2 == 0:
            add_question(
                repeat_questions,
                f"{agents_joined} {agent_count}명이 동일 패턴 반복 중입니다: '{short}'. 공통 가드레일을 추가할까요?",
                repeat_hint,
            )
        else:
            add_question(
                repeat_questions,
                f"반복 실수 경보: '{short}' 패턴이 {agents_joined} {agent_count}명에게서 재발합니다. 체크리스트를 강제해야 할까요?",
                repeat_hint,
            )

    # 3) 방치 데이터
    for idx, stale in enumerate(data_freshness["stale_three_plus"]):
        folder = stale["folder"]
        days = stale["days"]
        if idx % 2 == 0:
            add_question(
                stale_data_questions,
                f"data/{folder}가 {days:.1f}일 동안 갱신되지 않았습니다. 이 데이터가 방치되고 있습니다.",
                stale_hint,
            )
        else:
            add_question(
                stale_data_questions,
                f"{days:.1f}일째 멈춘 data/{folder}를 오늘 복구할까요, 아니면 폐기 후보로 분류할까요?",
                stale_hint,
            )

    # 4) 유휴 에이전트(최근 7일 이슈 0건)
    if agents:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=7)
        recent_issue_count: Counter[str] = Counter()
        for issue in issues:
            aid = issue.get("assigneeAgentId")
            if not aid:
                continue
            ts = parse_dt(issue.get("updatedAt")) or parse_dt(issue.get("createdAt"))
            if ts is None or ts < cutoff:
                continue
            recent_issue_count[str(aid)] += 1

        for idx, agent in enumerate(agents):
            aid = str(agent.get("id") or "")
            if not aid or recent_issue_count.get(aid, 0) > 0:
                continue
            name = str(agent.get("name") or aid)
            if idx % 2 == 0:
                add_question(
                    idle_agent_questions,
                    f"{name} 에이전트는 최근 7일간 이슈 0건입니다. 이 에이전트가 유휴 상태입니다.",
                    idle_hint,
                )
            else:
                add_question(
                    idle_agent_questions,
                    f"최근 7일 이슈가 없는 {name}를 관찰 모드로 둘까요, 아니면 신규 책임 영역을 할당할까요?",
                    idle_hint,
                )

    # 5) 과성장(업무 편중)
    assignee_counts: Counter[str] = Counter()
    for issue in issues:
        aid = issue.get("assigneeAgentId")
        if aid:
            assignee_counts[str(aid)] += 1
    total_assigned = sum(assignee_counts.values())
    if total_assigned > 0:
        name_by_id = {str(a.get("id")): str(a.get("name") or a.get("id") or "unknown") for a in agents}
        for idx, (aid, count) in enumerate(assignee_counts.most_common()):
            ratio = count / total_assigned
            if ratio < 0.30:
                continue
            name = name_by_id.get(aid, aid)
            if idx % 2 == 0:
                add_question(
                    overgrowth_questions,
                    f"업무 편중 경고: {name}가 전체 이슈의 {ratio * 100:.0f}%({count}/{total_assigned})를 담당 중입니다.",
                    overgrowth_hint,
                )
            else:
                add_question(
                    overgrowth_questions,
                    f"{name} 집중도가 {ratio * 100:.0f}%입니다. 티켓을 분산 재배치해 병목을 줄일까요?",
                    overgrowth_hint,
                )

    ordered_groups = [
        withered_questions,     # 건강도 시듦
        repeat_questions,       # 반복실수
        stale_data_questions,   # 방치데이터
        idle_agent_questions,   # 유휴에이전트
        overgrowth_questions,   # 과성장
    ]

    questions: list[dict[str, str]] = []
    for group in ordered_groups:
        for item in group:
            questions.append(item)
            if len(questions) >= max_questions:
                return questions

    if not questions:
        return [
            {
                "text": "현재 시듦 카드, 반복 실수, 방치 데이터, 유휴 에이전트, 업무 편중 경고가 없습니다. 어떤 영역을 선제 점검할까요?",
                "action_hint": "핵심 루틴 유지 상태를 주간 점검표로 고정해보세요.",
            }
        ]
    return questions


def build_dashboard(prev_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    registry = read_json(REGISTRY_PATH, {})
    if not isinstance(registry, dict):
        registry = {}

    jobs = collect_job_stats(registry)
    learnings = collect_learnings()
    freshness = collect_data_freshness()
    output_freshness = collect_output_freshness()
    watchlist = collect_watchlist_danger()

    paperclip = collect_agents_and_issues()
    agents = paperclip["agents"]
    issues = paperclip["issues"]

    cards = build_cards(jobs, issues, freshness, watchlist, agents, learnings)
    graph = build_graph_elements()
    node_details = build_node_details(jobs, agents, issues, learnings, freshness, output_freshness)
    questions = build_questions(jobs, learnings, freshness, cards, agents, issues, watchlist)

    generated_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    payload = {
        "meta": {
            "generated_at": generated_at,
            "agent_api_ok": bool(agents),
            "issue_api_ok": bool(issues),
            "node_count": len(graph["nodes"]),
            "edge_count": len(graph["edges"]),
        },
        "cards": cards,
        "questions": questions,
        "graph": graph,
        "node_details": node_details,
        "details": {
            "jobs": jobs["jobs"],
            "agent_rows": agents,
            "issue_rows": paperclip["issue_rows"],
            "learnings": learnings,
            "freshness": freshness,
            "output_freshness": output_freshness,
            "watchlist": watchlist,
        },
    }
    delta = build_delta(payload, prev_payload)
    if delta:
        for card in payload["cards"]:
            card["delta"] = delta.get("card_deltas", {}).get(str(card.get("name")))
    payload["delta"] = delta
    return payload


def render_detail_rows(payload: dict[str, Any]) -> str:
    jobs = payload["details"]["jobs"]
    top_jobs = sorted(jobs, key=lambda x: (x["consecutive_failures"], x["failure_rate"]), reverse=True)[:10]
    job_rows = "".join(
        "<tr>"
        f"<td>{job['name']}</td>"
        f"<td>{job['success_rate']:.0f}%</td>"
        f"<td>{job['failure_rate']:.0f}%</td>"
        f"<td>{job['consecutive_failures']}</td>"
        f"<td>{fmt_dt(job['last_run'])}</td>"
        "</tr>"
        for job in top_jobs
    )

    agents = payload["details"]["agent_rows"]
    if agents:
        agent_rows = "".join(
            "<tr>"
            f"<td>{a['name']}</td>"
            f"<td>{a['status']}</td>"
            f"<td>{a['heartbeat_interval'] if a['heartbeat_interval'] is not None else '-'}</td>"
            f"<td>{fmt_dt(a['last_heartbeat'])}</td>"
            "</tr>"
            for a in agents
        )
    else:
        agent_rows = "<tr><td colspan='4'>Paperclip API 연결 실패 (에이전트 섹션 비움)</td></tr>"

    issue_rows_data = payload["details"]["issue_rows"]
    issue_rows = "".join(
        "<tr>"
        f"<td>{row['agent_name']}</td>"
        f"<td>{row['done']}</td>"
        f"<td>{row['open']}</td>"
        f"<td>{fmt_dt(row['recent'])}</td>"
        "</tr>"
        for row in issue_rows_data[:8]
    )
    if not issue_rows:
        issue_rows = "<tr><td colspan='4'>이슈 데이터 없음</td></tr>"

    return f"""
      <div class=\"tables\">
        <article class=\"table-card\">
          <h3>스크립트 건강도</h3>
          <table>
            <thead><tr><th>Job</th><th>성공률</th><th>실패률</th><th>연속실패</th><th>최근 실행</th></tr></thead>
            <tbody>{job_rows}</tbody>
          </table>
        </article>
        <article class=\"table-card\">
          <h3>에이전트 상태</h3>
          <table>
            <thead><tr><th>이름</th><th>Status</th><th>Heartbeat(s)</th><th>Last heartbeat</th></tr></thead>
            <tbody>{agent_rows}</tbody>
          </table>
        </article>
        <article class=\"table-card\">
          <h3>이슈 통계</h3>
          <table>
            <thead><tr><th>에이전트</th><th>Done</th><th>Open</th><th>최근 활동</th></tr></thead>
            <tbody>{issue_rows}</tbody>
          </table>
        </article>
      </div>
    """


def render_html(payload: dict[str, Any]) -> str:
    payload_json = json.dumps(payload, ensure_ascii=False, default=lambda o: o.isoformat() if isinstance(o, datetime) else str(o)).replace("</", "<\\/")

    def delta_css_class(direction: str | None) -> str:
        if direction == "up":
            return "delta-up"
        if direction == "down":
            return "delta-down"
        return "delta-flat"

    def render_card_delta(delta_data: dict[str, Any] | None) -> str:
        if not delta_data:
            return ""
        direction = str(delta_data.get("direction") or "flat")
        diff = abs(int(delta_data.get("diff") or 0))
        if direction == "up":
            label = f"↑{diff} 개선"
        elif direction == "down":
            label = f"↓{diff} 악화"
        else:
            label = "→ 변동없음"
        return f" <span class='card-delta {delta_css_class(direction)}'>{label}</span>"

    def card_status_guide(card: dict[str, Any]) -> tuple[str, str] | None:
        detail = str(card.get("detail") or "")
        matched = re.search(r"done/open\s+(\d+)/(\d+)", detail)
        if not matched:
            return None
        done = int(matched.group(1))
        opened = int(matched.group(2))
        if opened == 0 and done > 0:
            return ("양호 — 전부 완료", "delta-up")
        if done > opened:
            return ("정상 — 업무 소화 중", "delta-up")
        if opened > done:
            return ("주의 — 미처리 업무 적체", "delta-down")
        return None

    cards_markup: list[str] = []
    for card in payload["cards"]:
        guide = card_status_guide(card)
        guide_html = (
            f"<div class='card-guide {guide[1]}'>{guide[0]}</div>"
            if guide
            else ""
        )
        cards_markup.append(
            f"<article class='score-card {card['state']}'><h3>{card['name']}</h3>"
            f"<div class='score'>{card['score']}%{render_card_delta(card.get('delta'))}</div>"
            f"<p>{card['detail']}</p>"
            f"{guide_html}</article>"
        )
    cards_html = "".join(cards_markup)

    def render_question(item: Any) -> str:
        text = question_text(item)
        hint = str(item.get("action_hint") or "").strip() if isinstance(item, dict) else ""
        hint_html = f"<div class='question-action-hint'>대처방안: {hint}</div>" if hint else ""
        return f"<li><div class='question-text'>{text}</div>{hint_html}</li>"

    questions_html = "".join(render_question(q) for q in payload["questions"])
    detail_html = render_detail_rows(payload)
    delta = payload.get("delta")
    if delta:
        health = (delta.get("overall_health") or {}).get("change")
        if health:
            health_html = (
                f"<div class='delta-pill {delta_css_class(health.get('direction'))}'>"
                f"건강도 {delta.get('overall_health', {}).get('current', '-')} "
                f"({health.get('label', '')})</div>"
            )
        else:
            health_html = "<div class='delta-pill delta-flat'>건강도 비교 데이터 없음</div>"

        new_questions = delta.get("new_questions") or []
        new_questions_html = "".join(f"<li>{q}</li>" for q in new_questions) or "<li>새 질문 없음</li>"

        status_changes = delta.get("agent_status_changes") or []
        status_changes_html = (
            "".join(
                "<li>"
                f"{item.get('name', 'unknown')}: "
                f"<span class='status-from'>{item.get('from', '-')}</span> → "
                f"<span class='status-to'>{item.get('to', '-')}</span>"
                "</li>"
                for item in status_changes
            )
            or "<li>에이전트 상태 변경 없음</li>"
        )
        delta_html = f"""
        <section class=\"section\">
          <h2>섹션 D: 변경 추적 (Delta)</h2>
          <div class=\"section-body delta-wrap\">
            {health_html}
            <div class=\"delta-grid\">
              <article class=\"table-card\">
                <h3>새로 추가된 질문</h3>
                <ul class=\"delta-list\">{new_questions_html}</ul>
              </article>
              <article class=\"table-card\">
                <h3>에이전트 상태 변경</h3>
                <ul class=\"delta-list\">{status_changes_html}</ul>
              </article>
            </div>
          </div>
        </section>
        """
    else:
        delta_html = """
        <section class=\"section\">
          <h2>섹션 D: 변경 추적 (Delta)</h2>
          <div class=\"section-body\">
            <div class=\"delta-pill delta-flat\">이전 스냅샷이 없어 Delta 비교를 건너뜁니다.</div>
          </div>
        </section>
        """

    return f"""<!doctype html>
<html lang=\"ko\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>System Garden</title>
  <style>
    :root {{
      --bg: #1a1a2e;
      --panel: #20213a;
      --text: #e0e0e0;
      --muted: #b9bdd4;
      --line: #34365b;
      --green: #22c55e;
      --yellow: #eab308;
      --red: #ef4444;
      --blue: #3b82f6;
      --agent: #22c55e;
      --data: #f97316;
      --output: #a855f7;
      --shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      background: radial-gradient(1200px 640px at 12% -12%, #2e2e56 0%, transparent 55%), var(--bg);
      color: var(--text);
    }}
    .wrap {{ max-width: 1440px; margin: 0 auto; padding: 20px; display: grid; gap: 16px; }}
    .header {{
      background: linear-gradient(135deg, #22234a 0%, #1f2038 100%);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: var(--shadow);
      padding: 18px 20px;
    }}
    .header h1 {{ margin: 0 0 8px; font-size: 34px; letter-spacing: 0.3px; }}
    .header p {{ margin: 0; color: var(--muted); }}
    .section {{
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
      box-shadow: var(--shadow);
      overflow: hidden;
    }}
    .section h2 {{ margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--line); font-size: 16px; }}
    .section-body {{ padding: 14px; }}

    .legend {{ display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }}
    .chip {{ border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; font-size: 12px; color: var(--muted); }}
    .chip b {{ color: var(--text); }}

    .graph-layout {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 12px;
      align-items: start;
    }}
    #cy {{ width: 100%; height: 560px; border-radius: 12px; background: #17182d; }}
    .detail-panel {{
      height: 560px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #17182d;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }}
    .detail-panel.hidden {{ display: none; }}
    .detail-head {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: #1b1c31;
    }}
    .detail-head h3 {{ margin: 0; font-size: 13px; }}
    .detail-close {{
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      border-radius: 6px;
      font-size: 11px;
      padding: 4px 8px;
      cursor: pointer;
    }}
    .detail-content {{
      padding: 10px 12px;
      overflow: auto;
      font-size: 12px;
      line-height: 1.45;
    }}
    .detail-content h4 {{ margin: 10px 0 4px; font-size: 12px; color: var(--muted); }}
    .detail-content ul {{ margin: 6px 0; padding-left: 16px; }}
    .detail-content li {{ margin-bottom: 4px; }}

    .cards-row {{
      display: grid;
      grid-template-columns: repeat(5, minmax(160px, 1fr));
      gap: 12px;
    }}
    .score-card {{
      background: #1b1c31;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      min-height: 118px;
    }}
    .score-card h3 {{ margin: 0 0 8px; font-size: 14px; }}
    .score-card .score {{ font-size: 26px; font-weight: 700; line-height: 1; margin-bottom: 8px; }}
    .score-card .card-delta {{ font-size: 12px; font-weight: 700; margin-left: 6px; }}
    .score-card .card-delta.delta-flat {{ font-size: 11px; font-weight: 600; }}
    .score-card p {{ margin: 0; font-size: 12px; color: var(--muted); line-height: 1.35; }}
    .score-card .card-guide {{ margin-top: 8px; font-size: 11px; font-weight: 600; }}
    .score-card.울창 {{ border-left: 6px solid var(--green); }}
    .score-card.성장 {{ border-left: 6px solid var(--yellow); }}
    .score-card.시듦 {{ border-left: 6px solid var(--red); }}

    .questions {{ margin: 0; padding-left: 20px; display: grid; gap: 8px; }}
    .questions li {{ line-height: 1.45; }}
    .question-text {{ line-height: 1.45; }}
    .question-action-hint {{ margin-top: 3px; font-size: 11px; color: #94a3b8; }}

    .tables {{ margin-top: 14px; display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(240px, 1fr)); }}
    .table-card {{ background: #1b1c31; border: 1px solid var(--line); border-radius: 12px; padding: 10px; }}
    .table-card h3 {{ margin: 0 0 8px; font-size: 13px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
    th, td {{ padding: 6px 4px; border-top: 1px solid #2f3154; text-align: left; }}
    th {{ color: var(--muted); border-top: none; font-weight: 600; }}

    .delta-wrap {{ display: grid; gap: 12px; }}
    .delta-pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 600;
      width: fit-content;
    }}
    .delta-grid {{ display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(220px, 1fr)); }}
    .delta-list {{ margin: 0; padding-left: 16px; display: grid; gap: 6px; font-size: 12px; }}
    .delta-flat {{ color: #94a3b8; }}
    .delta-up {{ color: var(--green); }}
    .delta-down {{ color: var(--red); }}
    .status-from {{ color: #94a3b8; }}
    .status-to {{ color: #f5f5f5; }}

    @media (max-width: 1180px) {{
      .graph-layout {{ grid-template-columns: 1fr; }}
      .detail-panel {{ width: 100%; height: 280px; }}
      .cards-row {{ grid-template-columns: repeat(2, minmax(160px, 1fr)); }}
      .tables {{ grid-template-columns: 1fr; }}
      .delta-grid {{ grid-template-columns: 1fr; }}
    }}
    @media (max-width: 760px) {{
      .header h1 {{ font-size: 28px; }}
      #cy {{ height: 440px; }}
      .cards-row {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <div class=\"wrap\">
    <header class=\"header\">
      <h1>System Garden</h1>
      <p>Generated at {payload['meta']['generated_at']}</p>
    </header>

    <section class=\"section\">
      <h2>섹션 A: 연결 지도 (Cytoscape force-directed graph)</h2>
      <div class=\"section-body\">
        <div class=\"legend\">
          <span class=\"chip\"><b>파란색</b> launchd 스케줄</span>
          <span class=\"chip\"><b>초록색</b> 에이전트</span>
          <span class=\"chip\"><b>주황색</b> 데이터</span>
          <span class=\"chip\"><b>보라색</b> 산출물</span>
          <span class=\"chip\">노드 {payload['meta']['node_count']}개 / 엣지 {payload['meta']['edge_count']}개</span>
        </div>
        <div class=\"graph-layout\">
          <div id=\"cy\"></div>
          <aside id=\"detailPanel\" class=\"detail-panel hidden\">
            <div class=\"detail-head\">
              <h3 id=\"detailTitle\">노드 디테일</h3>
              <button id=\"detailClose\" class=\"detail-close\" type=\"button\">닫기</button>
            </div>
            <div id=\"detailContent\" class=\"detail-content\">노드를 클릭하면 상세 정보가 표시됩니다.</div>
          </aside>
        </div>
      </div>
    </section>

    <section class=\"section\">
      <h2>섹션 B: 건강도 카드</h2>
      <div class=\"section-body\">
        <div class=\"cards-row\">{cards_html}</div>
        {detail_html}
      </div>
    </section>

    <section class=\"section\">
      <h2>섹션 C: 메타인지 질문</h2>
      <div class=\"section-body\">
        <ol class=\"questions\">{questions_html}</ol>
      </div>
    </section>

    {delta_html}
  </div>

  <script id=\"payload\" type=\"application/json\">{payload_json}</script>
  <script src=\"https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.4/cytoscape.min.js\"></script>
  <script>
    const payload = JSON.parse(document.getElementById("payload").textContent);
    const detailPanel = document.getElementById("detailPanel");
    const detailTitle = document.getElementById("detailTitle");
    const detailContent = document.getElementById("detailContent");
    const detailClose = document.getElementById("detailClose");
    const colorByKind = {{
      schedule: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim(),
      agent: getComputedStyle(document.documentElement).getPropertyValue("--agent").trim(),
      data: getComputedStyle(document.documentElement).getPropertyValue("--data").trim(),
      output: getComputedStyle(document.documentElement).getPropertyValue("--output").trim(),
    }};
    const nodeDetails = payload.node_details || {{}};
    const escapeHtml = (text) => String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    const renderNodeDetail = (detail) => {{
      if (!detail || !detail.kind) {{
        return "노드 정보를 찾을 수 없습니다.";
      }}
      if (detail.kind === "agent") {{
        const issues = (detail.recent_issues || []).map((item) =>
          `<li>${{escapeHtml(item.title)}} · ${{escapeHtml(item.status)}} · ${{escapeHtml(item.updated_at)}}</li>`
        ).join("") || "<li>최근 이슈 없음</li>";
        return `
          <div><b>이름</b>: ${{escapeHtml(detail.name)}}</div>
          <div><b>Status</b>: ${{escapeHtml(detail.status)}}</div>
          <div><b>Heartbeat interval</b>: ${{detail.heartbeat_interval ?? "-"}}</div>
          <div><b>실수 건수</b>: ${{detail.mistake_count ?? 0}}</div>
          <h4>최근 이슈 3건</h4>
          <ul>${{issues}}</ul>
        `;
      }}
      if (detail.kind === "data") {{
        return `
          <div><b>폴더명</b>: ${{escapeHtml(detail.folder)}}</div>
          <div><b>최신 파일 날짜</b>: ${{escapeHtml(detail.latest_file_date)}}</div>
          <div><b>파일 수</b>: ${{detail.file_count ?? 0}}</div>
        `;
      }}
      if (detail.kind === "schedule") {{
        return `
          <div><b>Job</b>: ${{escapeHtml(detail.job)}}</div>
          <div><b>마지막 성공</b>: ${{escapeHtml(detail.last_success)}}</div>
          <div><b>마지막 실패</b>: ${{escapeHtml(detail.last_failure)}}</div>
          <div><b>연속 실패 수</b>: ${{detail.consecutive_failures ?? 0}}</div>
        `;
      }}
      if (detail.kind === "output") {{
        return `
          <div><b>산출물</b>: ${{escapeHtml(detail.artifact)}}</div>
          <div><b>최신 파일명</b>: ${{escapeHtml(detail.latest_file)}}</div>
          <div><b>날짜</b>: ${{escapeHtml(detail.latest_file_date)}}</div>
        `;
      }}
      return "지원되지 않는 노드 유형입니다.";
    }};

    const hideDetailPanel = () => {{
      detailPanel.classList.add("hidden");
    }};

    const showDetailPanel = (nodeId, nodeLabel) => {{
      const detail = nodeDetails[nodeId];
      detailTitle.textContent = nodeLabel ? `노드 디테일 · ${{nodeLabel}}` : "노드 디테일";
      if (!detail) {{
        detailContent.innerHTML = '<div>이 노드에 대한 상세 정보가 없습니다. ID: ' + nodeId + '</div>';
        detailPanel.classList.remove("hidden");
        return;
      }}
      detailContent.innerHTML = renderNodeDetail(detail);
      detailPanel.classList.remove("hidden");
    }};

    detailClose.addEventListener("click", hideDetailPanel);

    const cy = cytoscape({{
      container: document.getElementById("cy"),
      elements: payload.graph,
      style: [
        {{
          selector: "node",
          style: {{
            "background-color": (ele) => colorByKind[ele.data("kind")] || "#94a3b8",
            "label": "data(label)",
            "color": "#eceff9",
            "font-size": 12,
            "text-wrap": "wrap",
            "text-max-width": 110,
            "text-valign": "center",
            "text-halign": "center",
            "width": 50,
            "height": 50,
            "text-outline-width": 3,
            "text-outline-color": "#17182d",
            "transition-property": "opacity, width, height",
            "transition-duration": "0.2s"
          }}
        }},
        {{
          selector: "edge",
          style: {{
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "line-color": "#8ea0c7",
            "target-arrow-color": "#8ea0c7",
            "width": 1.5,
            "opacity": 0.85,
            "arrow-scale": 0.75,
            "transition-property": "opacity, line-color, target-arrow-color, width",
            "transition-duration": "0.2s"
          }}
        }},
        {{
          selector: ".dimmed",
          style: {{
            "opacity": 0.2
          }}
        }},
        {{
          selector: "node.highlighted",
          style: {{
            "width": 56,
            "height": 56,
            "border-width": 2,
            "border-color": "#f8fafc",
            "opacity": 1
          }}
        }},
        {{
          selector: "edge.highlighted",
          style: {{
            "width": 2.6,
            "line-color": "#f8fafc",
            "target-arrow-color": "#f8fafc",
            "opacity": 1
          }}
        }}
      ],
      layout: {{
        name: "cose",
        animate: false,
        padding: 28,
        idealEdgeLength: 105,
        nodeRepulsion: 9200,
        edgeElasticity: 90,
        gravity: 0.45,
      }}
    }});

    const clearImpact = () => {{
      cy.elements().removeClass("dimmed highlighted");
    }};

    const applyImpact = (node) => {{
      clearImpact();
      const highlight = node.closedNeighborhood().union(node.connectedEdges());
      cy.elements().difference(highlight).addClass("dimmed");
      highlight.addClass("highlighted");
    }};

    cy.on("mouseover", "node", (event) => {{
      applyImpact(event.target);
    }});

    cy.on("mouseout", "node", () => {{
      clearImpact();
    }});

    cy.on("tap", "node", (event) => {{
      const node = event.target;
      showDetailPanel(node.id(), node.data("label"));
    }});

    cy.on("tap", (event) => {{
      if (event.target === cy) {{
        hideDetailPanel();
      }}
    }});
  </script>
</body>
</html>
"""


def main() -> int:
    prev_payload_raw = read_json(PREV_PAYLOAD_PATH, None)
    prev_payload = prev_payload_raw if isinstance(prev_payload_raw, dict) else None
    payload = build_dashboard(prev_payload)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(render_html(payload), encoding="utf-8")
    PREV_PAYLOAD_PATH.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
            default=lambda o: o.isoformat() if isinstance(o, datetime) else str(o),
        ),
        encoding="utf-8",
    )

    print(f"[OK] generated: {OUTPUT_PATH}")
    print(f"      nodes={payload['meta']['node_count']} edges={payload['meta']['edge_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
