import { ENTITY_TYPES } from "./constants.js";
function entities(ctx) {
    return ctx.entities;
}
function asRecord(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return value;
}
function asNonEmptyString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function normalizeName(value, fieldName) {
    const normalized = asNonEmptyString(value);
    if (!normalized) {
        throw new Error(`${fieldName} is required`);
    }
    return normalized;
}
function normalizeBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
        return value;
    }
    return fallback;
}
function normalizeEnv(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const entries = Object.entries(value)
        .filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string")
        .map(([key, raw]) => [key.trim(), raw])
        .filter(([key, raw]) => key.length > 0 && raw.length > 0);
    if (entries.length === 0) {
        return undefined;
    }
    return Object.fromEntries(entries);
}
function normalizeArgsSchema(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    return value;
}
function toToolConfigData(input, nowIso) {
    return {
        name: normalizeName(input.name, "name"),
        command: normalizeName(input.command, "command"),
        workingDirectory: asNonEmptyString(input.workingDirectory) || undefined,
        env: normalizeEnv(input.env),
        requiresApproval: normalizeBoolean(input.requiresApproval, false),
        description: asNonEmptyString(input.description) || undefined,
        instructions: asNonEmptyString(input.instructions) || undefined,
        argsSchema: normalizeArgsSchema(input.argsSchema),
        createdBy: asNonEmptyString(input.createdBy) || undefined,
        createdAt: asNonEmptyString(input.createdAt) || nowIso,
        updatedAt: asNonEmptyString(input.updatedAt) || nowIso,
    };
}
function toGrantData(input, nowIso) {
    return {
        agentName: normalizeName(input.agentName, "agentName"),
        toolName: normalizeName(input.toolName, "toolName"),
        grantedBy: normalizeName(input.grantedBy, "grantedBy"),
        grantedAt: asNonEmptyString(input.grantedAt) || nowIso,
    };
}
function asDataRecord(value) {
    return value;
}
function toScopeKind(value) {
    if (value === "instance" || value === "company" || value === "project" || value === "issue") {
        return value;
    }
    return "company";
}
async function listByType(ctx, entityType, companyId) {
    const pageSize = 500;
    let offset = 0;
    const all = [];
    while (true) {
        const listed = await entities(ctx).list({
            entityType,
            scopeKind: "company",
            scopeId: companyId,
            limit: pageSize,
            offset,
        });
        const filtered = listed
            .filter((record) => record.entityType === entityType)
            .filter((record) => asRecord(record.data).__deleted !== true)
            .filter((record) => {
            const sid = typeof record.scopeId === "string" ? record.scopeId.trim() : "";
            return !sid || sid === companyId;
        });
        all.push(...filtered);
        if (listed.length < pageSize) {
            return all;
        }
        offset += listed.length;
    }
}
async function listAllByType(ctx, entityType, companyId) {
    const pageSize = 500;
    let offset = 0;
    const all = [];
    while (true) {
        const listed = await entities(ctx).list({
            entityType,
            scopeKind: "company",
            scopeId: companyId,
            limit: pageSize,
            offset,
        });
        const filtered = listed
            .filter((record) => record.entityType === entityType)
            .filter((record) => {
            const sid = typeof record.scopeId === "string" ? record.scopeId.trim() : "";
            return !sid || sid === companyId;
        });
        all.push(...filtered);
        if (listed.length < pageSize) {
            return all;
        }
        offset += listed.length;
    }
}
async function findByExternalId(ctx, entityType, companyId, externalId) {
    const all = await listByType(ctx, entityType, companyId);
    return all.find((record) => record.externalId === externalId) ?? null;
}
async function getById(ctx, entityType, id) {
    const pageSize = 200;
    let offset = 0;
    while (true) {
        const page = await entities(ctx).list({
            entityType,
            limit: pageSize,
            offset,
        });
        const matched = page.find((record) => record.id === id
            && record.entityType === entityType
            && asRecord(record.data).__deleted !== true) ?? null;
        if (matched) {
            return matched;
        }
        if (page.length < pageSize) {
            return null;
        }
        offset += page.length;
    }
}
async function createEntity(ctx, input) {
    return await entities(ctx).upsert(input);
}
async function updateEntity(ctx, entityType, id, patch) {
    const current = await getById(ctx, entityType, id);
    if (!current) {
        throw new Error(`Entity not found: ${id}`);
    }
    const currentData = asRecord(current.data);
    const nextData = patch.data ? { ...currentData, ...patch.data } : currentData;
    return await entities(ctx).upsert({
        entityType: current.entityType,
        scopeKind: toScopeKind(current.scopeKind),
        scopeId: current.scopeId ?? undefined,
        externalId: current.externalId ?? patch.externalId ?? `${current.entityType}:${current.id}`,
        title: patch.title ?? current.title ?? undefined,
        status: patch.status ?? current.status ?? undefined,
        data: nextData,
    });
}
async function deleteEntity(ctx, entityType, id) {
    const current = await getById(ctx, entityType, id);
    if (!current) {
        return;
    }
    await entities(ctx).upsert({
        entityType: current.entityType,
        scopeKind: toScopeKind(current.scopeKind),
        scopeId: current.scopeId ?? undefined,
        externalId: current.externalId ?? `${current.entityType}:${current.id}`,
        title: current.title ?? undefined,
        status: "deleted",
        data: {
            ...asRecord(current.data),
            __deleted: true,
            deletedAt: new Date().toISOString(),
        },
    });
}
function toToolConfigRecord(record) {
    return {
        ...record,
        data: toToolConfigData(asRecord(record.data), record.updatedAt),
    };
}
function toGrantRecord(record) {
    return {
        ...record,
        data: toGrantData(asRecord(record.data), record.updatedAt),
    };
}
export async function createTool(ctx, companyId, input) {
    const nowIso = new Date().toISOString();
    const data = toToolConfigData(input, nowIso);
    const existing = await findByExternalId(ctx, ENTITY_TYPES.toolConfig, companyId, data.name);
    if (existing) {
        throw new Error(`Tool already exists: ${data.name}`);
    }
    const created = await createEntity(ctx, {
        entityType: ENTITY_TYPES.toolConfig,
        scopeKind: "company",
        scopeId: companyId,
        externalId: data.name,
        title: data.name,
        status: "active",
        data: asDataRecord(data),
    });
    return toToolConfigRecord(created);
}
export async function updateTool(ctx, companyId, toolName, patch) {
    const normalizedToolName = normalizeName(toolName, "toolName");
    const existing = await findByExternalId(ctx, ENTITY_TYPES.toolConfig, companyId, normalizedToolName);
    if (!existing) {
        throw new Error(`Tool not found: ${normalizedToolName}`);
    }
    const current = toToolConfigRecord(existing);
    const merged = toToolConfigData({
        ...current.data,
        ...patch,
        name: current.data.name,
        createdAt: current.data.createdAt,
        updatedAt: new Date().toISOString(),
    }, new Date().toISOString());
    const updated = await updateEntity(ctx, ENTITY_TYPES.toolConfig, existing.id, {
        title: merged.name,
        status: "active",
        externalId: merged.name,
        data: asDataRecord(merged),
    });
    return toToolConfigRecord(updated);
}
export async function deleteTool(ctx, companyId, toolName) {
    const normalizedToolName = normalizeName(toolName, "toolName");
    const existing = await findByExternalId(ctx, ENTITY_TYPES.toolConfig, companyId, normalizedToolName);
    if (!existing) {
        return;
    }
    await deleteEntity(ctx, ENTITY_TYPES.toolConfig, existing.id);
}
export async function getToolByName(ctx, companyId, toolName) {
    const normalizedToolName = normalizeName(toolName, "toolName");
    const found = await findByExternalId(ctx, ENTITY_TYPES.toolConfig, companyId, normalizedToolName);
    return found ? toToolConfigRecord(found) : null;
}
export async function listTools(ctx, companyId) {
    const records = await listByType(ctx, ENTITY_TYPES.toolConfig, companyId);
    return records
        .map((record) => toToolConfigRecord(record))
        .sort((left, right) => left.data.name.localeCompare(right.data.name));
}
export async function listAllTools(ctx, companyId) {
    const records = await listAllByType(ctx, ENTITY_TYPES.toolConfig, companyId);
    return records
        .map((record) => toToolConfigRecord(record))
        .sort((left, right) => left.data.name.localeCompare(right.data.name));
}
export async function restoreTool(ctx, companyId, toolName) {
    const normalizedToolName = normalizeName(toolName, "toolName");
    const allRecords = await listAllByType(ctx, ENTITY_TYPES.toolConfig, companyId);
    const existing = allRecords.find((record) => record.externalId === normalizedToolName);
    if (!existing) {
        throw new Error(`Tool not found: ${normalizedToolName}`);
    }
    const currentData = asRecord(existing.data);
    const { __deleted, deletedAt, ...cleanData } = currentData;
    const updated = await entities(ctx).upsert({
        entityType: existing.entityType,
        scopeKind: toScopeKind(existing.scopeKind),
        scopeId: existing.scopeId ?? undefined,
        externalId: existing.externalId ?? `${existing.entityType}:${existing.id}`,
        title: existing.title ?? undefined,
        status: "active",
        data: {
            ...cleanData,
            updatedAt: new Date().toISOString(),
        },
    });
    return toToolConfigRecord(updated);
}
export async function grantTool(ctx, companyId, input) {
    const nowIso = new Date().toISOString();
    const data = toGrantData(input, nowIso);
    const grantExternalId = `${data.agentName}::${data.toolName}`;
    const tool = await getToolByName(ctx, companyId, data.toolName);
    if (!tool) {
        throw new Error(`Tool not found: ${data.toolName}`);
    }
    const existing = await findByExternalId(ctx, ENTITY_TYPES.agentToolGrant, companyId, grantExternalId);
    if (existing) {
        return toGrantRecord(existing);
    }
    const created = await createEntity(ctx, {
        entityType: ENTITY_TYPES.agentToolGrant,
        scopeKind: "company",
        scopeId: companyId,
        externalId: grantExternalId,
        title: `${data.agentName} -> ${data.toolName}`,
        status: "active",
        data: asDataRecord(data),
    });
    return toGrantRecord(created);
}
export async function revokeTool(ctx, companyId, agentName, toolName) {
    const normalizedAgentName = normalizeName(agentName, "agentName");
    const normalizedToolName = normalizeName(toolName, "toolName");
    const externalId = `${normalizedAgentName}::${normalizedToolName}`;
    const existing = await findByExternalId(ctx, ENTITY_TYPES.agentToolGrant, companyId, externalId);
    if (!existing) {
        return;
    }
    await deleteEntity(ctx, ENTITY_TYPES.agentToolGrant, existing.id);
}
export async function listAgentGrants(ctx, companyId, filters) {
    const normalizedAgentName = asNonEmptyString(filters?.agentName);
    const normalizedToolName = asNonEmptyString(filters?.toolName);
    const records = await listByType(ctx, ENTITY_TYPES.agentToolGrant, companyId);
    const typed = records
        .map((record) => toGrantRecord(record))
        .filter((record) => {
        if (normalizedAgentName && record.data.agentName !== normalizedAgentName) {
            return false;
        }
        if (normalizedToolName && record.data.toolName !== normalizedToolName) {
            return false;
        }
        return true;
    })
        .sort((left, right) => {
        const byAgent = left.data.agentName.localeCompare(right.data.agentName);
        if (byAgent !== 0) {
            return byAgent;
        }
        return left.data.toolName.localeCompare(right.data.toolName);
    });
    return typed;
}
export async function isToolGrantedToAgent(ctx, companyId, agentName, toolName) {
    const grants = await listAgentGrants(ctx, companyId, {
        agentName,
        toolName,
    });
    return grants.length > 0;
}
export async function getEntityRecordById(ctx, entityType, id) {
    return await getById(ctx, entityType, id);
}
