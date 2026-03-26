import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { NODE_COLORS, PAGE_ROUTE } from "../constants.js";
let cytoscapeLoader = null;
const pageStyle = {
    display: "grid",
    gap: "20px",
    padding: "22px",
    color: "var(--foreground, #e2e8f0)",
    background: [
        "radial-gradient(circle at 8% -10%, color-mix(in srgb, #334155 42%, transparent) 0%, transparent 40%)",
        "radial-gradient(circle at 90% 0%, color-mix(in srgb, #1e293b 40%, transparent) 0%, transparent 36%)",
        "linear-gradient(180deg, color-mix(in srgb, var(--background, #0f172a) 100%, #020617), #020617)",
    ].join(", "),
    minHeight: "100%",
};
const panelStyle = {
    borderRadius: "18px",
    border: "1px solid color-mix(in srgb, var(--border, #334155) 74%, transparent)",
    background: "color-mix(in srgb, var(--card, #0b1220) 94%, transparent)",
    boxShadow: "0 22px 70px rgba(2, 6, 23, 0.35)",
};
const panelTitleStyle = {
    margin: 0,
    fontSize: "18px",
    lineHeight: 1.15,
};
const mutedStyle = {
    color: "color-mix(in srgb, var(--foreground, #e2e8f0) 62%, transparent)",
    fontSize: "12px",
    lineHeight: 1.5,
};
function hostPath(companyPrefix, suffix) {
    return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}
