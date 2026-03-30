import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";
import type { WorkflowStep } from "./dag-engine.js";
export interface WorkflowDefinition extends Record<string, unknown> {
    name: string;
    description: string;
    companyId: string;
    status: "active" | "paused" | "archived";
    steps: WorkflowStep[];
    timeoutMinutes?: number;
    maxDailyRuns?: number;
    maxConcurrentRuns?: number;
    triggerLabels?: string[];
    labelIds?: string[];
    schedule?: string;
    timezone?: string;
    deadlineTime?: string;
    lastScheduledRunAt?: string;
    projectId?: string;
    goalId?: string;
}
export interface WorkflowRun extends Record<string, unknown> {
    workflowId: string;
    workflowName: string;
    companyId: string;
    status: "running" | "completed" | "failed" | "aborted" | "timed-out";
    parentIssueId?: string;
    runLabel?: string;
    triggerSource?: "schedule" | "manual" | "label" | "api";
    startedAt: string;
    completedAt?: string;
}
export interface WorkflowStepRun extends Record<string, unknown> {
    runId: string;
    stepId: string;
    issueId?: string;
    agentName: string;
    status: "backlog" | "todo" | "in_progress" | "done" | "failed" | "skipped" | "escalated";
    retryCount: number;
    startedAt?: string;
    completedAt?: string;
    sessionId?: string;
}
export declare function formatDateKeyInTimezone(date: Date, timezone?: string): string | null;
export declare function createWorkflowDefinition(ctx: PluginContext, def: WorkflowDefinition): Promise<PluginEntityRecord>;
export declare function getWorkflowDefinition(ctx: PluginContext, id: string): Promise<(PluginEntityRecord & {
    data: WorkflowDefinition;
}) | null>;
export declare function listWorkflowDefinitions(ctx: PluginContext, companyId: string): Promise<PluginEntityRecord[]>;
export declare function updateWorkflowDefinition(ctx: PluginContext, id: string, updates: Partial<WorkflowDefinition>): Promise<PluginEntityRecord>;
export declare function createWorkflowRun(ctx: PluginContext, run: WorkflowRun): Promise<PluginEntityRecord>;
export declare function getWorkflowRun(ctx: PluginContext, id: string): Promise<(PluginEntityRecord & {
    data: WorkflowRun;
}) | null>;
export declare function listActiveRuns(ctx: PluginContext, companyId: string): Promise<PluginEntityRecord[]>;
export declare function listRecentRuns(ctx: PluginContext, companyId: string, limit?: number): Promise<PluginEntityRecord[]>;
export declare function listWorkflowRunsByWorkflowId(ctx: PluginContext, companyId: string, workflowId: string): Promise<PluginEntityRecord[]>;
export declare function updateWorkflowRun(ctx: PluginContext, id: string, updates: Partial<WorkflowRun>): Promise<PluginEntityRecord>;
export declare function createStepRun(ctx: PluginContext, companyId: string, stepRun: WorkflowStepRun): Promise<PluginEntityRecord>;
export declare function getStepRun(ctx: PluginContext, id: string): Promise<(PluginEntityRecord & {
    data: WorkflowStepRun;
}) | null>;
export declare function listStepRuns(ctx: PluginContext, runId: string, companyId: string): Promise<PluginEntityRecord[]>;
export declare function findStepRunByIssueId(ctx: PluginContext, issueId: string, companyId: string): Promise<PluginEntityRecord | null>;
export declare function updateStepRun(ctx: PluginContext, id: string, updates: Partial<WorkflowStepRun>): Promise<PluginEntityRecord>;
export declare function checkIdempotency(ctx: PluginContext, key: string, companyId: string): Promise<boolean>;
export declare function markIdempotency(ctx: PluginContext, key: string, companyId: string): Promise<void>;
