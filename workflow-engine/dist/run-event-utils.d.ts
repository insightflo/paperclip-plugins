import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
export interface RunEventRefs {
    agentId: string;
    agentName: string;
    issueId: string;
    log: string;
    projectId: string;
    runId: string;
    stderr: string;
    stdout: string;
}
export type WorkflowStepIssueTerminalStatus = "done" | "blocked" | "cancelled";
export declare function extractRunEventRefs(event: PluginEvent): RunEventRefs;
export declare function autoCompleteWorkflowStepIssue(ctx: PluginContext, event: PluginEvent): Promise<{
    completed: boolean;
    issueId?: string;
    reason?: string;
    stepId?: string;
}>;
export declare function syncWorkflowStepIssueStatus(ctx: PluginContext, event: PluginEvent, nextIssueStatus: WorkflowStepIssueTerminalStatus, options?: {
    comment?: string;
}): Promise<{
    completed: boolean;
    issueId?: string;
    reason?: string;
    stepId?: string;
}>;
export declare function syncWorkflowStepIssueStatusFromStepRun(ctx: PluginContext, stepRunRecord: {
    data: {
        issueId?: string;
        stepId: string;
    };
}, companyId: string, nextIssueStatus: WorkflowStepIssueTerminalStatus, options?: {
    comment?: string;
}): Promise<{
    completed: boolean;
    issueId?: string;
    reason?: string;
    stepId?: string;
}>;
