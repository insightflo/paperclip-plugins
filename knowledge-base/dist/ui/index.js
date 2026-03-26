// src/ui/index.tsx
import {
  useHostContext,
  usePluginAction,
  usePluginData
} from "@paperclipai/plugin-sdk/ui";
import {
  useEffect,
  useMemo,
  useState
} from "react";

// src/constants.ts
var PLUGIN_ID = "insightflo.knowledge-base";
var PAGE_ROUTE = "knowledge-base";
var KB_TYPES = {
  static: "static",
  rag: "rag",
  ontology: "ontology"
};
var DATA_KEYS = {
  overview: "knowledge-base.overview",
  kbList: "knowledge-base.list",
  kbGet: "knowledge-base.get",
  grantList: "knowledge-base.grant.list",
  agentList: "knowledge-base.agent.list",
  kbCreate: "knowledge-base.create",
  kbUpdate: "knowledge-base.update",
  kbDelete: "knowledge-base.delete",
  grantCreate: "knowledge-base.grant.create",
  grantDelete: "knowledge-base.grant.delete"
};
var ACTION_KEYS = {
  kbCreate: DATA_KEYS.kbCreate,
  kbUpdate: DATA_KEYS.kbUpdate,
  kbDelete: DATA_KEYS.kbDelete,
  kbRestore: "knowledge-base.restore",
  grantCreate: DATA_KEYS.grantCreate,
  grantDelete: DATA_KEYS.grantDelete
};

