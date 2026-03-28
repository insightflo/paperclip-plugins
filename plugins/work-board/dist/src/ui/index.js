import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";
import { COLUMN_UNASSIGNED, PAGE_ROUTE } from "../constants.js";
import { MissionGraphPanel } from "../mission-graph-panel.js";
const pageStyle = {
    display: "grid",
    gap: "24px",
    padding: "24px",
};
const heroStyle = {
    display: "grid",
    gap: "16px",
    padding: "24px",
    borderRadius: "24px",
    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 85%, transparent)",
    background: [
        "radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7dd3fc) 30%, transparent) 0%, transparent 42%)",
        "linear-gradient(145deg, color-mix(in srgb, var(--card, #ffffff) 96%, transparent), color-mix(in srgb, var(--background, #f8fafc) 92%, transparent))",
    ].join(", "),
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.06)",
};
const metricsGridStyle = {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
};
const metricCardStyle = {
    display: "grid",
    gap: "6px",
    padding: "14px 16px",
    borderRadius: "18px",
    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
    background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
};
const boardGridStyle = {
    display: "grid",
    gap: "18px",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    alignItems: "start",
};
const columnStyle = {
    display: "grid",
    gap: "14px",
    padding: "18px",
    borderRadius: "22px",
    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 78%, transparent)",
    background: "color-mix(in srgb, var(--card, #ffffff) 96%, transparent)",
    boxShadow: "0 18px 48px rgba(15, 23, 42, 0.05)",
    maxWidth: "calc(50% - 9px)",
};
const missionCardStyle = {
    display: "grid",
    gap: "10px",
    padding: "14px",
    borderRadius: "16px",
    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
    background: "color-mix(in srgb, var(--background, #f8fafc) 78%, var(--card, #ffffff))",
};
const bucketSectionStyle = {
    display: "grid",
    gap: "8px",
};
const bucketHeaderButtonStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    width: "100%",
    border: "none",
    padding: 0,
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    color: "inherit",
};
const issueCardStyle = {
    display: "grid",
    gap: "8px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
    background: "color-mix(in srgb, var(--card, #ffffff) 90%, transparent)",
};
const tinyMutedStyle = {
    fontSize: "12px",
    color: "color-mix(in srgb, var(--foreground, #0f172a) 62%, transparent)",
    lineHeight: 1.45,
};
const anchorResetStyle = {
    color: "inherit",
    textDecoration: "none",
};
function hostPath(companyPrefix, suffix) {
    return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}