function pluginPagePath(companyPrefix) {
    return hostPath(companyPrefix, `/${PAGE_ROUTE}`);
}
function loadCytoscape() {
    if (!cytoscapeLoader) {
        cytoscapeLoader = import("cytoscape").then((module) => module.default);
    }
    return cytoscapeLoader;
}
function buildElements(nodes, edges) {
    const nodeElements = nodes.map((node) => ({
        group: "nodes",
        data: {
            id: node.id,
            label: node.label,
            kind: node.kind,
            status: node.status,
            role: node.role,
        },
    }));
    const edgeElements = edges.map((edge) => ({
        group: "edges",
        data: {
            source: edge.source,
            target: edge.target,
            label: edge.label,
        },
    }));
    return [...nodeElements, ...edgeElements];
}
function isCodeNode(node) {
    return node.kind !== "agent";
}
function filterGraphByLayer(nodes, edges, layerFilter) {
    const filteredNodes = nodes.filter((node) => {
        if (layerFilter === "all")
            return true;
        if (layerFilter === "agent")
            return node.kind === "agent";
        return isCodeNode(node);
    });
    const nodeIds = new Set(filteredNodes.map((node) => node.id));
    const filteredEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { nodes: filteredNodes, edges: filteredEdges };
}
function scoreTone(score) {
    if (score >= 80) {
        return {
            color: "#16a34a",
            background: "color-mix(in srgb, #22c55e 16%, transparent)",
            border: "1px solid color-mix(in srgb, #22c55e 36%, transparent)",
        };
    }
    if (score >= 50) {
        return {
            color: "#d97706",
            background: "color-mix(in srgb, #f59e0b 16%, transparent)",
            border: "1px solid color-mix(in srgb, #f59e0b 36%, transparent)",
        };
    }
    return {
        color: "#dc2626",
        background: "color-mix(in srgb, #ef4444 16%, transparent)",
        border: "1px solid color-mix(in srgb, #ef4444 36%, transparent)",
    };
}
export function HealthCardRow({ cards }) {
    return (_jsx("div", { style: {
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        }, children: cards.map((card) => {
            const tone = scoreTone(card.score);
            const deltaLabel = card.delta
                ? card.delta.direction === "flat"
                    ? "0"
                    : `${card.delta.direction === "up" ? "+" : "-"}${Math.abs(card.delta.diff)}`
                : null;
            return (_jsxs("article", { style: {
                    ...panelStyle,
                    display: "grid",
                    gap: "8px",
                    padding: "14px",
                    border: tone.border,
                    background: `linear-gradient(165deg, ${tone.background}, color-mix(in srgb, var(--card, #0b1220) 92%, transparent))`,
                }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }, children: [_jsx("strong", { style: { fontSize: "14px" }, children: card.name }), _jsx("span", { style: { ...mutedStyle, color: tone.color }, children: card.state })] }), _jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "baseline" }, children: [_jsx("strong", { style: { fontSize: "28px", lineHeight: 1, color: tone.color }, children: card.score }), deltaLabel ? _jsxs("span", { style: mutedStyle, children: ["\u0394 ", deltaLabel] }) : null] }), _jsx("div", { style: mutedStyle, children: card.detail })] }, card.name));
        }) }));
}
export function QuestionList({ questions }) {
    return (_jsx("div", { style: { display: "grid", gap: "10px" }, children: questions.map((question, index) => (_jsxs("article", { style: { ...panelStyle, display: "grid", gap: "4px", padding: "12px 14px" }, children: [_jsx("div", { style: { fontSize: "14px", lineHeight: 1.5 }, children: question.text }), _jsx("div", { style: mutedStyle, children: question.actionHint })] }, `${question.text}-${index}`))) }));
}
function AgentDetailPanel({ selectedNode, detail, loading, }) {
    if (!selectedNode) {
        return _jsx("div", { style: mutedStyle, children: "\uB178\uB4DC\uB97C \uD074\uB9AD\uD558\uBA74 \uC0C1\uC138 \uC815\uBCF4\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4." });
    }
    if (selectedNode.kind !== "agent") {
        return (_jsxs("div", { style: { display: "grid", gap: "10px" }, children: [_jsxs("div", { style: { display: "grid", gap: "4px" }, children: [_jsx("strong", { style: { fontSize: "15px" }, children: selectedNode.label }), _jsxs("div", { style: mutedStyle, children: ["kind: ", selectedNode.kind, " \u00B7 layer: ", selectedNode.layer ?? "n/a"] })] }), selectedNode.summary ? _jsx("div", { style: { fontSize: "13px", lineHeight: 1.5 }, children: selectedNode.summary }) : null, _jsx("div", { style: mutedStyle, children: "\uCF54\uB4DC KG \uB178\uB4DC\uB294 \uCD5C\uADFC \uC774\uC288 \uBAA9\uB85D \uB300\uC2E0 \uAD6C\uC870 \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4." })] }));
    }
    return (_jsxs("div", { style: { display: "grid", gap: "10px" }, children: [_jsxs("div", { style: { display: "grid", gap: "4px" }, children: [_jsx("strong", { style: { fontSize: "15px" }, children: selectedNode.label }), _jsxs("div", { style: mutedStyle, children: ["status: ", selectedNode.status, " \u00B7 role: ", selectedNode.role] })] }), loading ? _jsx("div", { style: mutedStyle, children: "\uCD5C\uADFC \uC774\uC288\uB97C \uC870\uD68C\uD558\uB294 \uC911..." }) : null, !loading && detail?.recentIssues.length === 0 ? _jsx("div", { style: mutedStyle, children: "\uCD5C\uADFC \uC774\uC288\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) : null, !loading && detail ? (_jsx("div", { style: { display: "grid", gap: "8px" }, children: detail.recentIssues.map((issue) => (_jsxs("div", { style: {
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border: "1px solid color-mix(in srgb, var(--border, #334155) 74%, transparent)",
                        background: "color-mix(in srgb, var(--background, #020617) 68%, transparent)",
                    }, children: [_jsx("div", { style: { fontSize: "13px", lineHeight: 1.4 }, children: issue.title }), _jsxs("div", { style: mutedStyle, children: [issue.identifier ?? issue.id.slice(0, 8), " \u00B7 ", issue.status] })] }, issue.id))) })) : null] }));
}
export function SystemGardenPage({ context }) {
    const snapshot = usePluginData("system-garden-snapshot", {
        companyId: context.companyId ?? "",
    });
    const [layerFilter, setLayerFilter] = useState("all");
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [graphError, setGraphError] = useState(null);
    const graphRef = useRef(null);
    const filteredGraph = useMemo(() => {
        if (!snapshot.data)
            return { nodes: [], edges: [] };
        return filterGraphByLayer(snapshot.data.graph.nodes, snapshot.data.graph.edges, layerFilter);
    }, [snapshot.data, layerFilter]);
    const selectedNode = useMemo(() => filteredGraph.nodes.find((node) => node.id === selectedNodeId) ?? null, [filteredGraph.nodes, selectedNodeId]);
    const selectedAgent = selectedNode?.kind === "agent" ? selectedNode : null;
    const detail = usePluginData("system-garden-agent-detail", {
        companyId: context.companyId ?? "",
        agentId: selectedAgent?.id ?? "",
    });
    useEffect(() => {
        if (!selectedNodeId)
            return;
        if (filteredGraph.nodes.some((node) => node.id === selectedNodeId))
            return;
        setSelectedNodeId(null);
    }, [filteredGraph.nodes, selectedNodeId]);
    useEffect(() => {
        if (!snapshot.data || !graphRef.current)
            return;
        let disposed = false;
        let instance = null;
        setGraphError(null);
        const mount = async () => {
            const cytoscape = await loadCytoscape();
            if (disposed || !graphRef.current)
                return;
            instance = cytoscape({
                container: graphRef.current,
                elements: buildElements(filteredGraph.nodes, filteredGraph.edges),
                style: [
                    {
                        selector: "node",
                        style: {
                            "background-color": NODE_COLORS.default,
                            color: "#f8fafc",
                            "font-size": 11,
                            label: "data(label)",
                            "text-valign": "center",
                            "text-halign": "center",
                            "text-wrap": "wrap",
                            "text-max-width": 92,
                            width: 42,
                            height: 42,
                            "border-width": 2,
                            "border-color": "#0a1628",
                        },
                    },
                    {
                        selector: "node[kind = 'agent']",
                        style: {
                            "background-color": NODE_COLORS.agent,
                        },
                    },
                    {
                        selector: "node[kind = 'module'], node[kind = 'file']",
                        style: {
                            "background-color": NODE_COLORS.module,
                        },
                    },
                    {
                        selector: "node[kind = 'function']",
                        style: {
                            "background-color": NODE_COLORS.function,
                        },
                    },
                    {
                        selector: "node[kind = 'class']",
                        style: {
                            "background-color": NODE_COLORS.class,
                        },
                    },
                    {
                        selector: "edge",
                        style: {
                            width: 2,
                            "line-color": "#5d6b7e",
                            "target-arrow-color": "#6b7a8d",
                            "target-arrow-shape": "triangle",
                            "curve-style": "bezier",
                            label: "data(label)",
                            "font-size": 9,
                            color: "#9fb0c4",
                            "text-background-color": "rgba(15, 23, 42, 0.86)",
                            "text-background-opacity": 1,
                            "text-background-padding": 2,
                        },
                    },
                    {
                        selector: ".faded",
                        style: {
                            opacity: 0.18,
                        },
                    },
                    {
                        selector: ".highlight",
                        style: {
                            "line-color": "#22d3ee",
                            "target-arrow-color": "#22d3ee",
                            width: 3,
                        },
                    },
                ],
                layout: {
                    name: "cose",
                    animate: true,
                    fit: true,
                    padding: 20,
                },
            });
            instance.on("tap", "node", (event) => {
                setSelectedNodeId(event.target.id());
            });
            instance.on("mouseover", "node", (event) => {
                if (!instance)
                    return;
                const neighborhood = event.target.closedNeighborhood();
                instance.elements().removeClass("faded");
                instance.elements().not(neighborhood).addClass("faded");
                event.target.connectedEdges().addClass("highlight");
            });
            instance.on("mouseout", "node", () => {
                if (!instance)
                    return;
                instance.elements().removeClass("faded");
                instance.elements().removeClass("highlight");
            });
        };
        mount().catch((error) => {
            if (disposed)
                return;
            setGraphError(error instanceof Error ? error.message : "그래프를 초기화하지 못했습니다.");
        });
        return () => {
            disposed = true;
            if (instance)
                instance.destroy();
        };
    }, [snapshot.data, filteredGraph]);
    if (snapshot.loading)
        return _jsx("div", { style: pageStyle, children: "System Garden \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." });
    if (snapshot.error)
        return _jsxs("div", { style: pageStyle, children: ["System Garden \uB370\uC774\uD130 \uC624\uB958: ", snapshot.error.message] });
    if (!snapshot.data)
        return _jsx("div", { style: pageStyle, children: "\uD45C\uC2DC\uD560 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return (_jsxs("div", { style: pageStyle, children: [_jsxs("header", { style: { ...panelStyle, padding: "18px 20px", display: "grid", gap: "8px" }, children: [_jsx("h1", { style: { margin: 0, fontSize: "clamp(26px, 3.2vw, 38px)", lineHeight: 1.03 }, children: "System Garden" }), _jsx("div", { style: { ...mutedStyle, fontSize: "13px" }, children: "\uC5D0\uC774\uC804\uD2B8 \uADF8\uB798\uD504\uC640 \uCF54\uB4DC KG\uB97C \uB808\uC774\uC5B4\uBCC4\uB85C \uACB9\uCCD0 \uBCF4\uBA70 \uC6B4\uC601 \uAC74\uAC15\uB3C4\uC640 \uBA54\uD0C0\uC778\uC9C0 \uC9C8\uBB38\uC744 \uC810\uAC80\uD569\uB2C8\uB2E4." }), _jsxs("div", { style: mutedStyle, children: ["agents: ", snapshot.data.meta.agentCount, " \u00B7 issues: ", snapshot.data.meta.issueCount, " \u00B7 generated: ", new Date(snapshot.data.meta.generatedAt).toLocaleString("ko-KR")] })] }), _jsxs("section", { style: { ...panelStyle, padding: "14px", display: "grid", gap: "12px" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }, children: [_jsx("h2", { style: panelTitleStyle, children: "Graph" }), _jsx("div", { style: { display: "inline-flex", gap: "6px", background: "rgba(15,23,42,0.55)", borderRadius: "999px", padding: "4px" }, children: [
                                    { value: "all", label: "전체" },
                                    { value: "agent", label: "에이전트만" },
                                    { value: "code", label: "코드만" },
                                ].map((option) => (_jsx("button", { type: "button", onClick: () => setLayerFilter(option.value), style: {
                                        border: "none",
                                        borderRadius: "999px",
                                        padding: "6px 10px",
                                        fontSize: "12px",
                                        cursor: "pointer",
                                        color: layerFilter === option.value ? "#0f172a" : "#cbd5e1",
                                        background: layerFilter === option.value ? "#67e8f9" : "transparent",
                                    }, children: option.label }, option.value))) })] }), _jsxs("div", { style: { display: "grid", gap: "12px", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)" }, children: [_jsx("div", { ref: graphRef, style: {
                                    width: "100%",
                                    minHeight: "440px",
                                    display: "grid",
                                    placeItems: "center",
                                    borderRadius: "14px",
                                    border: "1px solid color-mix(in srgb, var(--border, #334155) 76%, transparent)",
                                    background: "color-mix(in srgb, var(--background, #020617) 75%, transparent)",
                                }, children: graphError ? (_jsxs("div", { style: { ...mutedStyle, maxWidth: "320px", textAlign: "center", padding: "16px" }, children: ["\uADF8\uB798\uD504\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. ", graphError] })) : filteredGraph.nodes.length === 0 ? (_jsx("div", { style: { ...mutedStyle, maxWidth: "320px", textAlign: "center", padding: "16px" }, children: "\uD604\uC7AC \uB808\uC774\uC5B4 \uD544\uD130\uC5D0 \uD45C\uC2DC\uD560 \uADF8\uB798\uD504\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })) : null }), _jsx("aside", { style: {
                                    borderRadius: "14px",
                                    border: "1px solid color-mix(in srgb, var(--border, #334155) 76%, transparent)",
                                    background: "color-mix(in srgb, var(--card, #0b1220) 92%, transparent)",
                                    padding: "12px",
                                }, children: _jsx(AgentDetailPanel, { selectedNode: selectedNode, detail: detail.data ?? null, loading: detail.loading }) })] })] }), _jsxs("section", { style: { ...panelStyle, padding: "14px", display: "grid", gap: "12px" }, children: [_jsx("h2", { style: panelTitleStyle, children: "Health" }), _jsx(HealthCardRow, { cards: snapshot.data.cards })] }), _jsxs("section", { style: { ...panelStyle, padding: "14px", display: "grid", gap: "12px" }, children: [_jsx("h2", { style: panelTitleStyle, children: "Questions" }), _jsx(QuestionList, { questions: snapshot.data.questions })] })] }));
}
export function SystemGardenSidebarLink({ context }) {
    const href = pluginPagePath(context.companyPrefix);
    const isActive = typeof window !== "undefined" && window.location.pathname === href;
    return (_jsxs("a", { href: href, "aria-current": isActive ? "page" : undefined, className: [
            "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
            isActive
                ? "bg-accent text-foreground"
                : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
        ].join(" "), children: [_jsx("span", { "aria-hidden": "true", children: "\u2733" }), _jsx("span", { className: "truncate", children: "System Garden" })] }));
}
//# sourceMappingURL=index.js.map