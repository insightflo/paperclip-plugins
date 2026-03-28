import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { NODE_COLORS } from "./constants.js";
import type { GraphEdge, GraphNode, WorkBoardSnapshot } from "./worker.js";

type CytoscapeElementPayload = {
  group: "nodes" | "edges";
  data: {
    id?: string;
    source?: string;
    target?: string;
    label?: string;
    kind?: string;
    status?: string;
    role?: string;
    topologyRole?: string;
    summary?: string;
    identifier?: string | null;
  };
};

type CytoscapeNode = {
  id(): string;
  closedNeighborhood(): CytoscapeCollection;
  connectedEdges(): CytoscapeCollection;
  addClass(className: string): CytoscapeNode;
  removeClass(className: string): CytoscapeNode;
};

type CytoscapeCollection = {
  addClass(className: string): CytoscapeCollection;
  removeClass(className: string): CytoscapeCollection;
};

type CytoscapeCore = {
  elements(): CytoscapeCollection & {
    not(collection: CytoscapeCollection): CytoscapeCollection;
  };
  getElementById(id: string): CytoscapeNode;
  on(eventName: string, selector: string, handler: (event: { target: CytoscapeNode }) => void): void;
  destroy(): void;
};

type CytoscapeFactory = (options: {
  container: HTMLElement;
  elements: CytoscapeElementPayload[];
  style: Array<{ selector: string; style: Record<string, string | number> }>;
  layout: { name: "cose"; animate: boolean; fit: boolean; padding: number };
}) => CytoscapeCore;

let cytoscapeLoader: Promise<CytoscapeFactory> | null = null;

type VisibleNodeKind = "parent" | "child" | "standalone" | "agent";
type GraphFilterState = Record<VisibleNodeKind, boolean>;

const DEFAULT_GRAPH_FILTERS: GraphFilterState = {
  parent: true,
  child: true,
  standalone: true,
  agent: true,
};

const panelStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 74%, transparent)",
  background: "color-mix(in srgb, var(--card, #ffffff) 96%, transparent)",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.05)",
};

const mutedStyle: CSSProperties = {
  color: "color-mix(in srgb, var(--foreground, #0f172a) 62%, transparent)",
  fontSize: "12px",
  lineHeight: 1.5,
};

function loadCytoscape(): Promise<CytoscapeFactory> {
  if (!cytoscapeLoader) {
    cytoscapeLoader = import("cytoscape").then((module) => (module as unknown as { default: CytoscapeFactory }).default);
  }
  return cytoscapeLoader;
}

function nodeFilterKind(node: GraphNode): VisibleNodeKind {
  if (node.kind === "agent") return "agent";
  return node.topologyRole ?? "standalone";
}

function isNodeVisibleByFilter(node: GraphNode, filters: GraphFilterState): boolean {
  return filters[nodeFilterKind(node)];
}

