#!/usr/bin/env python3
"""
[파일 목적] Paperclip 이슈 위생 관리
[주요 흐름]
  1. 하위 이슈 전부 done인데 상위가 in_progress → 자동 done 처리
  2. todo 상태에서 24시간 이상 방치 + 이미 결과 존재 → 자동 done 처리
  3. in_progress 상태에서 2시간 이상 멈춤 → 텔레그램 경고
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
KST = ZoneInfo("Asia/Seoul")

PAPERCLIP_API = "http://localhost:3100/api"
PAPERCLIP_COMPANY_ID = os.environ.get(
    "PAPERCLIP_COMPANY_ID", "9045933e-40ca-4a08-8dad-38a8a054bdf3"
)


def _now_kst() -> datetime:
    return datetime.now(KST)


def _api_get(path: str):
    try:
        url = f"{PAPERCLIP_API}{path}"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _api_post(path: str, data: dict) -> dict | None:
    try:
        url = f"{PAPERCLIP_API}{path}"
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _api_patch(path: str, data: dict) -> bool:
    try:
        url = f"{PAPERCLIP_API}{path}"
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload, headers={"Content-Type": "application/json"}, method="PATCH"
        )
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception:
        return False


def _send_telegram(msg: str) -> bool:
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
    except ImportError:
        pass

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": msg}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception:
        return False


def main() -> int:
    issues = _api_get(f"/companies/{PAPERCLIP_COMPANY_ID}/issues")
    if issues is None:
        print("SKIP — Paperclip 연결 불가")
        return 0  # Paperclip 꺼져있어도 healthcheck 실패로 안 봄

    by_id = {i["id"]: i for i in issues}
    actions = []

    # 1. 하위 전부 done → 상위 자동 done
    parents_with_children: dict[str, list[dict]] = {}
    for issue in issues:
        pid = issue.get("parentId")
        if pid:
            if pid not in parents_with_children:
                parents_with_children[pid] = []
            parents_with_children[pid].append(issue)

    for parent_id, children in parents_with_children.items():
        parent = by_id.get(parent_id)
        if not parent:
            continue
        if parent["status"] in ("done", "cancelled"):
            continue
        if all(c["status"] == "done" for c in children):
            ok = _api_patch(f"/issues/{parent_id}", {"status": "done"})
            if ok:
                actions.append(f"{parent['identifier']} → done (하위 {len(children)}건 전부 완료)")

    # 2. 완료/취소된 이슈에 activeRun이 running → 정리
    for issue in issues:
        if issue["status"] not in ("done", "cancelled"):
            continue
        active_run = issue.get("activeRun")
        if not isinstance(active_run, dict) or active_run.get("status") != "running":
            continue
        if issue["status"] == "done":
            # done인데 run 돌고 있으면 → in_progress로 되돌림
            ok = _api_patch(f"/issues/{issue['id']}", {"status": "in_progress"})
            if ok:
                actions.append(f"{issue['identifier']} → in_progress (done인데 run이 running)")
        elif issue["status"] == "cancelled":
            # cancelled인데 run 돌고 있으면 → 경고 + 텔레그램 알림
            _send_telegram(f"[🚨 좀비 run] {issue.get('identifier','?')} cancelled인데 activeRun running. 수동 중지 필요.")
            actions.append(f"{issue.get('identifier','?')} cancelled + running run 감지 (좀비)")

    # 2b. 메타 이슈 가비지 컬렉션
    # [보고], [배포 승인], [라우팅 요청], [blocked 복구] 등 자동 생성된 메타 이슈가
    # 참조하는 원본 이슈가 이미 해결됐으면 자동 done/cancelled 처리.
    import re
    META_PREFIXES = ("[보고]", "[배포 승인]", "[라우팅 요청]", "[blocked 복구]", "[검수]", "[긴급]")
    ident_map = {i.get("identifier", ""): i for i in issues if i.get("identifier")}

    for issue in issues:
        if issue["status"] in ("done", "cancelled"):
            continue
        title = issue.get("title", "")
        if not any(title.startswith(p) for p in META_PREFIXES):
            continue

        should_close = False
        close_reason = ""

        # [라우팅 요청] — 미할당 이슈가 더 이상 없으면 닫기
        if title.startswith("[라우팅 요청]"):
            unassigned = [i for i in issues if i["status"] not in ("done", "cancelled") and not i.get("assigneeAgentId")]
            if not unassigned:
                should_close = True
                close_reason = "미할당 이슈 0건, 자동 종료"

        # [blocked 복구] — 원본 이슈가 더 이상 blocked가 아니면 닫기
        elif title.startswith("[blocked 복구]"):
            ref_match = re.search(r"(AID|ALP)-\d+", title)
            if ref_match:
                ref_issue = ident_map.get(ref_match.group())
                if ref_issue and ref_issue["status"] != "blocked":
                    should_close = True
                    close_reason = f"원본 {ref_match.group()} 상태: {ref_issue['status']}"

        # [보고], [배포 승인], [검수] — 참조 이슈가 done이면 닫기
        elif any(title.startswith(p) for p in ("[보고]", "[배포 승인]", "[검수]")):
            ref_match = re.search(r"(AID|ALP)-\d+", title)
            if ref_match:
                ref_issue = ident_map.get(ref_match.group())
                if ref_issue and ref_issue["status"] in ("done", "cancelled"):
                    should_close = True
                    close_reason = f"원본 {ref_match.group()} 이미 {ref_issue['status']}"

        # [긴급] — 7일 이상 된 긴급 이슈는 자동 종료
        elif title.startswith("[긴급]"):
            created = issue.get("createdAt", "")
            try:
                created_dt = datetime.fromisoformat(created)
                if (_now_kst() - created_dt).days >= 7:
                    should_close = True
                    close_reason = "7일 경과 긴급 이슈 자동 종료"
            except (ValueError, TypeError):
                pass

        if should_close:
            ok = _api_patch(f"/issues/{issue['id']}", {"status": "cancelled"})
            if ok:
                _api_post(f"/issues/{issue['id']}/comments", {
                    "body": f"[자동 종료] {close_reason}"
                })
                actions.append(f"{issue.get('identifier', '?')} → cancelled ({close_reason})")

    # 3. blocked → CEO에게 판단 위임
    CEO_MAP = {
        "9045933e-40ca-4a08-8dad-38a8a054bdf3": "e21cef2e-425e-48a8-9231-b7d02eba332b",  # 가즈아 → 제갈량
        "240b0239-36cb-44b8-833f-663c2b0ec783": "58ac3d48-faba-4921-acc6-de0b76e04591",  # 개수라발발타 → 닉 퓨리
    }
    CEO_ID = CEO_MAP.get(PAPERCLIP_COMPANY_ID, "e21cef2e-425e-48a8-9231-b7d02eba332b")
    for issue in issues:
        if issue["status"] != "blocked":
            continue
        # 이미 제갈량에게 위임된 이슈가 있는지 확인 (중복 방지)
        blocked_title = issue.get("title", "")
        already_delegated = any(
            f"[blocked 복구]" in i.get("title", "") and blocked_title in i.get("description", "")
            for i in issues if i["status"] in ("todo", "in_progress")
        )
        if already_delegated:
            continue

        # 제갈량에게 복구 이슈 생성
        delegate_data = {
            "title": f"[blocked 복구] {issue['identifier']} {blocked_title[:40]}",
            "description": (
                f"팀원이 작업 중 blocked 상태가 됐습니다. 원인을 파악하고 해결해주세요.\n\n"
                f"## blocked 이슈\n"
                f"- ID: {issue['identifier']}\n"
                f"- 제목: {blocked_title}\n"
                f"- 담당: {issue.get('assigneeAgentId', '?')[:12]}\n"
                f"- 시각: {issue.get('updatedAt', '?')}\n\n"
                f"## 기대 행동\n"
                f"1. blocked 원인 파악 (에이전트 최근 Run 로그 확인)\n"
                f"2. 원인 해결 (스크립트 수정, 환경 문제 등)\n"
                f"3. 원본 이슈를 todo로 되돌림:\n"
                f"   curl -s -X PATCH http://localhost:3100/api/issues/{issue['id']} "
                f"-H 'Content-Type: application/json' -d '{{\"status\":\"todo\"}}'\n"
                f"4. 에이전트가 다시 처리하도록 heartbeat 트리거"
            ),
            "status": "todo",
            "priority": "critical",
            "assigneeAgentId": CEO_ID,
        }
        result = _api_post(f"/companies/{PAPERCLIP_COMPANY_ID}/issues", delegate_data)
        if result:
            ident = result.get("identifier", "?")
            actions.append(f"{issue['identifier']} blocked → {ident} 제갈량에게 위임")
            _send_telegram(f"[🚧 blocked] {issue['identifier']} {blocked_title[:30]}\n→ 제갈량에게 복구 위임 ({ident})")

    # 4. 미할당 이슈 → 자동 할당
    # [유지보수] 이슈는 CEO 경유 없이 바로 크로스 중계 대기 (step 8에서 처리)
    # 그 외 미할당은 CEO에게 자동 할당
    for issue in issues:
        if issue["status"] in ("done", "cancelled"):
            continue
        if issue.get("assigneeAgentId"):
            continue  # 이미 할당됨
        title = issue.get("title", "")
        if "[유지보수]" in title:
            continue  # 유지보수 이슈는 step 8에서 크로스 중계
        # 일반 미할당 이슈 → CEO에게 자동 할당
        ok = _api_patch(f"/issues/{issue['id']}", {"assigneeAgentId": CEO_ID})
        if ok:
            _api_post(f"/issues/{issue['id']}/comments", {
                "body": f"[자동 할당] 미할당 이슈 → CEO에게 자동 라우팅됨. 적절한 담당자에게 재할당 필요."
            })
            actions.append(f"{issue.get('identifier', '?')} 미할당 → CEO 자동 할당")

    # 5. done 게이트키핑 — 감찰관 외 에이전트가 done으로 바꾼 이슈 되돌림
    INSPECTOR_MAP = {
        "9045933e-40ca-4a08-8dad-38a8a054bdf3": "4d6492d4-9558-498e-b674-93a625718f23",  # 가즈아 → 포청천
        "240b0239-36cb-44b8-833f-663c2b0ec783": "b0e53e09-ac5d-43f2-a71b-7e69095d60ac",  # 개수라발발타 → 비전
    }
    INSPECTOR_ID = INSPECTOR_MAP.get(PAPERCLIP_COMPANY_ID, "4d6492d4-9558-498e-b674-93a625718f23")
    EXEMPT_KEYWORDS = ["[보고]", "[blocked 복구]", "[자가개선]", "[검수]", "[테스트]", "[고유업무]", "[라우팅 요청]"]
    now = _now_kst()

    for issue in issues:
        if issue["status"] != "done":
            continue
        # 오늘 생성된 이슈만 (과거 이슈는 건드리지 않음)
        created = issue.get("createdAt", "")
        try:
            created_dt = datetime.fromisoformat(created)
            if created_dt.date() != now.date():
                continue
        except (ValueError, TypeError):
            continue
        # 예외 이슈
        title = issue.get("title", "")
        if any(kw in title for kw in EXEMPT_KEYWORDS):
            continue
        # 감찰관이 담당한 이슈는 본인이 done 가능
        if issue.get("assigneeAgentId") == INSPECTOR_ID:
            continue
        # 감찰관이 검수 코멘트를 남겼는지 확인 (코멘트는 별도 API 조회)
        comments = _api_get(f"/issues/{issue['id']}/comments") or []
        inspector_approved = any(
            any(kw in (c.get("body") or c.get("content") or "") for kw in ("검수 통과", "[외부 검수 완료]"))
            for c in comments
        )
        if not inspector_approved:
            ok = _api_patch(f"/issues/{issue['id']}", {"status": "in_review"})
            if ok:
                actions.append(f"{issue['identifier']} done → in_review (감찰관 검수 미통과)")

    # 5. in_review 이슈 처리 (2단계)
    for issue in issues:
        if issue["status"] != "in_review":
            continue
        ident = issue.get("identifier", "")

        # 5a. 감찰관 검수 이슈가 이미 done → 원본도 done (409 우회)
        inspector_done = any(
            "[검수]" in i.get("title", "") and ident in i.get("title", "")
            and i["status"] == "done"
            for i in issues
        )
        if inspector_done:
            ok = _api_patch(f"/issues/{issue['id']}", {"status": "done"})
            if ok:
                actions.append(f"{ident} → done (감찰관 검수 완료, 코드 대행)")
            continue

        # 5b. 검수 이슈가 아직 없으면 생성
        already_queued = any(
            "[검수]" in i.get("title", "") and ident in i.get("title", "")
            for i in issues if i["status"] in ("todo", "in_progress")
        )
        if already_queued:
            continue
        result = _api_post(f"/companies/{PAPERCLIP_COMPANY_ID}/issues", {
            "title": f"[검수] {ident} {issue['title'][:30]}",
            "description": f"in_review 이슈를 검수해주세요.\n원본: {ident}\n담당: {issue.get('assigneeAgentId', '?')[:12]}",
            "assigneeAgentId": INSPECTOR_ID,
            "status": "todo",
            "priority": "high",
        })
        if result:
            actions.append(f"{ident} → 감찰관 검수 이슈 생성")

    # 6. in_progress 2시간 이상 멈춤 → 경고
    stuck = []
    for issue in issues:
        if issue["status"] != "in_progress":
            continue
        updated = issue.get("updatedAt", "")
        try:
            updated_dt = datetime.fromisoformat(updated)
            if (_now_kst() - updated_dt).total_seconds() > 2 * 3600:
                stuck.append(f"{issue['identifier']} {issue['title'][:40]}")
        except (ValueError, TypeError):
            continue

    if stuck:
        msg = f"[⚠️ Paperclip] {len(stuck)}건 이슈 2시간+ 멈춤:\n" + "\n".join(f"• {s}" for s in stuck[:5])
        _send_telegram(msg)
        actions.append(f"경고: {len(stuck)}건 멈춤")

    # 7. 실패 패턴 → learnings 파일에 자동 기록
    AGENT_FILE_MAP = {
        "e21cef2e": "ceo",
        "f5dc3d8a": "sherlock",
        "1836aba4": "harry",
        "5a4cd481": "conan",
        "1aba652f": "scrooge",
        "f697ea51": "doraemon",
        "ba1cb53d": "johnwick",
        "4d6492d4": "inspector",
    }
    learnings_dir = ROOT / ".paperclip" / "agents" / "learnings"
    today_str = now.strftime("%Y-%m-%d")

    for action_msg in actions:
        # done → in_review 되돌림 = 실수 패턴
        if "done → in_review" in action_msg:
            # 이슈 identifier에서 에이전트 찾기
            ident = action_msg.split()[0]
            matched_issue = next((i for i in issues if i.get("identifier") == ident), None)
            if matched_issue:
                aid = (matched_issue.get("assigneeAgentId") or "")[:8]
                agent_file = AGENT_FILE_MAP.get(aid)
                if agent_file:
                    learnings_path = learnings_dir / f"{agent_file}.md"
                    if learnings_path.exists():
                        entry = f"- {today_str}: {ident} 산출물 없이 done 시도 → 감찰관에 의해 되돌림. **산출물 생성 후 in_review로 전환할 것.**\n"
                        content = learnings_path.read_text()
                        if entry.strip() not in content:
                            # "## 실수 기록" 섹션 뒤에 추가
                            content = content.replace("## 실수 기록\n", f"## 실수 기록\n{entry}", 1)
                            learnings_path.write_text(content)

    # 8. 크로스 컴퍼니 유지보수 중계
    # 가즈아의 [유지보수] 이슈를 감지하여 개수라발발타 스파이더맨에게 자동 할당.
    # 스파이더맨 heartbeat에 의존하지 않고 코드가 30분마다 강제 감지.
    GAZUA_CID = "9045933e-40ca-4a08-8dad-38a8a054bdf3"
    GAESURA_CID = "240b0239-36cb-44b8-833f-663c2b0ec783"
    SPIDERMAN_ID = "c3df8f39-aa06-45b0-be1f-36949314b21a"
    MAINTENANCE_LABEL_ID = "150bfab9-225d-479c-9109-dc93710f6cac"

    if PAPERCLIP_COMPANY_ID == GAZUA_CID:
        for issue in issues:
            if issue["status"] in ("done", "cancelled"):
                continue
            title = issue.get("title", "")
            if "[유지보수]" not in title:
                continue
            # 개수라발발타에 이미 중계된 이슈가 있는지 확인
            gaesura_issues = _api_get(f"/companies/{GAESURA_CID}/issues") or []
            ref_ident = issue.get("identifier", "")
            already_relayed = any(
                ref_ident in (i.get("title", "") + (i.get("description") or ""))
                and i["status"] not in ("done", "cancelled")
                for i in gaesura_issues
            )
            if already_relayed:
                continue
            # 개수라발발타에 유지보수 이슈 생성
            relay_data = {
                "title": f"[크로스 유지보수] {ref_ident} {title[:40]}",
                "description": (
                    f"가즈아에서 유지보수 요청이 들어왔습니다.\n\n"
                    f"## 원본 이슈\n"
                    f"- 회사: 가즈아\n"
                    f"- ID: {ref_ident}\n"
                    f"- 제목: {title}\n"
                    f"- 내용: {(issue.get('description') or '')[:300]}\n\n"
                    f"## 작업 범위\n"
                    f"- 코드베이스: /Users/kwak/Projects/ai/alpha-prime-personal/\n"
                    f"- 완료 후 가즈아 이슈에 코멘트 + in_review 전환"
                ),
                "status": "todo",
                "priority": "high",
                "assigneeAgentId": SPIDERMAN_ID,
            }
            result = _api_post(f"/companies/{GAESURA_CID}/issues", relay_data)
            if result:
                relay_ident = result.get("identifier", "?")
                # 가즈아 원본 이슈에도 중계 사실 코멘트
                _api_post(f"/issues/{issue['id']}/comments", {
                    "body": f"[자동 중계] 개수라발발타 스파이더맨에게 유지보수 할당됨 ({relay_ident})"
                })
                actions.append(f"{ref_ident} → {relay_ident} 크로스 유지보수 중계")

    if actions:
        print(f"CLEANED {len(actions)} — " + "; ".join(actions))
    else:
        print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
