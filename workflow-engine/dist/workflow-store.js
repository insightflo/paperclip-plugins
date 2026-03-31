import { randomUUID } from "node:crypto";
import { ENTITY_TYPES } from "./constants.js";
export function formatDateKeyInTimezone(date, timezone) {
    if (!timezone) {
        return date.toISOString().slice(0, 10);
    }
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);
        const year = parts.find((part) => part.type === "year")?.value;
        const month = parts.find((part) => part.type === "month")?.value;
        const day = parts.find((part) => part.type === "day")?.value;
        if (!year || !month || !day) {
            return null;
        }
        return `${year}-${month}-${day}`;
    }
    catch {
        return null;
    }
}
function toTypedRecord(record, entityType) {
    if (record.entityType !== entityType) {
        throw new Error(`Expected entity type "${entityType}", got "${record.entityType}"`);
    }
    return record;
}
function toEntityData(value) {
    return value;
}
function toScopeKind(value) {
    if (value === "instance" || value === "company" || value === "project" || value === "issue") {
        return value;
    }
    return "company";
}
const inflightIdempotencyMarks = new Set();
function makeExternalId(prefix) {
    return `${prefix}:${Date.now()}:${randomUUID()}`;
}
function mergeEntityData(record, updates) {
    const merged = {
        ...record.data,
        ...updates,
    };
    // Remove keys explicitly set to undefined so cleared fields are stored as absent
    for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) {
            delete merged[key];
        }
    }
    return merged;
}
function isPluginEntityExternalIdConflict(error) {
    if (!error || typeof error !== "object") {
        return false;
    }
    const code = "code" in error ? error.code : undefined;
    if (code === "23505") {
        return true;
    }
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("plugin_entities_external_idx")
        || message.includes("duplicate key")
        || message.includes("unique constraint");
}
async function getEntityByType(ctx, id, entityType) {
    const pageSize = 200;
    let offset = 0;
    while (true) {
        const listed = await ctx.entities.list({
            entityType,
            limit: pageSize,
            offset,
        });
        const matched = listed.find((record) => record.id === id && record.entityType === entityType) ?? null;
        if (matched) {
            return toTypedRecord(matched, entityType);
        }
        if (listed.length < pageSize) {
            return null;
        }
        offset += listed.length;
    }
}
async function requireEntityByType(ctx, id, entityType, label) {
    const record = await getEntityByType(ctx, id, entityType);
    if (!record) {
        throw new Error(`${label} not found: ${id}`);
    }
    return record;
}
async function listAllCompanyStepRuns(ctx, companyId) {
    const pageSize = 200;
    const stepRuns = [];
    let offset = 0;
    while (true) {
        const page = await ctx.entities.list({
            entityType: ENTITY_TYPES.workflowStepRun,
            scopeKind: "company",
            scopeId: companyId,
            limit: pageSize,
            offset,
        });
        stepRuns.push(...page);
        if (page.length < pageSize) {
            return stepRuns;
        }
        offset += page.length;
    }
}
async function listAllCompanyWorkflowRuns(ctx, companyId) {
    const pageSize = 200;
    const workflowRuns = [];
    let offset = 0;
    while (true) {
        const page = await ctx.entities.list({
            entityType: ENTITY_TYPES.workflowRun,
            scopeKind: "company",
            scopeId: companyId,
            limit: pageSize,
            offset,
        });
        workflowRuns.push(...page);
        if (page.length < pageSize) {
            return workflowRuns;
        }
        offset += page.length;
    }
}
export async function createWorkflowDefinition(ctx, def) {
    return await ctx.entities.upsert({
        entityType: ENTITY_TYPES.workflowDefinition,
        scopeKind: "company",
        scopeId: def.companyId,
        externalId: makeExternalId(`workflow-definition:${def.companyId}`),
        title: def.name,
        status: def.status,
        data: toEntityData(def),
    });
}
export async function getWorkflowDefinition(ctx, id) {
    return await getEntityByType(ctx, id, ENTITY_TYPES.workflowDefinition);
}
export async function listWorkflowDefinitions(ctx, companyId) {
    return await ctx.entities.list({
        entityType: ENTITY_TYPES.workflowDefinition,
        scopeKind: "company",
        scopeId: companyId,
    });
}
export async function updateWorkflowDefinition(ctx, id, updates) {
    const current = await requireEntityByType(ctx, id, ENTITY_TYPES.workflowDefinition, "Workflow definition");
    const data = mergeEntityData(current, updates);
    return await ctx.entities.upsert({
        entityType: current.entityType,
        scopeKind: toScopeKind(current.scopeKind),
        scopeId: current.scopeId ?? undefined,
        externalId: current.externalId ?? `workflow-definition:${current.id}`,
        title: data.name,
        status: data.status,
        data: toEntityData(data),
    });
}
export async function createWorkflowRun(ctx, run) {
    return await ctx.entities.upsert({
        entityType: ENTITY_TYPES.workflowRun,
        scopeKind: "company",
        scopeId: run.companyId,
        externalId: makeExternalId(`workflow-run:${run.companyId}:${run.workflowId}`),
        title: `${run.workflowName} run`,
        status: run.status,
        data: toEntityData(run),
    });
}
export async function getWorkflowRun(ctx, id) {
    return await getEntityByType(ctx, id, ENTITY_TYPES.workflowRun);
}
export async function listActiveRuns(ctx, companyId) {
    const runs = await listAllCompanyWorkflowRuns(ctx, companyId);
    return runs.filter((run) => {
        const runCompanyId = typeof run.data.companyId === "string"
            ? run.data.companyId.trim()
            : "";
        return run.status === "running" && runCompanyId === companyId;
    });
}
export async function listRecentRuns(ctx, companyId, limit = 20) {
    const runs = await listAllCompanyWorkflowRuns(ctx, companyId);
    return runs
        .filter((run) => {
        const runCompanyId = typeof run.data.companyId === "string"
            ? run.data.companyId.trim()
            : "";
        return runCompanyId === companyId;
    })
        .sort((a, b) => {
        const aData = a.data;
        const bData = b.data;
        const aTime = Date.parse(aData.completedAt ?? aData.startedAt ?? "") || 0;
        const bTime = Date.parse(bData.completedAt ?? bData.startedAt ?? "") || 0;
        return bTime - aTime;
    })
        .slice(0, Math.max(0, limit));
}
export async function listWorkflowRunsByWorkflowId(ctx, companyId, workflowId) {
    const runs = await listAllCompanyWorkflowRuns(ctx, companyId);
    return runs.filter((run) => run.data.workflowId === workflowId &&
        run.data.companyId === companyId);
}
export async function updateWorkflowRun(ctx, id, updates) {
    const current = await requireEntityByType(ctx, id, ENTITY_TYPES.workflowRun, "Workflow run");
    const data = mergeEntityData(current, updates);
    return await ctx.entities.upsert({
        entityType: current.entityType,
        scopeKind: toScopeKind(current.scopeKind),
        scopeId: current.scopeId ?? undefined,
        externalId: current.externalId ?? `workflow-run:${current.id}`,
        title: `${data.workflowName} run`,
        status: data.status,
        data: toEntityData(data),
    });
}
export async function createStepRun(ctx, companyId, stepRun) {
    return await ctx.entities.upsert({
        entityType: ENTITY_TYPES.workflowStepRun,
        scopeKind: "company",
        scopeId: companyId,
        externalId: `${stepRun.runId}:${stepRun.stepId}`,
        title: stepRun.stepId,
        status: stepRun.status,
        data: toEntityData(stepRun),
    });
}
export async function getStepRun(ctx, id) {
    return await getEntityByType(ctx, id, ENTITY_TYPES.workflowStepRun);
}
export async function listStepRuns(ctx, runId, companyId) {
    const stepRuns = await listAllCompanyStepRuns(ctx, companyId);
    return stepRuns.filter((stepRun) => stepRun.data.runId === runId);
}
export async function findStepRunByIssueId(ctx, issueId, companyId) {
    const stepRuns = await listAllCompanyStepRuns(ctx, companyId);
    return (stepRuns.find((stepRun) => stepRun.data.issueId === issueId) ?? null);
}
export async function updateStepRun(ctx, id, updates) {
    const current = await requireEntityByType(ctx, id, ENTITY_TYPES.workflowStepRun, "Workflow step run");
    const data = mergeEntityData(current, updates);
    return await ctx.entities.upsert({
        entityType: current.entityType,
        scopeKind: toScopeKind(current.scopeKind),
        scopeId: current.scopeId ?? undefined,
        externalId: current.externalId ?? `${data.runId}:${data.stepId}`,
        title: data.stepId,
        status: data.status,
        data: toEntityData(data),
    });
}
export async function checkIdempotency(ctx, key, companyId) {
    const pageSize = 500;
    let offset = 0;
    while (true) {
        const page = await ctx.entities.list({
            entityType: ENTITY_TYPES.idempotencyKey,
            scopeKind: "company",
            scopeId: companyId,
            limit: pageSize,
            offset,
        });
        if (page.some((record) => record.externalId === key)) {
            return true;
        }
        if (page.length < pageSize) {
            return false;
        }
        offset += page.length;
    }
}
export async function markIdempotency(ctx, key, companyId) {
    const scopedKey = `${companyId}:${key}`;
    if (inflightIdempotencyMarks.has(scopedKey)) {
        return;
    }
    if (await checkIdempotency(ctx, key, companyId)) {
        return;
    }
    inflightIdempotencyMarks.add(scopedKey);
    try {
        await ctx.entities.upsert({
            entityType: ENTITY_TYPES.idempotencyKey,
            scopeKind: "company",
            scopeId: companyId,
            externalId: key,
            title: key,
            status: "processed",
            data: {
                processedAt: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        if (!isPluginEntityExternalIdConflict(error)) {
            throw error;
        }
        const exists = await checkIdempotency(ctx, key, companyId);
        if (!exists) {
            throw error;
        }
    }
    finally {
        inflightIdempotencyMarks.delete(scopedKey);
    }
}