function buildFilterSummary(nodes: GraphNode[]): Record<VisibleNodeKind, number> {
  const summary: Record<VisibleNodeKind, number> = {
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

function buildElements(nodes: GraphNode[], edges: GraphEdge[]): CytoscapeElementPayload[] {
  const nodeElements: CytoscapeElementPayload[] = nodes.map((node) => ({
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
  const edgeElements: CytoscapeElementPayload[] = edges.map((edge) => ({
    group: "edges",
    data: {
      source: edge.source,
      target: edge.target,
      label: edge.label,
    },
  }));
  return [...nodeElements, ...edgeElements];
}

function clearHighlight(core: CytoscapeCore): void {
  core.elements().removeClass("faded");
  core.elements().removeClass("highlight");
  core.elements().removeClass("active-node");
  core.elements().removeClass("current-node");
}

function buildAdjacency(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;

    const sourceBucket = adjacency.get(edge.source) ?? new Set<string>();
    sourceBucket.add(edge.target);
    adjacency.set(edge.source, sourceBucket);

    const targetBucket = adjacency.get(edge.target) ?? new Set<string>();
    targetBucket.add(edge.source);
    adjacency.set(edge.target, targetBucket);
  }

  return adjacency;
}

function applyTrailHighlight(
  core: CytoscapeCore,
  trailNodeIds: string[],
  nodes: GraphNode[],
  edges: GraphEdge[],
  adjacency: Map<string, Set<string>>,
): void {
  clearHighlight(core);

  if (trailNodeIds.length === 0) return;

  const activeNodeIds = new Set<string>();
  for (const nodeId of trailNodeIds) {
    activeNodeIds.add(nodeId);
    const neighbors = adjacency.get(nodeId);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      activeNodeIds.add(neighbor);
    }
  }

  for (const node of nodes) {
    const element = core.getElementById(node.id);
    if (!element) continue;
    if (activeNodeIds.has(node.id)) {
      element.removeClass("faded");
    } else {
      element.addClass("faded");
    }
  }

  for (const edge of edges) {
    if (!activeNodeIds.has(edge.source) && !activeNodeIds.has(edge.target)) continue;
    const source = core.getElementById(edge.source);
    if (!source) continue;
    source.connectedEdges().addClass("highlight");
  }

  for (const nodeId of trailNodeIds) {
    const element = core.getElementById(nodeId);
    if (!element) continue;
    element.removeClass("faded");
    element.addClass("active-node");
  }

  const currentNodeId = trailNodeIds[trailNodeIds.length - 1];
  const currentNode = core.getElementById(currentNodeId);
  if (currentNode) {
    currentNode.addClass("current-node");
  }
}

function toggleButtonStyle(active: boolean): CSSProperties {
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

type IssueLink = {
  node: GraphNode;
  relation: string;
  direction: "incoming" | "outgoing";
};

function collectIssueLinks(selectedNodeId: string, nodes: GraphNode[], edges: GraphEdge[]): {
  incomingIssueLinks: IssueLink[];
  outgoingIssueLinks: IssueLink[];
  assigneeLinks: IssueLink[];
} {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const incomingIssueLinks: IssueLink[] = [];
  const outgoingIssueLinks: IssueLink[] = [];
  const assigneeLinks: IssueLink[] = [];

  for (const edge of edges) {
    if (edge.source === selectedNodeId) {
      const target = nodeById.get(edge.target);
      if (!target) continue;
      const link: IssueLink = { node: target, relation: edge.label, direction: "outgoing" };
      if (target.kind === "agent" && edge.label === "assignee") assigneeLinks.push(link);
      if (target.kind === "issue") outgoingIssueLinks.push(link);
    }

    if (edge.target === selectedNodeId) {
      const source = nodeById.get(edge.source);
      if (!source) continue;
      const link: IssueLink = { node: source, relation: edge.label, direction: "incoming" };
      if (edge.label === "assignee" && source.kind === "issue") assigneeLinks.push(link);
      if (source.kind === "issue") incomingIssueLinks.push(link);
    }
  }

  return { incomingIssueLinks, outgoingIssueLinks, assigneeLinks };
}

function issuePath(companyPrefix: string | null | undefined, issue: GraphNode): string {
  const pathId = issue.identifier ?? issue.id;
  return companyPrefix ? `/${companyPrefix}/issues/${pathId}` : `/issues/${pathId}`;
}

function LinkList({
  title,
  links,
  companyPrefix,
}: {
  title: string;
  links: IssueLink[];
  companyPrefix: string | null | undefined;
}) {
  if (links.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: "6px" }}>
      <div style={{ ...mutedStyle, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {links.map((link) => (
        link.node.kind === "issue" ? (
          <a
            key={`${title}-${link.direction}-${link.node.id}-${link.relation}`}
            href={issuePath(companyPrefix, link.node)}
            style={{ color: "inherit", textDecoration: "none" }}
          >
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "10px",
                border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 74%, transparent)",
                background: "color-mix(in srgb, var(--background, #f8fafc) 68%, transparent)",
              }}
            >
              <div style={{ fontSize: "13px", lineHeight: 1.4 }}>{link.node.label}</div>
              <div style={mutedStyle}>
                {link.relation} · {link.node.kind}
                {link.node.summary ? ` · ${link.node.summary}` : ""}
              </div>
            </div>
          </a>
        ) : (
          <div
            key={`${title}-${link.direction}-${link.node.id}-${link.relation}`}
            style={{
              padding: "8px 10px",
              borderRadius: "10px",
              border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 74%, transparent)",
              background: "color-mix(in srgb, var(--background, #f8fafc) 68%, transparent)",
            }}
          >
            <div style={{ fontSize: "13px", lineHeight: 1.4 }}>{link.node.label}</div>
            <div style={mutedStyle}>
              {link.relation} · {link.node.kind}
              {link.node.summary ? ` · ${link.node.summary}` : ""}
            </div>
          </div>
        )
      ))}
    </div>
  );
}

