import { RUN_STATUSES } from "./constants.js";
import { listWorkflowRunsByWorkflowId } from "./workflow-store.js";
import { toWorkflowRunRecord } from "./workflow-utils.js";
const BLOCKING_RUN_STATUSES = new Set([
    RUN_STATUSES.running,
    RUN_STATUSES.completed,
]);
function toIsoDay(value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return new Date(parsed).toISOString().slice(0, 10);
}
export async function checkDailyRunGuard(ctx, companyId, workflowId, referenceDate = new Date()) {
    const dayKey = referenceDate.toISOString().slice(0, 10);
    const runs = await listWorkflowRunsByWorkflowId(ctx, companyId, workflowId);
    for (const runRecord of runs) {
        const run = toWorkflowRunRecord(runRecord);
        if (!BLOCKING_RUN_STATUSES.has(run.data.status)) {
            continue;
        }
        const runDay = toIsoDay(run.data.startedAt);
        if (runDay !== dayKey) {
            continue;
        }
        return {
            blocked: true,
            dayKey,
            existingRunId: run.id,
            existingStatus: run.data.status,
        };
    }
    return {
        blocked: false,
        dayKey,
    };
}
