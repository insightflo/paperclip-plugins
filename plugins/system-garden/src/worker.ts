import { definePlugin, runWorker, type PluginContext, type PluginEvent } from "@paperclipai/plugin-sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { HEALTH_LABELS, HEALTH_THRESHOLDS, PLUGIN_DISPLAY_NAME } from "./constants.js";

type AgentRecord = Awaited<ReturnType<PluginContext["agents"]["list"]>>[number];
type IssueRecord = Awaited<ReturnType<PluginContext["issues"]["list"]>>[number];

type AgentMetrics = {
  open: number;
  done: number;
  inReview: number;
  failedStreak: number;
  assigned: number;
};

export type GardenSnapshot = {
  meta: {
    generatedAt: string;
    agentCount: number;
    issueCount: number;
  };
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  cards: HealthCard[];
  questions: MetaQuestion[];
};

const UA_KG_PATH_ENV = "SYSTEM_GARDEN_KG_PATH";
const TOOL_GRAPH_CACHE_STATE_KEY = "tool-graph-cache";
const TOOL_GRAPH_UPDATED_EVENT = "plugin.insightflo.tool-registry.tool-graph-updated";

type UaGraphNode = {
  id?: unknown;
  type?: unknown;
  label?: unknown;
  name?: unknown;
  summary?: unknown;
  complexity?: unknown;
  layer?: unknown;
  metadata?: unknown;
};

type UaGraphEdge = {
  source?: unknown;
  from?: unknown;
  target?: unknown;
  to?: unknown;
  type?: unknown;
  label?: unknown;
};

type UaKnowledgeGraph = {
  nodes?: unknown;
  edges?: unknown;
};

type CodeLayerSource = "knowledge-graph" | "tool-registry" | "none";

type ToolGraphUpdatedTool = {
  name?: unknown;
  displayName?: unknown;
  description?: unknown;
  command?: unknown;
};

type ToolGraphUpdatedGrant = {
  agentName?: unknown;
  toolName?: unknown;
};

type ToolGraphCache = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  updatedAt: string;
};

export type GraphNodeKind = "agent" | "module" | "file" | "function" | "class" | "tool";
export type GraphNode = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  status: string;
  role: string;
  summary?: string;
  complexity?: string;
  layer?: string;
};
export type GraphEdge = { source: string; target: string; label: string };
export type HealthCard = { name: string; score: number; state: string; detail: string; delta?: { diff: number; direction: string } };
export type MetaQuestion = { text: string; actionHint: string };

export type AgentIssueBrief = {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  updatedAt: string | null;
};

export type AgentDetailSnapshot = {
  agentId: string;
  name: string;
  status: string;
  role: string;
  recentIssues: AgentIssueBrief[];
};

