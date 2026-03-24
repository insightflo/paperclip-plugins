#!/usr/bin/env python3
"""Detect and cancel stale queued Paperclip heartbeat runs.

Stale means:
- heartbeat run status is `queued`
- the linked issue already reached `done` or `cancelled`

This script is intended as an external mitigation when runtime changes are
not allowed. It uses the local_trusted Paperclip API directly.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_API = "http://localhost:3100/api"
DEFAULT_COMPANY_ID = "240b0239-36cb-44b8-833f-663c2b0ec783"
TERMINAL_ISSUE_STATUSES = {"done", "cancelled"}


@dataclass(frozen=True)
class StaleQueuedRun:
    run_id: str
    agent_id: str
    agent_name: str
    issue_id: str
    issue_identifier: str
    issue_status: str
    issue_title: str
    created_at: str


def api_request(api_base: str, path: str, *, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{api_base}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_issues(api_base: str, company_id: str) -> dict[str, dict[str, Any]]:
    issues = api_request(api_base, f"/companies/{company_id}/issues")
    return {issue["id"]: issue for issue in issues}


def load_live_runs(api_base: str, company_id: str) -> list[dict[str, Any]]:
    return api_request(api_base, f"/companies/{company_id}/live-runs")


def find_stale_queued_runs(issues_by_id: dict[str, dict[str, Any]], live_runs: list[dict[str, Any]]) -> list[StaleQueuedRun]:
    stale_runs: list[StaleQueuedRun] = []
    for run in live_runs:
        if run.get("status") != "queued":
            continue
        issue_id = run.get("issueId")
        if not issue_id:
            continue
        issue = issues_by_id.get(issue_id)
        if not issue:
            continue
        issue_status = str(issue.get("status") or "")
        if issue_status not in TERMINAL_ISSUE_STATUSES:
            continue
        stale_runs.append(
            StaleQueuedRun(
                run_id=str(run["id"]),
                agent_id=str(run["agentId"]),
                agent_name=str(run.get("agentName") or run["agentId"]),
                issue_id=issue_id,
                issue_identifier=str(issue.get("identifier") or issue_id),
                issue_status=issue_status,
                issue_title=str(issue.get("title") or ""),
                created_at=str(run.get("createdAt") or ""),
            )
        )
    stale_runs.sort(key=lambda item: item.created_at)
    return stale_runs


def cancel_run(api_base: str, run_id: str) -> dict[str, Any]:
    return api_request(api_base, f"/heartbeat-runs/{run_id}/cancel", method="POST")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default=DEFAULT_API, help="Paperclip API base URL")
    parser.add_argument("--company-id", default=DEFAULT_COMPANY_ID, help="Paperclip company ID")
    parser.add_argument("--apply", action="store_true", help="Actually cancel stale queued runs")
    parser.add_argument(
        "--fail-on-found",
        action="store_true",
        help="Exit 1 when stale queued runs are detected",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        issues_by_id = load_issues(args.api, args.company_id)
        live_runs = load_live_runs(args.api, args.company_id)
    except urllib.error.URLError as exc:
        print(f"ERROR api_unreachable: {exc}", file=sys.stderr)
        return 2
    except urllib.error.HTTPError as exc:
        print(f"ERROR api_http_{exc.code}: {exc.reason}", file=sys.stderr)
        return 2

    stale_runs = find_stale_queued_runs(issues_by_id, live_runs)
    live_queued_count = sum(1 for run in live_runs if run.get("status") == "queued")

    print(
        json.dumps(
            {
                "liveQueuedRuns": live_queued_count,
                "staleQueuedRuns": len(stale_runs),
                "apply": args.apply,
                "runs": [
                    {
                        "runId": run.run_id,
                        "agentId": run.agent_id,
                        "agentName": run.agent_name,
                        "issueId": run.issue_id,
                        "issueIdentifier": run.issue_identifier,
                        "issueStatus": run.issue_status,
                        "issueTitle": run.issue_title,
                        "createdAt": run.created_at,
                    }
                    for run in stale_runs
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if not args.apply:
        return 1 if stale_runs and args.fail_on_found else 0

    cancelled = 0
    failed: list[dict[str, str]] = []
    for run in stale_runs:
        try:
            result = cancel_run(args.api, run.run_id)
        except urllib.error.HTTPError as exc:
            failed.append({"runId": run.run_id, "error": f"http_{exc.code}:{exc.reason}"})
            continue
        except urllib.error.URLError as exc:
            failed.append({"runId": run.run_id, "error": str(exc)})
            continue

        if isinstance(result, dict) and result.get("status") == "cancelled":
            cancelled += 1
        else:
            failed.append({"runId": run.run_id, "error": f"unexpected_response:{result!r}"})

    print(
        json.dumps(
            {
                "cancelled": cancelled,
                "failed": failed,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
