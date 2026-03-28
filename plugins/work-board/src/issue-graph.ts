import type { GraphEdge, GraphNode } from "./worker.js";

type IssueCommentRecord = {
  body: string;
};

type IssueRecord = {
  id: string;
  identifier?: string | null;
  title: string;
  description?: string | null;
  status: string;
  hiddenAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  parentId?: string | null;
  assigneeAgentId?: string | null;
  executionRunId?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

type AgentRecord = {
  id: string;
  name: string;
  status?: string | null;
  role?: string | null;
};

export interface MissionIssueGraphInput {
  issues: IssueRecord[];
  agents: AgentRecord[];
  loadComments: (issueId: string) => Promise<IssueCommentRecord[]>;
  seedIssueIds?: string[];
  maxDepth?: number;
}

export interface MissionIssueGraphResult {
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  seedIssueIds: string[];
}

const MISSION_BOARD_TITLE_PREFIXES = [
  "[유지보수]",
  "[리벨런싱 경고]",
  "[경고]",
  "[지시]",
  "[전략]",
  "[긴급]",
] as const;

const ISSUE_REF_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const REISSUE_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\s*재이슈(?:[)\]\s]|$)/;
const COMMENT_SPAWN_PATTERN = /(생성|이관|분리|후속|차단|연결|파생|재이슈|follow[- ]?up|spawn|handoff|linked|created)/i;

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractIssuePrefix(title: string): string {
  const match = title.match(/^\[([^\]]+)\]/);
  return match ? match[1]!.trim() : "";
}

function isHiddenOrCancelled(issue: IssueRecord): boolean {
  return toDate(issue.hiddenAt) !== null || toDate(issue.cancelledAt) !== null;
}

function isSeedIssue(issue: IssueRecord): boolean {
  if (isHiddenOrCancelled(issue)) return false;

  const title = issue.title.trim();
  const record = issue as unknown as Record<string, unknown>;
  if (MISSION_BOARD_TITLE_PREFIXES.some((prefix) => title.startsWith(prefix))) return true;
  if (toNonEmptyString(issue.executionRunId)) return true;
  if (toNonEmptyString(record.originRunId)) return true;
  if (toNonEmptyString(record.originKind) && toNonEmptyString(record.originKind) !== "manual") return true;
  return false;
}

function issueNode(issue: IssueRecord, topologyRole: "parent" | "child" | "standalone"): GraphNode {
  const originKind = toNonEmptyString((issue as unknown as Record<string, unknown>).originKind);
  return {
    id: issue.id,
    label: issue.identifier ?? issue.id.slice(0, 8),
    kind: "issue",
    status: issue.status,
    role: extractIssuePrefix(issue.title) || originKind || "issue",
    topologyRole,
    summary: issue.title,
    identifier: issue.identifier ?? null,
  };
}

function agentNode(agent: AgentRecord): GraphNode {
  return {
    id: agent.id,
    label: agent.name,
    kind: "agent",
    status: agent.status ?? "active",
    role: agent.role ?? "assignee",
    summary: agent.name,
    identifier: null,
  };
}

function collectRefs(...texts: Array<string | null | undefined>): string[] {
  const refs = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const matches = text.matchAll(ISSUE_REF_PATTERN);
    for (const match of matches) {
      const ref = match[1]?.trim();
      if (ref) refs.add(ref);
    }
  }
  return [...refs];
}

function extractReissueRef(issue: IssueRecord): string | null {
  const match = issue.title.match(REISSUE_PATTERN);
  return match?.[1]?.trim() ?? null;
}

