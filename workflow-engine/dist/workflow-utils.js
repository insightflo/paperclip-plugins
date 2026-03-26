import { STEP_STATUSES } from "./constants.js";
export const TERMINAL_STEP_STATUSES = new Set([
    STEP_STATUSES.done,
    STEP_STATUSES.failed,
    STEP_STATUSES.skipped,
    STEP_STATUSES.escalated,
]);
export function toWorkflowRunRecord(record) {
    return record;
}
export function toWorkflowStepRunRecord(record) {
    return record;
}
export function toWorkflowDefinitionRecord(record) {
    return record;
}
export function findStepDefinition(definition, stepId) {
    return definition.data.steps.find((step) => step.id === stepId) ?? null;
}
export function getStepAgentNameHint(stepDef) {
    const stepMeta = stepDef;
    const candidates = [stepMeta.agentName, stepMeta.agent, stepMeta.assigneeAgentName];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return null;
}
export function getStepAgentName(stepRun, stepDef) {
    if (typeof stepRun.data.agentName === "string" && stepRun.data.agentName.trim()) {
        return stepRun.data.agentName.trim();
    }
    return getStepAgentNameHint(stepDef);
}
