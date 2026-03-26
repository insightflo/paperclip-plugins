// src/ui/index.tsx
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast
} from "@paperclipai/plugin-sdk/ui";
import {
  useMemo,
  useState
} from "react";

// src/constants.ts
var DATA_KEYS = {
  pageData: "tool-registry.page-data"
};
var ACTION_KEYS = {
  createTool: "tool-registry.create-tool",
  updateTool: "tool-registry.update-tool",
  deleteTool: "tool-registry.delete-tool",
  restoreTool: "tool-registry.restore-tool",
  grantTool: "tool-registry.grant-tool",
  revokeTool: "tool-registry.revoke-tool"
};

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
var cardStyle = {
  display: "grid",
  gap: "12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "12px",
  background: "var(--card, #0f172a)",
  padding: "16px"
};
var headerRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px"
};
var titleStyle = {
  margin: 0,
  fontSize: "24px",
  lineHeight: 1.2,
  fontWeight: 700
};
var sectionTitleStyle = {
  margin: 0,
  fontSize: "16px",
  lineHeight: 1.3,
  fontWeight: 600
};
var mutedTextStyle = {
  margin: 0,
  fontSize: "13px",
  lineHeight: 1.4,
  color: "var(--muted-foreground, #94a3b8)"
};
var gridCols2Style = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "10px"
};
var inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  fontSize: "13px"
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
var primaryButtonStyle = {
  ...buttonStyle,
  background: "#111827",
  color: "#ffffff",
  borderColor: "var(--foreground, #f8fafc)"
};
var tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px"
};
var thStyle = {
  borderBottom: "1px solid var(--border, #334155)",
  textAlign: "left",
  padding: "8px 10px",
  fontSize: "11px",
  textTransform: "uppercase",
  color: "var(--muted-foreground, #94a3b8)",
  letterSpacing: "0.04em"
};
var tdStyle = {
  borderBottom: "1px solid var(--border, #1e293b)",
  padding: "9px 10px",
  verticalAlign: "top"
};
var codeStyle = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "11px",
  lineHeight: 1.45,
  color: "#374151"
};
function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(void 0, {
    dateStyle: "short",
    timeStyle: "short"
  }).format(parsed);
}
function truncate(value, max = 120) {
  if (!value) {
    return "";
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}\u2026`;
}
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
function ToolSection({
  data,
  companyId,
  refresh
}) {
  const toast = usePluginToast();
  const createToolAction = usePluginAction(ACTION_KEYS.createTool);
  const updateToolAction = usePluginAction(ACTION_KEYS.updateTool);
  const deleteToolAction = usePluginAction(ACTION_KEYS.deleteTool);
  const restoreToolAction = usePluginAction(ACTION_KEYS.restoreTool);
  const [statusFilter, setStatusFilter] = useState("active");
  const activeTools = useMemo(
    () => data.tools.filter((tool) => !tool.data.__deleted),
    [data.tools]
  );
  const archivedTools = useMemo(
    () => data.tools.filter((tool) => tool.data.__deleted === true),
    [data.tools]
  );
  const filteredTools = statusFilter === "active" ? activeTools : archivedTools;
  const [form, setForm] = useState({
    name: "",
    command: "",
    workingDirectory: "",
    description: "",
    instructions: "",
    requiresApproval: false
  });
  async function onCreateTool(event) {
    event.preventDefault();
    await createToolAction({
      companyId,
      tool: {
        name: form.name,
        command: form.command,
        workingDirectory: form.workingDirectory,
        description: form.description,
        instructions: form.instructions,
        requiresApproval: form.requiresApproval
      },
      actorName: "tool-registry-ui"
    });
    toast({ title: `Tool created: ${form.name}`, tone: "success" });
    setForm({ name: "", command: "", workingDirectory: "", description: "", instructions: "", requiresApproval: false });
    refresh();
  }
  async function onToggleApproval(tool) {
    await updateToolAction({
      companyId,
      toolName: tool.data.name,
      patch: {
        requiresApproval: !tool.data.requiresApproval
      }
    });
    toast({
      title: `${tool.data.name} approval ${tool.data.requiresApproval ? "disabled" : "enabled"}`,
      tone: "info"
    });
    refresh();
  }
  async function onDeleteTool(toolName) {
    await deleteToolAction({ companyId, toolName });
    toast({ title: `Tool archived: ${toolName}`, tone: "warn" });
    refresh();
  }
  async function onRestoreTool(toolName) {
    await restoreToolAction({ companyId, toolName });
    toast({ title: `Tool restored: ${toolName}`, tone: "success" });
    refresh();
  }
  return /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: headerRowStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Tool Config" }),
      /* @__PURE__ */ jsxs("p", { style: mutedTextStyle, children: [
        activeTools.length,
        " active / ",
        archivedTools.length,
        " archived"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px" }, children: [
      /* @__PURE__ */ jsxs("button", { type: "button", style: filterTabStyle(statusFilter === "active"), onClick: () => setStatusFilter("active"), children: [
        "\uD65C\uC131 (",
        activeTools.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxs("button", { type: "button", style: filterTabStyle(statusFilter === "archived"), onClick: () => setStatusFilter("archived"), children: [
        "\uBCF4\uAD00 (",
        archivedTools.length,
        ")"
      ] })
    ] }),
    statusFilter === "active" && /* @__PURE__ */ jsxs("form", { onSubmit: (event) => void onCreateTool(event), style: { display: "grid", gap: "10px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: gridCols2Style, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "Tool name (e.g. ripgrep)",
            style: inputStyle,
            value: form.name,
            onChange: (event) => setForm((prev) => ({ ...prev, name: event.target.value })),
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "Command (e.g. rg)",
            style: inputStyle,
            value: form.command,
            onChange: (event) => setForm((prev) => ({ ...prev, command: event.target.value })),
            required: true
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "Working directory (optional)",
            style: inputStyle,
            value: form.workingDirectory,
            onChange: (event) => setForm((prev) => ({ ...prev, workingDirectory: event.target.value }))
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "Description",
            style: inputStyle,
            value: form.description,
            onChange: (event) => setForm((prev) => ({ ...prev, description: event.target.value }))
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        "textarea",
        {
          placeholder: "Instructions (\uC5D0\uC774\uC804\uD2B8\uC5D0\uAC8C \uC804\uB2EC\uD560 \uC0AC\uC6A9\uBC95)",
          style: { ...inputStyle, minHeight: "150px", resize: "vertical", width: "100%", gridColumn: "1 / -1" },
          value: form.instructions,
          onChange: (event) => setForm((prev) => ({ ...prev, instructions: event.target.value })),
          rows: 3
        }
      ),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { style: primaryButtonStyle, type: "submit", children: "Create Tool" }) })
    ] }),
    /* @__PURE__ */ jsx(
      ToolTable,
      {
        tools: filteredTools,
        companyId,
        updateToolAction,
        onDeleteTool,
        onRestoreTool,
        refresh,
        toast,
        statusFilter
      }
    ),
    false
  ] });
}
function ToolTable({
  tools,
  companyId,
  updateToolAction,
  onDeleteTool,
  onRestoreTool,
  refresh,
  toast,
  statusFilter
}) {
  const [editingName, setEditingName] = useState(null);
  const [editForm, setEditForm] = useState({ command: "", workingDirectory: "", description: "", instructions: "" });
  function beginEdit(tool) {
    setEditingName(tool.data.name);
    setEditForm({
      command: tool.data.command,
      workingDirectory: tool.data.workingDirectory || "",
      description: tool.data.description || "",
      instructions: tool.data.instructions || ""
    });
  }
  async function saveEdit(toolName) {
    await updateToolAction({
      companyId,
      toolName,
      patch: {
        command: editForm.command,
        workingDirectory: editForm.workingDirectory || void 0,
        description: editForm.description || void 0,
        instructions: editForm.instructions || void 0
      }
    });
    toast({ title: `Tool updated: ${toolName}`, tone: "success" });
    setEditingName(null);
    refresh();
  }
  return /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Name" }),
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Command" }),
      /* @__PURE__ */ jsx("th", { style: thStyle, children: "Actions" })
    ] }) }),
    /* @__PURE__ */ jsxs("tbody", { children: [
      tools.map((tool) => {
        const isEditing = editingName === tool.data.name;
        return /* @__PURE__ */ jsx("tr", { children: isEditing ? /* @__PURE__ */ jsx("td", { style: tdStyle, colSpan: 3, children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "8px" }, children: [
          /* @__PURE__ */ jsx("strong", { children: tool.data.name }),
          /* @__PURE__ */ jsx("input", { style: inputStyle, value: editForm.command, placeholder: "Command", onChange: (e) => setEditForm((p) => ({ ...p, command: e.target.value })) }),
          /* @__PURE__ */ jsx("input", { style: inputStyle, value: editForm.workingDirectory, placeholder: "Working directory", onChange: (e) => setEditForm((p) => ({ ...p, workingDirectory: e.target.value })) }),
          /* @__PURE__ */ jsx("input", { style: inputStyle, value: editForm.description, placeholder: "Description", onChange: (e) => setEditForm((p) => ({ ...p, description: e.target.value })) }),
          /* @__PURE__ */ jsx("textarea", { style: { ...inputStyle, minHeight: "180px", resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px" }, value: editForm.instructions, placeholder: "Instructions (\uC5D0\uC774\uC804\uD2B8 \uC0AC\uC6A9\uBC95)", onChange: (e) => setEditForm((p) => ({ ...p, instructions: e.target.value })), rows: 5 }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px" }, children: [
            /* @__PURE__ */ jsx("button", { type: "button", style: primaryButtonStyle, onClick: () => void saveEdit(tool.data.name), children: "Save" }),
            /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: () => setEditingName(null), children: "Cancel" })
          ] })
        ] }) }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("td", { style: tdStyle, children: [
            /* @__PURE__ */ jsx("strong", { children: tool.data.name }),
            /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: tool.data.description || "-" }),
            tool.data.instructions && /* @__PURE__ */ jsx("div", { style: { ...mutedTextStyle, fontSize: "11px", marginTop: "4px" }, children: "\u{1F4CB} instructions \uC788\uC74C" })
          ] }),
          /* @__PURE__ */ jsxs("td", { style: tdStyle, children: [
            /* @__PURE__ */ jsx("code", { children: tool.data.command }),
            /* @__PURE__ */ jsx("div", { style: mutedTextStyle, children: tool.data.workingDirectory || "cwd: default" })
          ] }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" }, children: statusFilter === "active" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("button", { type: "button", style: primaryButtonStyle, onClick: () => beginEdit(tool), children: "Edit" }),
            /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: () => void onDeleteTool(tool.data.name), children: "\uBCF4\uAD00" })
          ] }) : /* @__PURE__ */ jsx("button", { type: "button", style: primaryButtonStyle, onClick: () => void onRestoreTool(tool.data.name), children: "\uBCF5\uC6D0" }) }) })
        ] }) }, tool.id);
      }),
      tools.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 3, style: tdStyle, children: /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "No tools configured yet." }) }) })
    ] })
  ] });
}
function GrantSection({
  data,
  companyId,
  refresh
}) {
  const toast = usePluginToast();
  const grantToolAction = usePluginAction(ACTION_KEYS.grantTool);
  const revokeToolAction = usePluginAction(ACTION_KEYS.revokeTool);
  const [agentName, setAgentName] = useState("");
  const [toolName, setToolName] = useState("");
  const sortedAgentNames = useMemo(
    () => data.agents.map((agent) => agent.name).sort((left, right) => left.localeCompare(right)),
    [data.agents]
  );
  async function onGrant(event) {
    event.preventDefault();
    await grantToolAction({
      companyId,
      agentName,
      toolName,
      grantedBy: "tool-registry-ui"
    });
    toast({ title: `Granted ${toolName} to ${agentName}`, tone: "success" });
    refresh();
  }
  async function onRevoke(targetAgentName, targetToolName) {
    await revokeToolAction({
      companyId,
      agentName: targetAgentName,
      toolName: targetToolName
    });
    toast({ title: `Revoked ${targetToolName} from ${targetAgentName}`, tone: "warn" });
    refresh();
  }
  return /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: headerRowStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Agent Grants" }),
      /* @__PURE__ */ jsxs("p", { style: mutedTextStyle, children: [
        data.grants.length,
        " grants"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: (event) => void onGrant(event), style: { display: "grid", gap: "10px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: gridCols2Style, children: [
        /* @__PURE__ */ jsxs(
          "select",
          {
            style: inputStyle,
            value: agentName,
            onChange: (event) => setAgentName(event.target.value),
            required: true,
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Select agent" }),
              sortedAgentNames.map((name) => /* @__PURE__ */ jsx("option", { value: name, children: name }, name))
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "select",
          {
            style: inputStyle,
            value: toolName,
            onChange: (event) => setToolName(event.target.value),
            required: true,
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Select tool" }),
              data.tools.map((tool) => /* @__PURE__ */ jsx("option", { value: tool.data.name, children: tool.data.name }, tool.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { style: primaryButtonStyle, type: "submit", children: "Grant Tool" }) })
    ] }),
    /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Agent" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Tool" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Granted By" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Granted At" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        data.grants.map((grant) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: grant.data.agentName }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: grant.data.toolName }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: grant.data.grantedBy }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: formatDateTime(grant.data.grantedAt) }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              style: buttonStyle,
              onClick: () => void onRevoke(grant.data.agentName, grant.data.toolName),
              children: "Revoke"
            }
          ) })
        ] }, grant.id)),
        data.grants.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 5, style: tdStyle, children: /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "No grants configured yet." }) }) }) : null
      ] })
    ] })
  ] });
}
function LogsSection({ data }) {
  return /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: headerRowStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Recent Execution Logs" }),
      /* @__PURE__ */ jsxs("p", { style: mutedTextStyle, children: [
        data.logs.length,
        " entries"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Time" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Agent" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Tool" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Mode" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Exit" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Summary" })
      ] }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        data.logs.map((entry) => {
          const log = entry.data;
          const summary = log.reason || log.stderr || log.stdout || "-";
          return /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: formatDateTime(log.timestamp || entry.createdAt) }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: log.agentName || log.agentId }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: log.toolName }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: log.mode }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: log.exitCode == null ? "-" : String(log.exitCode) }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx("pre", { style: codeStyle, children: truncate(summary, 160) || "-" }) })
          ] }, entry.id);
        }),
        data.logs.length === 0 ? /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 6, style: tdStyle, children: /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "No execution logs yet." }) }) }) : null
      ] })
    ] })
  ] });
}
function HelpSection() {
  const [showHelp, setShowHelp] = useState(false);
  return /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Help" }),
      /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: () => setShowHelp(!showHelp), children: showHelp ? "\uB2EB\uAE30" : "\uB3C4\uC6C0\uB9D0" })
    ] }),
    showHelp && /* @__PURE__ */ jsxs("div", { style: mutedTextStyle, children: [
      /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, fontSize: "15px", marginBottom: "8px" }, children: "Tool Registry \uB3C4\uC6C0\uB9D0" }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "\uAE30\uBCF8 \uAC1C\uB150" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Tool" }),
          ": CLI \uBA85\uB839\uC5B4\uB97C \uB798\uD551\uD55C \uC2E4\uD589 \uAC00\uB2A5\uD55C \uB3C4\uAD6C"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Grant" }),
          ": \uC5D0\uC774\uC804\uD2B8\uBCC4 \uB3C4\uAD6C \uC0AC\uC6A9 \uAD8C\uD55C"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Instructions" }),
          ": \uC5D0\uC774\uC804\uD2B8\uC5D0\uAC8C \uC804\uB2EC\uB418\uB294 \uB3C4\uAD6C \uC0AC\uC6A9\uBC95"
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "\uB3C4\uAD6C \uB4F1\uB85D" }),
      /* @__PURE__ */ jsxs("ol", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Name" }),
          ": \uACE0\uC720 \uC774\uB984 (workflow\uC5D0\uC11C \uCC38\uC870)"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Command" }),
          ": \uC2E4\uD589\uD560 CLI \uBA85\uB839\uC5B4"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Working Directory" }),
          ": \uC2E4\uD589 \uACBD\uB85C (\uBE44\uC6CC\uB450\uBA74 \uAE30\uBCF8\uAC12)"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Description" }),
          ": \uB3C4\uAD6C \uC124\uBA85"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Instructions" }),
          ": \uC5D0\uC774\uC804\uD2B8\uC5D0\uAC8C \uC804\uB2EC\uD560 \uC0C1\uC138 \uC0AC\uC6A9\uBC95",
          /* @__PURE__ */ jsx("ul", { style: { margin: "2px 0", paddingLeft: "16px" }, children: /* @__PURE__ */ jsx("li", { children: "Workflow\uC758 Agent step\uC5D0\uC11C tools\uC5D0 \uC774 \uB3C4\uAD6C\uB97C \uC9C0\uC815\uD558\uBA74 \uC790\uB3D9 \uC804\uB2EC" }) })
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "Grant \uAD00\uB9AC" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsx("li", { children: "\uC5D0\uC774\uC804\uD2B8 \uC774\uB984 + \uB3C4\uAD6C \uC774\uB984\uC73C\uB85C \uC0AC\uC6A9 \uAD8C\uD55C \uBD80\uC5EC" }),
        /* @__PURE__ */ jsx("li", { children: "Grant\uAC00 \uC5C6\uC73C\uBA74 \uC5D0\uC774\uC804\uD2B8\uAC00 \uC9C1\uC811 \uC2E4\uD589 \uBD88\uAC00" }),
        /* @__PURE__ */ jsx("li", { children: "Workflow Engine\uC758 Tool step\uC740 Grant \uC5C6\uC774 \uC2DC\uC2A4\uD15C\uC73C\uB85C \uC2E4\uD589" })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }, children: "\uC2E4\uD589 \uB85C\uADF8" }),
      /* @__PURE__ */ jsx("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: /* @__PURE__ */ jsx("li", { children: "\uBAA8\uB4E0 \uB3C4\uAD6C \uC2E4\uD589\uC774 \uAE30\uB85D\uB428 (\uC131\uACF5/\uC2E4\uD328/\uAC70\uBD80)" }) })
    ] })
  ] });
}
function ToolRegistryPage(props) {
  const hostContext = useHostContext();
  const toast = usePluginToast();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";
  const page = usePluginData(DATA_KEYS.pageData, {
    companyId,
    maxLogEntries: 50
  });
  if (!companyId) {
    return /* @__PURE__ */ jsxs("main", { style: pageStyle, children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Tool Registry" }),
      /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "Company context is required." })
    ] });
  }
  if (page.loading) {
    return /* @__PURE__ */ jsxs("main", { style: pageStyle, children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Tool Registry" }),
      /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: "Loading..." })
    ] });
  }
  if (page.error || !page.data) {
    return /* @__PURE__ */ jsxs("main", { style: pageStyle, children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Tool Registry" }),
      /* @__PURE__ */ jsx("p", { style: mutedTextStyle, children: page.error?.message ?? "Failed to load tool registry data." }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { style: buttonStyle, type: "button", onClick: () => page.refresh(), children: "Retry" }) })
    ] });
  }
  const data = page.data;
  function refresh() {
    page.refresh();
  }
  return /* @__PURE__ */ jsxs("main", { style: pageStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: headerRowStyle, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Tool Registry" }),
        /* @__PURE__ */ jsxs("p", { style: mutedTextStyle, children: [
          "Company: ",
          data.companyName ?? companyId
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          style: buttonStyle,
          type: "button",
          onClick: () => {
            refresh();
            toast({ title: "Refreshed tool registry", tone: "info" });
          },
          children: "Refresh"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(ToolSection, { data, companyId, refresh }),
    /* @__PURE__ */ jsx(GrantSection, { data, companyId, refresh }),
    /* @__PURE__ */ jsx(LogsSection, { data }),
    /* @__PURE__ */ jsx(HelpSection, {})
  ] });
}
function ToolRegistrySidebarLink({ context }) {
  const href = context.companyPrefix ? `/${context.companyPrefix}/tool-registry` : "/tool-registry";
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
      children: /* @__PURE__ */ jsx("span", { children: "\u{1F527} Tool Registry" })
    }
  );
}
export {
  ToolRegistryPage,
  ToolRegistrySidebarLink
};
//# sourceMappingURL=index.js.map