function addEdge(edges: GraphEdge[], seen: Set<string>, source: string, target: string, label: string): void {
  if (!source || !target || source === target) return;
  const key = `${source}->${target}:${label}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ source, target, label });
}

async function getComments(
  issueId: string,
  loadComments: (issueId: string) => Promise<IssueCommentRecord[]>,
  cache: Map<string, IssueCommentRecord[]>,
): Promise<IssueCommentRecord[]> {
  if (cache.has(issueId)) return cache.get(issueId) ?? [];
  try {
    const comments = await loadComments(issueId);
    cache.set(issueId, comments);
    return comments;
  } catch {
    cache.set(issueId, []);
    return [];
  }
}

export async function buildMissionIssueGraph(input: MissionIssueGraphInput): Promise<MissionIssueGraphResult> {
  const issueById = new Map(input.issues.map((issue) => [issue.id, issue] as const));
  const issueByIdentifier = new Map(
    input.issues.flatMap((issue) => (issue.identifier ? [[issue.identifier, issue] as const] : [])),
  );
  const agentById = new Map(input.agents.map((agent) => [agent.id, agent] as const));

  const seedIssueIds =
    input.seedIssueIds && input.seedIssueIds.length > 0
      ? input.seedIssueIds.filter((issueId) => issueById.has(issueId))
      : input.issues.filter(isSeedIssue).map((issue) => issue.id);
  const queue: Array<{ issueId: string; depth: number }> = seedIssueIds.map((issueId) => ({ issueId, depth: 0 }));
  const visited = new Set<string>();
  const commentsCache = new Map<string, IssueCommentRecord[]>();
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  const maxDepth = input.maxDepth ?? 2;
  const childrenByIssueId = new Map<string, string[]>();
  for (const issue of input.issues) {
    if (!issue.parentId || !issueById.has(issue.parentId)) continue;
    const bucket = childrenByIssueId.get(issue.parentId);
    if (bucket) {
      bucket.push(issue.id);
    } else {
      childrenByIssueId.set(issue.parentId, [issue.id]);
    }
  }

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) continue;
    if (visited.has(next.issueId)) continue;
    visited.add(next.issueId);

    const issue = issueById.get(next.issueId);
    if (!issue) continue;

    const hasParent = Boolean(issue.parentId && issueById.has(issue.parentId));
    const hasChildren = (childrenByIssueId.get(issue.id) ?? []).length > 0;
    const topologyRole = hasChildren ? "parent" : hasParent ? "child" : "standalone";
    nodes.set(issue.id, issueNode(issue, topologyRole));

    if (issue.assigneeAgentId) {
      const agent = agentById.get(issue.assigneeAgentId);
      if (agent) {
        nodes.set(agent.id, agentNode(agent));
        addEdge(edges, seenEdges, issue.id, agent.id, "assignee");
      }
    }

    const comments = next.depth <= maxDepth ? await getComments(issue.id, input.loadComments, commentsCache) : [];

    const reissueRef = extractReissueRef(issue);
    if (reissueRef) {
      const original = issueByIdentifier.get(reissueRef);
      if (original) {
        const originalHasParent = Boolean(original.parentId && issueById.has(original.parentId));
        const originalHasChildren = (childrenByIssueId.get(original.id) ?? []).length > 0;
        const originalTopologyRole = originalHasChildren ? "parent" : originalHasParent ? "child" : "standalone";
        nodes.set(original.id, issueNode(original, originalTopologyRole));
        addEdge(edges, seenEdges, original.id, issue.id, "reissue");
        if (!visited.has(original.id) && next.depth < maxDepth) {
          queue.push({ issueId: original.id, depth: next.depth + 1 });
        }
      }
    }

    if (issue.parentId) {
      const parent = issueById.get(issue.parentId);
      if (parent) {
        const parentHasParent = Boolean(parent.parentId && issueById.has(parent.parentId));
        const parentHasChildren = (childrenByIssueId.get(parent.id) ?? []).length > 0;
        const parentTopologyRole = parentHasChildren ? "parent" : parentHasParent ? "child" : "standalone";
        nodes.set(parent.id, issueNode(parent, parentTopologyRole));
        addEdge(edges, seenEdges, issue.id, parent.id, "parent");
        if (!visited.has(parent.id) && next.depth < maxDepth) {
          queue.push({ issueId: parent.id, depth: next.depth + 1 });
        }
      }
    }

    const textRefs = collectRefs(issue.title, issue.description).filter((ref) => ref !== reissueRef);
    for (const ref of textRefs) {
      const target = issueByIdentifier.get(ref);
      if (!target || target.id === issue.id) continue;

      const targetHasParent = Boolean(target.parentId && issueById.has(target.parentId));
      const targetHasChildren = (childrenByIssueId.get(target.id) ?? []).length > 0;
      const targetTopologyRole = targetHasChildren ? "parent" : targetHasParent ? "child" : "standalone";
      nodes.set(target.id, issueNode(target, targetTopologyRole));
      addEdge(edges, seenEdges, issue.id, target.id, "related");

      if (!visited.has(target.id) && next.depth < maxDepth) {
        queue.push({ issueId: target.id, depth: next.depth + 1 });
      }
    }

    for (const comment of comments) {
      const commentRefs = collectRefs(comment.body);
      const commentSpawn = COMMENT_SPAWN_PATTERN.test(comment.body);
      for (const ref of commentRefs) {
        const target = issueByIdentifier.get(ref);
        if (!target || target.id === issue.id) continue;

        const targetHasParent = Boolean(target.parentId && issueById.has(target.parentId));
        const targetHasChildren = (childrenByIssueId.get(target.id) ?? []).length > 0;
        const targetTopologyRole = targetHasChildren ? "parent" : targetHasParent ? "child" : "standalone";
        nodes.set(target.id, issueNode(target, targetTopologyRole));
        addEdge(edges, seenEdges, issue.id, target.id, commentSpawn ? "spawned_followup" : "related");

        if (!visited.has(target.id) && next.depth < maxDepth) {
          queue.push({ issueId: target.id, depth: next.depth + 1 });
        }
      }
    }

    const childIds = childrenByIssueId.get(issue.id) ?? [];
    for (const childId of childIds) {
      if (!visited.has(childId) && next.depth < maxDepth) {
        queue.push({ issueId: childId, depth: next.depth + 1 });
      }
    }
  }

  const orderedNodes = [...nodes.values()].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "issue" ? -1 : 1;
    const leftIssue = issueById.get(left.id);
    const rightIssue = issueById.get(right.id);
    const leftTime = toDate(leftIssue?.updatedAt)?.getTime() ?? 0;
    const rightTime = toDate(rightIssue?.updatedAt)?.getTime() ?? 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.label.localeCompare(right.label);
  });

  return {
    graph: {
      nodes: orderedNodes,
      edges,
    },
    seedIssueIds,
  };
}