const ACTIVE_STATUSES = new Set(["active", "idle", "running"]);
const OPEN_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const FAILED_SIGNAL_STATUSES = new Set(["blocked", "cancelled"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function getCompanyId(params: Record<string, unknown>): string {
  return typeof params.companyId === "string" ? params.companyId.trim() : "";
}

function getAgentId(params: Record<string, unknown>): string {
  return typeof params.agentId === "string" ? params.agentId.trim() : "";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : null;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function toHealthState(score: number): string {
  if (score >= HEALTH_THRESHOLDS.good) return HEALTH_LABELS.good;
  if (score >= HEALTH_THRESHOLDS.warning) return HEALTH_LABELS.warning;
  return HEALTH_LABELS.bad;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function extractChainTargets(agent: AgentRecord): string[] {
  const metadata = toRecord(agent.metadata);
  const runtime = toRecord(agent.runtimeConfig);
  const direct = toRecord(agent as unknown);

  const combined = [
    ...toStringArray(direct?.chainOfCommand),
    ...toStringArray(metadata?.chainOfCommand),
    ...toStringArray(runtime?.chainOfCommand),
    ...toStringArray(metadata?.chain_of_command),
    ...toStringArray(runtime?.chain_of_command),
  ];

  return Array.from(new Set(combined));
}

function touchedAt(issue: IssueRecord): Date | null {
  return (
    toDate(issue.updatedAt)
    ?? toDate(issue.completedAt)
    ?? toDate(issue.cancelledAt)
    ?? toDate(issue.createdAt)
  );
}

function issueSortDesc(left: IssueRecord, right: IssueRecord): number {
  const leftTime = touchedAt(left)?.getTime() ?? 0;
  const rightTime = touchedAt(right)?.getTime() ?? 0;
  return rightTime - leftTime;
}

function buildGraph(agents: AgentRecord[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = agents.map((agent) => ({
    id: agent.id,
    label: agent.name,
    kind: "agent",
    status: agent.status,
    role: agent.role,
  }));

  const idSet = new Set(nodes.map((node) => node.id));
  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const agent of agents) {
    if (agent.reportsTo && idSet.has(agent.reportsTo)) {
      const key = `${agent.id}->${agent.reportsTo}:reportsTo`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push({ source: agent.id, target: agent.reportsTo, label: "reportsTo" });
      }
    }

    for (const target of extractChainTargets(agent)) {
      if (!idSet.has(target)) continue;
      const key = `${agent.id}->${target}:chainOfCommand`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({ source: agent.id, target, label: "chainOfCommand" });
    }
  }

  return { nodes, edges };
}

function resolveUaKnowledgeGraphPath(): string {
  const fromEnv = process.env[UA_KG_PATH_ENV];
  if (typeof fromEnv === "string" && fromEnv.trim()) return path.resolve(fromEnv.trim());
  return path.resolve(process.cwd(), ".understand-anything", "knowledge-graph.json");
}

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getCodeLayerSource(params: Record<string, unknown>): CodeLayerSource {
  const raw = toNonEmptyString(params.codeLayerSource).toLowerCase();
  if (raw === "none") return "none";
  if (raw === "tool-registry") return "tool-registry";
  return "knowledge-graph";
}

function normalizeGraphNodeKind(value: unknown): GraphNodeKind {
  const kind = toNonEmptyString(value).toLowerCase();
  if (kind === "agent" || kind === "module" || kind === "file" || kind === "function" || kind === "class" || kind === "tool") {
    return kind;
  }
  return "module";
}

function toGraphNode(value: unknown): GraphNode | null {
  const record = toRecord(value);
  if (!record) return null;
  const id = toNonEmptyString(record.id);
  if (!id) return null;

  const label = toNonEmptyString(record.label) || id;
  return {
    id,
    label,
    kind: normalizeGraphNodeKind(record.kind),
    status: toNonEmptyString(record.status) || "code",
    role: toNonEmptyString(record.role) || "tool",
    summary: toNonEmptyString(record.summary) || undefined,
    complexity: toNonEmptyString(record.complexity) || undefined,
    layer: toNonEmptyString(record.layer) || undefined,
  };
}

function toGraphEdge(value: unknown): GraphEdge | null {
  const record = toRecord(value);
  if (!record) return null;
  const source = toNonEmptyString(record.source);
  const target = toNonEmptyString(record.target);
  if (!source || !target) return null;
  return {
    source,
    target,
    label: toNonEmptyString(record.label) || "uses",
  };
}

function normalizeToolGraphPayload(payload: unknown): { tools: ToolGraphUpdatedTool[]; grants: ToolGraphUpdatedGrant[] } {
  const record = toRecord(payload);
  const rawTools = Array.isArray(record?.tools) ? record.tools : [];
  const rawGrants = Array.isArray(record?.grants) ? record.grants : [];

  const tools = rawTools
    .map((item) => toRecord(item) as ToolGraphUpdatedTool | null)
    .filter((item): item is ToolGraphUpdatedTool => item != null)
    .filter((item) => toNonEmptyString(item.name).length > 0);

  const grants = rawGrants
    .map((item) => toRecord(item) as ToolGraphUpdatedGrant | null)
    .filter((item): item is ToolGraphUpdatedGrant => item != null)
    .filter((item) => toNonEmptyString(item.agentName).length > 0 && toNonEmptyString(item.toolName).length > 0);

  return { tools, grants };
}

function toolNodeId(name: string): string {
  return `tool:${name}`;
}

function buildToolRegistryGraph(
  tools: ToolGraphUpdatedTool[],
  grants: ToolGraphUpdatedGrant[],
  agents: AgentRecord[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodesById = new Map<string, GraphNode>();
  const toolIdByName = new Map<string, string>();

  const setToolNameIndex = (toolName: string, nodeId: string) => {
    toolIdByName.set(toolName, nodeId);
    toolIdByName.set(toolName.toLowerCase(), nodeId);
  };

  const upsertToolNode = (toolName: string, displayName?: string, description?: string): string => {
    const nodeId = toolNodeId(toolName);
    setToolNameIndex(toolName, nodeId);
    if (!nodesById.has(nodeId)) {
      nodesById.set(nodeId, {
        id: nodeId,
        label: toNonEmptyString(displayName) || toolName,
        kind: "tool",
        status: "code",
        role: "tool",
        summary: toNonEmptyString(description) || undefined,
        layer: "tool-registry",
      });
    } else if (description && !nodesById.get(nodeId)?.summary) {
      const current = nodesById.get(nodeId);
      if (current) {
        current.summary = toNonEmptyString(description) || undefined;
      }
    }
    return nodeId;
  };

  for (const tool of tools) {
    const toolName = toNonEmptyString(tool.name);
    if (!toolName) continue;
    upsertToolNode(toolName, toNonEmptyString(tool.displayName), toNonEmptyString(tool.description));
  }

  const agentIdByName = new Map<string, string>();
  for (const agent of agents) {
    const name = toNonEmptyString(agent.name);
    if (!name) continue;
    agentIdByName.set(name, agent.id);
    agentIdByName.set(name.toLowerCase(), agent.id);
  }

  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  for (const grant of grants) {
    const agentName = toNonEmptyString(grant.agentName);
    const toolName = toNonEmptyString(grant.toolName);
    if (!agentName || !toolName) continue;

    const agentId = agentIdByName.get(agentName) ?? agentIdByName.get(agentName.toLowerCase());
    if (!agentId) continue;

    const toolId = toolIdByName.get(toolName)
      ?? toolIdByName.get(toolName.toLowerCase())
      ?? upsertToolNode(toolName, toolName, "");

    const edgeKey = `${agentId}->${toolId}:uses`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    edges.push({ source: agentId, target: toolId, label: "uses" });
  }

  return {
    nodes: Array.from(nodesById.values()),
    edges,
  };
}

async function readToolGraphCache(context: PluginContext, companyId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const cached = await context.state.get({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: TOOL_GRAPH_CACHE_STATE_KEY,
  });

  const record = toRecord(cached);
  if (!record) return { nodes: [], edges: [] };
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const rawEdges = Array.isArray(record.edges) ? record.edges : [];

  const nodes = rawNodes
    .map((node) => toGraphNode(node))
    .filter((node): node is GraphNode => node != null);
  const edges = rawEdges
    .map((edge) => toGraphEdge(edge))
    .filter((edge): edge is GraphEdge => edge != null);

  return { nodes, edges };
}

async function cacheToolGraph(context: PluginContext, companyId: string, graph: { nodes: GraphNode[]; edges: GraphEdge[] }): Promise<void> {
  const payload: ToolGraphCache = {
    nodes: graph.nodes,
    edges: graph.edges,
    updatedAt: new Date().toISOString(),
  };
  await context.state.set(
    {
      scopeKind: "company",
      scopeId: companyId,
      stateKey: TOOL_GRAPH_CACHE_STATE_KEY,
    },
    payload,
  );
}

async function handleToolGraphUpdatedEvent(context: PluginContext, event: PluginEvent): Promise<void> {
  const companyId = toNonEmptyString(event.companyId);
  if (!companyId) return;

  const payload = normalizeToolGraphPayload(event.payload);
  const agents = await context.agents.list({ companyId, limit: 300, offset: 0 });
  const graph = buildToolRegistryGraph(payload.tools, payload.grants, agents);
  await cacheToolGraph(context, companyId, graph);

  context.logger.info("Updated tool graph cache from tool-registry event", {
    companyId,
    toolNodes: graph.nodes.length,
    grantEdges: graph.edges.length,
  });
}

function normalizeCodeNodeKind(rawKind: string): GraphNodeKind {
  const kind = rawKind.toLowerCase();
  if (kind === "module" || kind === "file") return "module";
  if (kind === "function") return "function";
  if (kind === "class") return "class";
  return "module";
}

function codeNodeId(rawId: string): string {
  return `code:${rawId}`;
}

function extractLayer(value: unknown): string | undefined {
  const direct = toNonEmptyString(value);
  if (direct) return direct;
  const metadata = toRecord(value);
  const nested = toNonEmptyString(metadata?.layer);
  return nested || undefined;
}

function buildCodeGraph(knowledgeGraph: UaKnowledgeGraph | null): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (!knowledgeGraph) return { nodes: [], edges: [] };
  const rawNodes = Array.isArray(knowledgeGraph.nodes) ? knowledgeGraph.nodes : [];
  const rawEdges = Array.isArray(knowledgeGraph.edges) ? knowledgeGraph.edges : [];

  const nodes: GraphNode[] = [];
  const nodeIdMap = new Map<string, string>();
  for (const rawNode of rawNodes) {
    const nodeRecord = toRecord(rawNode) as UaGraphNode | null;
    if (!nodeRecord) continue;

    const rawId = toNonEmptyString(nodeRecord.id);
    if (!rawId) continue;

    const label = toNonEmptyString(nodeRecord.label) || toNonEmptyString(nodeRecord.name) || rawId;
    const rawType = toNonEmptyString(nodeRecord.type) || "module";
    const kind = normalizeCodeNodeKind(rawType);
    const layer = extractLayer(nodeRecord.layer) ?? extractLayer(nodeRecord.metadata);

    const mappedId = codeNodeId(rawId);
    nodeIdMap.set(rawId, mappedId);
    nodes.push({
      id: mappedId,
      label,
      kind,
      status: "code",
      role: rawType,
      summary: toNonEmptyString(nodeRecord.summary) || undefined,
      complexity: toNonEmptyString(nodeRecord.complexity) || undefined,
      layer,
    });
  }

  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  for (const rawEdge of rawEdges) {
    const edgeRecord = toRecord(rawEdge) as UaGraphEdge | null;
    if (!edgeRecord) continue;

    const sourceRaw = toNonEmptyString(edgeRecord.source) || toNonEmptyString(edgeRecord.from);
    const targetRaw = toNonEmptyString(edgeRecord.target) || toNonEmptyString(edgeRecord.to);
    if (!sourceRaw || !targetRaw) continue;

    const source = nodeIdMap.get(sourceRaw);
    const target = nodeIdMap.get(targetRaw);
    if (!source || !target) continue;

    const label = toNonEmptyString(edgeRecord.type) || toNonEmptyString(edgeRecord.label) || "references";
    const edgeKey = `${source}->${target}:${label}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    edges.push({ source, target, label });
  }

  return { nodes, edges };
}

function mergeGraphs(
  left: { nodes: GraphNode[]; edges: GraphEdge[] },
  right: { nodes: GraphNode[]; edges: GraphEdge[] },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = [...left.nodes, ...right.nodes];
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const edge of [...left.edges, ...right.edges]) {
    const key = `${edge.source}->${edge.target}:${edge.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(edge);
  }
  return { nodes, edges };
}

async function listAllAgents(context: PluginContext, companyId: string): Promise<AgentRecord[]> {
  const limit = 250;
  const items: AgentRecord[] = [];
  for (let offset = 0; ; offset += limit) {
    const batch = await context.agents.list({ companyId, limit, offset });
    items.push(...batch);
    if (batch.length < limit) break;
  }
  return items;
}

async function listAllIssues(context: PluginContext, companyId: string): Promise<IssueRecord[]> {
  const limit = 250;
  const items: IssueRecord[] = [];
  for (let offset = 0; ; offset += limit) {
    const batch = await context.issues.list({ companyId, limit, offset });
    items.push(...batch);
    if (batch.length < limit) break;
  }
  return items;
}

async function loadUaKnowledgeGraph(context: PluginContext): Promise<UaKnowledgeGraph | null> {
  const kgPath = resolveUaKnowledgeGraphPath();
  try {
    const content = await fs.readFile(kgPath, "utf8");
    const parsed = JSON.parse(content) as UaKnowledgeGraph;
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      context.logger.info("UA knowledge graph not found; rendering agent graph only", { kgPath });
      return null;
    }
    context.logger.warn("Failed to load UA knowledge graph; rendering agent graph only", { kgPath, error: message });
    return null;
  }
}

function mapIssuesByAgent(issues: IssueRecord[]): Map<string, IssueRecord[]> {
  const bucket = new Map<string, IssueRecord[]>();
  for (const issue of issues) {
    if (!issue.assigneeAgentId) continue;
    const list = bucket.get(issue.assigneeAgentId) ?? [];
    list.push(issue);
    bucket.set(issue.assigneeAgentId, list);
  }
  return bucket;
}

function computeFailureStreak(issues: IssueRecord[]): number {
  const ordered = [...issues].sort(issueSortDesc);
  let streak = 0;
  for (const issue of ordered) {
    if (!FAILED_SIGNAL_STATUSES.has(issue.status)) break;
    streak += 1;
  }
  return streak;
}

function computeAgentMetrics(issues: IssueRecord[]): AgentMetrics {
  let open = 0;
  let done = 0;
  let inReview = 0;

  for (const issue of issues) {
    if (issue.status === "done") done += 1;
    if (OPEN_STATUSES.has(issue.status)) open += 1;
    if (issue.status === "in_review") inReview += 1;
  }

  return {
    open,
    done,
    inReview,
    failedStreak: computeFailureStreak(issues),
    assigned: issues.length,
  };
}

function buildHealthCards(agents: AgentRecord[], issuesByAgent: Map<string, IssueRecord[]>): HealthCard[] {
  const totalAgents = agents.length;
  const activeAgents = agents.filter((agent) => ACTIVE_STATUSES.has(agent.status)).length;
  const utilizationScore = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;

  const cards: HealthCard[] = [
    {
      name: "전체 가동률",
      score: clampScore(utilizationScore),
      state: toHealthState(utilizationScore),
      detail: `활성 에이전트 ${activeAgents}/${totalAgents}`,
      delta: {
        diff: activeAgents - (totalAgents - activeAgents),
        direction: activeAgents >= (totalAgents - activeAgents) ? "up" : "down",
      },
    },
  ];

  for (const agent of agents) {
    const assignedIssues = issuesByAgent.get(agent.id) ?? [];
    const metrics = computeAgentMetrics(assignedIssues);

    const ratioScore = metrics.open + metrics.done > 0
      ? (metrics.done / (metrics.done + metrics.open)) * 100
      : ACTIVE_STATUSES.has(agent.status)
        ? 76
        : 58;
    const statusBonus = ACTIVE_STATUSES.has(agent.status) ? 8 : -8;
    const reviewPenalty = metrics.inReview >= 3 ? 10 : 0;
    const failurePenalty = Math.min(36, metrics.failedStreak * 12);
    const score = clampScore(ratioScore + statusBonus - reviewPenalty - failurePenalty);
    const diff = metrics.done - metrics.open;

    cards.push({
      name: agent.name,
      score,
      state: toHealthState(score),
      detail: `완료 ${metrics.done} · 미완료 ${metrics.open} · in_review ${metrics.inReview} · 연속 실패 ${metrics.failedStreak}`,
      delta: {
        diff,
        direction: diff === 0 ? "flat" : diff > 0 ? "up" : "down",
      },
    });
  }

  return cards;
}

function buildMetaQuestions(agents: AgentRecord[], issuesByAgent: Map<string, IssueRecord[]>, now: Date): MetaQuestion[] {
  const questions: MetaQuestion[] = [];
  const weekAgo = now.getTime() - (7 * DAY_MS);

  const idleAgents: string[] = [];
  for (const agent of agents) {
    const assigned = issuesByAgent.get(agent.id) ?? [];
    const touchedInWeek = assigned.some((issue) => {
      const touched = touchedAt(issue);
      return Boolean(touched && touched.getTime() >= weekAgo);
    });
    if (!touchedInWeek) idleAgents.push(agent.name);
  }
  if (idleAgents.length > 0) {
    questions.push({
      text: `유휴 상태: 최근 7일간 이슈 흔적이 없는 에이전트가 있다 (${idleAgents.join(", ")}).`,
      actionHint: "백로그 분배를 다시 하고, 주 1회 이상 최소 실행 단위를 배정하세요.",
    });
  }

  const issueLoad = agents
    .map((agent) => ({ name: agent.name, count: (issuesByAgent.get(agent.id) ?? []).length }))
    .filter((item) => item.count > 0);
  const totalAssigned = issueLoad.reduce((sum, item) => sum + item.count, 0);
  const skewed = issueLoad
    .filter((item) => totalAssigned > 0 && (item.count / totalAssigned) >= 0.3)
    .map((item) => `${item.name}(${Math.round((item.count / totalAssigned) * 100)}%)`);
  if (skewed.length > 0) {
    questions.push({
      text: `업무 편중: 특정 에이전트 이슈 비중이 30%를 넘는다 (${skewed.join(", ")}).`,
      actionHint: "업무를 기능 단위로 쪼개고 보조 에이전트에 재위임해 병렬 처리율을 높이세요.",
    });
  }

  const reviewBacklog = agents
    .map((agent) => {
      const inReview = (issuesByAgent.get(agent.id) ?? []).filter((issue) => issue.status === "in_review").length;
      return { name: agent.name, inReview };
    })
    .filter((item) => item.inReview >= 3)
    .map((item) => `${item.name}(${item.inReview}건)`);
  if (reviewBacklog.length > 0) {
    questions.push({
      text: `검수 병목: in_review 적체가 3건 이상인 에이전트가 있다 (${reviewBacklog.join(", ")}).`,
      actionHint: "검수자 교대 슬롯을 만들고, 리뷰 SLA를 정해 오래된 검수부터 처리하세요.",
    });
  }

  const openBacklog = agents
    .map((agent) => {
      const metrics = computeAgentMetrics(issuesByAgent.get(agent.id) ?? []);
      return { name: agent.name, open: metrics.open, done: metrics.done };
    })
    .filter((item) => item.open > item.done)
    .map((item) => `${item.name}(open ${item.open} > done ${item.done})`);
  if (openBacklog.length > 0) {
    questions.push({
      text: `미처리 적체: open 이슈가 done 보다 많은 에이전트가 있다 (${openBacklog.join(", ")}).`,
      actionHint: "WIP 상한을 도입하고, 신규 착수 전에 열린 이슈를 먼저 정리하세요.",
    });
  }

  if (questions.length === 0) {
    questions.push({
      text: "현재 구조는 안정적이다. 다음 스프린트에서 어떤 실험으로 throughput을 더 높일 수 있을까?",
      actionHint: "한 번에 1개 개선 가설만 선택해 1주일 후 지표(완료율/리드타임)로 검증하세요.",
    });
  }

  return questions;
}

function toAgentIssueBrief(issue: IssueRecord): AgentIssueBrief {
  return {
    id: issue.id,
    identifier: issue.identifier ?? null,
    title: issue.title,
    status: issue.status,
    updatedAt: toIsoString(issue.updatedAt),
  };
}

function buildAgentDetailSnapshot(
  agents: AgentRecord[],
  issues: IssueRecord[],
  agentId: string,
): AgentDetailSnapshot | null {
  if (!agentId) return null;
  const agent = agents.find((entry) => entry.id === agentId);
  if (!agent) return null;

  const recentIssues = issues
    .filter((issue) => issue.assigneeAgentId === agent.id)
    .sort(issueSortDesc)
    .slice(0, 5)
    .map(toAgentIssueBrief);

  return {
    agentId: agent.id,
    name: agent.name,
    status: agent.status,
    role: agent.role,
    recentIssues,
  };
}

export async function buildGardenSnapshot(
  context: PluginContext,
  input: { companyId: string; now?: Date; codeLayerSource?: CodeLayerSource },
): Promise<GardenSnapshot> {
  const now = input.now ?? new Date();
  const codeLayerSource = input.codeLayerSource ?? "knowledge-graph";

  const [agents, issues] = await Promise.all([
    listAllAgents(context, input.companyId),
    listAllIssues(context, input.companyId),
  ]);

  let codeGraph: { nodes: GraphNode[]; edges: GraphEdge[] } = { nodes: [], edges: [] };
  if (codeLayerSource === "knowledge-graph") {
    const knowledgeGraph = await loadUaKnowledgeGraph(context);
    codeGraph = buildCodeGraph(knowledgeGraph);
  } else if (codeLayerSource === "tool-registry") {
    codeGraph = await readToolGraphCache(context, input.companyId);
  }

  const issuesByAgent = mapIssuesByAgent(issues);
  const agentGraph = buildGraph(agents);
  const graph = mergeGraphs(agentGraph, codeGraph);
  const cards = buildHealthCards(agents, issuesByAgent);
  const questions = buildMetaQuestions(agents, issuesByAgent, now);

  return {
    meta: {
      generatedAt: now.toISOString(),
      agentCount: agents.length,
      issueCount: issues.length,
    },
    graph,
    cards,
    questions,
  };
}

const plugin = definePlugin({
  async setup(context) {
    context.data.register("system-garden-snapshot", async (rawParams) => {
      const params = toRecord(rawParams) ?? {};
      const companyId = getCompanyId(params);
      let codeLayerSource = getCodeLayerSource(params);
      if (codeLayerSource === "knowledge-graph") {
        try {
          const config = toRecord(await context.config.get()) ?? {};
          const configSource = toNonEmptyString(config.codeLayerSource).toLowerCase();
          if (configSource === "tool-registry" || configSource === "none") {
            codeLayerSource = configSource as CodeLayerSource;
          }
        } catch { /* config not available, use default */ }
      }
      return await buildGardenSnapshot(context, { companyId, codeLayerSource });
    });

    context.data.register("system-garden-agent-detail", async (rawParams) => {
      const params = toRecord(rawParams) ?? {};
      const companyId = getCompanyId(params);
      const agentId = getAgentId(params);
      if (!companyId || !agentId) return null;

      const [agents, issues] = await Promise.all([
        listAllAgents(context, companyId),
        listAllIssues(context, companyId),
      ]);

      return buildAgentDetailSnapshot(agents, issues, agentId);
    });

    context.events.on(TOOL_GRAPH_UPDATED_EVENT, async (event) => {
      await handleToolGraphUpdatedEvent(context, event);
    });
  },

  async onHealth() {
    return {
      status: "ok",
      message: `${PLUGIN_DISPLAY_NAME} worker ready`,
      details: {
        health: "garden-snapshot-enabled",
      },
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
