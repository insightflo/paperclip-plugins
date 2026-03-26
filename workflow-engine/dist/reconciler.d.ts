import type { PluginContext } from "@paperclipai/plugin-sdk";
type StartWorkflowFn = (ctx: PluginContext, workflowId: string, companyId: string, options?: {
    createParentIssue?: boolean;
    parentIssueId?: string;
}) => Promise<unknown>;
export declare function setStartWorkflowFn(fn: StartWorkflowFn): void;
export declare function runScheduledWorkflows(ctx: PluginContext): Promise<void>;
export declare function reconcileStuckSteps(ctx: PluginContext): Promise<void>;
export {};
