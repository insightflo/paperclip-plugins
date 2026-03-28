import { TERMINAL_STEP_STATUSES, toWorkflowStepRunRecord } from "./workflow-utils.js";
import { findStepRunByIssueId } from "./workflow-store.js";
function asString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function getNestedString(payload, ...path) {
    let current = payload;
    for (const token of path) {
        if (!current || typeof current !== "object") {
            return "";
        }
        current = current[token];
    }
    return asString(current);
}
function eventPayload(event) {
    return (event.payload && typeof event.payload === "object" ? event.payload : {});
}
export function extractRunEventRefs(event) {
    const payload = eventPayload(event);
    const agentId = asString(payload.agentId)
        || asString(payload.agent_id)
        || getNestedString(payload, "agent", "id");
    const issueId = asString(payload.issueId)
        || asString(payload.issue_id)
        || getNestedString(payload, "issue", "id")
        || getNestedString(payload, "context", "issueId");
    const runId = asString(payload.runId)
        || asString(payload.run_id)
        || (event.entityType === "run" ? asString(event.entityId) : "");
    const projectId = asString(payload.projectId)
        || asString(payload.project_id)
        || getNestedString(payload, "project", "id")
        || getNestedString(payload, "context", "projectId");
    const agentName = asString(payload.agentName)
        || asString(payload.agent_name)
        || getNestedString(payload, "agent", "name");
    const stdout = asString(payload.stdout) || asString(payload.stdoutExcerpt);
    const stderr = asString(payload.stderr) || asString(payload.stderrExcerpt);
    const log = asString(payload.log) || asString(payload.output);
    return {
        agentId,
        agentName,
        issueId,
        log,
        projectId,
        runId,
        stderr,
        stdout,
    };
}
export async function autoCompleteWorkflowStepIssue(ctx, event) {
    return await syncWorkflowStepIssueStatus(ctx, event, "done");
}
export async function syncWorkflowStepIssueStatus(ctx, event, nextIssueStatus, options) {
    const refs = extractRunEventRefs(event);
    if (!refs.issueId) {
        return { completed: false, reason: "missing issueId" };
    }
    return await syncWorkflowStepIssueStatusByIssueId(ctx, refs.issueId, event.companyId, nextIssueStatus, options);
}
export async function syncWorkflowStepIssueStatusFromStepRun(ctx, stepRunRecord, companyId, nextIssueStatus, options) {
    const issueId = asString(stepRunRecord.data.issueId);
    if (!issueId) {
        return { completed: false, reason: "missing issueId", stepId: stepRunRecord.data.stepId };
    }
    return await syncWorkflowStepIssueStatusByIssueId(ctx, issueId, companyId, nextIssueStatus, options);
}
async function syncWorkflowStepIssueStatusByIssueId(ctx, issueId, companyId, nextIssueStatus, options) {
    const stepRunRecord = await findStepRunByIssueId(ctx, issueId, companyId);
    if (!stepRunRecord) {
        return { completed: false, issueId, reason: "not a workflow step issue" };
    }
    const stepRun = toWorkflowStepRunRecord(stepRunRecord);
    if (TERMINAL_STEP_STATUSES.has(stepRun.data.status)) {
        return { completed: false, issueId, reason: `step already terminal (${stepRun.data.status})`, stepId: stepRun.data.stepId };
    }
    const issue = await ctx.issues.get(issueId, companyId);
    if (!issue) {
        return { completed: false, issueId, reason: "issue not found" };
    }
    const status = typeof issue.status === "string" ? issue.status : "";
    if (status !== "todo" && status !== "in_progress") {
        return { completed: false, issueId, reason: `issue status not eligible (${status || "unknown"})`, stepId: stepRun.data.stepId };
    }
    await ctx.issues.update(issueId, { status: nextIssueStatus }, companyId);
    if (nextIssueStatus !== "done") {
        const comment = options?.comment?.trim();
        if (comment) {
            await ctx.issues.createComment(issueId, comment, companyId);
        }
    }
    return {
        completed: true,
        issueId,
        stepId: stepRun.data.stepId,
    };
}
