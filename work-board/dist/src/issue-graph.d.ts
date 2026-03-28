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
export declare function buildMissionIssueGraph(input: MissionIssueGraphInput): Promise<MissionIssueGraphResult>;
export {};
//# sourceMappingURL=issue-graph.d.ts.map