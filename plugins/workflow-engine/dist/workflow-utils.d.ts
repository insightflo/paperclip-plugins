import type { PluginEntityRecord } from "@paperclipai/plugin-sdk";
import type { WorkflowStep } from "./dag-engine.js";
import type { WorkflowDefinition, WorkflowRun, WorkflowStepRun } from "./workflow-store.js";
export type WorkflowRunRecord = PluginEntityRecord & {
    data: WorkflowRun;
};
export type WorkflowStepRunRecord = PluginEntityRecord & {
    data: WorkflowStepRun;
};
export type WorkflowDefinitionRecord = PluginEntityRecord & {
    data: WorkflowDefinition;
};
export declare const TERMINAL_STEP_STATUSES: Set<string>;
export declare function toWorkflowRunRecord(record: PluginEntityRecord): WorkflowRunRecord;
export declare function toWorkflowStepRunRecord(record: PluginEntityRecord): WorkflowStepRunRecord;
export declare function toWorkflowDefinitionRecord(record: PluginEntityRecord): WorkflowDefinitionRecord;
export declare function findStepDefinition(definition: WorkflowDefinitionRecord, stepId: string): WorkflowStep | null;
export declare function getStepAgentNameHint(stepDef: WorkflowStep): string | null;
export declare function getStepAgentName(stepRun: WorkflowStepRunRecord, stepDef: WorkflowStep): string | null;
