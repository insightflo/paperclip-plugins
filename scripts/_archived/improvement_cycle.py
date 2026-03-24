#!/usr/bin/env python3
"""
[파일 목적] 자가 개선 사이클 — 프로젝트 목표 대비 부족한 점을 찾아 개선안 도출
[주요 흐름]
  1. 결과 측정: 최근 7일 실적 데이터 수집
  2. 갭 분석: 목표 대비 부족한 영역 식별
  3. 개선안 도출: 구체적 액션 아이템 생성
  4. Paperclip 이슈로 자동 등록 (해당 에이전트 배정)
  5. 텔레그램 주간 개선 보고
[외부 연결] logs/jobs/, data/signals/, portfolio/, reports/, Paperclip API
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
KST = ZoneInfo("Asia/Seoul")
VENV_PYTHON = str(ROOT / "venv" / "bin" / "python")
AUTOMATION_DIR = ROOT / "scripts" / "automation"
if str(AUTOMATION_DIR) not in sys.path:
    sys.path.insert(0, str(AUTOMATION_DIR))

from report_quality import validate_blog_report

# Paperclip 설정
PAPERCLIP_API = "http://localhost:3100/api"
PAPERCLIP_COMPANY_ID = "9045933e-40ca-4a08-8dad-38a8a054bdf3"
AGENTS = {
    "doraemon": "f697ea51-ecb2-4629-96b1-671a99f2f1e3",
    "conan": "5a4cd481-92b2-4d4c-9cb4-b21291398a08",
    "t800": "ba1cb53d-25aa-44e4-abe8-a3548e8e6def",
    "harry": "1836aba4-98a1-4ce9-be73-2816d88812ec",
    "scrooge": "1aba652f-bee7-4173-9750-11849085f8bf",
    "ceo": "e21cef2e-425e-48a8-9231-b7d02eba332b",
}

# 업무 영역 라벨 (area → label ID)
AREA_LABELS = {
    "gate_too_loose": "51bf2ddf-404a-47a8-a913-8136d16a8991",      # 시그널분석
    "catalyst_noise": "51bf2ddf-404a-47a8-a913-8136d16a8991",      # 시그널분석
    "sl_too_tight": "9c8eaeef-7131-471b-a722-887512e9529d",        # 포트폴리오
    "tp_too_high": "9c8eaeef-7131-471b-a722-887512e9529d",         # 포트폴리오
    "portfolio_risk": "9c8eaeef-7131-471b-a722-887512e9529d",       # 포트폴리오
    "data_reliability": "ea84f697-0c2a-4c36-9916-2c1ea965300e",    # 데이터수집
    "report_incomplete": "ffe7f138-3e5e-44d2-a48f-44ebe7b8dd4a",   # 리포팅
    "report_missing": "ffe7f138-3e5e-44d2-a48f-44ebe7b8dd4a",      # 리포팅
    "report_structure_incomplete": "ffe7f138-3e5e-44d2-a48f-44ebe7b8dd4a",  # 리포팅
    "strategy_incomplete": "c13b3b8c-a782-42d3-80fd-5cad5015fd8d",  # 전략매매
}


def _now_kst() -> datetime:
    return datetime.now(KST)


def _load_json(path: Path, default=None):
    if not path.exists():
        return default if default is not None else {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default if default is not None else {}


# ===========================================================================
# 1. 결과 측정
# ===========================================================================

def measure_sl_tp_accuracy() -> dict:
    """SL/TP 적중률 — 과도한 손절 / 과도한 목표가 비율."""
    watchlist = _load_json(ROOT / "portfolio" / "watchlist.json", {})
    items = watchlist.get("watchlist", [])

    sl_breached_then_recovered = 0  # SL 이탈 후 반등 (과도한 손절)
    tp_never_reached = 0            # TP 미도달 (과도한 목표)
    total_with_sl = 0
    total_with_tp = 0
    issues = []

    for item in items:
        ticker = item.get("ticker", "")
        name = item.get("name", "")
        sl = item.get("sl_target")
        tp = item.get("tp_target")
        current = item.get("current_price")
        momentum = item.get("momentum_status", "")
        narrative = item.get("narrative_status", "")

        if sl and current:
            total_with_sl += 1
            try:
                sl_val = float(sl)
                cur_val = float(current)
                # SL 이탈 종목인데 narrative가 아직 Valid = 과도한 손절 가능성
                if cur_val < sl_val and narrative == "Valid" and momentum not in ("Dead",):
                    sl_breached_then_recovered += 1
                    issues.append({
                        "area": "sl_too_tight",
                        "ticker": ticker,
                        "name": name,
                        "detail": f"SL {sl} 이탈이나 서사 Valid — SL 여유폭 부족 가능",
                        "agent": "scrooge",
                    })
            except (ValueError, TypeError):
                pass

        if tp and current and tp != "N/A":
            total_with_tp += 1
            try:
                tp_val = float(tp)
                cur_val = float(current)
                # 현재가가 TP의 50% 미만이면 목표가 과도
                if cur_val < tp_val * 0.5 and momentum in ("Dead", "Weakening"):
                    tp_never_reached += 1
                    issues.append({
                        "area": "tp_too_high",
                        "ticker": ticker,
                        "name": name,
                        "detail": f"TP {tp} 대비 현재가 {current} — 목표가 비현실적 가능성",
                        "agent": "scrooge",
                    })
            except (ValueError, TypeError):
                pass

    return {
        "sl_breach_valid_count": sl_breached_then_recovered,
        "tp_unrealistic_count": tp_never_reached,
        "total_with_sl": total_with_sl,
        "total_with_tp": total_with_tp,
        "issues": issues,
    }


def measure_signal_coverage() -> dict:
    """시그널 커버리지 — 중요 이벤트를 놓치고 있는 영역."""
    delta = _load_json(ROOT / "reports" / ".meta" / "delta_tracker.json")
    quality = _load_json(ROOT / "logs" / "jobs" / "signal_quality.json")

    issues = []

    # Gate가 항상 PASS = 필터 역할 못함
    fp_rate = quality.get("false_positive_rate", 0)
    if fp_rate > 30:
        issues.append({
            "area": "gate_too_loose",
            "detail": f"Gate 오탐율 {fp_rate}% — 필터 역할 부족. daily gate sns_high_impact 임계값 강화 검토",
            "agent": "conan",
        })

    # catalyst_events가 과도하게 많으면 노이즈
    catalyst_count = len(delta.get("catalyst_events", []))
    if catalyst_count > 30:
        issues.append({
            "area": "catalyst_noise",
            "detail": f"catalyst_events {catalyst_count}건 — 노이즈 필터링 강화 필요",
            "agent": "conan",
        })

    # holdings danger 종목이 5개 이상이면 전략 리밸런싱 필요
    danger_count = delta.get("holdings_delta", {}).get("danger_count", 0)
    if danger_count >= 5:
        issues.append({
            "area": "portfolio_risk",
            "detail": f"Danger 종목 {danger_count}개 — 포트폴리오 리밸런싱 또는 SL 기준 재검토",
            "agent": "scrooge",
        })

    return {
        "gate_fp_rate": fp_rate,
        "catalyst_count": catalyst_count,
        "danger_count": danger_count,
        "issues": issues,
    }


def measure_data_completeness() -> dict:
    """데이터 수집 완성도 — 빠지는 소스나 지연이 반복되는 패턴."""
    registry = _load_json(ROOT / "logs" / "jobs" / "registry.json")
    issues = []

    for job_name, info in registry.items():
        if job_name.startswith("_"):
            continue
        consecutive_failures = info.get("consecutive_failures", 0)
        if consecutive_failures >= 2:
            issues.append({
                "area": "data_reliability",
                "detail": f"{job_name} 연속 실패 {consecutive_failures}회 — 재시도 로직 또는 대체 소스 검토",
                "agent": "doraemon",
            })

    return {
        "total_jobs": len([k for k in registry if not k.startswith("_")]),
        "failing_jobs": len(issues),
        "issues": issues,
    }


def measure_report_quality() -> dict:
    """리포트 품질 — 필수 섹션 누락, 발행 지연."""
    today = _now_kst().strftime("%Y-%m-%d")
    blog_path = ROOT / "reports" / "blog" / f"Public_Market_Report_{today}.md"
    strategy_path = ROOT / "reports" / "strategy" / f"buy_sell_strategy_{today.replace('-', '')}.md"
    issues = []

    # 블로그 리포트 품질 체크: 자동화 게이트와 동일 기준 + 구조 섹션 별칭 허용
    if blog_path.exists():
        content = blog_path.read_text(encoding="utf-8")
        validation = validate_blog_report(content)

        if not validation["valid"]:
            missing_labels = {
                "pre_market_futures_analysis": "선물 시장 해석",
                "us_regime": "US 레짐",
                "kr_regime": "KR 레짐",
                "us_strategy": "US 전략",
                "kr_strategy": "KR 전략",
                "expert_voices_min_2": "전문가 분석 최소 2개",
                "top_picks_min_5": "옥석 종목 최소 5개",
                "source_markers_min_2": "출처 표기 최소 2개",
            }
            missing = [missing_labels.get(key, key) for key in validation["missing"]]
            issues.append({
                "area": "report_incomplete",
                "detail": f"블로그 리포트 섹션 누락: {', '.join(missing)}",
                "agent": "harry",
            })

        # improvement_cycle 전용 구조 체크
        # - 템플릿 문구 변경(예: Top Picks/Action Plan)에도 오탐이 나지 않게 별칭 허용
        section_aliases = {
            "섹터 로테이션": ["섹터 로테이션", "Sector Rotation", "Market Regime", "레짐 분석"],
            "보유 종목": ["보유 종목", "오늘의 옥석", "Top Picks", "모니터링 리스트", "Danger Assets"],
            "전망": ["전망", "투자 전략", "Action Plan", "총평"],
        }
        missing_structure = [
            name for name, aliases in section_aliases.items() if not any(alias in content for alias in aliases)
        ]
        if missing_structure:
            issues.append({
                "area": "report_structure_incomplete",
                "detail": f"블로그 구조 섹션 누락: {', '.join(missing_structure)}",
                "agent": "harry",
            })
    else:
        issues.append({
            "area": "report_missing",
            "detail": f"오늘({today}) 블로그 리포트 미생성",
            "agent": "harry",
        })

    # 전략 리포트 체크
    if strategy_path.exists():
        content = strategy_path.read_text(encoding="utf-8")
        required = ["레짐 판정", "매도 전략", "매수 전략", "보유 유지", "리스크 관리"]
        missing = [s for s in required if s not in content]
        if missing:
            issues.append({
                "area": "strategy_incomplete",
                "detail": f"전략 리포트 섹션 누락: {', '.join(missing)}",
                "agent": "ceo",
            })

    return {"issues": issues}


# ===========================================================================
# 2. 갭 분석 + 개선안 도출
# ===========================================================================

def analyze_gaps() -> list[dict]:
    """모든 영역 측정 → 개선이 필요한 항목 통합."""
    all_issues = []

    sl_tp = measure_sl_tp_accuracy()
    all_issues.extend(sl_tp["issues"])

    signals = measure_signal_coverage()
    all_issues.extend(signals["issues"])

    data = measure_data_completeness()
    all_issues.extend(data["issues"])

    reports = measure_report_quality()
    all_issues.extend(reports["issues"])

    return all_issues


# ===========================================================================
# 3. Paperclip 이슈 자동 등록
# ===========================================================================

def create_paperclip_issue(title: str, description: str, agent_key: str, area: str = "") -> str | None:
    """Paperclip에 개선 이슈 생성."""
    agent_id = AGENTS.get(agent_key)
    if not agent_id:
        return None

    label_id = AREA_LABELS.get(area)
    label_ids = [label_id] if label_id else []

    payload = {
        "title": title,
        "description": description,
        "status": "todo",
        "priority": "medium",
        "assigneeAgentId": agent_id,
        "labelIds": label_ids,
    }

    try:
        import urllib.request
        url = f"{PAPERCLIP_API}/companies/{PAPERCLIP_COMPANY_ID}/issues"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("identifier")
    except Exception:
        return None


def register_improvements(issues: list[dict]) -> list[str]:
    """개선 이슈를 Paperclip에 등록."""
    registered = []
    for issue in issues:
        area = issue.get("area", "")
        detail = issue.get("detail", "")
        agent = issue.get("agent", "ceo")
        ticker = issue.get("ticker", "")
        name = issue.get("name", "")

        title_prefix = "[자가개선]"
        if ticker:
            title = f"{title_prefix} {name}({ticker}) — {area}"
        else:
            title = f"{title_prefix} {area}"

        description = (
            f"자가 개선 사이클에서 자동 발견된 개선 항목입니다.\n\n"
            f"## 발견 내용\n{detail}\n\n"
            f"## 기대 액션\n"
            f".claude/skills/ 에서 관련 스킬을 찾아서 활용하세요.\n"
            f"수정 후 반드시 테스트하고, 결과를 이 이슈 코멘트에 기록해주세요.\n"
        )

        ident = create_paperclip_issue(title, description, agent, area=area)
        if ident:
            registered.append(f"{ident}: {title}")

    return registered


# ===========================================================================
# 4. 텔레그램 보고 + 결과 저장
# ===========================================================================

def send_telegram(msg: str) -> bool:
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
    except ImportError:
        pass

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False

    import urllib.request
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": msg}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode()).get("ok", False)
    except Exception:
        return False


def main() -> int:
    issues = analyze_gaps()

    if not issues:
        print("PASS — 개선 필요 항목 없음")
        return 0

    # Paperclip에 등록
    registered = register_improvements(issues)

    # 결과 저장
    result = {
        "evaluated_at": _now_kst().isoformat(),
        "total_issues": len(issues),
        "registered": registered,
        "details": issues,
    }
    log_path = ROOT / "logs" / "jobs" / "improvement_cycle.json"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 텔레그램 보고
    msg_lines = [f"[자가 개선] {len(issues)}건 발견"]
    for issue in issues[:5]:
        area = issue.get("area", "")
        detail = issue.get("detail", "")[:60]
        msg_lines.append(f"• {area}: {detail}")
    if registered:
        msg_lines.append(f"\nPaperclip 이슈 {len(registered)}건 자동 등록")

    send_telegram("\n".join(msg_lines))

    print(f"FOUND {len(issues)} issues, registered {len(registered)} to Paperclip")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