function NodeDetailPanel({
  selectedNode,
  nodes,
  edges,
  companyPrefix,
  seedIssueIds,
}: {
  selectedNode: GraphNode | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  companyPrefix: string | null | undefined;
  seedIssueIds: string[];
}) {
  if (!selectedNode) {
    return <div style={mutedStyle}>노드를 클릭하면 관계와 원본 이슈를 볼 수 있습니다.</div>;
  }

  const { incomingIssueLinks, outgoingIssueLinks, assigneeLinks } = collectIssueLinks(selectedNode.id, nodes, edges);
  const isSeed = seedIssueIds.includes(selectedNode.id);
  const assigneeTitle = selectedNode.kind === "agent" ? "Assigned issues" : "Assignees";

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <strong style={{ fontSize: "15px" }}>{selectedNode.label}</strong>
        <div style={mutedStyle}>
          kind: {selectedNode.kind} · status: {selectedNode.status} · role: {selectedNode.role}
          {selectedNode.topologyRole ? ` · topology: ${selectedNode.topologyRole}` : ""}
        </div>
      </div>

      {selectedNode.summary ? <div style={{ fontSize: "13px", lineHeight: 1.5 }}>{selectedNode.summary}</div> : null}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 58%, transparent)" }}>
          {isSeed ? "seed" : "related"}
        </span>
        {selectedNode.identifier ? (
          <a
            href={issuePath(companyPrefix, selectedNode)}
            style={{ ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #0ea5e9 12%, transparent)", color: "#075985", textDecoration: "none" }}
          >
            {selectedNode.identifier}
          </a>
        ) : null}
      </div>
      <LinkList title={assigneeTitle} links={assigneeLinks} companyPrefix={companyPrefix} />
      {selectedNode.kind === "issue" ? (
        <>
          <LinkList title="Inbound issues" links={incomingIssueLinks} companyPrefix={companyPrefix} />
          <LinkList title="Outbound issues" links={outgoingIssueLinks} companyPrefix={companyPrefix} />
        </>
      ) : null}
    </div>
  );
}

function graphStyle(kind: GraphNode["kind"]): Record<string, string | number> {
  if (kind === "agent") {
    return {
      "background-color": NODE_COLORS.agent,
      width: 44,
      height: 44,
      "font-size": 11,
      "text-max-width": 96,
    } as Record<string, string | number>;
  }
  return {
    "background-color": NODE_COLORS.issueStandalone,
    shape: "round-rectangle",
    width: 56,
    height: 38,
    "font-size": 10,
    "text-max-width": 88,
  } as Record<string, string | number>;
}

