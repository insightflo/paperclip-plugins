import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { NODE_COLORS } from "./constants.js";
let cytoscapeLoader = null;
const DEFAULT_GRAPH_FILTERS = {
    parent: true,
    child: true,
    standalone: true,
    agent: true,
};
const panelStyle = {
    borderRadius: "18px",
    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 74%, transparent)",
    background: "color-mix(in srgb, var(--card, #ffffff) 96%, transparent)",
    boxShadow: "0 18px 48px rgba(15, 23, 42, 0.05)",
};
const mutedStyle = {
    color: "color-mix(in srgb, var(--foreground, #0f172a) 62%, transparent)",
    fontSize: "12px",
    lineHeight: 1.5,
};
function loadCytoscape() {
    if (!cytoscapeLoader) {
        cytoscapeLoader = import("cytoscape").then((module) => module.default);
    }
    return cytoscapeLoader;
}
function nodeFilterKind(node) {
    if (node.kind === "agent")
        return "agent";
    return node.topologyRole ?? "standalone";
}
function isNodeVisibleByFilter(node, filters) {
    return filters[nodeFilterKind(node)];
}
function buildFilterSummary(nodes) {
    const summary = {
        parent: 0,
        child: 0,
        standalone: 0,
        agent: 0,
    };
    for (const node of nodes) {
        summary[nodeFilterKind(node)] += 1;
    }
    return summary;
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
            topologyRole: node.topologyRole,
            summary: node.summary,
            identifier: node.identifier ?? null,
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
function clearHighlight(core) {
    core.elements().removeClass("faded");
    core.elements().removeClass("highlight");
    core.elements().removeClass("active-node");
    core.elements().removeClass("current-node");
}
function buildAdjacency(nodes, edges) {
    const adjacency = new Map();
    const nodeIds = new Set(nodes.map((node) => node.id));
    for (const edge of edges) {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))
            continue;
        const sourceBucket = adjacency.get(edge.source) ?? new Set();
        sourceBucket.add(edge.target);
        adjacency.set(edge.source, sourceBucket);
        const targetBucket = adjacency.get(edge.target) ?? new Set();
        targetBucket.add(edge.source);
        adjacency.set(edge.target, targetBucket);
    }
    return adjacency;
}
function applyTrailHighlight(core, trailNodeIds, nodes, edges, adjacency) {
    clearHighlight(core);
    if (trailNodeIds.length === 0)
        return;
    const activeNodeIds = new Set();
    for (const nodeId of trailNodeIds) {
        activeNodeIds.add(nodeId);
        const neighbors = adjacency.get(nodeId);
        if (!neighbors)
            continue;
        for (const neighbor of neighbors) {
            activeNodeIds.add(neighbor);
        }
    }
    for (const node of nodes) {
        const element = core.getElementById(node.id);
        if (!element)
            continue;
        if (activeNodeIds.has(node.id)) {
            element.removeClass("faded");
        }
        else {
            element.addClass("faded");
        }
    }
    for (const edge of edges) {
        if (!activeNodeIds.has(edge.source) && !activeNodeIds.has(edge.target))
            continue;
        const source = core.getElementById(edge.source);
        if (!source)
            continue;
        source.connectedEdges().addClass("highlight");
    }
    for (const nodeId of trailNodeIds) {
        const element = core.getElementById(nodeId);
        if (!element)
            continue;
        element.removeClass("faded");
        element.addClass("active-node");
    }
    const currentNodeId = trailNodeIds[trailNodeIds.length - 1];
    const currentNode = core.getElementById(currentNodeId);
    if (currentNode) {
        currentNode.addClass("current-node");
    }
}
function toggleButtonStyle(active) {
    return {
        borderRadius: "999px",
        border: `1px solid ${active ? "color-mix(in srgb, #0ea5e9 58%, transparent)" : "color-mix(in srgb, var(--border, #d4d4d8) 74%, transparent)"}`,
        background: active ? "color-mix(in srgb, #0ea5e9 16%, transparent)" : "color-mix(in srgb, var(--background, #f8fafc) 72%, transparent)",
        color: active ? "#075985" : "inherit",
        padding: "6px 10px",
        fontSize: "12px",
        cursor: "pointer",
    };
}
function collectIssueLinks(selectedNodeId, nodes, edges) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incomingIssueLinks = [];
    const outgoingIssueLinks = [];
    const assigneeLinks = [];
    for (const edge of edges) {
        if (edge.source === selectedNodeId) {
            const target = nodeById.get(edge.target);
            if (!target)
                continue;
            const link = { node: target, relation: edge.label, direction: "outgoing" };
            if (target.kind === "agent" && edge.label === "assignee")
                assigneeLinks.push(link);
            if (target.kind === "issue")
                outgoingIssueLinks.push(link);
        }
        if (edge.target === selectedNodeId) {
            const source = nodeById.get(edge.source);
            if (!source)
                continue;
            const link = { node: source, relation: edge.label, direction: "incoming" };
            if (edge.label === "assignee" && source.kind === "issue")
                assigneeLinks.push(link);
            if (source.kind === "issue")
                incomingIssueLinks.push(link);
        }
    }
    return { incomingIssueLinks, outgoingIssueLinks, assigneeLinks };
}
function issuePath(companyPrefix, issue) {
    const pathId = issue.identifier ?? issue.id;
    return companyPrefix ? `/${companyPrefix}/issues/${pathId}` : `/issues/${pathId}`;
}
function LinkList({ title, links, companyPrefix, }) {
    if (links.length === 0)
        return null;
    return (_jsxs("div", { style: { display: "grid", gap: "6px" }, children: [_jsx("div", { style: { ...mutedStyle, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }, children: title }), links.map((link) => (link.node.kind === "issue" ? (_jsx("a", { href: issuePath(companyPrefix, link.node), style: { color: "inherit", textDecoration: "none" }, children: _jsxs("div", { style: {
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 74%, transparent)",
                        background: "color-mix(in srgb, var(--background, #f8fafc) 68%, transparent)",
                    }, children: [_jsx("div", { style: { fontSize: "13px", lineHeight: 1.4 }, children: link.node.label }), _jsxs("div", { style: mutedStyle, children: [link.relation, " \u00B7 ", link.node.kind, link.node.summary ? ` · ${link.node.summary}` : ""] })] }) }, `${title}-${link.direction}-${link.node.id}-${link.relation}`)) : (_jsxs("div", { style: {
                    padding: "8px 10px",
                    borderRadius: "10px",
                    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 74%, transparent)",
                    background: "color-mix(in srgb, var(--background, #f8fafc) 68%, transparent)",
                }, children: [_jsx("div", { style: { fontSize: "13px", lineHeight: 1.4 }, children: link.node.label }), _jsxs("div", { style: mutedStyle, children: [link.relation, " \u00B7 ", link.node.kind, link.node.summary ? ` · ${link.node.summary}` : ""] })] }, `${title}-${link.direction}-${link.node.id}-${link.relation}`))))] }));
}
function NodeDetailPanel({ selectedNode, nodes, edges, companyPrefix, seedIssueIds, }) {
    if (!selectedNode) {
        return _jsx("div", { style: mutedStyle, children: "\uB178\uB4DC\uB97C \uD074\uB9AD\uD558\uBA74 \uAD00\uACC4\uC640 \uC6D0\uBCF8 \uC774\uC288\uB97C \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    }
    const { incomingIssueLinks, outgoingIssueLinks, assigneeLinks } = collectIssueLinks(selectedNode.id, nodes, edges);
    const isSeed = seedIssueIds.includes(selectedNode.id);
    const assigneeTitle = selectedNode.kind === "agent" ? "Assigned issues" : "Assignees";
    return (_jsxs("div", { style: { display: "grid", gap: "10px" }, children: [_jsxs("div", { style: { display: "grid", gap: "4px" }, children: [_jsx("strong", { style: { fontSize: "15px" }, children: selectedNode.label }), _jsxs("div", { style: mutedStyle, children: ["kind: ", selectedNode.kind, " \u00B7 status: ", selectedNode.status, " \u00B7 role: ", selectedNode.role, selectedNode.topologyRole ? ` · topology: ${selectedNode.topologyRole}` : ""] })] }), selectedNode.summary ? _jsx("div", { style: { fontSize: "13px", lineHeight: 1.5 }, children: selectedNode.summary }) : null, _jsxs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [_jsx("span", { style: { ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 58%, transparent)" }, children: isSeed ? "seed" : "related" }), selectedNode.identifier ? (_jsx("a", { href: issuePath(companyPrefix, selectedNode), style: { ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #0ea5e9 12%, transparent)", color: "#075985", textDecoration: "none" }, children: selectedNode.identifier })) : null] }), _jsx(LinkList, { title: assigneeTitle, links: assigneeLinks, companyPrefix: companyPrefix }), selectedNode.kind === "issue" ? (_jsxs(_Fragment, { children: [_jsx(LinkList, { title: "Inbound issues", links: incomingIssueLinks, companyPrefix: companyPrefix }), _jsx(LinkList, { title: "Outbound issues", links: outgoingIssueLinks, companyPrefix: companyPrefix })] })) : null] }));
}
function graphStyle(kind) {
    if (kind === "agent") {
        return {
            "background-color": NODE_COLORS.agent,
            width: 44,
            height: 44,
            "font-size": 11,
            "text-max-width": 96,
        };
    }
    return {
        "background-color": NODE_COLORS.issueStandalone,
        shape: "round-rectangle",
        width: 56,
        height: 38,
        "font-size": 10,
        "text-max-width": 88,
    };
}
export function MissionGraphPanel({ graph, companyPrefix, }) {
    const [graphMode, setGraphMode] = useState("mission");
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchNotice, setSearchNotice] = useState(null);
    const [graphError, setGraphError] = useState(null);
    const [collapsed, setCollapsed] = useState(false);
    const [visibleMode, setVisibleMode] = useState(false);
    const [filters, setFilters] = useState(DEFAULT_GRAPH_FILTERS);
    const [filterNotice, setFilterNotice] = useState(null);
    const [trailNodeIds, setTrailNodeIds] = useState([]);
    const graphRef = useRef(null);
    const instanceRef = useRef(null);
    const selectedNodeIdRef = useRef(null);
    const visibleModeRef = useRef(false);
    const trailNodeIdsRef = useRef([]);
    const clearTrail = () => {
        trailNodeIdsRef.current = [];
        setTrailNodeIds([]);
        if (instanceRef.current) {
            clearHighlight(instanceRef.current);
        }
    };
    useEffect(() => {
        selectedNodeIdRef.current = selectedNodeId;
    }, [selectedNodeId]);
    useEffect(() => {
        visibleModeRef.current = visibleMode;
    }, [visibleMode]);
    useEffect(() => {
        trailNodeIdsRef.current = trailNodeIds;
    }, [trailNodeIds]);
    useEffect(() => {
        if (!visibleMode) {
            trailNodeIdsRef.current = [];
            setTrailNodeIds([]);
        }
    }, [visibleMode]);
    const activeGraph = useMemo(() => {
        if (graphMode === "spawn" && graph.spawnGraph)
            return graph.spawnGraph;
        return graph.missionGraph;
    }, [graph.missionGraph, graph.spawnGraph, graphMode]);
    const filterSummary = useMemo(() => buildFilterSummary(activeGraph.graph.nodes), [activeGraph.graph.nodes]);
    const activeFilterCount = useMemo(() => (Object.values(filters).filter(Boolean).length), [filters]);
    const visibleNodes = useMemo(() => activeGraph.graph.nodes.filter((node) => isNodeVisibleByFilter(node, filters)), [activeGraph.graph.nodes, filters]);
    const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
    const visibleEdges = useMemo(() => activeGraph.graph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)), [activeGraph.graph.edges, visibleNodeIds]);
    const visibleGraph = useMemo(() => ({
        nodes: visibleNodes,
        edges: visibleEdges,
    }), [visibleEdges, visibleNodes]);
    const adjacency = useMemo(() => buildAdjacency(visibleGraph.nodes, visibleGraph.edges), [visibleGraph.edges, visibleGraph.nodes]);
    useEffect(() => {
        const visibleNodeIdSet = new Set(visibleGraph.nodes.map((node) => node.id));
        setTrailNodeIds((current) => current.filter((id) => visibleNodeIdSet.has(id)));
    }, [visibleGraph.nodes]);
    const selectedNode = useMemo(() => visibleGraph.nodes.find((node) => node.id === selectedNodeId) ?? null, [selectedNodeId, visibleGraph.nodes]);
    const selectNode = (nodeId) => {
        if (!visibleModeRef.current || !instanceRef.current) {
            setSelectedNodeId(nodeId);
            return;
        }
        setTrailNodeIds((current) => {
            const exists = current.includes(nodeId);
            const next = exists
                ? current.filter((currentNodeId) => currentNodeId !== nodeId)
                : [...current.filter((currentNodeId) => currentNodeId !== nodeId), nodeId];
            if (next.length > 0) {
                applyTrailHighlight(instanceRef.current, next, visibleGraph.nodes, visibleGraph.edges, adjacency);
                setSelectedNodeId(next[next.length - 1] ?? null);
            }
            else {
                clearHighlight(instanceRef.current);
                setSelectedNodeId(null);
            }
            return next;
        });
    };
    useEffect(() => {
        if (!visibleGraph.nodes.length) {
            setSelectedNodeId(null);
            return;
        }
        if (selectedNodeId && visibleGraph.nodes.some((node) => node.id === selectedNodeId)) {
            return;
        }
        setSelectedNodeId(visibleGraph.nodes[0]?.id ?? null);
    }, [selectedNodeId, visibleGraph.nodes]);
    useEffect(() => {
        const instance = instanceRef.current;
        if (!instance)
            return;
        if (!visibleMode) {
            clearHighlight(instance);
            return;
        }
        if (trailNodeIds.length > 0) {
            applyTrailHighlight(instance, trailNodeIds, visibleGraph.nodes, visibleGraph.edges, adjacency);
            return;
        }
        clearHighlight(instance);
    }, [adjacency, trailNodeIds, visibleGraph.edges, visibleGraph.nodes, visibleMode]);
    useEffect(() => {
        if (!graphRef.current || collapsed) {
            if (instanceRef.current) {
                instanceRef.current.destroy();
                instanceRef.current = null;
            }
            return;
        }
        let disposed = false;
        let instance = null;
        setGraphError(null);
        const mount = async () => {
            const cytoscape = await loadCytoscape();
            if (disposed || !graphRef.current)
                return;
            const elements = buildElements(visibleGraph.nodes, visibleGraph.edges);
            if (elements.length === 0) {
                instanceRef.current = null;
                return;
            }
            instance = cytoscape({
                container: graphRef.current,
                elements,
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
                        style: graphStyle("agent"),
                    },
                    {
                        selector: "node[kind = 'issue']",
                        style: graphStyle("issue"),
                    },
                    {
                        selector: "node[kind = 'issue'][topologyRole = 'parent']",
                        style: {
                            "background-color": NODE_COLORS.issueParent,
                            "border-color": "#075985",
                        },
                    },
                    {
                        selector: "node[kind = 'issue'][topologyRole = 'child']",
                        style: {
                            "background-color": NODE_COLORS.issueChild,
                            "border-color": "#9a3412",
                        },
                    },
                    {
                        selector: "node[kind = 'issue'][topologyRole = 'standalone']",
                        style: {
                            "background-color": NODE_COLORS.issueStandalone,
                            "border-color": "#334155",
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
                    {
                        selector: ".active-node",
                        style: {
                            "border-width": 4,
                            "border-color": "#67e8f9",
                            "z-index": 10,
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
                selectNode(event.target.id());
            });
            instance.on("mouseover", "node", (event) => {
                if (!instanceRef.current)
                    return;
                if (visibleModeRef.current)
                    return;
                applyTrailHighlight(instanceRef.current, [event.target.id()], visibleGraph.nodes, visibleGraph.edges, adjacency);
            });
            instance.on("mouseout", "node", () => {
                if (!instanceRef.current)
                    return;
                if (visibleModeRef.current)
                    return;
                clearHighlight(instanceRef.current);
            });
            instanceRef.current = instance;
            if (visibleModeRef.current && trailNodeIdsRef.current.length > 0) {
                applyTrailHighlight(instance, trailNodeIdsRef.current, visibleGraph.nodes, visibleGraph.edges, adjacency);
            }
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
            if (instanceRef.current === instance) {
                instanceRef.current = null;
            }
        };
    }, [adjacency, collapsed, visibleEdges, visibleNodes, graphMode]);
    const updateFilter = (key) => {
        if (filters[key] && activeFilterCount === 1) {
            setFilterNotice("최소 하나의 필터는 유지해야 합니다.");
            return;
        }
        setFilterNotice(null);
        setFilters((current) => ({
            ...current,
            [key]: !current[key],
        }));
    };
    const searchIssues = () => {
        const query = searchQuery.trim();
        if (!query) {
            setSearchNotice("이슈 번호를 입력해 주세요.");
            return;
        }
        const normalizedQuery = query.toLowerCase();
        const issueNodes = activeGraph.graph.nodes.filter((node) => node.kind === "issue");
        const exactMatch = issueNodes.find((node) => (node.identifier ?? "").toLowerCase() === normalizedQuery);
        const partialMatch = issueNodes.find((node) => (node.identifier ?? "").toLowerCase().includes(normalizedQuery));
        const match = exactMatch ?? partialMatch ?? null;
        if (!match) {
            setSearchNotice(`"${query}" 이슈를 현재 ${graphMode} 그래프에서 찾지 못했습니다.`);
            return;
        }
        const requiredFilter = nodeFilterKind(match);
        if (!filters[requiredFilter]) {
            setFilters((current) => ({
                ...current,
                [requiredFilter]: true,
            }));
        }
        setSearchNotice(`${match.identifier ?? match.label} 선택됨`);
        selectNode(match.id);
    };
    return (_jsxs("section", { style: {
            ...panelStyle,
            padding: "14px",
            display: "grid",
            gap: "12px",
        }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("div", { style: { display: "grid", gap: "4px" }, children: [_jsx("strong", { style: { fontSize: "18px" }, children: "Mission Graph" }), _jsxs("div", { style: mutedStyle, children: [graphMode === "spawn" ? "spawn" : "mission", " \u00B7 seed ", activeGraph.seedIssueIds.length, " \u00B7 visible ", visibleGraph.nodes.length, " \u00B7 edges ", visibleGraph.edges.length] })] }), _jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("div", { style: { display: "flex", gap: "6px" }, children: [_jsx("button", { type: "button", style: toggleButtonStyle(graphMode === "mission"), onClick: () => setGraphMode("mission"), children: "mission graph" }), _jsx("button", { type: "button", style: toggleButtonStyle(graphMode === "spawn"), onClick: () => setGraphMode("spawn"), children: "spawn graph" })] }), _jsx("div", { style: { ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: graphMode === "spawn" ? "spawn lineage only" : "금주 seed + related only" }), _jsx("button", { type: "button", style: toggleButtonStyle(collapsed), onClick: () => setCollapsed((value) => !value), children: collapsed ? "펼치기" : "접기" })] })] }), _jsxs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }, children: [["parent", "child", "standalone", "agent"].map((key) => (_jsxs("button", { type: "button", style: toggleButtonStyle(filters[key]), onClick: () => updateFilter(key), children: [key, " ", filterSummary[key]] }, key))), _jsxs("button", { type: "button", style: toggleButtonStyle(visibleMode), onClick: () => setVisibleMode((value) => !value), children: ["visible mode ", visibleMode ? "on" : "off"] }), _jsx("button", { type: "button", style: toggleButtonStyle(trailNodeIds.length > 0), onClick: clearTrail, disabled: trailNodeIds.length === 0, children: "trail clear" })] }), _jsxs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }, children: [_jsx("input", { type: "search", value: searchQuery, onChange: (event) => {
                            setSearchQuery(event.target.value);
                            if (searchNotice)
                                setSearchNotice(null);
                        }, onKeyDown: (event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                searchIssues();
                            }
                        }, placeholder: "issue \uAC80\uC0C9 \uC608: cmpa-156", "aria-label": "Search issue in mission graph", style: {
                            minWidth: "240px",
                            padding: "8px 12px",
                            borderRadius: "12px",
                            border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 76%, transparent)",
                            background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
                            color: "inherit",
                            fontSize: "13px",
                        } }), _jsx("button", { type: "button", style: toggleButtonStyle(false), onClick: searchIssues, children: "issue \uCC3E\uAE30" })] }), searchNotice ? _jsx("div", { style: mutedStyle, children: searchNotice }) : null, filterNotice ? _jsx("div", { style: mutedStyle, children: filterNotice }) : null, visibleMode && trailNodeIds.length > 0 ? (_jsxs("div", { style: {
                    display: "flex",
                    gap: "6px",
                    flexWrap: "nowrap",
                    alignItems: "center",
                    overflowX: "auto",
                    minHeight: "34px",
                    paddingBottom: "2px",
                }, children: [_jsx("span", { style: { ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #0ea5e9 12%, transparent)" }, children: "trail" }), trailNodeIds.map((nodeId, index) => {
                        const node = visibleGraph.nodes.find((candidate) => candidate.id === nodeId);
                        return (_jsx("span", { style: {
                                flex: "0 0 auto",
                                ...mutedStyle,
                                padding: "4px 8px",
                                borderRadius: "999px",
                                background: index === trailNodeIds.length - 1 ? "color-mix(in srgb, #67e8f9 20%, transparent)" : "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)",
                                color: index === trailNodeIds.length - 1 ? "#075985" : "inherit",
                            }, children: node?.identifier ?? node?.label ?? nodeId }, nodeId));
                    })] })) : null, !collapsed ? (_jsxs("div", { style: { display: "grid", gap: "12px", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)" }, children: [_jsx("div", { ref: graphRef, style: {
                            width: "100%",
                            minHeight: "420px",
                            display: "grid",
                            placeItems: "center",
                            borderRadius: "14px",
                            border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 76%, transparent)",
                            background: "color-mix(in srgb, var(--background, #f8fafc) 75%, transparent)",
                        }, children: graphError ? (_jsxs("div", { style: { ...mutedStyle, maxWidth: "320px", textAlign: "center", padding: "16px" }, children: ["\uADF8\uB798\uD504\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. ", graphError] })) : visibleGraph.nodes.length === 0 ? (_jsx("div", { style: { ...mutedStyle, maxWidth: "320px", textAlign: "center", padding: "16px" }, children: "\uD604\uC7AC \uD544\uD130\uC5D0 \uB9DE\uB294 \uBBF8\uC158 \uADF8\uB798\uD504 \uB178\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })) : null }), _jsx("aside", { style: {
                            borderRadius: "14px",
                            border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 76%, transparent)",
                            background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
                            padding: "12px",
                        }, children: _jsx(NodeDetailPanel, { selectedNode: selectedNode, nodes: visibleGraph.nodes, edges: visibleGraph.edges, companyPrefix: companyPrefix, seedIssueIds: activeGraph.seedIssueIds }) })] })) : (_jsxs("div", { style: { ...mutedStyle, padding: "8px 4px" }, children: ["\uADF8\uB798\uD504\uB294 \uC811\uD78C \uC0C1\uD0DC\uC785\uB2C8\uB2E4. \uB2E4\uC2DC \uD3BC\uCE58\uBA74 ", graphMode === "spawn" ? "spawn 계보" : "연관 미션", "\uACFC \uD558\uC774\uB77C\uC774\uD2B8\uB97C \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4."] })), _jsxs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }, children: [_jsx("span", { style: { ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: "parent / child / standalone / agent \uD544\uD130" }), _jsx("span", { style: { ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }, children: "visible mode on = \uD074\uB9AD\uD55C \uB178\uB4DC\uC758 \uC5F0\uAD00 \uAD00\uACC4\uB97C \uACE0\uC815" })] })] }));
}
//# sourceMappingURL=mission-graph-panel.js.map