// src/ui/index.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
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
  borderRadius: "12px",
  border: "1px solid var(--border, #334155)",
  background: "var(--card, #0f172a)"
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
var mutedStyle = {
  margin: 0,
  fontSize: "13px",
  color: "var(--muted-foreground, #94a3b8)"
};
var tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px"
};
var thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border, #334155)",
  fontSize: "12px",
  letterSpacing: "0.03em",
  color: "var(--muted-foreground, #94a3b8)",
  textTransform: "uppercase"
};
var tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border, #1e293b)",
  verticalAlign: "top"
};
var buttonStyle = {
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--card, #0f172a)",
  color: "var(--foreground, #f8fafc)",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  padding: "8px 12px"
};
var buttonDisabledStyle = {
  opacity: 0.65,
  cursor: "not-allowed"
};
var inputStyle = {
  width: "100%",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: "14px"
};
var textareaStyle = {
  ...inputStyle,
  minHeight: "140px",
  resize: "vertical",
  lineHeight: 1.5
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
function hostPath(companyPrefix, suffix) {
  return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}
function pluginPagePath(companyPrefix) {
  return hostPath(companyPrefix, `/${PAGE_ROUTE}`);
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
function KnowledgeBasePage(props) {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState("static");
  const [createDescription, setCreateDescription] = useState("");
  const [createTokenBudget, setCreateTokenBudget] = useState("4096");
  const [createStaticContent, setCreateStaticContent] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [detailTokenBudget, setDetailTokenBudget] = useState("4096");
  const [detailStaticContent, setDetailStaticContent] = useState("");
  const [grantAgentName, setGrantAgentName] = useState("");
  const [grantKbName, setGrantKbName] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overview = usePluginData(DATA_KEYS.overview, {
    companyId,
    refreshNonce
  });
  const selectedDetail = usePluginData(DATA_KEYS.kbGet, {
    companyId,
    id: selectedKbId,
    refreshNonce
  });
  const createKnowledgeBase = usePluginAction(ACTION_KEYS.kbCreate);
  const updateKnowledgeBase = usePluginAction(ACTION_KEYS.kbUpdate);
  const deleteKnowledgeBase = usePluginAction(ACTION_KEYS.kbDelete);
  const restoreKnowledgeBase = usePluginAction(ACTION_KEYS.kbRestore);
  const createGrant = usePluginAction(ACTION_KEYS.grantCreate);
  const deleteGrant = usePluginAction(ACTION_KEYS.grantDelete);
  const allKnowledgeBases = overview.data?.knowledgeBases ?? [];
  const grants = overview.data?.grants ?? [];
  const agents = overview.data?.agents ?? [];
  const activeKnowledgeBases = useMemo(
    () => allKnowledgeBases.filter((kb) => !kb.__deleted),
    [allKnowledgeBases]
  );
  const archivedKnowledgeBases = useMemo(
    () => allKnowledgeBases.filter((kb) => kb.__deleted === true),
    [allKnowledgeBases]
  );
  const knowledgeBases = statusFilter === "active" ? activeKnowledgeBases : archivedKnowledgeBases;
  useEffect(() => {
    if (!selectedKbId && knowledgeBases.length > 0) {
      setSelectedKbId(knowledgeBases[0].id);
      return;
    }
    if (selectedKbId && !knowledgeBases.some((item) => item.id === selectedKbId)) {
      setSelectedKbId(knowledgeBases[0]?.id ?? "");
    }
  }, [knowledgeBases, selectedKbId]);
  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKbId) ?? null,
    [knowledgeBases, selectedKbId]
  );
  useEffect(() => {
    const detail = selectedDetail.data;
    if (detail) {
      setDetailDescription(detail.description ?? "");
      setDetailTokenBudget(String(detail.maxTokenBudget || 4096));
      setDetailStaticContent(detail.staticConfig?.content ?? "");
      return;
    }
    if (!selectedKnowledgeBase) {
      return;
    }
    setDetailDescription(selectedKnowledgeBase.description ?? "");
    setDetailTokenBudget(String(selectedKnowledgeBase.maxTokenBudget || 4096));
    setDetailStaticContent("");
  }, [selectedDetail.data, selectedKnowledgeBase]);
  useEffect(() => {
    if (!selectedKnowledgeBase) {
      return;
    }
    if (!grantKbName) {
      setGrantKbName(selectedKnowledgeBase.name);
    }
  }, [grantKbName, selectedKnowledgeBase]);
  const selectedKbGrants = useMemo(
    () => grants.filter((grant) => grant.kbName === selectedKnowledgeBase?.name),
    [grants, selectedKnowledgeBase]
  );
  async function refreshOverview() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      setRefreshNonce((value) => value + 1);
      await overview.refresh();
    } finally {
      setIsRefreshing(false);
    }
  }
  const refreshButtonLabel = isRefreshing ? "\uAC31\uC2E0 \uC911..." : "\u21BB Refresh";
  async function onCreateKnowledgeBase(event) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");
    try {
      const result = await createKnowledgeBase({
        companyId,
        name: createName,
        type: createType,
        description: createDescription,
        maxTokenBudget: Number(createTokenBudget),
        staticContent: createStaticContent
      });
      setCreateName("");
      setCreateDescription("");
      setCreateTokenBudget("4096");
      setCreateStaticContent("");
      setCreateType("static");
      await refreshOverview();
      if (result?.id) {
        setSelectedKbId(result.id);
      }
      setStatusMessage("Knowledge Base\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
  async function onSaveDetail() {
    if (!selectedKnowledgeBase) {
      return;
    }
    setStatusMessage("");
    setErrorMessage("");
    try {
      await updateKnowledgeBase({
        companyId,
        id: selectedKnowledgeBase.id,
        name: selectedKnowledgeBase.name,
        description: detailDescription,
        maxTokenBudget: Number(detailTokenBudget),
        staticContent: detailStaticContent
      });
      await refreshOverview();
      setStatusMessage("KB \uC0C1\uC138 \uC815\uBCF4\uB97C \uC5C5\uB370\uC774\uD2B8\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
  async function onDeleteSelected() {
    if (!selectedKnowledgeBase) {
      return;
    }
    setStatusMessage("");
    setErrorMessage("");
    try {
      await deleteKnowledgeBase({
        companyId,
        id: selectedKnowledgeBase.id
      });
      await refreshOverview();
      setStatusMessage("Knowledge Base\uB97C \uBCF4\uAD00\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
  async function onRestoreSelected() {
    if (!selectedKnowledgeBase) {
      return;
    }
    setStatusMessage("");
    setErrorMessage("");
    try {
      await restoreKnowledgeBase({
        companyId,
        id: selectedKnowledgeBase.id
      });
      await refreshOverview();
      setStatusMessage("Knowledge Base\uB97C \uBCF5\uC6D0\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
  async function onCreateGrant(event) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");
    try {
      await createGrant({
        companyId,
        agentName: grantAgentName,
        kbName: grantKbName,
        grantedBy: "knowledge-base-ui"
      });
      await refreshOverview();
      setStatusMessage("\uC5D0\uC774\uC804\uD2B8 \uAD8C\uD55C\uC744 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
  async function onDeleteGrant(grant) {
    setStatusMessage("");
    setErrorMessage("");
    try {
      await deleteGrant({
        companyId,
        grantId: grant.id
      });
      await refreshOverview();
      setStatusMessage("\uC5D0\uC774\uC804\uD2B8 \uAD8C\uD55C\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
  if (overview.loading) {
    return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: pageStyle, children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Knowledge Base" }),
      /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "Knowledge Base \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." })
    ] });
  }
  if (overview.error) {
    return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: pageStyle, children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Knowledge Base" }),
      /* @__PURE__ */ jsxs("p", { style: mutedStyle, children: [
        "\uB370\uC774\uD130 \uB85C\uB4DC \uC2E4\uD328: ",
        overview.error.message
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { "data-plugin-id": PLUGIN_ID, style: pageStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }, children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "Knowledge Base" }),
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
    statusMessage ? /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, color: "#065f46" }, children: statusMessage }) : null,
    errorMessage ? /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, color: "#b91c1c" }, children: errorMessage }) : null,
    /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "KB \uBAA9\uB85D" }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "6px" }, children: [
        /* @__PURE__ */ jsxs("button", { type: "button", style: filterTabStyle(statusFilter === "active"), onClick: () => setStatusFilter("active"), children: [
          "\uD65C\uC131 (",
          activeKnowledgeBases.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs("button", { type: "button", style: filterTabStyle(statusFilter === "archived"), onClick: () => setStatusFilter("archived"), children: [
          "\uBCF4\uAD00 (",
          archivedKnowledgeBases.length,
          ")"
        ] })
      ] }),
      knowledgeBases.length === 0 ? /* @__PURE__ */ jsx("p", { style: mutedStyle, children: statusFilter === "active" ? "\uB4F1\uB85D\uB41C Knowledge Base\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." : "\uBCF4\uAD00\uB41C Knowledge Base\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) : /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Name" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Type" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Token Budget" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Updated" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: knowledgeBases.map((kb) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setSelectedKbId(kb.id);
                setGrantKbName(kb.name);
              },
              style: {
                ...buttonStyle,
                padding: "4px 8px",
                fontWeight: kb.id === selectedKbId ? 700 : 500,
                borderColor: kb.id === selectedKbId ? "#2563eb" : "#d1d5db"
              },
              children: kb.name
            }
          ) }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: kb.type }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: kb.maxTokenBudget }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: formatDateTime(kb.updatedAt) })
        ] }, kb.id)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "KB \uC0DD\uC131" }),
      /* @__PURE__ */ jsxs("form", { onSubmit: onCreateKnowledgeBase, style: { display: "grid", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "\uC774\uB984" }),
          /* @__PURE__ */ jsx("input", { required: true, value: createName, onChange: (event) => setCreateName(event.target.value), style: inputStyle })
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "\uD0C0\uC785" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: createType,
              onChange: (event) => setCreateType(event.target.value),
              style: inputStyle,
              children: [
                /* @__PURE__ */ jsx("option", { value: KB_TYPES.static, children: "static" }),
                /* @__PURE__ */ jsx("option", { value: KB_TYPES.rag, children: "rag" }),
                /* @__PURE__ */ jsx("option", { value: KB_TYPES.ontology, children: "ontology" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "\uC124\uBA85" }),
          /* @__PURE__ */ jsx("input", { value: createDescription, onChange: (event) => setCreateDescription(event.target.value), style: inputStyle })
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Max Token Budget" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: 1,
              value: createTokenBudget,
              onChange: (event) => setCreateTokenBudget(event.target.value),
              style: inputStyle
            }
          )
        ] }),
        createType === KB_TYPES.static ? /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Static Content" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: createStaticContent,
              onChange: (event) => setCreateStaticContent(event.target.value),
              style: textareaStyle
            }
          )
        ] }) : /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "`rag`, `ontology` \uD0C0\uC785\uC740 \uD604\uC7AC \uC774\uBCA4\uD2B8 \uB85C\uADF8\uB9CC \uB3D9\uC791\uD569\uB2C8\uB2E4." }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { type: "submit", style: buttonStyle, children: "KB \uC800\uC7A5" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "KB \uC0C1\uC138" }),
      !selectedKnowledgeBase ? /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uBAA9\uB85D\uC5D0\uC11C KB\uB97C \uC120\uD0DD\uD558\uC138\uC694." }) : /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("p", { style: mutedStyle, children: [
          "\uC120\uD0DD\uB41C KB: ",
          /* @__PURE__ */ jsx("strong", { children: selectedKnowledgeBase.name }),
          " (",
          selectedKnowledgeBase.type,
          ")"
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "\uC124\uBA85" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              value: detailDescription,
              onChange: (event) => setDetailDescription(event.target.value),
              style: inputStyle
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Max Token Budget" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: 1,
              value: detailTokenBudget,
              onChange: (event) => setDetailTokenBudget(event.target.value),
              style: inputStyle
            }
          )
        ] }),
        selectedKnowledgeBase.type === KB_TYPES.static ? /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Static Content" }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              value: detailStaticContent,
              onChange: (event) => setDetailStaticContent(event.target.value),
              style: textareaStyle
            }
          )
        ] }) : /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uC774 KB \uD0C0\uC785\uC740 \uD604\uC7AC \uC0C1\uC138 \uD3B8\uC9D1 \uC5C6\uC774 \uB9E4\uD551\uB9CC \uAD00\uB9AC\uD569\uB2C8\uB2E4." }),
        /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: statusFilter === "active" ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: () => void onSaveDetail(), children: "\uC800\uC7A5" }),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              style: { ...buttonStyle, borderColor: "#fecaca", color: "#b91c1c" },
              onClick: () => void onDeleteSelected(),
              children: "\uBCF4\uAD00"
            }
          )
        ] }) : /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            style: buttonStyle,
            onClick: () => void onRestoreSelected(),
            children: "\uBCF5\uC6D0"
          }
        ) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "\uC5D0\uC774\uC804\uD2B8-KB \uC5F0\uACB0" }),
      /* @__PURE__ */ jsxs("form", { onSubmit: onCreateGrant, style: { display: "grid", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Agent Name" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              required: true,
              value: grantAgentName,
              onChange: (event) => setGrantAgentName(event.target.value),
              style: inputStyle,
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "\uC120\uD0DD\uD558\uC138\uC694" }),
                agents.map((agentName) => /* @__PURE__ */ jsx("option", { value: agentName, children: agentName }, agentName))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "KB Name" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              required: true,
              value: grantKbName,
              onChange: (event) => setGrantKbName(event.target.value),
              style: inputStyle,
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "\uC120\uD0DD\uD558\uC138\uC694" }),
                knowledgeBases.map((kb) => /* @__PURE__ */ jsx("option", { value: kb.name, children: kb.name }, kb.id))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { type: "submit", style: buttonStyle, children: "\uAD8C\uD55C \uCD94\uAC00" }) })
      ] }),
      selectedKnowledgeBase ? /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("p", { style: mutedStyle, children: [
          /* @__PURE__ */ jsx("strong", { children: selectedKnowledgeBase.name }),
          " \uC5D0 \uC5F0\uACB0\uB41C \uC5D0\uC774\uC804\uD2B8"
        ] }),
        selectedKbGrants.length === 0 ? /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uC5F0\uACB0\uB41C \uC5D0\uC774\uC804\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) : /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { style: thStyle, children: "Agent" }),
            /* @__PURE__ */ jsx("th", { style: thStyle, children: "Granted By" }),
            /* @__PURE__ */ jsx("th", { style: thStyle, children: "Granted At" }),
            /* @__PURE__ */ jsx("th", { style: thStyle, children: "Action" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: selectedKbGrants.map((grant) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: grant.agentName }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: grant.grantedBy }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: formatDateTime(grant.grantedAt) }),
            /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                style: { ...buttonStyle, padding: "6px 10px" },
                onClick: () => {
                  void onDeleteGrant(grant);
                },
                children: "\uD574\uC81C"
              }
            ) })
          ] }, grant.id)) })
        ] })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsx(KnowledgeBaseHelpSection, {})
  ] });
}
function KnowledgeBaseHelpSection() {
  const [showHelp, setShowHelp] = useState(false);
  return /* @__PURE__ */ jsxs("section", { style: sectionStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsx("h2", { style: sectionTitleStyle, children: "Help" }),
      /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: () => setShowHelp(!showHelp), children: showHelp ? "\uB2EB\uAE30" : "\uB3C4\uC6C0\uB9D0" })
    ] }),
    showHelp && /* @__PURE__ */ jsxs("div", { style: mutedStyle, children: [
      /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, fontWeight: 600, fontSize: "15px", marginBottom: "8px" }, children: "Knowledge Base \uB3C4\uC6C0\uB9D0" }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uAE30\uBCF8 \uAC1C\uB150" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Article" }),
          ": \uC5C5\uBB34 \uC9C0\uC2DD/\uADDC\uC815/\uC808\uCC28\uB97C \uB2F4\uC740 \uBB38\uC11C"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Tag" }),
          ": \uBB38\uC11C \uBD84\uB958\uB97C \uC704\uD55C \uD0DC\uADF8"
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uC0AC\uC6A9\uBC95" }),
      /* @__PURE__ */ jsxs("ol", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsx("li", { children: '\uC0C8 \uBB38\uC11C \uC791\uC131: "KB \uC800\uC7A5" \uBC84\uD2BC\uC73C\uB85C \uC0DD\uC131' }),
        /* @__PURE__ */ jsx("li", { children: "\uD0DC\uADF8\uB85C \uBB38\uC11C \uD544\uD130\uB9C1 \uAC00\uB2A5" }),
        /* @__PURE__ */ jsx("li", { children: "\uC5D0\uC774\uC804\uD2B8\uAC00 \uC5C5\uBB34 \uC911 \uCC38\uC870\uD560 \uC218 \uC788\uB294 \uC9C0\uC2DD \uC800\uC7A5\uC18C" })
      ] })
    ] })
  ] });
}
function KnowledgeBaseSidebarLink({ context }) {
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
        /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "KB" }),
        /* @__PURE__ */ jsx("span", { className: "truncate", children: "Knowledge Base" })
      ]
    }
  );
}
export {
  KnowledgeBasePage,
  KnowledgeBaseSidebarLink
};
//# sourceMappingURL=index.js.map