export function MissionGraphPanel({
  graph,
  companyPrefix,
}: {
  graph: WorkBoardSnapshot;
  companyPrefix: string | null | undefined;
}) {
  const [graphMode, setGraphMode] = useState<"mission" | "spawn">("mission");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [visibleMode, setVisibleMode] = useState(false);
  const [filters, setFilters] = useState<GraphFilterState>(DEFAULT_GRAPH_FILTERS);
  const [filterNotice, setFilterNotice] = useState<string | null>(null);
  const [trailNodeIds, setTrailNodeIds] = useState<string[]>([]);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<CytoscapeCore | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const visibleModeRef = useRef(false);
  const trailNodeIdsRef = useRef<string[]>([]);

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
    if (graphMode === "spawn" && graph.spawnGraph) return graph.spawnGraph;
    return graph.missionGraph;
  }, [graph.missionGraph, graph.spawnGraph, graphMode]);

  const filterSummary = useMemo(() => buildFilterSummary(activeGraph.graph.nodes), [activeGraph.graph.nodes]);
  const activeFilterCount = useMemo(
    () => (Object.values(filters).filter(Boolean).length),
    [filters],
  );
  const visibleNodes = useMemo(
    () => activeGraph.graph.nodes.filter((node) => isNodeVisibleByFilter(node, filters)),
    [activeGraph.graph.nodes, filters],
  );
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => activeGraph.graph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
    [activeGraph.graph.edges, visibleNodeIds],
  );
  const visibleGraph = useMemo(
    () => ({
      nodes: visibleNodes,
      edges: visibleEdges,
    }),
    [visibleEdges, visibleNodes],
  );
  const adjacency = useMemo(() => buildAdjacency(visibleGraph.nodes, visibleGraph.edges), [visibleGraph.edges, visibleGraph.nodes]);
  useEffect(() => {
    const visibleNodeIdSet = new Set(visibleGraph.nodes.map((node) => node.id));
    setTrailNodeIds((current) => current.filter((id) => visibleNodeIdSet.has(id)));
  }, [visibleGraph.nodes]);
  const selectedNode = useMemo(
    () => visibleGraph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, visibleGraph.nodes],
  );

  const selectNode = (nodeId: string) => {
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
        applyTrailHighlight(instanceRef.current!, next, visibleGraph.nodes, visibleGraph.edges, adjacency);
        setSelectedNodeId(next[next.length - 1] ?? null);
      } else {
        clearHighlight(instanceRef.current!);
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
    if (!instance) return;

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
    let instance: CytoscapeCore | null = null;
    setGraphError(null);

    const mount = async () => {
      const cytoscape = await loadCytoscape();
      if (disposed || !graphRef.current) return;

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
        if (!instanceRef.current) return;
        if (visibleModeRef.current) return;
        applyTrailHighlight(instanceRef.current, [event.target.id()], visibleGraph.nodes, visibleGraph.edges, adjacency);
      });

      instance.on("mouseout", "node", () => {
        if (!instanceRef.current) return;
        if (visibleModeRef.current) return;
        clearHighlight(instanceRef.current);
      });

      instanceRef.current = instance;

      if (visibleModeRef.current && trailNodeIdsRef.current.length > 0) {
        applyTrailHighlight(instance, trailNodeIdsRef.current, visibleGraph.nodes, visibleGraph.edges, adjacency);
      }
    };

    mount().catch((error) => {
      if (disposed) return;
      setGraphError(error instanceof Error ? error.message : "그래프를 초기화하지 못했습니다.");
    });

    return () => {
      disposed = true;
      if (instance) instance.destroy();
      if (instanceRef.current === instance) {
        instanceRef.current = null;
      }
    };
  }, [adjacency, collapsed, visibleEdges, visibleNodes, graphMode]);

  const updateFilter = (key: VisibleNodeKind) => {
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

  return (
    <section
      style={{
        ...panelStyle,
        padding: "14px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <strong style={{ fontSize: "18px" }}>Mission Graph</strong>
          <div style={mutedStyle}>
            {graphMode === "spawn" ? "spawn" : "mission"} · seed {activeGraph.seedIssueIds.length} · visible {visibleGraph.nodes.length} · edges {visibleGraph.edges.length}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <button type="button" style={toggleButtonStyle(graphMode === "mission")} onClick={() => setGraphMode("mission")}>
              mission graph
            </button>
            <button type="button" style={toggleButtonStyle(graphMode === "spawn")} onClick={() => setGraphMode("spawn")}>
              spawn graph
            </button>
          </div>
          <div style={{ ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }}>
            {graphMode === "spawn" ? "spawn lineage only" : "금주 seed + related only"}
          </div>
          <button type="button" style={toggleButtonStyle(collapsed)} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "펼치기" : "접기"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {(["parent", "child", "standalone", "agent"] as VisibleNodeKind[]).map((key) => (
          <button key={key} type="button" style={toggleButtonStyle(filters[key])} onClick={() => updateFilter(key)}>
            {key} {filterSummary[key]}
          </button>
        ))}
        <button type="button" style={toggleButtonStyle(visibleMode)} onClick={() => setVisibleMode((value) => !value)}>
          visible mode {visibleMode ? "on" : "off"}
        </button>
        <button type="button" style={toggleButtonStyle(trailNodeIds.length > 0)} onClick={clearTrail} disabled={trailNodeIds.length === 0}>
          trail clear
        </button>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            if (searchNotice) setSearchNotice(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              searchIssues();
            }
          }}
          placeholder="issue 검색 예: cmpa-156"
          aria-label="Search issue in mission graph"
          style={{
            minWidth: "240px",
            padding: "8px 12px",
            borderRadius: "12px",
            border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 76%, transparent)",
            background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
            color: "inherit",
            fontSize: "13px",
          }}
        />
        <button type="button" style={toggleButtonStyle(false)} onClick={searchIssues}>
          issue 찾기
        </button>
      </div>
      {searchNotice ? <div style={mutedStyle}>{searchNotice}</div> : null}
      {filterNotice ? <div style={mutedStyle}>{filterNotice}</div> : null}
      {visibleMode && trailNodeIds.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "nowrap",
            alignItems: "center",
            overflowX: "auto",
            minHeight: "34px",
            paddingBottom: "2px",
          }}
        >
          <span style={{ ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #0ea5e9 12%, transparent)" }}>
            trail
          </span>
          {trailNodeIds.map((nodeId, index) => {
            const node = visibleGraph.nodes.find((candidate) => candidate.id === nodeId);
            return (
              <span
                key={nodeId}
                style={{
                  flex: "0 0 auto",
                  ...mutedStyle,
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: index === trailNodeIds.length - 1 ? "color-mix(in srgb, #67e8f9 20%, transparent)" : "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)",
                  color: index === trailNodeIds.length - 1 ? "#075985" : "inherit",
                }}
              >
                {node?.identifier ?? node?.label ?? nodeId}
              </span>
            );
          })}
        </div>
      ) : null}

      {!collapsed ? (
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)" }}>
          <div
            ref={graphRef}
            style={{
              width: "100%",
              minHeight: "420px",
              display: "grid",
              placeItems: "center",
              borderRadius: "14px",
              border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 76%, transparent)",
              background: "color-mix(in srgb, var(--background, #f8fafc) 75%, transparent)",
            }}
          >
            {graphError ? (
              <div style={{ ...mutedStyle, maxWidth: "320px", textAlign: "center", padding: "16px" }}>
                그래프를 불러오지 못했습니다. {graphError}
              </div>
            ) : visibleGraph.nodes.length === 0 ? (
              <div style={{ ...mutedStyle, maxWidth: "320px", textAlign: "center", padding: "16px" }}>
                현재 필터에 맞는 미션 그래프 노드가 없습니다.
              </div>
            ) : null}
          </div>
          <aside
            style={{
              borderRadius: "14px",
              border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 76%, transparent)",
              background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
              padding: "12px",
            }}
          >
            <NodeDetailPanel
              selectedNode={selectedNode}
              nodes={visibleGraph.nodes}
              edges={visibleGraph.edges}
              companyPrefix={companyPrefix}
              seedIssueIds={activeGraph.seedIssueIds}
            />
          </aside>
        </div>
      ) : (
        <div style={{ ...mutedStyle, padding: "8px 4px" }}>
          그래프는 접힌 상태입니다. 다시 펼치면 {graphMode === "spawn" ? "spawn 계보" : "연관 미션"}과 하이라이트를 볼 수 있습니다.
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }}>
          parent / child / standalone / agent 필터
        </span>
        <span style={{ ...mutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 52%, transparent)" }}>
          visible mode on = 클릭한 노드의 연관 관계를 고정
        </span>
      </div>
    </section>
  );
}
