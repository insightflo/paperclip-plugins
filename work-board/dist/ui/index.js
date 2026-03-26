// src/ui/index.tsx
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";

// src/constants.ts
var PAGE_ROUTE = "work-board";
var COLUMN_UNASSIGNED = "\uBBF8\uBD84\uB958";

// src/ui/index.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var pageStyle = {
  display: "grid",
  gap: "24px",
  padding: "24px"
};
var heroStyle = {
  display: "grid",
  gap: "16px",
  padding: "24px",
  borderRadius: "24px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 85%, transparent)",
  background: [
    "radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7dd3fc) 30%, transparent) 0%, transparent 42%)",
    "linear-gradient(145deg, color-mix(in srgb, var(--card, #ffffff) 96%, transparent), color-mix(in srgb, var(--background, #f8fafc) 92%, transparent))"
  ].join(", "),
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.06)"
};
var metricsGridStyle = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))"
};
var metricCardStyle = {
  display: "grid",
  gap: "6px",
  padding: "14px 16px",
  borderRadius: "18px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
  background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)"
};
var boardGridStyle = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  alignItems: "start"
};
var columnStyle = {
  display: "grid",
  gap: "14px",
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 78%, transparent)",
  background: "color-mix(in srgb, var(--card, #ffffff) 96%, transparent)",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.05)"
};
var missionCardStyle = {
  display: "grid",
  gap: "10px",
  padding: "14px",
  borderRadius: "16px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
  background: "color-mix(in srgb, var(--background, #f8fafc) 78%, var(--card, #ffffff))"
};
var bucketSectionStyle = {
  display: "grid",
  gap: "8px"
};
var bucketHeaderButtonStyle = {
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
  color: "inherit"
};
var issueCardStyle = {
  display: "grid",
  gap: "8px",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
  background: "color-mix(in srgb, var(--card, #ffffff) 90%, transparent)"
};
var tinyMutedStyle = {
  fontSize: "12px",
  color: "color-mix(in srgb, var(--foreground, #0f172a) 62%, transparent)",
  lineHeight: 1.45
};
var anchorResetStyle = {
  color: "inherit",
  textDecoration: "none"
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
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}
function relativeAgeLabel(days) {
  if (days <= 0) return "\uC624\uB298 \uAC31\uC2E0";
  if (days === 1) return "1\uC77C \uACBD\uACFC";
  return `${days}\uC77C \uACBD\uACFC`;
}
function useWorkBoard(companyId) {
  return usePluginData("work-board-overview", {
    companyId: companyId ?? ""
  });
}
function MetricCard({ label, value, helper, accent }) {
  return /* @__PURE__ */ jsxs("div", { style: metricCardStyle, children: [
    /* @__PURE__ */ jsx("div", { style: tinyMutedStyle, children: label }),
    /* @__PURE__ */ jsx("strong", { style: { fontSize: "24px", lineHeight: 1, color: accent || "inherit" }, children: value }),
    /* @__PURE__ */ jsx("div", { style: tinyMutedStyle, children: helper })
  ] });
}
function IssueTile({ companyPrefix, issue }) {
  return /* @__PURE__ */ jsx("a", { href: issuePath(companyPrefix, issue), style: anchorResetStyle, children: /* @__PURE__ */ jsxs("article", { style: issueCardStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("strong", { style: { fontSize: "13px" }, children: issue.identifier ?? issue.id.slice(0, 8) }),
      /* @__PURE__ */ jsx("span", { style: { ...tinyMutedStyle, whiteSpace: "nowrap" }, children: issue.statusLabel })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { fontSize: "14px", lineHeight: 1.45 }, children: issue.title }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("span", { style: { ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 58%, transparent)" }, children: issue.priority }),
      issue.overdueFromLastWeek ? /* @__PURE__ */ jsx("span", { style: { ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, #ef4444 16%, transparent)", color: "#991b1b" }, children: "overdue" }) : null,
      issue.stale ? /* @__PURE__ */ jsx("span", { style: { ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, #f59e0b 16%, transparent)", color: "#92400e" }, children: "stale" }) : null
    ] }),
    /* @__PURE__ */ jsx("div", { style: tinyMutedStyle, children: issue.status === "done" ? `\uC644\uB8CC ${formatDateTime(issue.completedAt)}` : `${relativeAgeLabel(issue.ageDays)} \xB7 \uC5C5\uB370\uC774\uD2B8 ${formatDateTime(issue.updatedAt)}` })
  ] }) });
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
function MissionBucketSection({
  bucket,
  companyPrefix
}) {
  const [collapsed, setCollapsed] = useState(bucket.count === 0);
  const accent = bucketAccent(bucket.key);
  return /* @__PURE__ */ jsxs(
    "section",
    {
      style: {
        ...bucketSectionStyle,
        padding: "10px 12px",
        borderRadius: "12px",
        borderLeft: `3px solid ${accent.color}`,
        background: accent.background
      },
      children: [
        /* @__PURE__ */ jsxs("button", { type: "button", style: bucketHeaderButtonStyle, onClick: () => setCollapsed((value) => !value), children: [
          /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
            /* @__PURE__ */ jsx("span", { "aria-hidden": "true", style: { width: "8px", height: "8px", borderRadius: "999px", background: accent.color } }),
            /* @__PURE__ */ jsx("strong", { style: { fontSize: "13px" }, children: bucket.label })
          ] }),
          /* @__PURE__ */ jsxs("span", { style: { ...tinyMutedStyle, display: "flex", alignItems: "center", gap: "8px" }, children: [
            /* @__PURE__ */ jsxs("span", { children: [
              bucket.count,
              "\uAC74"
            ] }),
            /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: collapsed ? "\u25B8" : "\u25BE" })
          ] })
        ] }),
        !collapsed ? bucket.items.length > 0 ? bucket.items.map((item) => /* @__PURE__ */ jsx(IssueTile, { companyPrefix, issue: item }, item.id)) : /* @__PURE__ */ jsx("div", { style: { ...tinyMutedStyle, padding: "8px 10px", borderRadius: "10px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 38%, transparent)" }, children: "\uBE44\uC5B4 \uC788\uC74C" }) : null
      ]
    }
  );
}
function MissionCardPanel({ mission, companyPrefix }) {
  const [expanded, setExpanded] = useState(false);
  const totalTasks = mission.progress.total;
  return /* @__PURE__ */ jsxs("article", { style: missionCardStyle, children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => setExpanded((v) => !v),
        style: { all: "unset", cursor: "pointer", display: "grid", gap: "6px", width: "100%" },
        children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }, children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px", textAlign: "left" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
                /* @__PURE__ */ jsx("span", { "aria-hidden": "true", style: { fontSize: "12px", opacity: 0.6 }, children: expanded ? "\u25BE" : "\u25B8" }),
                /* @__PURE__ */ jsx("strong", { style: { fontSize: "16px" }, children: mission.title })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: tinyMutedStyle, children: [
                mission.missionIdentifier ?? mission.missionIssueId ?? mission.missionId.slice(0, 8),
                " \xB7 ",
                totalTasks,
                "\uAC74"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--accent, #7dd3fc) 16%, transparent)" }, children: [
              mission.progress.done,
              "/",
              mission.progress.total
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "4px" }, children: /* @__PURE__ */ jsx("div", { style: { width: "100%", height: "6px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 60%, transparent)", overflow: "hidden" }, children: /* @__PURE__ */ jsx(
            "div",
            {
              style: {
                width: `${mission.progress.percent}%`,
                height: "100%",
                borderRadius: "999px",
                background: mission.progress.percent === 100 ? "#22c55e" : "linear-gradient(90deg, #22c55e, #0ea5e9)"
              }
            }
          ) }) })
        ]
      }
    ),
    expanded ? /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "8px", marginTop: "8px" }, children: mission.buckets.map((bucket) => /* @__PURE__ */ jsx(MissionBucketSection, { bucket, companyPrefix }, bucket.key)) }) : null
  ] });
}
function UnassignedSection({
  missions,
  companyPrefix
}) {
  const allItems = missions.flatMap((m) => m.buckets.flatMap((b) => b.items));
  if (allItems.length === 0) return null;
  return /* @__PURE__ */ jsxs("section", { style: { ...columnStyle, gridColumn: "1 / -1" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("strong", { style: { fontSize: "15px", opacity: 0.6 }, children: "\uBBF8\uBD84\uB958" }),
      /* @__PURE__ */ jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: [
        allItems.length,
        "\uAC74"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: allItems.map((item) => /* @__PURE__ */ jsx(IssueTile, { companyPrefix, issue: item }, item.id)) })
  ] });
}
function ColumnPanel({
  name,
  missions,
  companyPrefix,
  isUnassigned
}) {
  if (isUnassigned) {
    return /* @__PURE__ */ jsx(UnassignedSection, { missions, companyPrefix });
  }
  return /* @__PURE__ */ jsxs("section", { style: columnStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("strong", { style: { fontSize: "17px" }, children: name }),
      /* @__PURE__ */ jsxs("span", { style: { ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: [
        missions.length,
        " \uBBF8\uC158"
      ] })
    ] }),
    missions.length > 0 ? missions.map((mission) => /* @__PURE__ */ jsx(MissionCardPanel, { mission, companyPrefix }, mission.missionId)) : /* @__PURE__ */ jsx("div", { style: tinyMutedStyle, children: "\uD45C\uC2DC\uD560 \uBBF8\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." })
  ] });
}
function BoardContent({
  context,
  data,
  onRefresh,
  loading
}) {
  return /* @__PURE__ */ jsxs("div", { style: pageStyle, children: [
    /* @__PURE__ */ jsxs("section", { style: heroStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "8px" }, children: [
        /* @__PURE__ */ jsx("div", { style: { ...tinyMutedStyle, textTransform: "uppercase", letterSpacing: "0.08em" }, children: "mission-first board" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "16px" }, children: [
          /* @__PURE__ */ jsx("h1", { style: { margin: 0, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02 }, children: "\uAE08\uC8FC \uBBF8\uC158 \uBCF4\uB4DC" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: onRefresh,
              disabled: loading,
              style: {
                padding: "8px 16px",
                borderRadius: "12px",
                border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
                background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
                cursor: loading ? "wait" : "pointer",
                fontSize: "13px",
                color: "inherit",
                opacity: loading ? 0.5 : 1
              },
              children: loading ? "\uAC31\uC2E0 \uC911..." : "\u21BB \uC0C8\uB85C\uACE0\uCE68"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: "15px", lineHeight: 1.6, maxWidth: "760px" }, children: "parent issue\uB97C \uBBF8\uC158\uC73C\uB85C \uBCF4\uACE0 \uD558\uC704 \uC774\uC288\uB97C \uADF8\uB8F9\uD654\uD569\uB2C8\uB2E4. \uD558\uC704 \uB77C\uBCA8\uC774 \uC5C6\uC73C\uBA74 \uBD80\uBAA8 \uB77C\uBCA8\uC744 \uC0C1\uC18D\uD574 \uCE7C\uB7FC\uC5D0 \uBC30\uCE58\uD569\uB2C8\uB2E4." })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: metricsGridStyle, children: [
        /* @__PURE__ */ jsx(MetricCard, { label: "\uBBF8\uC158 \uC218", value: data.columns.filter((c) => c.key !== COLUMN_UNASSIGNED).reduce((sum, c) => sum + c.missionCount, 0), helper: "\uC774\uBC88 \uC8FC \uCD94\uC801 \uC911\uC778 \uBBF8\uC158 (\uBBF8\uBD84\uB958 \uC81C\uC678)", accent: "#0ea5e9" }),
        /* @__PURE__ */ jsx(MetricCard, { label: "\uB300\uAE30", value: data.totals.todo, helper: "\uB300\uAE30 \uC911\uC778 \uD0DC\uC2A4\uD06C", accent: "#f59e0b" }),
        /* @__PURE__ */ jsx(MetricCard, { label: "\uC9C4\uD589", value: data.totals.inProgress, helper: "\uC9C4\uD589 \uC911\uC778 \uD0DC\uC2A4\uD06C", accent: "#3b82f6" }),
        /* @__PURE__ */ jsx(MetricCard, { label: "\uC9C0\uC5F0", value: data.totals.overdue, helper: "N\uC77C \uC774\uC0C1 \uBBF8\uCC98\uB9AC", accent: "#ef4444" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsx("div", { style: tinyMutedStyle, children: data.weekRange.label }),
      /* @__PURE__ */ jsxs("a", { href: pluginPagePath(context.companyPrefix), style: { ...anchorResetStyle, ...tinyMutedStyle }, children: [
        "route: ",
        pluginPagePath(context.companyPrefix)
      ] })
    ] }),
    /* @__PURE__ */ jsx("section", { style: boardGridStyle, children: data.columns.filter((c) => c.key !== COLUMN_UNASSIGNED).map((column) => /* @__PURE__ */ jsx(ColumnPanel, { name: column.name, missions: column.missions, companyPrefix: context.companyPrefix }, column.key)) }),
    data.columns.filter((c) => c.key === COLUMN_UNASSIGNED).map((column) => /* @__PURE__ */ jsx(ColumnPanel, { name: column.name, missions: column.missions, companyPrefix: context.companyPrefix, isUnassigned: true }, column.key))
  ] });
}
function WorkBoardHelpSection() {
  const [showHelp, setShowHelp] = useState(false);
  return /* @__PURE__ */ jsx("div", { style: { ...pageStyle, paddingTop: 0 }, children: /* @__PURE__ */ jsxs("section", { style: columnStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsx("strong", { style: { fontSize: "17px" }, children: "Help" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => setShowHelp(!showHelp),
          style: {
            padding: "8px 16px",
            borderRadius: "12px",
            border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
            background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
            cursor: "pointer",
            fontSize: "13px",
            color: "inherit"
          },
          children: showHelp ? "\uB2EB\uAE30" : "\uB3C4\uC6C0\uB9D0"
        }
      )
    ] }),
    showHelp && /* @__PURE__ */ jsxs("div", { style: tinyMutedStyle, children: [
      /* @__PURE__ */ jsx("p", { style: { ...tinyMutedStyle, fontWeight: 600, fontSize: "14px", marginBottom: "8px" }, children: "Mission Board \uB3C4\uC6C0\uB9D0" }),
      /* @__PURE__ */ jsx("p", { style: { ...tinyMutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uAE30\uBCF8 \uAC1C\uB150" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsx("li", { children: "\uC5D0\uC774\uC804\uD2B8\uBCC4 \uC774\uC288\uB97C \uCE78\uBC18 \uBCF4\uB4DC\uB85C \uC2DC\uAC01\uD654" }),
        /* @__PURE__ */ jsx("li", { children: "\uC0C1\uD0DC\uBCC4 \uBD84\uB958: \uC9C0\uC5F0 / \uB300\uAE30 / \uC9C4\uD589 / \uC644\uB8CC" })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { ...tinyMutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uC0AC\uC6A9\uBC95" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsx("li", { children: "\uCE74\uB4DC \uD074\uB9AD\uC73C\uB85C \uC774\uC288 \uC0C1\uC138 \uD655\uC778" }),
        /* @__PURE__ */ jsx("li", { children: "\uC5D0\uC774\uC804\uD2B8\uBCC4 \uD544\uD130\uB9C1 \uAC00\uB2A5" }),
        /* @__PURE__ */ jsx("li", { children: "\uBBF8\uBD84\uB958 \uC774\uC288\uB294 \uC0C1\uB2E8\uC5D0 \uAC00\uB85C \uBC30\uCE58" })
      ] })
    ] })
  ] }) });
}
function WorkBoardPage({ context }) {
  const board = useWorkBoard(context.companyId);
  if (board.loading) {
    return /* @__PURE__ */ jsx("div", { style: pageStyle, children: "\uBBF8\uC158 \uBCF4\uB4DC\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." });
  }
  if (board.error) {
    return /* @__PURE__ */ jsxs("div", { style: pageStyle, children: [
      "\uBBF8\uC158 \uBCF4\uB4DC\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uB2E4: ",
      board.error.message
    ] });
  }
  if (!board.data) {
    return /* @__PURE__ */ jsx("div", { style: pageStyle, children: "\uD45C\uC2DC\uD560 \uB370\uC774\uD130\uAC00 \uC5C6\uB2E4." });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(BoardContent, { context, data: board.data, onRefresh: board.refresh, loading: board.loading }),
    /* @__PURE__ */ jsx(WorkBoardHelpSection, {})
  ] });
}
function WorkBoardSidebarLink({ context }) {
  const href = pluginPagePath(context.companyPrefix);
  const isActive = typeof window !== "undefined" && window.location.pathname === href;
  return /* @__PURE__ */ jsxs(
    "a",
    {
      href,
      "aria-current": isActive ? "page" : void 0,
      className: [
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
        isActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
      ].join(" "),
      children: [
        /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "\u25A6" }),
        /* @__PURE__ */ jsx("span", { className: "truncate", children: "Mission Board" })
      ]
    }
  );
}
function WorkBoardDashboardWidget({ context }) {
  const board = useWorkBoard(context.companyId);
  if (board.loading) return /* @__PURE__ */ jsx("div", { children: "\uBBF8\uC158 \uBCF4\uB4DC \uC694\uC57D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911..." });
  if (board.error) return /* @__PURE__ */ jsxs("div", { children: [
    "\uBBF8\uC158 \uBCF4\uB4DC \uC624\uB958: ",
    board.error.message
  ] });
  if (!board.data) return /* @__PURE__ */ jsx("div", { children: "\uC694\uC57D \uB370\uC774\uD130\uAC00 \uC5C6\uB2E4." });
  return /* @__PURE__ */ jsxs("section", { style: { display: "grid", gap: "12px" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }, children: [
      /* @__PURE__ */ jsx("strong", { children: "Mission Board" }),
      /* @__PURE__ */ jsx("a", { href: pluginPagePath(context.companyPrefix), style: tinyMutedStyle, children: "Open board" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: tinyMutedStyle, children: board.data.weekRange.label }),
    /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: tinyMutedStyle, children: [
        "\uBBF8\uC158 ",
        board.data.totals.missions,
        " \xB7 \uD0DC\uC2A4\uD06C ",
        board.data.totals.tasks
      ] }),
      /* @__PURE__ */ jsxs("div", { style: tinyMutedStyle, children: [
        "\uC9C0\uC5F0 ",
        board.data.totals.overdue,
        " \xB7 \uC9C4\uD589 ",
        board.data.totals.inProgress,
        " \xB7 \uB300\uAE30 ",
        board.data.totals.todo,
        " \xB7 \uC644\uB8CC ",
        board.data.totals.done
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "8px" }, children: board.data.columns.slice(0, 3).map((column) => /* @__PURE__ */ jsxs(
      "div",
      {
        style: {
          display: "grid",
          gap: "4px",
          padding: "10px 12px",
          borderRadius: "12px",
          border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
          background: "color-mix(in srgb, var(--card, #ffffff) 95%, transparent)"
        },
        children: [
          /* @__PURE__ */ jsx("strong", { style: { fontSize: "13px" }, children: column.name }),
          /* @__PURE__ */ jsxs("div", { style: tinyMutedStyle, children: [
            "\uBBF8\uC158 ",
            column.missionCount
          ] })
        ]
      },
      column.key
    )) })
  ] });
}
export {
  WorkBoardDashboardWidget,
  WorkBoardPage,
  WorkBoardSidebarLink
};
//# sourceMappingURL=index.js.map
