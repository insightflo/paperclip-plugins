export interface WorkflowStep {
    id: string;
    title: string;
    dependsOn: string[];
    type?: "agent" | "tool";
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    tools?: string[];
    sessionMode?: "fresh" | "reuse";
    onFailure?: "retry" | "skip" | "abort_workflow" | "escalate";
    escalateTo?: string;
    maxRetries?: number;
    triggerOn?: "normal" | "escalation";
    timeoutSeconds?: number;
}
export interface DagValidationResult {
    valid: boolean;
    errors: string[];
    topologicalOrder: string[];
}
export interface NextStepsResult {
    readyStepIds: string[];
    isWorkflowComplete: boolean;
}
export declare function validateDag(steps: WorkflowStep[]): DagValidationResult;
export declare function getNextSteps(steps: WorkflowStep[], completedStepIds: Set<string>, failedStepIds: Set<string>, skippedStepIds: Set<string>): NextStepsResult;
export declare function getEscalationTarget(steps: WorkflowStep[], failedStepId: string): string | null;
export declare function getRetryInfo(steps: WorkflowStep[], stepId: string): {
    shouldRetry: boolean;
    maxRetries: number;
};
