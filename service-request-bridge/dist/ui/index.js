// src/ui/index.tsx
import {
  useHostContext,
  usePluginAction,
  usePluginData
} from "@paperclipai/plugin-sdk/ui";
import {
  useMemo,
  useState
} from "react";

// src/constants.ts
var PLUGIN_ID = "insightflo.service-request-bridge";
var BRIDGE_DIRECTIONS = {
  twoWay: "two-way",
  localToRemote: "local-to-remote",
  remoteToLocal: "remote-to-local"
};
var DATA_KEYS = {
  listTab: "service-request-bridge.list-tab",
  detailTab: "service-request-bridge.detail-tab",
  dashboardWidget: "service-request-bridge.dashboard-widget",
  settingsGet: "service-request-bridge.settings-get",
  createLink: "service-request-bridge.create-link"
};
var ACTION_KEYS = {
  createLink: DATA_KEYS.createLink,
  settingsSave: "service-request-bridge.settings-save"
};
var SYNC_STAMP_TTL_MS = 10 * 60 * 1e3;

// src/ui/index.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var tabStyle = {
  display: "grid",
  gap: "12px",
  padding: "14px",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "#e5e7eb"
};
var cardStyle = {
  display: "grid",
  gap: "10px",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(255, 255, 255, 0.04)"
};
var mutedStyle = {
  margin: 0,
  fontSize: "12px",
  color: "#9ca3af"
};
var tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12px"
};
var thStyle = {
  textAlign: "left",
  fontSize: "11px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#9ca3af",
  padding: "8px 10px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.12)"
};
var tdStyle = {
  verticalAlign: "top",
  padding: "8px 10px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
};
var inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(255, 255, 255, 0.16)",
  borderRadius: "8px",
  fontSize: "13px",
  background: "rgba(17, 24, 39, 0.9)",
  color: "#f9fafb"
};
var buttonStyle = {
  padding: "8px 12px",
  border: "1px solid #111827",
  borderRadius: "8px",
  background: "#111827",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600
};
var widgetStyle = {
  display: "grid",
  gap: "10px",
  padding: "12px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "12px",
  background: "rgba(255, 255, 255, 0.04)",
  color: "#e5e7eb",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
};
function statusBadgeStyle(connected) {
  return connected ? {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    borderRadius: "999px",
    padding: "2px 8px",
    background: "#dcfce7",
    color: "#166534",
    fontSize: "11px",
    fontWeight: 700
  } : {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    borderRadius: "999px",
    padding: "2px 8px",
    background: "rgba(255, 255, 255, 0.08)",
    color: "#d1d5db",
    fontSize: "11px",
    fontWeight: 700
  };
}
function directionLabel(direction) {
  if (direction === BRIDGE_DIRECTIONS.localToRemote) {
    return "local -> remote";
  }
  if (direction === BRIDGE_DIRECTIONS.remoteToLocal) {
    return "remote -> local";
  }
  return "two-way";
}
function settingsHref(companyPrefix) {
  return companyPrefix ? `/${companyPrefix}/bridge-settings` : "/bridge-settings";
}
function bridgeHref(companyPrefix) {
  return companyPrefix ? `/${companyPrefix}/service-request-bridge` : "/service-request-bridge";
}
function resolveIssueId(props) {
  return props.issueId ?? props.selectedIssueId ?? props.issue?.id ?? "";
}
function resolveIssueIds(props) {
  if (Array.isArray(props.issueIds) && props.issueIds.length > 0) {
    return props.issueIds.filter((item) => typeof item === "string" && item.trim().length > 0);
  }
  if (Array.isArray(props.issues) && props.issues.length > 0) {
    return props.issues.map((item) => item.id ?? item.identifier ?? "").filter((item) => typeof item === "string" && item.trim().length > 0);
  }
  return [];
}
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
function DataError({ error }) {
  if (!error) {
    return null;
  }
  return /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, color: "#b91c1c" }, children: error?.message ?? String(error) });
}
function BridgeHelpSection() {
  const [showHelp, setShowHelp] = useState(false);
  return /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ jsx("strong", { style: { fontSize: "14px" }, children: "Help" }),
      /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: () => setShowHelp(!showHelp), children: showHelp ? "\uB2EB\uAE30" : "\uB3C4\uC6C0\uB9D0" })
    ] }),
    showHelp && /* @__PURE__ */ jsxs("div", { style: mutedStyle, children: [
      /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, fontWeight: 600, fontSize: "14px", marginBottom: "8px" }, children: "Service Request Bridge \uB3C4\uC6C0\uB9D0" }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uAE30\uBCF8 \uAC1C\uB150" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Bridge Link" }),
          ": \uB450 \uD68C\uC0AC \uAC04 \uC774\uC288\uB97C \uC5F0\uACB0\uD558\uB294 \uC591\uBC29\uD5A5 \uB9C1\uD06C"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Mirror Issue" }),
          ": \uC694\uCCAD \uC774\uC288\uC758 \uC0AC\uBCF8\uC744 \uC81C\uACF5\uC790 \uD68C\uC0AC\uC5D0 \uC790\uB3D9 \uC0DD\uC131"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Sync" }),
          ": \uD55C\uCABD \uC774\uC288 \uC0C1\uD0DC \uBCC0\uACBD \uC2DC \uC790\uB3D9\uC73C\uB85C \uBC18\uB300\uCABD\uB3C4 \uBCC0\uACBD"
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uC124\uC815" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Provider Company" }),
          ": \uC11C\uBE44\uC2A4 \uC81C\uACF5 \uD68C\uC0AC \uC774\uB984"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Requester Issue Label Aliases" }),
          ": \uC694\uCCAD \uC774\uC288\uC5D0 \uC774 \uB77C\uBCA8 \uBCC4\uCE6D \uC911 \uD558\uB098\uAC00 \uBD99\uC73C\uBA74 \uC790\uB3D9 \uBBF8\uB7EC\uB9C1"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Requester Title Prefixes" }),
          ": \uC694\uCCAD \uC774\uC288 \uC81C\uBAA9\uC774 \uC774 prefix \uC911 \uD558\uB098\uB85C \uC2DC\uC791\uD574\uB3C4 \uC790\uB3D9 \uBBF8\uB7EC\uB9C1"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Workflow Trigger Label" }),
          ": \uBBF8\uB7EC \uC774\uC288\uC5D0 \uBD99\uC77C \uC6CC\uD06C\uD50C\uB85C\uC6B0 \uD2B8\uB9AC\uAC70 \uB77C\uBCA8"
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, fontWeight: 600, marginTop: "12px" }, children: "\uBC29\uD5A5 \uC81C\uC5B4" }),
      /* @__PURE__ */ jsxs("ul", { style: { margin: "4px 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "two-way" }),
          ": \uC591\uBC29\uD5A5 \uB3D9\uAE30\uD654"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "local-to-remote" }),
          ": \uB85C\uCEEC \u2192 \uB9AC\uBAA8\uD2B8\uB9CC"
        ] }),
        /* @__PURE__ */ jsxs("li", { children: [
          /* @__PURE__ */ jsx("strong", { children: "remote-to-local" }),
          ": \uB9AC\uBAA8\uD2B8 \u2192 \uB85C\uCEEC\uB9CC"
        ] })
      ] })
    ] })
  ] });
}
function ServiceRequestBridgeListTab(props) {
  const host = useHostContext();
  const companyId = host.companyId ?? props.context?.companyId ?? "";
  const companyPrefix = host.companyPrefix ?? props.context?.companyPrefix ?? "";
  const issueIds = useMemo(() => resolveIssueIds(props), [props.issueIds, props.issues]);
  const snapshot = usePluginData(DATA_KEYS.listTab, {
    companyId,
    issueIds
  });
  return /* @__PURE__ */ jsxs("div", { style: tabStyle, children: [
    /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("strong", { style: { fontSize: "14px" }, children: "Service Bridge \uC0C1\uD0DC" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [
          /* @__PURE__ */ jsx("a", { href: settingsHref(companyPrefix), style: { ...buttonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }, children: "\uC124\uC815" }),
          /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: snapshot.refresh, children: "\uC0C8\uB85C\uACE0\uCE68" })
        ] })
      ] }),
      /* @__PURE__ */ jsx(DataError, { error: snapshot.error }),
      snapshot.loading ? /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uC5F0\uACB0 \uC0C1\uD0DC\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." }) : null,
      snapshot.data ? /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" }, children: [
        /* @__PURE__ */ jsxs("span", { style: statusBadgeStyle(true), children: [
          "linked ",
          snapshot.data.totals.linked
        ] }),
        /* @__PURE__ */ jsxs("span", { style: statusBadgeStyle(false), children: [
          "unlinked ",
          snapshot.data.totals.unlinked
        ] }),
        /* @__PURE__ */ jsxs("span", { style: { ...mutedStyle, alignSelf: "center" }, children: [
          "total ",
          snapshot.data.totals.issues
        ] })
      ] }) : null
    ] }),
    snapshot.data ? /* @__PURE__ */ jsx("section", { style: cardStyle, children: snapshot.data.items.length === 0 ? /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uD45C\uC2DC\uD560 \uC774\uC288\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) : /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Issue" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Status" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Bridge" }),
        /* @__PURE__ */ jsx("th", { style: thStyle, children: "Remote" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: snapshot.data.items.map((item) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
          /* @__PURE__ */ jsx("strong", { children: item.identifier ?? item.issueId.slice(0, 8) }),
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: item.title })
        ] }) }),
        /* @__PURE__ */ jsx("td", { style: tdStyle, children: item.status }),
        /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsx("span", { style: statusBadgeStyle(item.linkCount > 0), children: item.linkCount > 0 ? "linked" : "unlinked" }) }),
        /* @__PURE__ */ jsx("td", { style: tdStyle, children: item.links.length === 0 ? /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "-" }) : /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "6px" }, children: item.links.map((link) => /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "2px" }, children: [
          /* @__PURE__ */ jsxs("strong", { style: { fontSize: "12px" }, children: [
            link.remoteCompanyName ?? link.remoteCompanyId,
            " / ",
            link.remoteIdentifier ?? link.remoteIssueId
          ] }),
          /* @__PURE__ */ jsxs("span", { style: mutedStyle, children: [
            link.remoteStatus ?? "unknown",
            " \xB7 ",
            directionLabel(link.direction)
          ] })
        ] }, link.bridgeId)) }) })
      ] }, item.issueId)) })
    ] }) }) : null,
    /* @__PURE__ */ jsx(BridgeHelpSection, {})
  ] });
}
function ServiceRequestBridgeDetailTab(props) {
  const host = useHostContext();
  const companyId = host.companyId ?? props.context?.companyId ?? "";
  const companyPrefix = host.companyPrefix ?? props.context?.companyPrefix ?? "";
  const issueId = resolveIssueId(props);
  const snapshot = usePluginData(DATA_KEYS.detailTab, {
    companyId,
    issueId
  });
  const createLink = usePluginAction(ACTION_KEYS.createLink);
  const [remoteCompanyId, setRemoteCompanyId] = useState("");
  const [remoteIssueId, setRemoteIssueId] = useState("");
  const [direction, setDirection] = useState(BRIDGE_DIRECTIONS.twoWay);
  const [editingBridgeId, setEditingBridgeId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  function loadLinkIntoForm(link) {
    setEditingBridgeId(link.bridgeId);
    setRemoteCompanyId(link.remoteCompanyId);
    setRemoteIssueId(link.remoteIdentifier ?? link.remoteIssueId);
    setDirection(link.direction);
    setStatusMessage("");
    setErrorMessage("");
  }
  function resetForm() {
    setEditingBridgeId("");
    setRemoteCompanyId("");
    setRemoteIssueId("");
    setDirection(BRIDGE_DIRECTIONS.twoWay);
  }
  async function onCreateLink(event) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");
    try {
      if (!issueId) {
        throw new Error("Issue id is required");
      }
      await createLink({
        companyId,
        localIssueId: issueId,
        remoteCompanyId,
        remoteIssueId,
        direction,
        createdBy: "service-request-bridge-ui"
      });
      setStatusMessage(editingBridgeId ? "Bridge link updated." : "Bridge link saved.");
      resetForm();
      await snapshot.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error?.message ?? String(error) : String(error));
    }
  }
  return /* @__PURE__ */ jsxs("div", { style: tabStyle, children: [
    /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("strong", { style: { fontSize: "14px" }, children: "\uC5F0\uACB0\uB41C \uC0C1\uB300 \uD68C\uC0AC \uC774\uC288" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [
          /* @__PURE__ */ jsx("a", { href: settingsHref(companyPrefix), style: { ...buttonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }, children: "\uC124\uC815" }),
          /* @__PURE__ */ jsx("button", { type: "button", style: buttonStyle, onClick: snapshot.refresh, children: "\uC0C8\uB85C\uACE0\uCE68" })
        ] })
      ] }),
      snapshot.loading ? /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uC5F0\uACB0 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." }) : null,
      /* @__PURE__ */ jsx(DataError, { error: snapshot.error }),
      snapshot.data?.issue ? /* @__PURE__ */ jsxs("p", { style: mutedStyle, children: [
        "local issue: ",
        snapshot.data.issue.identifier ?? snapshot.data.issue.id,
        " (",
        snapshot.data.issue.status,
        ")"
      ] }) : /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uD604\uC7AC \uC774\uC288 \uCEE8\uD14D\uC2A4\uD2B8\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }),
      statusMessage ? /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, color: "#166534" }, children: statusMessage }) : null,
      errorMessage ? /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, color: "#b91c1c" }, children: errorMessage }) : null,
      snapshot.data?.links && snapshot.data.links.length > 0 ? /* @__PURE__ */ jsxs("table", { style: tableStyle, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Remote" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Status" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Direction" }),
          /* @__PURE__ */ jsx("th", { style: thStyle, children: "Synced" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: snapshot.data.links.map((link) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "3px" }, children: [
            /* @__PURE__ */ jsx("strong", { children: link.remoteCompanyName ?? link.remoteCompanyId }),
            /* @__PURE__ */ jsx("span", { style: mutedStyle, children: link.remoteIdentifier ?? link.remoteIssueId }),
            link.remoteTitle ? /* @__PURE__ */ jsx("span", { style: mutedStyle, children: link.remoteTitle }) : null
          ] }) }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: link.remoteStatus ?? "unknown" }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: directionLabel(link.direction) }),
          /* @__PURE__ */ jsx("td", { style: tdStyle, children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "8px" }, children: [
            /* @__PURE__ */ jsx("span", { children: formatDateTime(link.lastSyncedAt ?? link.updatedAt) }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                style: { ...buttonStyle, padding: "6px 10px", fontSize: "12px" },
                onClick: () => loadLinkIntoForm(link),
                children: "\uC218\uC815"
              }
            )
          ] }) })
        ] }, link.bridgeId)) })
      ] }) : /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uC5F0\uACB0\uB41C \uBE0C\uB9AC\uC9C0\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4." })
    ] }),
    /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("strong", { style: { fontSize: "14px" }, children: editingBridgeId ? "Bridge \uC5F0\uACB0 \uC218\uC815" : "Bridge \uC5F0\uACB0 \uC0DD\uC131" }),
        editingBridgeId ? /* @__PURE__ */ jsx("button", { type: "button", style: { ...buttonStyle, padding: "6px 10px", fontSize: "12px" }, onClick: resetForm, children: "\uCDE8\uC18C" }) : null
      ] }),
      /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uC124\uC815\uC740 \uBCC4\uB3C4 \uC124\uC815 \uD398\uC774\uC9C0\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uAE30\uC874 \uB9C1\uD06C\uB294 \uBD88\uB7EC\uC640\uC11C \uBC29\uD5A5\uC744 \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: (event) => void onCreateLink(event), style: { display: "grid", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Remote company" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              required: true,
              style: inputStyle,
              value: remoteCompanyId,
              onChange: (event) => setRemoteCompanyId(event.target.value),
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "Choose company" }),
                (snapshot.data?.remoteCompanies ?? []).map((company) => /* @__PURE__ */ jsx("option", { value: company.id, children: company.name }, company.id))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Remote issue id or identifier" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              required: true,
              style: inputStyle,
              value: remoteIssueId,
              onChange: (event) => setRemoteIssueId(event.target.value),
              placeholder: "e.g. issue id"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "6px" }, children: [
          /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Direction" }),
          /* @__PURE__ */ jsxs(
            "select",
            {
              style: inputStyle,
              value: direction,
              onChange: (event) => setDirection(event.target.value),
              children: [
                /* @__PURE__ */ jsx("option", { value: BRIDGE_DIRECTIONS.twoWay, children: "two-way" }),
                /* @__PURE__ */ jsx("option", { value: BRIDGE_DIRECTIONS.localToRemote, children: "local -> remote" }),
                /* @__PURE__ */ jsx("option", { value: BRIDGE_DIRECTIONS.remoteToLocal, children: "remote -> local" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { type: "submit", style: buttonStyle, children: editingBridgeId ? "Bridge \uC218\uC815 \uC800\uC7A5" : "Bridge \uC800\uC7A5" }) })
      ] })
    ] })
  ] });
}
function BridgeDashboardWidget({ context }) {
  const snapshot = usePluginData(DATA_KEYS.dashboardWidget, {
    companyId: context.companyId ?? ""
  });
  if (snapshot.loading) {
    return /* @__PURE__ */ jsx("div", { style: widgetStyle, children: "Bridge \uC704\uC82F \uB85C\uB529 \uC911..." });
  }
  if (snapshot.error) {
    return /* @__PURE__ */ jsxs("div", { style: widgetStyle, children: [
      "Bridge \uC704\uC82F \uC624\uB958: ",
      String(snapshot.error)
    ] });
  }
  if (!snapshot.data) {
    return /* @__PURE__ */ jsx("div", { style: widgetStyle, children: "Bridge \uC704\uC82F \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  return /* @__PURE__ */ jsxs("section", { style: widgetStyle, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }, children: [
      /* @__PURE__ */ jsx("strong", { children: "Service Bridge" }),
      /* @__PURE__ */ jsx("span", { style: { ...mutedStyle, fontSize: "11px" }, children: formatDateTime(snapshot.data.generatedAt) })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: "26px", fontWeight: 700, lineHeight: 1 }, children: snapshot.data.totalActiveLinks }),
      /* @__PURE__ */ jsx("div", { style: mutedStyle, children: "\uD65C\uC131 \uB9C1\uD06C \uC218" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" }, children: [
      /* @__PURE__ */ jsxs("span", { style: statusBadgeStyle(true), children: [
        "open ",
        snapshot.data.statusCounts.open
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { ...statusBadgeStyle(true), background: "#dbeafe", color: "#1d4ed8" }, children: [
        "in_progress ",
        snapshot.data.statusCounts.inProgress
      ] }),
      /* @__PURE__ */ jsxs("span", { style: { ...statusBadgeStyle(true), background: "#f3e8ff", color: "#6b21a8" }, children: [
        "resolved ",
        snapshot.data.statusCounts.resolved
      ] })
    ] })
  ] });
}
function BridgeSettingsTab() {
  const snapshot = usePluginData(DATA_KEYS.settingsGet, {});
  const [providerCompanyId, setProviderCompanyId] = useState("");
  const [providerCompanyName, setProviderCompanyName] = useState("");
  const [providerProjectId, setProviderProjectId] = useState("");
  const [providerProjectName, setProviderProjectName] = useState("");
  const [requesterLabelNamesText, setRequesterLabelNamesText] = useState("");
  const [requesterTitlePrefixesText, setRequesterTitlePrefixesText] = useState("");
  const [autoCreateMirrorIssue, setAutoCreateMirrorIssue] = useState(true);
  const [workflowTriggerLabel, setWorkflowTriggerLabel] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const companies = snapshot.data?.companies ?? [];
  const availableProjects = companies.find((company) => company.id === providerCompanyId)?.projects ?? snapshot.data?.providerProjects ?? [];
  function parseAliases(value) {
    return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  }
  if (snapshot.data && !loaded) {
    setProviderCompanyId(snapshot.data.providerCompanyId || "");
    setProviderCompanyName(snapshot.data.providerCompanyName || "");
    setProviderProjectId(snapshot.data.providerProjectId || "");
    setProviderProjectName(snapshot.data.providerProjectName || "");
    setRequesterLabelNamesText(
      (snapshot.data.requesterLabelNames && snapshot.data.requesterLabelNames.length > 0 ? snapshot.data.requesterLabelNames : snapshot.data.requesterLabelName ? [snapshot.data.requesterLabelName] : []).join(", ")
    );
    setRequesterTitlePrefixesText(
      (snapshot.data.requesterTitlePrefixes && snapshot.data.requesterTitlePrefixes.length > 0 ? snapshot.data.requesterTitlePrefixes : snapshot.data.requesterLabelName ? [snapshot.data.requesterLabelName] : []).join(", ")
    );
    setAutoCreateMirrorIssue(snapshot.data.autoCreateMirrorIssue ?? true);
    setWorkflowTriggerLabel(snapshot.data.workflowTriggerLabel || "");
    setLoaded(true);
  }
  async function onSave(e) {
    e.preventDefault();
    setStatusMsg("");
    try {
      const selectedCompany = companies.find((company) => company.id === providerCompanyId);
      const selectedProject = availableProjects.find((project) => project.id === providerProjectId);
      const res = await fetch(`/api/plugins/${PLUGIN_ID}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configJson: {
            providerCompanyId,
            providerCompanyName: selectedCompany?.name ?? providerCompanyName,
            providerProjectId,
            providerProjectName: selectedProject?.name ?? providerProjectName,
            requesterLabelNames: parseAliases(requesterLabelNamesText),
            requesterTitlePrefixes: parseAliases(requesterTitlePrefixesText),
            autoCreateMirrorIssue,
            workflowTriggerLabel
          }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatusMsg("\uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    } catch (err) {
      setStatusMsg(`\uC624\uB958: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return /* @__PURE__ */ jsx("div", { style: tabStyle, children: /* @__PURE__ */ jsxs("section", { style: cardStyle, children: [
    /* @__PURE__ */ jsx("strong", { style: { fontSize: "14px" }, children: "Service Bridge \uC124\uC815" }),
    snapshot.loading ? /* @__PURE__ */ jsx("p", { style: mutedStyle, children: "\uB85C\uB529 \uC911..." }) : null,
    /* @__PURE__ */ jsx(DataError, { error: snapshot.error }),
    /* @__PURE__ */ jsxs("form", { onSubmit: (e) => void onSave(e), style: { display: "grid", gap: "12px" }, children: [
      /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "4px" }, children: [
        /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Provider Company (\uC11C\uBE44\uC2A4 \uC81C\uACF5 \uD68C\uC0AC)" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            style: inputStyle,
            value: providerCompanyId,
            onChange: (e) => {
              const nextId = e.target.value;
              const nextCompany = companies.find((company) => company.id === nextId);
              setProviderCompanyId(nextId);
              setProviderCompanyName(nextCompany?.name ?? "");
              setProviderProjectId("");
              setProviderProjectName("");
            },
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "(\uC120\uD0DD)" }),
              companies.map((company) => /* @__PURE__ */ jsx("option", { value: company.id, children: company.name }, company.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "4px" }, children: [
        /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Provider Project (\uC774\uC288\uB97C \uC0DD\uC131\uD560 \uD504\uB85C\uC81D\uD2B8)" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            style: inputStyle,
            value: providerProjectId,
            onChange: (e) => {
              const nextId = e.target.value;
              const nextProject = availableProjects.find((project) => project.id === nextId);
              setProviderProjectId(nextId);
              setProviderProjectName(nextProject?.name ?? "");
            },
            disabled: !providerCompanyId,
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "(\uC120\uD0DD)" }),
              availableProjects.map((project) => /* @__PURE__ */ jsx("option", { value: project.id, children: project.name }, project.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "4px" }, children: [
        /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Requester Issue Label Aliases (\uC694\uCCAD \uC774\uC288 \uB77C\uBCA8 \uBCC4\uCE6D)" }),
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: requesterLabelNamesText, onChange: (e) => setRequesterLabelNamesText(e.target.value), placeholder: "\uC608: \uC720\uC9C0\uBCF4\uC218, maintenance" })
      ] }),
      /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "4px" }, children: [
        /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Requester Title Prefixes (\uC694\uCCAD \uC774\uC288 \uC81C\uBAA9 prefix)" }),
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: requesterTitlePrefixesText, onChange: (e) => setRequesterTitlePrefixesText(e.target.value), placeholder: "\uC608: \uC720\uC9C0\uBCF4\uC218, maintenance" })
      ] }),
      /* @__PURE__ */ jsxs("label", { style: { display: "grid", gap: "4px" }, children: [
        /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Workflow Trigger Label (\uBBF8\uB7EC \uC774\uC288\uC5D0 \uBD99\uC77C \uB77C\uBCA8)" }),
        /* @__PURE__ */ jsx("input", { style: inputStyle, value: workflowTriggerLabel, onChange: (e) => setWorkflowTriggerLabel(e.target.value), placeholder: "(\uC120\uD0DD)" })
      ] }),
      /* @__PURE__ */ jsxs("label", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: autoCreateMirrorIssue, onChange: (e) => setAutoCreateMirrorIssue(e.target.checked) }),
        /* @__PURE__ */ jsx("span", { style: mutedStyle, children: "Auto Create Mirror Issue" })
      ] }),
      statusMsg ? /* @__PURE__ */ jsx("p", { style: { ...mutedStyle, color: statusMsg.startsWith("\uC624\uB958") ? "#b91c1c" : "#166534" }, children: statusMsg }) : null,
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("button", { type: "submit", style: buttonStyle, children: "\uC800\uC7A5" }) })
    ] })
  ] }) });
}
function BridgeSidebarLink({ context }) {
  const href = bridgeHref(context.companyPrefix);
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
      children: /* @__PURE__ */ jsx("span", { children: "\u{1F517} Service Bridge" })
    }
  );
}
export {
  BridgeDashboardWidget,
  BridgeSettingsTab,
  BridgeSidebarLink,
  ServiceRequestBridgeDetailTab,
  ServiceRequestBridgeListTab
};
//# sourceMappingURL=index.js.map
