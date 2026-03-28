// src/ui/index.tsx
import {
  useHostContext,
  usePluginAction,
  usePluginData
} from "@paperclipai/plugin-sdk/ui";
import { useEffect, useMemo, useState } from "react";

// src/constants.ts
var PLUGIN_ID = "insightflo.workflow-engine";

// src/ui/index.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    const target = e.target;
    if (target?.tagName === "TEXTAREA" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.stopPropagation();
    }
  }, true);
}
var pageStyle = {
  display: "grid",
  gap: "20px",
  padding: "24px",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "var(--foreground, #f8fafc)"
};
var sectionStyle = {
  display: "grid",
  gap: "12px",
  padding: "16px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "12px",
  background: "var(--card, #0f172a)"
};
var headerRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px"
};
var titleStyle = {
  margin: 0,
  fontSize: "28px",
  lineHeight: 1.2,
  fontWeight: 700
};
var sectionTitleStyle = {
  margin: 0,
  fontSize: "18px",
  lineHeight: 1.3,
  fontWeight: 600
};
var mutedTextStyle = {
  margin: 0,
  color: "var(--muted-foreground, #94a3b8)",
  fontSize: "14px",
  lineHeight: 1.5
};
var tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px"
};
var thStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border, #334155)",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted-foreground, #94a3b8)"
};
var tdStyle = {
  padding: "12px",
  borderBottom: "1px solid var(--border, #334155)",
  verticalAlign: "top"
};
var widgetStyle = {
  display: "grid",
  gap: "10px",
  padding: "14px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "12px",
  background: "var(--card, #0f172a)",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "var(--foreground, #f8fafc)"
};
var widgetTitleStyle = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.2,
  fontWeight: 600
};
var widgetCountStyle = {
  fontSize: "28px",
  lineHeight: 1,
  fontWeight: 700
};
var badgeRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px"
};
var buttonStyle = {
  padding: "8px 12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--card, #0f172a)",
  color: "var(--foreground, #f8fafc)",
  cursor: "pointer",
  fontSize: "13px"
};
var buttonDisabledStyle = {
  opacity: 0.65,
  cursor: "not-allowed"
};
var primaryButtonStyle = {
  ...buttonStyle,
  background: "color-mix(in srgb, var(--foreground, #f8fafc) 14%, var(--card, #0f172a))"
};
var dangerButtonStyle = {
  ...buttonStyle,
  background: "color-mix(in srgb, var(--muted-foreground, #94a3b8) 24%, var(--card, #0f172a))"
};
var inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--background, #020617)",
  color: "var(--foreground, #f8fafc)",
  fontSize: "13px"
};
var textareaStyle = {
  ...inputStyle,
  minHeight: "150px",
  resize: "vertical"
};
var formPanelStyle = {
  display: "grid",
  gap: "10px",
  padding: "12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "10px",
  background: "var(--card, #0f172a)"
};
var filterTabStyle = (isActive) => ({
  padding: "6px 14px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "6px",
  background: isActive ? "color-mix(in srgb, var(--foreground, #f8fafc) 14%, var(--card, #0f172a))" : "var(--card, #0f172a)",
  color: "var(--foreground, #f8fafc)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: isActive ? 700 : 500,
  opacity: isActive ? 1 : 0.7
});
var LABEL_COLOR_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#6366f1", "#ec4899"];
function normalizeLabel(input) {
  return {
    id: String(input.id ?? ""),
    name: String(input.name ?? input.id ?? ""),
    color: typeof input.color === "string" && input.color.trim() ? input.color : "#6366f1"
  };
}
function apiBaseUrl() {
  if (typeof window !== "undefined" && typeof window.location?.origin === "string" && window.location.origin.startsWith("http")) {
    return window.location.origin;
  }
  return "http://localhost:3100";
}
function companyLabelsUrl(companyId) {
  return `${apiBaseUrl()}/api/companies/${encodeURIComponent(companyId)}/labels`;
}
async function fetchCompanyLabels(companyId) {
  if (!companyId.trim()) {
    return [];
  }
  try {
    const res = await fetch(companyLabelsUrl(companyId));
    if (!res.ok) {
      return [];
    }
    const raw = await res.json();
    return raw.map(normalizeLabel).filter((label) => label.id);
  } catch {
    return [];
  }
}
async function createCompanyLabel(companyId, name, color) {
  const res = await fetch(companyLabelsUrl(companyId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `\uB808\uC774\uBE14 \uC0DD\uC131 \uC2E4\uD328 (${res.status})`);
  }
  const payload = await res.json();
  return normalizeLabel(payload);
}
function toggleLabelId(selectedIds, labelId) {
  return selectedIds.includes(labelId) ? selectedIds.filter((id) => id !== labelId) : [...selectedIds, labelId];
}
function labelChipStyle(color, selected) {
  return {
    ...inputStyle,
    width: "auto",
    padding: "6px 10px",
    border: `1px solid ${color}`,
    background: selected ? color : "transparent",
    color: selected ? "#ffffff" : color,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontWeight: 600,
    whiteSpace: "nowrap"
  };
}
function useWorkflowOverview(companyId) {
  return usePluginData("workflow-overview", {
    companyId: companyId ?? ""
  });
}
function statusBadgeStyle(status) {
  const normalized = status.trim().toLowerCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    border: "1px solid var(--border, #334155)",
    color: "var(--foreground, #f8fafc)"
  };
  if (normalized === "running" || normalized === "active") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--foreground, #f8fafc) 16%, var(--background, #020617))"
    };
  }
  if (normalized === "completed") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--foreground, #f8fafc) 22%, var(--background, #020617))"
    };
  }
  if (normalized === "failed" || normalized === "aborted") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--muted-foreground, #94a3b8) 26%, var(--background, #020617))"
    };
  }
  if (normalized === "timed-out" || normalized === "paused") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--muted-foreground, #94a3b8) 20%, var(--background, #020617))"
    };
  }
  return {
    ...base,
    background: "color-mix(in srgb, var(--background, #020617) 78%, var(--card, #0f172a))"
  };
}
function formatDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(void 0, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}
function countStatuses(activeRuns) {
  const counts = /* @__PURE__ */ new Map();
  for (const run of activeRuns) {
    const status = run.status.trim().toLowerCase() || "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
}
function normalizeMaxDailyRunsInput(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: void 0 };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { value: void 0, error: "maxDailyRuns\uB294 0 \uC774\uC0C1\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4." };
  }
  return { value: parsed };
}
var selectStyle = {
  ...inputStyle,
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: "28px"
};
var stepCardStyle = {
  display: "grid",
  gap: "8px",
  padding: "12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--background, #020617)"
};
var stepRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px"
};
function emptyStep() {
  return { id: "", title: "", description: "", type: "agent", toolName: "", toolArgs: "{}", agentName: "", tools: "", dependsOn: "", onFailure: "" };
}
var collapsedStepHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--background, #020617)",
  cursor: "pointer",
  fontSize: "13px",
  userSelect: "none"
};
var selectedStepOutlineStyle = {
  outline: "2px solid color-mix(in srgb, var(--foreground, #f8fafc) 40%, transparent)",
  outlineOffset: "-2px"
};
function StepEditor({
  steps,
  onChange
}) {
  const [collapsedSet, setCollapsedSet] = useState(() => new Set(steps.map((_, i) => i)));
  const [selectedIndex, setSelectedIndex] = useState(null);
  function toggleCollapse(index) {
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }
  function update(index, patch) {
    const next = steps.map((s, i) => i === index ? { ...s, ...patch } : s);
    onChange(next);
  }
  function remove(index) {
    onChange(steps.filter((_, i) => i !== index));
    setCollapsedSet((prev) => {
      const next = /* @__PURE__ */ new Set();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
    if (selectedIndex === index) setSelectedIndex(null);
    else if (selectedIndex !== null && selectedIndex > index) setSelectedIndex(selectedIndex - 1);
  }
  function add() {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < steps.length) {
      const afterStep = steps[selectedIndex];
      const newStep = { ...emptyStep(), dependsOn: afterStep.id.trim() };
      const insertAt = selectedIndex + 1;
      const next = [...steps.slice(0, insertAt), newStep, ...steps.slice(insertAt)];
      onChange(next);
      setCollapsedSet((prev) => {
        const shifted = /* @__PURE__ */ new Set();
        for (const idx of prev) {
          if (idx < insertAt) shifted.add(idx);
          else shifted.add(idx + 1);
        }
        return shifted;
      });
      setSelectedIndex(insertAt);
    } else {
      onChange([...steps, emptyStep()]);
      setSelectedIndex(steps.length);
    }
  }
  const allIds = steps.map((s) => s.id).filter(Boolean);
  return /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { ...mutedTextStyle, fontWeight: 600 }, children: [
        "Steps (",
        steps.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px", alignItems: "center" }, children: [
        selectedIndex !== null && /* @__PURE__ */ jsxs("span", { style: { fontSize: "11px", color: "var(--muted-foreground, #94a3b8)" }, children: [
          "insert after step ",
          selectedIndex + 1
        ] }),
        /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: add, children: "+ Add Step" })
      ] })
    ] }),
    steps.map((step, i) => {
      const isCollapsed = collapsedSet.has(i);
      const isSelected = selectedIndex === i;
      if (isCollapsed) {
        return /* @__PURE__ */ jsxs(
          "div",
          {
            style: {
              ...collapsedStepHeaderStyle,
              ...isSelected ? selectedStepOutlineStyle : {}
            },
            onClick: () => {
              setSelectedIndex(isSelected ? null : i);
            },
            onDoubleClick: () => toggleCollapse(i),
            children: [
              /* @__PURE__ */ jsx("span", { style: { fontSize: "11px", color: "var(--muted-foreground, #94a3b8)", minWidth: "18px" }, children: i + 1 }),
              /* @__PURE__ */ jsx("span", { style: { fontSize: "13px" }, children: step.type === "tool" ? "\u{1F527}" : "\u{1F916}" }),
              /* @__PURE__ */ jsx("span", { style: { fontWeight: 600, fontSize: "13px", color: "var(--foreground, #f8fafc)" }, children: step.id || "(no id)" }),
              step.title && /* @__PURE__ */ jsxs("span", { style: { color: "var(--muted-foreground, #94a3b8)", fontSize: "12px" }, children: [
                "\u2014 ",
                step.title
              ] }),
              /* @__PURE__ */ jsxs("span", { style: { marginLeft: "auto", display: "flex", gap: "4px", alignItems: "center" }, children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    style: { ...buttonStyle, padding: "2px 8px", fontSize: "11px" },
                    onClick: (e) => {
                      e.stopPropagation();
                      toggleCollapse(i);
                    },
                    children: "Expand"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    style: { ...dangerButtonStyle, padding: "2px 8px", fontSize: "11px" },
                    onClick: (e) => {
                      e.stopPropagation();
                      remove(i);
                    },
                    children: "Remove"
                  }
                )
              ] })
            ]
          },
          i
        );
      }
      return /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            ...stepCardStyle,
            ...isSelected ? selectedStepOutlineStyle : {}
          },
          onClick: () => setSelectedIndex(isSelected ? null : i),
          children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsxs("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--muted-foreground, #94a3b8)" }, children: [
                "Step ",
                i + 1,
                " \u2014 ",
                step.type === "tool" ? "\u{1F527} Tool" : "\u{1F916} Agent"
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("button", { type: "button", style: { ...buttonStyle, padding: "4px 8px", fontSize: "11px" }, onClick: (e) => {
                  e.stopPropagation();
                  toggleCollapse(i);
                }, children: "Collapse" }),
                /* @__PURE__ */ jsx("button", { type: "button", style: { ...dangerButtonStyle, padding: "4px 8px", fontSize: "11px" }, onClick: (e) => {
                  e.stopPropagation();
                  remove(i);
                }, children: "Remove" })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: stepRowStyle, onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "ID" }),
                /* @__PURE__ */ jsx("input", { style: inputStyle, value: step.id, placeholder: "gather", onChange: (e) => update(i, { id: e.target.value }) })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Title" }),
                /* @__PURE__ */ jsx("input", { style: inputStyle, value: step.title, placeholder: "\uB370\uC774\uD130 \uC218\uC9D1", onChange: (e) => update(i, { title: e.target.value }) })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Description (\uC5D0\uC774\uC804\uD2B8\uC5D0\uAC8C \uC804\uB2EC\uD560 \uC791\uC5C5 \uC9C0\uC2DC)" }),
              /* @__PURE__ */ jsx("textarea", { style: { ...textareaStyle, minHeight: "120px" }, value: step.description, placeholder: "\uC218\uC9D1\uB41C \uB370\uC774\uD130\uB97C \uBD84\uC11D\uD558\uC5EC \uBCF4\uACE0\uC11C\uB97C \uC791\uC131\uD558\uC138\uC694.", onChange: (e) => update(i, { description: e.target.value }), rows: 2 })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: stepRowStyle, onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Type" }),
                /* @__PURE__ */ jsxs("select", { style: selectStyle, value: step.type, onChange: (e) => update(i, { type: e.target.value }), children: [
                  /* @__PURE__ */ jsxs("option", { value: "tool", children: [
                    "\u{1F527}",
                    " Tool (\uC2DC\uC2A4\uD15C \uC2E4\uD589)"
                  ] }),
                  /* @__PURE__ */ jsxs("option", { value: "agent", children: [
                    "\u{1F916}",
                    " Agent (\uC5D0\uC774\uC804\uD2B8 \uC791\uC5C5)"
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "4px" }, children: step.type === "tool" ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Tool Name" }),
                /* @__PURE__ */ jsx("input", { style: inputStyle, value: step.toolName, placeholder: "daily-tech-scout", onChange: (e) => update(i, { toolName: e.target.value }) })
              ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Agent Name" }),
                /* @__PURE__ */ jsx("input", { style: inputStyle, value: step.agentName, placeholder: "\uD5D0\uD06C", onChange: (e) => update(i, { agentName: e.target.value }) })
              ] }) })
            ] }),
            step.type === "agent" && /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Tools (\uC5D0\uC774\uC804\uD2B8\uAC00 \uC0AC\uC6A9\uD560 \uB3C4\uAD6C, comma-separated)" }),
              /* @__PURE__ */ jsx("input", { style: inputStyle, value: step.tools, placeholder: "write-obsidian-report", onChange: (e) => update(i, { tools: e.target.value }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: stepRowStyle, onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Depends On (comma-separated IDs)" }),
                /* @__PURE__ */ jsx("input", { style: inputStyle, value: step.dependsOn, placeholder: allIds.filter((id) => id !== step.id).join(", ") || "none", onChange: (e) => update(i, { dependsOn: e.target.value }) })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "On Failure" }),
                /* @__PURE__ */ jsxs("select", { style: selectStyle, value: step.onFailure, onChange: (e) => update(i, { onFailure: e.target.value }), children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "default" }),
                  /* @__PURE__ */ jsx("option", { value: "retry", children: "retry" }),
                  /* @__PURE__ */ jsx("option", { value: "skip", children: "skip" }),
                  /* @__PURE__ */ jsx("option", { value: "abort_workflow", children: "abort workflow" })
                ] })
              ] })
            ] })
          ]
        },
        i
      );
    }),
    steps.length === 0 && /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: 'No steps yet. Click "+ Add Step" to begin.' })
  ] });
}
function stepsToJson(drafts) {
  return drafts.map((d) => {
    const step = {
      id: d.id.trim(),
      title: d.title.trim(),
      description: d.description.trim() || void 0,
      type: d.type,
      dependsOn: d.dependsOn.split(",").map((s) => s.trim()).filter(Boolean)
    };
    if (d.type === "tool") {
      step.toolName = d.toolName.trim();
      try {
        step.toolArgs = JSON.parse(d.toolArgs || "{}");
      } catch {
        step.toolArgs = {};
      }
    } else {
      if (d.agentName.trim()) step.agentName = d.agentName.trim();
      const toolsList = d.tools.split(",").map((t) => t.trim()).filter(Boolean);
      if (toolsList.length > 0) step.tools = toolsList;
    }
    if (d.onFailure) step.onFailure = d.onFailure;
    return step;
  });
}
function jsonToSteps(steps) {
  return steps.map((s) => {
    const raw = s;
    return {
      id: s.id,
      title: s.title,
      description: raw.description || "",
      type: s.type || "agent",
      toolName: s.toolName || "",
      toolArgs: "{}",
      agentName: s.agentName || "",
      tools: Array.isArray(raw.tools) ? raw.tools.join(", ") : "",
      dependsOn: s.dependsOn.join(", "),
      onFailure: ""
    };
  });
}
function ErrorState({
  message,
  onRetry,
  retrying
}) {
  return /* @__PURE__ */ jsxs("div", { style: sectionStyle, children: [
    /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: message }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(
      "button",
      {
        onClick: () => {
          void onRetry();
        },
        style: retrying ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle,
        type: "button",
        disabled: retrying,
        children: retrying ? "\uAC31\uC2E0 \uC911..." : "Retry"
      }
    ) })
  ] });
}
function DefinitionsTable({
  workflows,
  companyId,
  refreshOverview,
  projects,
  labels,
  refreshLabels
}) {
  const updateWorkflow = usePluginAction("update-workflow");
  const deleteWorkflow = usePluginAction("delete-workflow");
  const runWorkflow = usePluginAction("start-workflow");
  const [editingWorkflowId, setEditingWorkflowId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingStatus, setEditingStatus] = useState("active");
  const [editingTriggerLabels, setEditingTriggerLabels] = useState("");
  const [editingLabelIds, setEditingLabelIds] = useState([]);
  const [showNewLabelForm, setShowNewLabelForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState("");
  const [editingMaxDailyRuns, setEditingMaxDailyRuns] = useState("");
  const [editingTimezone, setEditingTimezone] = useState("Asia/Seoul");
  const [editingProjectId, setEditingProjectId] = useState("");
  const [editingSteps, setEditingSteps] = useState([]);
  const [editJsonMode, setEditJsonMode] = useState(false);
  const [editJsonText, setEditJsonText] = useState("");
  const [pendingWorkflowId, setPendingWorkflowId] = useState(null);
  const [tableError, setTableError] = useState("");
  function beginEdit(workflow) {
    setTableError("");
    setEditingWorkflowId(workflow.id);
    setEditingName(workflow.name);
    setEditingDescription(workflow.description);
    setEditingStatus(workflow.status);
    setEditingTriggerLabels((workflow.triggerLabels ?? []).join(", "));
    setEditingLabelIds(workflow.labelIds ?? []);
    setShowNewLabelForm(false);
    setNewLabelName("");
    setNewLabelColor("#6366f1");
    const rawWorkflow = workflow;
    const rawSchedule = rawWorkflow.schedule;
    const rawProjectId = rawWorkflow.projectId;
    const rawTimezone = rawWorkflow.timezone;
    const rawMaxDailyRuns = rawWorkflow.maxDailyRuns;
    setEditingSchedule(typeof rawSchedule === "string" ? rawSchedule : "");
    setEditingProjectId(typeof rawProjectId === "string" ? rawProjectId : "");
    setEditingTimezone(typeof rawTimezone === "string" && rawTimezone.trim() ? rawTimezone : "Asia/Seoul");
    setEditingMaxDailyRuns(
      typeof rawMaxDailyRuns === "number" && Number.isFinite(rawMaxDailyRuns) ? String(Math.trunc(rawMaxDailyRuns)) : ""
    );
    setEditingSteps(jsonToSteps(workflow.steps));
    setEditJsonMode(false);
    setEditJsonText(JSON.stringify(workflow.steps, null, 2));
  }
  function cancelEdit() {
    setEditingWorkflowId(null);
    setEditingName("");
    setEditingDescription("");
    setEditingStatus("active");
    setEditingTriggerLabels("");
    setEditingLabelIds([]);
    setShowNewLabelForm(false);
    setNewLabelName("");
    setNewLabelColor("#6366f1");
    setEditingSchedule("");
    setEditingMaxDailyRuns("");
    setEditingTimezone("Asia/Seoul");
    setEditingProjectId("");
    setEditingSteps([]);
    setEditJsonMode(false);
    setEditJsonText("");
    setTableError("");
  }
  async function onSaveEdit(workflowId) {
    const nextName = editingName.trim();
    if (!nextName) {
      setTableError("name\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.");
      return;
    }
    setPendingWorkflowId(workflowId);
    setTableError("");
    try {
      const parsedMaxDailyRuns = normalizeMaxDailyRunsInput(editingMaxDailyRuns);
      if (parsedMaxDailyRuns.error) {
        setTableError(parsedMaxDailyRuns.error);
        return;
      }
      const triggerLabels = editingTriggerLabels.split(",").map((l) => l.trim()).filter(Boolean);
      const labelIds = editingLabelIds.map((l) => l.trim()).filter(Boolean);
      let steps;
      if (editJsonMode) {
        try {
          steps = JSON.parse(editJsonText);
          if (!Array.isArray(steps)) {
            setTableError("steps\uB294 JSON \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
            return;
          }
        } catch (e) {
          setTableError(`JSON \uD30C\uC2F1 \uC2E4\uD328: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
      } else {
        steps = stepsToJson(editingSteps);
      }
      const patch = {
        name: nextName,
        description: editingDescription.trim(),
        status: editingStatus.trim() || "active",
        triggerLabels,
        labelIds,
        steps,
        schedule: editingSchedule.trim(),
        maxDailyRuns: parsedMaxDailyRuns.value,
        timezone: editingTimezone.trim(),
        projectId: editingProjectId.trim()
      };
      await updateWorkflow({
        companyId,
        workflowId,
        id: workflowId,
        patch,
        ...patch
      });
      cancelEdit();
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`\uC218\uC815 \uC2E4\uD328: ${message}`);
    } finally {
      setPendingWorkflowId(null);
    }
  }
  async function onCreateLabelForEditForm() {
    const name = newLabelName.trim();
    if (!name) {
      setTableError("\uC0C8 \uB808\uC774\uBE14 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694.");
      return;
    }
    if (!companyId.trim()) {
      setTableError("companyId\uAC00 \uC5C6\uC5B4 \uB808\uC774\uBE14\uC744 \uC0DD\uC131\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    setTableError("");
    setCreatingLabel(true);
    try {
      const created = await createCompanyLabel(companyId, name, newLabelColor);
      const nextLabels = await refreshLabels();
      const createdId = nextLabels.find((label) => label.id === created.id)?.id ?? created.id;
      setEditingLabelIds((prev) => prev.includes(createdId) ? prev : [...prev, createdId]);
      setNewLabelName("");
      setNewLabelColor("#6366f1");
      setShowNewLabelForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`\uB808\uC774\uBE14 \uC0DD\uC131 \uC2E4\uD328: ${message}`);
    } finally {
      setCreatingLabel(false);
    }
  }
  async function onDeleteWorkflow(workflow) {
    const accepted = typeof window !== "undefined" ? window.confirm(`"${workflow.name}" \uC6CC\uD06C\uD50C\uB85C\uB97C \uBCF4\uAD00\uD560\uAE4C\uC694?`) : true;
    if (!accepted) {
      return;
    }
    setPendingWorkflowId(workflow.id);
    setTableError("");
    try {
      await deleteWorkflow({
        companyId,
        workflowId: workflow.id,
        id: workflow.id,
        status: "archived"
      });
      if (editingWorkflowId === workflow.id) {
        cancelEdit();
      }
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`\uC0AD\uC81C \uC2E4\uD328: ${message}`);
    } finally {
      setPendingWorkflowId(null);
    }
  }
  async function onToggleStatus(workflow) {
    const normalized = workflow.status.trim().toLowerCase();
    if (normalized !== "active" && normalized !== "paused") {
      return;
    }
    const nextStatus = normalized === "active" ? "paused" : "active";
    setPendingWorkflowId(workflow.id);
    setTableError("");
    try {
      await updateWorkflow({
        companyId,
        workflowId: workflow.id,
        id: workflow.id,
        patch: { status: nextStatus },
        status: nextStatus
      });
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`status \uBCC0\uACBD \uC2E4\uD328: ${message}`);
    } finally {
      setPendingWorkflowId(null);
    }
  }
  async function onRestoreWorkflow(workflow) {
    setPendingWorkflowId(workflow.id);
    setTableError("");
    try {
      await updateWorkflow({
        companyId,
        workflowId: workflow.id,
        id: workflow.id,
        patch: { status: "active" },
        status: "active"
      });
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`\uBCF5\uC6D0 \uC2E4\uD328: ${message}`);
    } finally {
      setPendingWorkflowId(null);
    }
  }
  if (workflows.length === 0) {
    return /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "No workflows defined yet." });
  }
  return /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "8px" }, children: [
    tableError ? /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: tableError }) : null,
    /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Name" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Status" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Step Count" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        workflows.map((workflow) => {
          const isEditing = editingWorkflowId === workflow.id;
          const isPending = pendingWorkflowId === workflow.id;
          const normalizedStatus = workflow.status.trim().toLowerCase();
          return /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { style: tdStyle, colSpan: isEditing ? 4 : 1, children: isEditing ? /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px" }, children: [
              /* @__PURE__ */ jsxs("div", { style: stepRowStyle, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Name" }),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      style: inputStyle,
                      value: editingName,
                      onChange: (event) => setEditingName(event.target.value),
                      required: true
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Status" }),
                  /* @__PURE__ */ jsxs(
                    "select",
                    {
                      style: selectStyle,
                      value: editingStatus,
                      onChange: (event) => setEditingStatus(event.target.value),
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "active", children: "active" }),
                        /* @__PURE__ */ jsx("option", { value: "paused", children: "paused" }),
                        /* @__PURE__ */ jsx("option", { value: "archived", children: "archived" })
                      ]
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Description" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    style: textareaStyle,
                    value: editingDescription,
                    onChange: (event) => setEditingDescription(event.target.value),
                    rows: 2
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { style: stepRowStyle, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Schedule (cron)" }),
                  /* @__PURE__ */ jsx("input", { style: inputStyle, value: editingSchedule, onChange: (e) => setEditingSchedule(e.target.value), placeholder: "0 9 * * * (\uB9E4\uC77C 9\uC2DC)" })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Project" }),
                  /* @__PURE__ */ jsxs("select", { style: selectStyle, value: editingProjectId, onChange: (e) => setEditingProjectId(e.target.value), children: [
                    /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 none \u2014" }),
                    projects.map((p) => /* @__PURE__ */ jsx("option", { value: p.id, children: p.name }, p.id))
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: stepRowStyle, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Timezone" }),
                  /* @__PURE__ */ jsx("input", { style: inputStyle, value: editingTimezone, onChange: (e) => setEditingTimezone(e.target.value), placeholder: "Asia/Seoul" })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                  /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Max Daily Runs (optional)" }),
                  /* @__PURE__ */ jsx("input", { style: inputStyle, type: "number", min: 0, step: 1, value: editingMaxDailyRuns, onChange: (e) => setEditingMaxDailyRuns(e.target.value), placeholder: "blank=1/day, 0=unlimited" })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Trigger Labels (comma-separated)" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    style: inputStyle,
                    value: editingTriggerLabels,
                    onChange: (event) => setEditingTriggerLabels(event.target.value),
                    placeholder: "daily-tech-research"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
                /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "\uB808\uC774\uBE14 \uC120\uD0DD" }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" }, children: [
                  (labels ?? []).map((label) => {
                    const selected = editingLabelIds.includes(label.id);
                    return /* @__PURE__ */ jsxs(
                      "button",
                      {
                        type: "button",
                        style: labelChipStyle(label.color, selected),
                        onClick: () => setEditingLabelIds((prev) => toggleLabelId(prev, label.id)),
                        children: [
                          /* @__PURE__ */ jsx("span", { style: { width: "8px", height: "8px", borderRadius: "999px", background: selected ? "rgba(255,255,255,0.95)" : label.color } }),
                          label.name
                        ]
                      },
                      label.id
                    );
                  }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      style: buttonStyle,
                      onClick: () => {
                        setTableError("");
                        setShowNewLabelForm((prev) => !prev);
                      },
                      children: "+ \uC0C8 \uB808\uC774\uBE14"
                    }
                  )
                ] }),
                (labels ?? []).length === 0 ? /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uB808\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null,
                showNewLabelForm ? /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px", marginTop: "6px", padding: "8px", border: "1px solid var(--border, #334155)", borderRadius: "8px" }, children: [
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      style: inputStyle,
                      value: newLabelName,
                      onChange: (event) => setNewLabelName(event.target.value),
                      placeholder: "\uC0C8 \uB808\uC774\uBE14 \uC774\uB984"
                    }
                  ),
                  /* @__PURE__ */ jsx("select", { style: selectStyle, value: newLabelColor, onChange: (event) => setNewLabelColor(event.target.value), children: LABEL_COLOR_PRESETS.map((color) => /* @__PURE__ */ jsx("option", { value: color, children: color }, color)) }),
                  /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px" }, children: [
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        style: creatingLabel ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle,
                        disabled: creatingLabel,
                        onClick: () => {
                          void onCreateLabelForEditForm();
                        },
                        children: "\uB9CC\uB4E4\uAE30"
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        style: buttonStyle,
                        onClick: () => {
                          setShowNewLabelForm(false);
                          setNewLabelName("");
                          setNewLabelColor("#6366f1");
                        },
                        children: "\uB2EB\uAE30"
                      }
                    )
                  ] })
                ] }) : null
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
                /* @__PURE__ */ jsx("span", { style: { ...mutedTextStyle, fontWeight: 600 }, children: "Steps" }),
                /* @__PURE__ */ jsx("button", { type: "button", style: { ...buttonStyle, padding: "4px 10px", fontSize: "11px" }, onClick: () => {
                  if (!editJsonMode) {
                    setEditJsonText(JSON.stringify(stepsToJson(editingSteps), null, 2));
                  } else {
                    try {
                      setEditingSteps(jsonToSteps(JSON.parse(editJsonText)));
                    } catch {
                    }
                  }
                  setEditJsonMode(!editJsonMode);
                }, children: editJsonMode ? "Visual" : "JSON" })
              ] }),
              editJsonMode ? /* @__PURE__ */ jsx(
                "textarea",
                {
                  style: { ...textareaStyle, minHeight: "250px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px" },
                  value: editJsonText,
                  onChange: (e) => setEditJsonText(e.target.value),
                  rows: 10
                }
              ) : /* @__PURE__ */ jsx(StepEditor, { steps: editingSteps, onChange: setEditingSteps }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    style: isPending ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle,
                    disabled: isPending,
                    onClick: () => {
                      void onSaveEdit(workflow.id);
                    },
                    children: "Save"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    style: isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle,
                    disabled: isPending,
                    onClick: cancelEdit,
                    children: "Cancel"
                  }
                )
              ] })
            ] }) : /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
              /* @__PURE__ */ jsx("strong", { children: workflow.name }),
              /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: workflow.description || "-" }),
              (workflow.triggerLabels ?? []).length > 0 && /* @__PURE__ */ jsxs("span", { style: { ...mutedTextStyle, fontSize: "11px" }, children: [
                "Labels: ",
                workflow.triggerLabels.join(", ")
              ] })
            ] }) }),
            !isEditing && /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx("span", { style: statusBadgeStyle(workflow.status), children: workflow.status }) }),
            !isEditing && /* @__PURE__ */ jsx("td", { style: tdStyle, children: workflow.steps.length }),
            !isEditing && /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" }, children: normalizedStatus === "archived" ? /* @__PURE__ */ jsx("button", { type: "button", style: isPending ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle, disabled: isPending, onClick: () => {
              void onRestoreWorkflow(workflow);
            }, children: "\uBCF5\uC6D0" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("button", { type: "button", style: isPending ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle, disabled: isPending || normalizedStatus !== "active", onClick: () => {
                setPendingWorkflowId(workflow.id);
                setTableError("");
                void (async () => {
                  try {
                    await runWorkflow({ companyId, workflowId: workflow.id, createParentIssue: true });
                    await refreshOverview();
                  } catch (e) {
                    setTableError(`Run \uC2E4\uD328: ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setPendingWorkflowId(null);
                  }
                })();
              }, children: "\u25B6 Run" }),
              /* @__PURE__ */ jsx("button", { type: "button", style: isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle, disabled: isPending, onClick: () => beginEdit(workflow), children: "Edit" }),
              /* @__PURE__ */ jsx("button", { type: "button", style: isPending ? { ...dangerButtonStyle, ...buttonDisabledStyle } : dangerButtonStyle, disabled: isPending, onClick: () => {
                void onDeleteWorkflow(workflow);
              }, children: "\uBCF4\uAD00" }),
              /* @__PURE__ */ jsx("button", { type: "button", style: isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle, disabled: isPending || normalizedStatus !== "active" && normalizedStatus !== "paused", onClick: () => {
                void onToggleStatus(workflow);
              }, children: normalizedStatus === "active" ? "Pause" : "Activate" })
            ] }) }) })
          ] }, workflow.id);
        }),
        workflows.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 4, style: tdStyle, children: /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "No workflows defined yet." }) }) }) : null
      ] })
    ] })
  ] });
}
function ActiveRunsTable({ activeRuns, onAbort }) {
  if (activeRuns.length === 0) {
    return /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "No active runs." });
  }
  return /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Workflow" }),
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Run" }),
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Issue" }),
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Status" }),
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Started" }),
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Actions" })
    ] }) }),
    /* @__PURE__ */ jsx("tbody", { children: activeRuns.map((run) => /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("td", { style: tdStyle, children: run.workflowName }),
      /* @__PURE__ */ jsx("td", { style: tdStyle, children: run.runLabel && /* @__PURE__ */ jsx("span", { style: { fontSize: "12px", fontWeight: 600 }, children: run.runLabel }) }),
      /* @__PURE__ */ jsx("td", { style: tdStyle, children: run.parentIssueId && /* @__PURE__ */ jsx(
        "a",
        {
          href: `/issues/${run.parentIssueId}`,
          style: { color: "var(--link, #60a5fa)", fontSize: "12px", textDecoration: "none" },
          title: run.parentIssueId,
          children: run.parentIssueIdentifier || run.parentIssueId.slice(0, 8)
        }
      ) }),
      /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx("span", { style: statusBadgeStyle(run.status), children: run.status }) }),
      /* @__PURE__ */ jsx("td", { style: tdStyle, children: formatDateTime(run.startedAt) }),
      /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx("button", { type: "button", style: dangerButtonStyle, onClick: () => onAbort(run.id), children: "Abort" }) })
    ] }, run.id)) })
  ] });
}
function WorkflowPage(props) {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";
  const overview = useWorkflowOverview(companyId);
  const createWorkflow = usePluginAction("create-workflow");
  const abortRun = usePluginAction("abort-run");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState("active");
  const [showNewWorkflowForm, setShowNewWorkflowForm] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowDescription, setNewWorkflowDescription] = useState("");
  const [newWorkflowSteps, setNewWorkflowSteps] = useState([]);
  const [newJsonMode, setNewJsonMode] = useState(false);
  const [newJsonText, setNewJsonText] = useState("[]");
  const [newTriggerLabels, setNewTriggerLabels] = useState("");
  const [newLabelIds, setNewLabelIds] = useState([]);
  const [showNewLabelForm, setShowNewLabelForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newSchedule, setNewSchedule] = useState("");
  const [newMaxDailyRuns, setNewMaxDailyRuns] = useState("");
  const [newTimezone, setNewTimezone] = useState("Asia/Seoul");
  const [newProjectId, setNewProjectId] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [labels, setLabels] = useState([]);
  async function refreshOverview() {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await overview.refresh();
    } finally {
      setIsRefreshing(false);
    }
  }
  useEffect(() => {
    const nextLabels = overview.data?.labels ?? [];
    setLabels(nextLabels.map((label) => ({
      id: String(label.id),
      name: String(label.name ?? label.id),
      color: typeof label.color === "string" && label.color.trim() ? label.color : "#6366f1"
    })));
  }, [overview.data?.labels]);
  useEffect(() => {
    if (!companyId.trim()) {
      setLabels([]);
    }
  }, [companyId]);
  async function refreshLabels() {
    const next = await fetchCompanyLabels(companyId);
    setLabels(next);
    return next;
  }
  function resetCreateForm() {
    setNewWorkflowName("");
    setNewWorkflowDescription("");
    setNewWorkflowSteps([]);
    setNewJsonMode(false);
    setNewJsonText("[]");
    setNewTriggerLabels("");
    setNewLabelIds([]);
    setShowNewLabelForm(false);
    setNewLabelName("");
    setNewLabelColor("#6366f1");
    setNewSchedule("");
    setNewMaxDailyRuns("");
    setNewTimezone("Asia/Seoul");
    setNewProjectId("");
    setCreateError("");
    setShowNewWorkflowForm(false);
  }
  async function onCreateWorkflow(event) {
    event.preventDefault();
    const name = newWorkflowName.trim();
    if (!name) {
      setCreateError("name\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.");
      return;
    }
    let parsedSteps;
    if (newJsonMode) {
      try {
        parsedSteps = JSON.parse(newJsonText);
        if (!Array.isArray(parsedSteps)) {
          setCreateError("steps\uB294 JSON \uBC30\uC5F4\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
          return;
        }
      } catch (e) {
        setCreateError(`JSON \uD30C\uC2F1 \uC2E4\uD328: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    } else {
      parsedSteps = stepsToJson(newWorkflowSteps);
    }
    const invalidStep = parsedSteps.find((s) => !s.id);
    if (invalidStep) {
      setCreateError("\uBAA8\uB4E0 step\uC5D0 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
      return;
    }
    setCreateError("");
    setIsCreating(true);
    try {
      const parsedMaxDailyRuns = normalizeMaxDailyRunsInput(newMaxDailyRuns);
      if (parsedMaxDailyRuns.error) {
        setCreateError(parsedMaxDailyRuns.error);
        return;
      }
      const description = newWorkflowDescription.trim();
      const triggerLabels = newTriggerLabels.split(",").map((l) => l.trim()).filter(Boolean);
      const labelIds = newLabelIds.map((l) => l.trim()).filter(Boolean);
      const workflow = {
        name,
        description,
        status: "active",
        steps: parsedSteps,
        maxDailyRuns: parsedMaxDailyRuns.value,
        timezone: newTimezone.trim() || void 0,
        ...triggerLabels.length > 0 ? { triggerLabels } : {},
        ...labelIds.length > 0 ? { labelIds } : {},
        ...newSchedule.trim() ? { schedule: newSchedule.trim() } : {},
        ...newProjectId.trim() ? { projectId: newProjectId.trim() } : {}
      };
      await createWorkflow({
        companyId,
        workflow,
        ...workflow
      });
      resetCreateForm();
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreateError(`\uC0DD\uC131 \uC2E4\uD328: ${message}`);
    } finally {
      setIsCreating(false);
    }
  }
  async function onCreateLabelForCreateForm() {
    const name = newLabelName.trim();
    if (!name) {
      setCreateError("\uC0C8 \uB808\uC774\uBE14 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694.");
      return;
    }
    if (!companyId.trim()) {
      setCreateError("companyId\uAC00 \uC5C6\uC5B4 \uB808\uC774\uBE14\uC744 \uC0DD\uC131\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    setCreateError("");
    setCreatingLabel(true);
    try {
      const created = await createCompanyLabel(companyId, name, newLabelColor);
      const nextLabels = await refreshLabels();
      const createdId = nextLabels.find((label) => label.id === created.id)?.id ?? created.id;
      setNewLabelIds((prev) => prev.includes(createdId) ? prev : [...prev, createdId]);
      setNewLabelName("");
      setNewLabelColor("#6366f1");
      setShowNewLabelForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreateError(`\uB808\uC774\uBE14 \uC0DD\uC131 \uC2E4\uD328: ${message}`);
    } finally {
      setCreatingLabel(false);
    }
  }
  const refreshButtonLabel = isRefreshing ? "\uAC31\uC2E0 \uC911..." : "\u21BB Refresh";
  const allWorkflows = overview.data?.workflows ?? [];
  const activeWorkflows = useMemo(
    () => allWorkflows.filter((w) => w.status.trim().toLowerCase() !== "archived"),
    [allWorkflows]
  );
  const archivedWorkflows = useMemo(
    () => allWorkflows.filter((w) => w.status.trim().toLowerCase() === "archived"),
    [allWorkflows]
  );
  const filteredWorkflows = workflowStatusFilter === "active" ? activeWorkflows : archivedWorkflows;
  if (overview.loading) {
    return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: pageStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: headerRowStyle, children: [
        /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Workflows" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              void refreshOverview();
            },
            disabled: isRefreshing,
            style: isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle,
            children: refreshButtonLabel
          }
        )
      ] }),
      /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "Loading workflows..." })
    ] });
  }
  if (overview.error) {
    return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: pageStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: headerRowStyle, children: [
        /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Workflows" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              void refreshOverview();
            },
            disabled: isRefreshing,
            style: isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle,
            children: refreshButtonLabel
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        ErrorState,
        {
          message: `Failed to load workflows: ${overview.error.message}`,
          onRetry: refreshOverview,
          retrying: isRefreshing
        }
      )
    ] });
  }
  const data = overview.data ?? { workflows: [], activeRuns: [], projects: [], labels: [] };
  return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: pageStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: headerRowStyle, children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Workflows" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => {
            void refreshOverview();
          },
          disabled: isRefreshing,
          style: isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle,
          children: refreshButtonLabel
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { ...headerRowStyle, justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Workflow Definitions" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              style: showNewWorkflowForm ? { ...buttonStyle, ...buttonDisabledStyle } : primaryButtonStyle,
              disabled: showNewWorkflowForm,
              onClick: () => {
                setCreateError("");
                setShowNewWorkflowForm(true);
              },
              children: "+ New Workflow"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "Definitions available for this company." }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px" }, children: [
          /* @__PURE__ */ jsxs("button", { type: "button", style: filterTabStyle(workflowStatusFilter === "active"), onClick: () => setWorkflowStatusFilter("active"), children: [
            "\uD65C\uC131 (",
            activeWorkflows.length,
            ")"
          ] }),
          /* @__PURE__ */ jsxs("button", { type: "button", style: filterTabStyle(workflowStatusFilter === "archived"), onClick: () => setWorkflowStatusFilter("archived"), children: [
            "\uBCF4\uAD00 (",
            archivedWorkflows.length,
            ")"
          ] })
        ] })
      ] }),
      showNewWorkflowForm ? /* @__PURE__ */ jsxs("form", { style: formPanelStyle, onSubmit: (event) => void onCreateWorkflow(event), children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("label", { style: mutedTextStyle, children: "name" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              style: inputStyle,
              value: newWorkflowName,
              onChange: (event) => setNewWorkflowName(event.target.value),
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("label", { style: mutedTextStyle, children: "description" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              style: textareaStyle,
              value: newWorkflowDescription,
              onChange: (event) => setNewWorkflowDescription(event.target.value),
              rows: 3
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { style: stepRowStyle, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
            /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Schedule (cron)" }),
            /* @__PURE__ */ jsx("input", { style: inputStyle, value: newSchedule, onChange: (e) => setNewSchedule(e.target.value), placeholder: "0 9 * * * (\uB9E4\uC77C 9\uC2DC)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
            /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Project" }),
            /* @__PURE__ */ jsxs("select", { style: selectStyle, value: newProjectId, onChange: (e) => setNewProjectId(e.target.value), children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 none \u2014" }),
              (data.projects ?? []).map((p) => /* @__PURE__ */ jsx("option", { value: p.id, children: p.name }, p.id))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: stepRowStyle, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
            /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Timezone" }),
            /* @__PURE__ */ jsx("input", { style: inputStyle, value: newTimezone, onChange: (e) => setNewTimezone(e.target.value), placeholder: "Asia/Seoul" })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
            /* @__PURE__ */ jsx("label", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "Max Daily Runs (optional)" }),
            /* @__PURE__ */ jsx("input", { style: inputStyle, type: "number", min: 0, step: 1, value: newMaxDailyRuns, onChange: (e) => setNewMaxDailyRuns(e.target.value), placeholder: "blank=1/day, 0=unlimited" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("label", { style: mutedTextStyle, children: "trigger labels (comma-separated)" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              style: inputStyle,
              value: newTriggerLabels,
              onChange: (event) => setNewTriggerLabels(event.target.value),
              placeholder: "daily-tech-research"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("label", { style: mutedTextStyle, children: "\uB808\uC774\uBE14 \uC120\uD0DD" }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" }, children: [
            labels.map((label) => {
              const selected = newLabelIds.includes(label.id);
              return /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  style: labelChipStyle(label.color, selected),
                  onClick: () => setNewLabelIds((prev) => toggleLabelId(prev, label.id)),
                  children: [
                    /* @__PURE__ */ jsx("span", { style: { width: "8px", height: "8px", borderRadius: "999px", background: selected ? "rgba(255,255,255,0.95)" : label.color } }),
                    label.name
                  ]
                },
                label.id
              );
            }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                style: buttonStyle,
                onClick: () => {
                  setCreateError("");
                  setShowNewLabelForm((prev) => !prev);
                },
                children: "+ \uC0C8 \uB808\uC774\uBE14"
              }
            )
          ] }),
          labels.length === 0 ? /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontSize: "11px" }, children: "\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uB808\uC774\uBE14\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null,
          showNewLabelForm ? /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "6px", marginTop: "6px", padding: "8px", border: "1px solid var(--border, #334155)", borderRadius: "8px" }, children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                style: inputStyle,
                value: newLabelName,
                onChange: (event) => setNewLabelName(event.target.value),
                placeholder: "\uC0C8 \uB808\uC774\uBE14 \uC774\uB984"
              }
            ),
            /* @__PURE__ */ jsx("select", { style: selectStyle, value: newLabelColor, onChange: (event) => setNewLabelColor(event.target.value), children: LABEL_COLOR_PRESETS.map((color) => /* @__PURE__ */ jsx("option", { value: color, children: color }, color)) }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px" }, children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  style: creatingLabel ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle,
                  disabled: creatingLabel,
                  onClick: () => {
                    void onCreateLabelForCreateForm();
                  },
                  children: "\uB9CC\uB4E4\uAE30"
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  style: buttonStyle,
                  onClick: () => {
                    setShowNewLabelForm(false);
                    setNewLabelName("");
                    setNewLabelColor("#6366f1");
                  },
                  children: "\uB2EB\uAE30"
                }
              )
            ] })
          ] }) : null
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
          /* @__PURE__ */ jsx("span", { style: { ...mutedTextStyle, fontWeight: 600 }, children: "Steps" }),
          /* @__PURE__ */ jsx("button", { type: "button", style: { ...buttonStyle, padding: "4px 10px", fontSize: "11px" }, onClick: () => {
            if (!newJsonMode) {
              setNewJsonText(JSON.stringify(stepsToJson(newWorkflowSteps), null, 2));
            } else {
              try {
                setNewWorkflowSteps(jsonToSteps(JSON.parse(newJsonText)));
              } catch {
              }
            }
            setNewJsonMode(!newJsonMode);
          }, children: newJsonMode ? "Visual" : "JSON" })
        ] }),
        newJsonMode ? /* @__PURE__ */ jsx(
          "textarea",
          {
            style: { ...textareaStyle, minHeight: "250px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px" },
            value: newJsonText,
            onChange: (e) => setNewJsonText(e.target.value),
            rows: 10
          }
        ) : /* @__PURE__ */ jsx(StepEditor, { steps: newWorkflowSteps, onChange: setNewWorkflowSteps }),
        createError ? /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: createError }) : null,
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "submit",
              style: isCreating ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle,
              disabled: isCreating,
              children: "Save"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              style: isCreating ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle,
              disabled: isCreating,
              onClick: resetCreateForm,
              children: "Cancel"
            }
          )
        ] })
      ] }) : null,
      /* @__PURE__ */ jsx(
        DefinitionsTable,
        {
          workflows: filteredWorkflows,
          companyId,
          refreshOverview,
          projects: data.projects ?? [],
          labels,
          refreshLabels
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { ...headerRowStyle, justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Active Runs" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                void refreshOverview();
              },
              disabled: isRefreshing,
              style: isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle,
              children: refreshButtonLabel
            }
          )
        ] }),
        /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "Currently running or unresolved workflow executions." })
      ] }),
      /* @__PURE__ */ jsx(ActiveRunsTable, { activeRuns: data.activeRuns, onAbort: (runId) => {
        void (async () => {
          try {
            await abortRun({ runId });
            await refreshOverview();
          } catch {
          }
        })();
      } })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
        /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Help" }),
        /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: () => setShowHelp(!showHelp), children: showHelp ? "\uB2EB\uAE30" : "\uB3C4\uC6C0\uB9D0" })
      ] }),
      showHelp && /* @__PURE__ */ jsxs("div", { style: mutedTextStyle, children: [
        /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, fontSize: "15px", marginBottom: "8px" }, children: "Workflow Engine \uB3C4\uC6C0\uB9D0" }),
        /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "\uAE30\uBCF8 \uAC1C\uB150" }),
        /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Workflow" }),
            ": \uC5EC\uB7EC Step\uC73C\uB85C \uAD6C\uC131\uB41C \uC790\uB3D9\uD654 \uD30C\uC774\uD504\uB77C\uC778"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Step" }),
            ": Tool(\uC2DC\uC2A4\uD15C \uC2E4\uD589) \uB610\uB294 Agent(\uC5D0\uC774\uC804\uD2B8 \uC791\uC5C5) \uC720\uD615"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Tool Step" }),
            ": Tool Registry\uC5D0 \uB4F1\uB85D\uB41C \uB3C4\uAD6C\uB97C \uC2DC\uC2A4\uD15C\uC774 \uC9C1\uC811 \uC2E4\uD589"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Agent Step" }),
            ": \uC9C0\uC815\uB41C \uC5D0\uC774\uC804\uD2B8\uAC00 \uC774\uC288\uB97C \uBC1B\uC544 \uC791\uC5C5 \uC218\uD589"
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "Step \uC124\uC815" }),
        /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "ID" }),
            ": \uACE0\uC720 \uC2DD\uBCC4\uC790 (dependsOn\uC5D0\uC11C \uCC38\uC870)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Type" }),
            ": Tool(\uB3C4\uAD6C \uC2E4\uD589) / Agent(\uC5D0\uC774\uC804\uD2B8 \uC791\uC5C5)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Depends On" }),
            ": \uC120\uD589 step ID (\uC27C\uD45C \uAD6C\uBD84, \uBE44\uC6CC\uB450\uBA74 \uCCAB step)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "Tools" }),
            ": Agent step\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uB3C4\uAD6C \uC774\uB984 (\uC0AC\uC6A9\uBC95\uC774 \uC790\uB3D9 \uC804\uB2EC\uB428)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("strong", { children: "On Failure" }),
            ": \uC2E4\uD328 \uC2DC \uC815\uCC45 (retry/skip/abort)"
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "\uBCC0\uC218" }),
        /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "Step title\uC5D0 \uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uBCC0\uC218:" }),
        /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "{$date}" }),
            " \u2014 \uC2E4\uD589 \uB0A0\uC9DC (2026-03-25)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "{$runNumber}" }),
            " \u2014 \uB2F9\uC77C \uC2E4\uD589 \uBC88\uD638 (1, 2, ...)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "{$runLabel}" }),
            " \u2014 \uC2E4\uD589 \uB77C\uBCA8 (#2026-03-25-1)"
          ] }),
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("code", { children: "{$workflowName}" }),
            " \u2014 \uC6CC\uD06C\uD50C\uB85C\uC6B0 \uC774\uB984"
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "Schedule (Cron)" }),
        /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
          /* @__PURE__ */ jsxs("li", { children: [
            "\uD615\uC2DD: \uBD84 \uC2DC \uC77C \uC6D4 \uC694\uC77C (\uC608: ",
            /* @__PURE__ */ jsx("code", { children: "0 9 * * *" }),
            " = \uB9E4\uC77C 9\uC2DC)"
          ] }),
          /* @__PURE__ */ jsx("li", { children: "Reconciler\uAC00 5\uBD84 \uAC04\uACA9\uC73C\uB85C \uCCB4\uD06C\uD558\uC5EC \uC2E4\uD589" })
        ] })
      ] })
    ] })
  ] });
}
function WorkflowDashboardWidget(props) {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";
  const overview = useWorkflowOverview(companyId);
  if (overview.loading) {
    return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: widgetStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: widgetTitleStyle, children: "Workflows" }),
      /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Loading workflows..." })
    ] });
  }
  if (overview.error) {
    return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: widgetStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: widgetTitleStyle, children: "Workflows" }),
      /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "Unable to load workflow summary." })
    ] });
  }
  const data = overview.data ?? { workflows: [], activeRuns: [], projects: [], labels: [] };
  const statusCounts = countStatuses(data.activeRuns);
  return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: widgetStyle, children: [
    /* @__PURE__ */ jsx("h2", { style: widgetTitleStyle, children: "Workflows" }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: "8px" }, children: [
      /* @__PURE__ */ jsx("span", { style: widgetCountStyle, children: data.activeRuns.length }),
      /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "active runs" })
    ] }),
    /* @__PURE__ */ jsx("div", { style: badgeRowStyle, children: statusCounts.length > 0 ? statusCounts.map((item) => /* @__PURE__ */ jsxs("span", { style: statusBadgeStyle(item.status), children: [
      item.status,
      ": ",
      item.count
    ] }, item.status)) : /* @__PURE__ */ jsx("span", { style: mutedTextStyle, children: "No active runs." }) })
  ] });
}
function WorkflowSidebarLink({ context }) {
  const href = context.companyPrefix ? `/${context.companyPrefix}/workflows` : "/workflows";
  const isActive = typeof window !== "undefined" && window.location.pathname === href;
  return /* @__PURE__ */ jsx(
    "a",
    {
      href,
      style: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 12px",
        fontSize: "13px",
        fontWeight: 500,
        textDecoration: "none",
        color: isActive ? "var(--foreground, #f8fafc)" : "color-mix(in srgb, var(--foreground, #f8fafc) 80%, transparent)",
        background: isActive ? "var(--accent, rgba(125,211,252,0.12))" : "transparent",
        borderRadius: "8px"
      },
      children: /* @__PURE__ */ jsx("span", { children: "\u26A1 Workflows" })
    }
  );
}
export {
  WorkflowDashboardWidget,
  WorkflowPage,
  WorkflowSidebarLink
};
//# sourceMappingURL=index.js.map