function pluginPagePath(companyPrefix) {
    return hostPath(companyPrefix, `/${PAGE_ROUTE}`);
}
function issuePath(companyPrefix, issue) {
    const pathId = issue.identifier ?? issue.id;
    return hostPath(companyPrefix, `/issues/${pathId}`);
}
function formatDateTime(value) {
    if (!value)
        return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return "-";
    return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed);
}
function relativeAgeLabel(days) {
    if (days <= 0)
        return "오늘 갱신";
    if (days === 1)
        return "1일 경과";
    return `${days}일 경과`;
}
function useWorkBoard(companyId) {
    return usePluginData("work-board-overview", {
        companyId: companyId ?? "",
    });
}
function MetricCard({ label, value, helper, accent }) {
    return (_jsxs("div", { style: metricCardStyle, children: [_jsx("div", { style: tinyMutedStyle, children: label }), _jsx("strong", { style: { fontSize: "24px", lineHeight: 1, color: accent || "inherit" }, children: value }), _jsx("div", { style: tinyMutedStyle, children: helper })] }));
}
function IssueTile({ companyPrefix, issue }) {
    return (_jsx("a", { href: issuePath(companyPrefix, issue), style: anchorResetStyle, children: _jsxs("article", { style: issueCardStyle, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }, children: [_jsx("strong", { style: { fontSize: "13px" }, children: issue.identifier ?? issue.id.slice(0, 8) }), _jsx("span", { style: { ...tinyMutedStyle, whiteSpace: "nowrap" }, children: issue.statusLabel })] }), _jsx("div", { style: { fontSize: "14px", lineHeight: 1.45 }, children: issue.title }), _jsxs("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" }, children: [_jsx("span", { style: { ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 58%, transparent)" }, children: issue.priority }), issue.overdueFromLastWeek ? (_jsx("span", { style: { ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, #ef4444 16%, transparent)", color: "#991b1b" }, children: "overdue" })) : null, issue.stale ? (_jsx("span", { style: { ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, #f59e0b 16%, transparent)", color: "#92400e" }, children: "stale" })) : null] }), _jsx("div", { style: tinyMutedStyle, children: issue.status === "done"
                        ? `완료 ${formatDateTime(issue.completedAt)}`
                        : `${relativeAgeLabel(issue.ageDays)} · 업데이트 ${formatDateTime(issue.updatedAt)}` })] }) }));
}
function bucketAccent(key) {
    if (key === "delayed") {
        return { color: "#ef4444", background: "color-mix(in srgb, #ef4444 10%, transparent)" };
    }
    if (key === "waiting") {
        return { color: "#f59e0b", background: "color-mix(in srgb, #f59e0b 10%, transparent)" };
    }
    if (key === "inProgress") {
        return { color: "#3b82f6", background: "color-mix(in srgb, #3b82f6 10%, transparent)" };
    }
    return { color: "#22c55e", background: "color-mix(in srgb, #22c55e 10%, transparent)" };
}
function MissionBucketSection({ bucket, companyPrefix, }) {
    const [collapsed, setCollapsed] = useState(bucket.count === 0);
    const accent = bucketAccent(bucket.key);
    return (_jsxs("section", { style: {
            ...bucketSectionStyle,
            padding: "10px 12px",
            borderRadius: "12px",
            borderLeft: `3px solid ${accent.color}`,
            background: accent.background,
        }, children: [_jsxs("button", { type: "button", style: bucketHeaderButtonStyle, onClick: () => setCollapsed((value) => !value), children: [_jsxs("span", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [_jsx("span", { "aria-hidden": "true", style: { width: "8px", height: "8px", borderRadius: "999px", background: accent.color } }), _jsx("strong", { style: { fontSize: "13px" }, children: bucket.label })] }), _jsxs("span", { style: { ...tinyMutedStyle, display: "flex", alignItems: "center", gap: "8px" }, children: [_jsxs("span", { children: [bucket.count, "\uAC74"] }), _jsx("span", { "aria-hidden": "true", children: collapsed ? "▸" : "▾" })] })] }), !collapsed ? bucket.items.length > 0 ? bucket.items.map((item) => (_jsx(IssueTile, { companyPrefix: companyPrefix, issue: item }, item.id))) : (_jsx("div", { style: { ...tinyMutedStyle, padding: "8px 10px", borderRadius: "10px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 38%, transparent)" }, children: "\uBE44\uC5B4 \uC788\uC74C" })) : null] }));
}
function MissionCardPanel({ mission, companyPrefix }) {
    const [expanded, setExpanded] = useState(false);
    const totalTasks = mission.progress.total;
    return (_jsxs("article", { style: missionCardStyle, children: [_jsxs("button", { type: "button", onClick: () => setExpanded((v) => !v), style: { all: "unset", cursor: "pointer", display: "grid", gap: "6px", width: "100%" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }, children: [_jsxs("div", { style: { display: "grid", gap: "4px", textAlign: "left" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [_jsx("span", { "aria-hidden": "true", style: { fontSize: "12px", opacity: 0.6 }, children: expanded ? "▾" : "▸" }), _jsx("strong", { style: { fontSize: "16px" }, children: mission.title })] }), _jsxs("div", { style: tinyMutedStyle, children: [mission.missionIdentifier ?? mission.missionIssueId ?? mission.missionId.slice(0, 8), " · ", totalTasks, "\uAC74"] })] }), _jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--accent, #7dd3fc) 16%, transparent)" }, children: [mission.progress.done, "/", mission.progress.total] })] }), _jsx("div", { style: { display: "grid", gap: "4px" }, children: _jsx("div", { style: { width: "100%", height: "6px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 60%, transparent)", overflow: "hidden" }, children: _jsx("div", { style: {
                                    width: `${mission.progress.percent}%`,
                                    height: "100%",
                                    borderRadius: "999px",
                                    background: mission.progress.percent === 100 ? "#22c55e" : "linear-gradient(90deg, #22c55e, #0ea5e9)",
                                } }) }) })] }), expanded ? (_jsx("div", { style: { display: "grid", gap: "8px", marginTop: "8px" }, children: mission.buckets.map((bucket) => (_jsx(MissionBucketSection, { bucket: bucket, companyPrefix: companyPrefix }, bucket.key))) })) : null] }));
}
function UnassignedSection({ missions, companyPrefix, }) {
    const allItems = missions.flatMap((m) => m.buckets.flatMap((b) => b.items));
    if (allItems.length === 0)
        return null;
    return (_jsxs("section", { style: { ...columnStyle, gridColumn: "1 / -1" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }, children: [_jsx("strong", { style: { fontSize: "15px", opacity: 0.6 }, children: "\uBBF8\uBD84\uB958" }), _jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: [allItems.length, "\uAC74"] })] }), _jsx("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: allItems.map((item) => (_jsx(IssueTile, { companyPrefix: companyPrefix, issue: item }, item.id))) })] }));
}
function ColumnPanel({ name, missions, companyPrefix, isUnassigned, }) {
    if (isUnassigned) {
        return _jsx(UnassignedSection, { missions: missions, companyPrefix: companyPrefix });
    }
    return (_jsxs("section", { style: columnStyle, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }, children: [_jsx("strong", { style: { fontSize: "17px" }, children: name }), _jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: [missions.length, " \uBBF8\uC158"] })] }), missions.length > 0 ? missions.map((mission) => (_jsx(MissionCardPanel, { mission: mission, companyPrefix: companyPrefix }, mission.missionId))) : (_jsx("div", { style: tinyMutedStyle, children: "\uD45C\uC2DC\uD560 \uBBF8\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }))] }));
}
const projectGroupStyle = {
    display: "grid",
    gap: "18px",
};
const projectHeaderStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    width: "100%",
    border: "none",
    padding: "16px 20px",
    borderRadius: "18px",
    background: "linear-gradient(135deg, color-mix(in srgb, var(--accent, #7dd3fc) 14%, transparent), color-mix(in srgb, var(--card, #ffffff) 96%, transparent))",
    borderBottom: "2px solid color-mix(in srgb, var(--accent, #7dd3fc) 36%, transparent)",
    cursor: "pointer",
    textAlign: "left",
    color: "inherit",
};
function ProjectGroupPanel({ group, companyPrefix, defaultExpanded, }) {
    const [expanded, setExpanded] = useState(defaultExpanded ?? true);
    const totalMissions = group.columns.reduce((sum, col) => sum + col.missionCount, 0);
    const totalTasks = group.columns.reduce((sum, col) => sum + col.missions.reduce((mSum, m) => mSum + m.buckets.reduce((bSum, b) => bSum + b.count, 0), 0), 0);
    return (_jsxs("section", { style: projectGroupStyle, children: [_jsxs("button", { type: "button", style: projectHeaderStyle, onClick: () => setExpanded((v) => !v), children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "10px" }, children: [_jsx("span", { "aria-hidden": "true", style: { fontSize: "14px", opacity: 0.5 }, children: expanded ? "▾" : "▸" }), _jsx("strong", { style: { fontSize: "20px", letterSpacing: "-0.01em" }, children: group.projectName })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "10px" }, children: [_jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 10px", borderRadius: "999px", background: "color-mix(in srgb, var(--accent, #7dd3fc) 18%, transparent)" }, children: [totalMissions, " \uBBF8\uC158"] }), _jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 10px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: [totalTasks, " \uD0DC\uC2A4\uD06C"] })] })] }), expanded ? (_jsxs(_Fragment, { children: [_jsx("section", { style: boardGridStyle, children: group.columns.filter((c) => c.key !== COLUMN_UNASSIGNED).map((column) => (_jsx(ColumnPanel, { name: column.name, missions: column.missions, companyPrefix: companyPrefix }, column.key))) }), group.columns.filter((c) => c.key === COLUMN_UNASSIGNED).map((column) => (_jsx(ColumnPanel, { name: column.name, missions: column.missions, companyPrefix: companyPrefix, isUnassigned: true }, column.key)))] })) : null] }));
}
function BoardContent({ context, data, onRefresh, loading, }) {
    return (_jsxs("div", { style: pageStyle, children: [_jsxs("section", { style: heroStyle, children: [_jsxs("div", { style: { display: "grid", gap: "8px" }, children: [_jsx("div", { style: { ...tinyMutedStyle, textTransform: "uppercase", letterSpacing: "0.08em" }, children: "mission-first board" }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "16px" }, children: [_jsx("h1", { style: { margin: 0, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02 }, children: "\uAE08\uC8FC \uBBF8\uC158 \uBCF4\uB4DC" }), _jsx("button", { type: "button", onClick: onRefresh, disabled: loading, style: {
                                            padding: "8px 16px",
                                            borderRadius: "12px",
                                            border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
                                            background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
                                            cursor: loading ? "wait" : "pointer",
                                            fontSize: "13px",
                                            color: "inherit",
                                            opacity: loading ? 0.5 : 1,
                                        }, children: loading ? "갱신 중..." : "↻ 새로고침" })] }), _jsx("div", { style: { fontSize: "15px", lineHeight: 1.6, maxWidth: "760px" }, children: "parent issue\uB97C \uBBF8\uC158\uC73C\uB85C \uBCF4\uACE0 \uD558\uC704 \uC774\uC288\uB97C \uADF8\uB8F9\uD654\uD569\uB2C8\uB2E4. \uD558\uC704 \uB77C\uBCA8\uC774 \uC5C6\uC73C\uBA74 \uBD80\uBAA8 \uB77C\uBCA8\uC744 \uC0C1\uC18D\uD574 \uCE7C\uB7FC\uC5D0 \uBC30\uCE58\uD569\uB2C8\uB2E4. \uBBF8\uC158 \uADF8\uB798\uD504\uB294 \uC81C\uBAA9 prefix, \uB313\uAE00, \uC7AC\uC774\uC288, \uC0C1\uC704 \uAD00\uACC4\uB97C \uADDC\uCE59 \uAE30\uBC18\uC73C\uB85C \uBB36\uC5B4 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4." })] }), _jsxs("div", { style: metricsGridStyle, children: [_jsx(MetricCard, { label: "\uBBF8\uC158 \uC218", value: data.columns.filter((c) => c.key !== COLUMN_UNASSIGNED).reduce((sum, c) => sum + c.missionCount, 0), helper: "\uC774\uBC88 \uC8FC \uCD94\uC801 \uC911\uC778 \uBBF8\uC158 (\uBBF8\uBD84\uB958 \uC81C\uC678)", accent: "#0ea5e9" }), _jsx(MetricCard, { label: "\uB300\uAE30", value: data.totals.todo, helper: "\uB300\uAE30 \uC911\uC778 \uD0DC\uC2A4\uD06C", accent: "#f59e0b" }), _jsx(MetricCard, { label: "\uC9C4\uD589", value: data.totals.inProgress, helper: "\uC9C4\uD589 \uC911\uC778 \uD0DC\uC2A4\uD06C", accent: "#3b82f6" }), _jsx(MetricCard, { label: "\uC9C0\uC5F0", value: data.totals.overdue, helper: "N\uC77C \uC774\uC0C1 \uBBF8\uCC98\uB9AC", accent: "#ef4444" })] })] }), _jsx(MissionGraphPanel, { graph: data, companyPrefix: context.companyPrefix }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }, children: [_jsx("div", { style: tinyMutedStyle, children: data.weekRange.label }), _jsxs("a", { href: pluginPagePath(context.companyPrefix), style: { ...anchorResetStyle, ...tinyMutedStyle }, children: ["route: ", pluginPagePath(context.companyPrefix)] })] }), data.projectGroups && data.projectGroups.length > 0 ? (data.projectGroups.map((group) => (_jsx(ProjectGroupPanel, { group: group, companyPrefix: context.companyPrefix, defaultExpanded: true }, group.projectId ?? "__default__")))) : (_jsxs(_Fragment, { children: [_jsx("section", { style: boardGridStyle, children: data.columns.filter((c) => c.key !== COLUMN_UNASSIGNED).map((column) => (_jsx(ColumnPanel, { name: column.name, missions: column.missions, companyPrefix: context.companyPrefix }, column.key))) }), data.columns.filter((c) => c.key === COLUMN_UNASSIGNED).map((column) => (_jsx(ColumnPanel, { name: column.name, missions: column.missions, companyPrefix: context.companyPrefix, isUnassigned: true }, column.key)))] }))] }));
}
function WorkBoardHelpSection() {
    const [showHelp, setShowHelp] = useState(false);
    return (_jsx("div", { style: { ...pageStyle, paddingTop: 0 }, children: _jsxs("section", { style: columnStyle, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [_jsx("strong", { style: { fontSize: "17px" }, children: "Help" }), _jsx("button", { type: "button", onClick: () => setShowHelp(!showHelp), style: {
                                padding: "8px 16px",
                                borderRadius: "12px",
                                border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
                                background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
                                cursor: "pointer",
                                fontSize: "13px",
                                color: "inherit",
                            }, children: showHelp ? "닫기" : "도움말" })] }), showHelp && (_jsxs("div", { style: tinyMutedStyle, children: [_jsx("p", { style: { ...tinyMutedStyle, fontWeight: 600, fontSize: "14px", marginBottom: "8px" }, children: "Mission Board \uB3C4\uC6C0\uB9D0" }), _jsx("p", { style: { ...tinyMutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uAE30\uBCF8 \uAC1C\uB150" }), _jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [_jsx("li", { children: "\uC5D0\uC774\uC804\uD2B8\uBCC4 \uC774\uC288\uB97C \uCE78\uBC18 \uBCF4\uB4DC\uB85C \uC2DC\uAC01\uD654" }), _jsx("li", { children: "\uC0C1\uD0DC\uBCC4 \uBD84\uB958: \uC9C0\uC5F0 / \uB300\uAE30 / \uC9C4\uD589 / \uC644\uB8CC" })] }), _jsx("p", { style: { ...tinyMutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uC0AC\uC6A9\uBC95" }), _jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [_jsx("li", { children: "\uCE74\uB4DC \uD074\uB9AD\uC73C\uB85C \uC774\uC288 \uC0C1\uC138 \uD655\uC778" }), _jsx("li", { children: "\uC5D0\uC774\uC804\uD2B8\uBCC4 \uD544\uD130\uB9C1 \uAC00\uB2A5" }), _jsx("li", { children: "\uBBF8\uBD84\uB958 \uC774\uC288\uB294 \uC0C1\uB2E8\uC5D0 \uAC00\uB85C \uBC30\uCE58" })] })] }))] }) }));
}
export function WorkBoardPage({ context }) {
    const board = useWorkBoard(context.companyId);
    if (board.loading) {
        return _jsx("div", { style: pageStyle, children: "\uBBF8\uC158 \uBCF4\uB4DC\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." });
    }
    if (board.error) {
        return _jsxs("div", { style: pageStyle, children: ["\uBBF8\uC158 \uBCF4\uB4DC\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uB2E4: ", board.error.message] });
    }
    if (!board.data) {
        return _jsx("div", { style: pageStyle, children: "\uD45C\uC2DC\uD560 \uB370\uC774\uD130\uAC00 \uC5C6\uB2E4." });
    }
    return (_jsxs(_Fragment, { children: [_jsx(BoardContent, { context: context, data: board.data, onRefresh: board.refresh, loading: board.loading }), _jsx(WorkBoardHelpSection, {})] }));
}
export function WorkBoardSidebarLink({ context }) {
    const href = pluginPagePath(context.companyPrefix);
    const isActive = typeof window !== "undefined" && window.location.pathname === href;
    return (_jsxs("a", { href: href, "aria-current": isActive ? "page" : undefined, className: [
            "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
            isActive
                ? "bg-accent text-foreground"
                : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
        ].join(" "), children: [_jsx("span", { "aria-hidden": "true", children: "\u25A6" }), _jsx("span", { className: "truncate", children: "Mission Board" })] }));
}
export function WorkBoardDashboardWidget({ context }) {
    const board = useWorkBoard(context.companyId);
    if (board.loading)
        return _jsx("div", { children: "\uBBF8\uC158 \uBCF4\uB4DC \uC694\uC57D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911..." });
    if (board.error)
        return _jsxs("div", { children: ["\uBBF8\uC158 \uBCF4\uB4DC \uC624\uB958: ", board.error.message] });
    if (!board.data)
        return _jsx("div", { children: "\uC694\uC57D \uB370\uC774\uD130\uAC00 \uC5C6\uB2E4." });
    return (_jsxs("section", { style: { display: "grid", gap: "12px" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }, children: [_jsx("strong", { children: "Mission Board" }), _jsx("a", { href: pluginPagePath(context.companyPrefix), style: tinyMutedStyle, children: "Open board" })] }), _jsx("div", { style: tinyMutedStyle, children: board.data.weekRange.label }), _jsxs("div", { style: { display: "grid", gap: "6px" }, children: [_jsxs("div", { style: tinyMutedStyle, children: ["\uBBF8\uC158 ", board.data.totals.missions, " \u00B7 \uD0DC\uC2A4\uD06C ", board.data.totals.tasks] }), _jsxs("div", { style: tinyMutedStyle, children: ["\uC9C0\uC5F0 ", board.data.totals.overdue, " \u00B7 \uC9C4\uD589 ", board.data.totals.inProgress, " \u00B7 \uB300\uAE30 ", board.data.totals.todo, " \u00B7 \uC644\uB8CC ", board.data.totals.done] })] }), _jsx("div", { style: { display: "grid", gap: "8px" }, children: board.data.columns.slice(0, 3).map((column) => (_jsxs("div", { style: {
                        display: "grid",
                        gap: "4px",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
                        background: "color-mix(in srgb, var(--card, #ffffff) 95%, transparent)",
                    }, children: [_jsx("strong", { style: { fontSize: "13px" }, children: column.name }), _jsxs("div", { style: tinyMutedStyle, children: ["\uBBF8\uC158 ", column.missionCount] })] }, column.key))) })] }));
}
//# sourceMappingURL=index.js.map