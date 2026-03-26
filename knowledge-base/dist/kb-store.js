import { DEFAULT_MAX_TOKEN_BUDGET, ENTITY_TYPES, KB_TYPES, } from "./constants.js";
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
function normalizeRequiredString(value, fieldName) {
    const normalized = asNonEmptyString(value);
    if (!normalized) {
        throw new Error(`${fieldName} is required`);
    }
    return normalized;
}
function normalizeKnowledgeBaseType(value) {
    const normalized = asNonEmptyString(value).toLowerCase();
    if (normalized === KB_TYPES.static || normalized === KB_TYPES.rag || normalized === KB_TYPES.ontology) {
        return normalized;
    }
    return KB_TYPES.static;
}
function normalizeMaxTokenBudget(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return DEFAULT_MAX_TOKEN_BUDGET;
    }
    const rounded = Math.floor(value);
    if (rounded <= 0) {
        return DEFAULT_MAX_TOKEN_BUDGET;
    }
    return rounded;
}
function normalizeStaticConfig(value) {
    const config = asRecord(value);
    return {
        content: typeof config.content === "string" ? config.content : "",
    };
}
function normalizeRagConfig(value) {
    const config = asRecord(value);
    const mcpServerUrl = asNonEmptyString(config.mcpServerUrl);
    let topK;
    if (typeof config.topK === "number" && Number.isFinite(config.topK) && config.topK > 0) {
        topK = Math.floor(config.topK);
    }
    return {
        mcpServerUrl: mcpServerUrl || undefined,
        topK,
    };
}
function normalizeOntologyConfig(value) {
    const config = asRecord(value);
    const kgPath = asNonEmptyString(config.kgPath);
    return {
        kgPath: kgPath || undefined,
    };
}
function toKnowledgeBaseData(input, nowIso, fallback) {
    const type = normalizeKnowledgeBaseType(input.type ?? fallback?.type);
    const name = normalizeRequiredString(input.name ?? fallback?.name, "name");
    const companyId = normalizeRequiredString(input.companyId ?? fallback?.companyId, "companyId");
    const description = asNonEmptyString(input.description ?? fallback?.description);
    const maxTokenBudget = normalizeMaxTokenBudget(input.maxTokenBudget ?? fallback?.maxTokenBudget);
    const createdAt = asNonEmptyString(input.createdAt ?? fallback?.createdAt) || nowIso;
    const updatedAt = asNonEmptyString(input.updatedAt) || nowIso;
    const staticConfig = type === KB_TYPES.static
        ? normalizeStaticConfig(input.staticConfig ?? fallback?.staticConfig)
        : normalizeStaticConfig(input.staticConfig ?? fallback?.staticConfig ?? {});
    const ragConfig = normalizeRagConfig(input.ragConfig ?? fallback?.ragConfig);
    const ontologyConfig = normalizeOntologyConfig(input.ontologyConfig ?? fallback?.ontologyConfig);
    return {
        name,
        type,
        description: description || undefined,
        companyId,
        maxTokenBudget,
        staticConfig: type === KB_TYPES.static ? staticConfig : undefined,
        ragConfig: type === KB_TYPES.rag ? ragConfig : undefined,
        ontologyConfig: type === KB_TYPES.ontology ? ontologyConfig : undefined,
        createdAt,
        updatedAt,
    };
}
function toGrantData(input, nowIso, fallback) {
    return {
        agentName: normalizeRequiredString(input.agentName ?? fallback?.agentName, "agentName"),
        kbName: normalizeRequiredString(input.kbName ?? fallback?.kbName, "kbName"),
        grantedBy: normalizeRequiredString(input.grantedBy ?? fallback?.grantedBy, "grantedBy"),
        grantedAt: asNonEmptyString(input.grantedAt ?? fallback?.grantedAt) || nowIso,
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
            const raw = asRecord(record.data).companyId;
            const dataCompanyId = typeof raw === "string" ? raw.trim() : "";
            return !dataCompanyId || dataCompanyId === companyId;
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
            const raw = asRecord(record.data).companyId;
            const dataCompanyId = typeof raw === "string" ? raw.trim() : "";
            return !dataCompanyId || dataCompanyId === companyId;
        });
        all.push(...filtered);
        if (listed.length < pageSize) {
            return all;
        }
        offset += listed.length;
    }
}
async function findByExternalId(ctx, entityType, companyId, externalId) {
    const fallback = await listByType(ctx, entityType, companyId);
    return fallback.find((record) => record.externalId === externalId) ?? null;
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
function toKnowledgeBaseRecord(record) {
    return {
        ...record,
        data: toKnowledgeBaseData(asRecord(record.data), record.updatedAt),
    };
}
function toGrantRecord(record) {
    return {
        ...record,
        data: toGrantData(asRecord(record.data), record.updatedAt),
    };
}
function normalizeGrantExternalId(agentName, kbName) {
    return `${agentName}::${kbName}`;
}
async function resolveKnowledgeBaseRecord(ctx, companyId, kbNameOrId) {
    const trimmed = asNonEmptyString(kbNameOrId);
    if (!trimmed) {
        return null;
    }
    const byId = await getById(ctx, ENTITY_TYPES.knowledgeBase, trimmed);
    if (byId) {
        const typed = toKnowledgeBaseRecord(byId);
        if (typed.data.companyId === companyId) {
            return typed;
        }
    }
    const byName = await findByExternalId(ctx, ENTITY_TYPES.knowledgeBase, companyId, trimmed);
    return byName ? toKnowledgeBaseRecord(byName) : null;
}
export async function listKnowledgeBases(ctx, companyId) {
    const listed = await listByType(ctx, ENTITY_TYPES.knowledgeBase, companyId);
    return listed
        .map(toKnowledgeBaseRecord)
        .sort((left, right) => left.data.name.localeCompare(right.data.name));
}
export async function listAllKnowledgeBases(ctx, companyId) {
    const listed = await listAllByType(ctx, ENTITY_TYPES.knowledgeBase, companyId);
    return listed
        .map(toKnowledgeBaseRecord)
        .sort((left, right) => left.data.name.localeCompare(right.data.name));
}
export async function restoreKnowledgeBase(ctx, companyId, kbNameOrId) {
    const trimmed = asNonEmptyString(kbNameOrId);
    if (!trimmed) {
        throw new Error("id or name is required for restore");
    }
    const allRecords = await listAllByType(ctx, ENTITY_TYPES.knowledgeBase, companyId);
    const target = allRecords.find((record) => record.id === trimmed || record.externalId === trimmed);
    if (!target) {
        throw new Error(`Knowledge base not found: ${trimmed}`);
    }
    const currentData = asRecord(target.data);
    const { __deleted, deletedAt, ...cleanData } = currentData;
    const updated = await entities(ctx).upsert({
        entityType: target.entityType,
        scopeKind: toScopeKind(target.scopeKind),
        scopeId: target.scopeId ?? undefined,
        externalId: target.externalId ?? `${target.entityType}:${target.id}`,
        title: target.title ?? undefined,
        status: "active",
        data: {
            ...cleanData,
            updatedAt: new Date().toISOString(),
        },
    });
    return toKnowledgeBaseRecord(updated);
}
export async function getKnowledgeBaseByName(ctx, companyId, kbName) {
    const normalizedName = asNonEmptyString(kbName);
    if (!normalizedName) {
        return null;
    }
    const found = await findByExternalId(ctx, ENTITY_TYPES.knowledgeBase, companyId, normalizedName);
    return found ? toKnowledgeBaseRecord(found) : null;
}
export async function getKnowledgeBaseById(ctx, id) {
    const found = await getById(ctx, ENTITY_TYPES.knowledgeBase, asNonEmptyString(id));
    return found ? toKnowledgeBaseRecord(found) : null;
}
export async function upsertKnowledgeBase(ctx, companyId, input) {
    const nowIso = new Date().toISOString();
    const name = normalizeRequiredString(input.name, "name");
    const existing = await getKnowledgeBaseByName(ctx, companyId, name);
    const data = toKnowledgeBaseData({
        ...input,
        companyId,
        name,
        updatedAt: nowIso,
    }, nowIso, existing?.data);
    if (!existing) {
        const created = await createEntity(ctx, {
            entityType: ENTITY_TYPES.knowledgeBase,
            scopeKind: "company",
            scopeId: companyId,
            externalId: data.name,
            title: data.name,
            status: "active",
            data: asDataRecord(data),
        });
        return toKnowledgeBaseRecord(created);
    }
    const updated = await updateEntity(ctx, ENTITY_TYPES.knowledgeBase, existing.id, {
        externalId: data.name,
        title: data.name,
        status: "active",
        data: asDataRecord(data),
    });
    return toKnowledgeBaseRecord(updated);
}
export async function deleteKnowledgeBase(ctx, companyId, kbNameOrId) {
    const record = await resolveKnowledgeBaseRecord(ctx, companyId, kbNameOrId);
    if (!record) {
        return;
    }
    const grants = await listAgentKbGrants(ctx, companyId, {
        kbName: record.data.name,
    });
    await Promise.all(grants.map(async (grant) => {
        await deleteEntity(ctx, ENTITY_TYPES.agentKbGrant, grant.id);
    }));
    await deleteEntity(ctx, ENTITY_TYPES.knowledgeBase, record.id);
}
export async function listAgentKbGrants(ctx, companyId, filters) {
    const listed = await listByType(ctx, ENTITY_TYPES.agentKbGrant, companyId);
    const agentName = asNonEmptyString(filters?.agentName);
    const kbName = asNonEmptyString(filters?.kbName);
    return listed
        .map(toGrantRecord)
        .filter((record) => (agentName ? record.data.agentName === agentName : true))
        .filter((record) => (kbName ? record.data.kbName === kbName : true))
        .sort((left, right) => {
        const agentOrder = left.data.agentName.localeCompare(right.data.agentName);
        if (agentOrder !== 0) {
            return agentOrder;
        }
        return left.data.kbName.localeCompare(right.data.kbName);
    });
}
export async function grantKnowledgeBase(ctx, companyId, input) {
    const nowIso = new Date().toISOString();
    const draft = toGrantData(input, nowIso);
    const kb = await getKnowledgeBaseByName(ctx, companyId, draft.kbName);
    if (!kb) {
        throw new Error(`Knowledge base not found: ${draft.kbName}`);
    }
    const externalId = normalizeGrantExternalId(draft.agentName, draft.kbName);
    const existing = await findByExternalId(ctx, ENTITY_TYPES.agentKbGrant, companyId, externalId);
    const data = toGrantData({
        ...draft,
        kbName: kb.data.name,
        grantedAt: nowIso,
    }, nowIso, existing ? toGrantRecord(existing).data : undefined);
    if (!existing) {
        const created = await createEntity(ctx, {
            entityType: ENTITY_TYPES.agentKbGrant,
            scopeKind: "company",
            scopeId: companyId,
            externalId,
            title: `${data.agentName} -> ${data.kbName}`,
            status: "active",
            data: asDataRecord(data),
        });
        return toGrantRecord(created);
    }
    const updated = await updateEntity(ctx, ENTITY_TYPES.agentKbGrant, existing.id, {
        externalId,
        title: `${data.agentName} -> ${data.kbName}`,
        status: "active",
        data: asDataRecord(data),
    });
    return toGrantRecord(updated);
}
export async function revokeKnowledgeBaseGrant(ctx, companyId, input) {
    const grantId = asNonEmptyString(input.grantId);
    if (grantId) {
        const found = await getById(ctx, ENTITY_TYPES.agentKbGrant, grantId);
        if (found && found.scopeId === companyId) {
            await deleteEntity(ctx, ENTITY_TYPES.agentKbGrant, found.id);
        }
        return;
    }
    const agentName = normalizeRequiredString(input.agentName, "agentName");
    const kbName = normalizeRequiredString(input.kbName, "kbName");
    const externalId = normalizeGrantExternalId(agentName, kbName);
    const found = await findByExternalId(ctx, ENTITY_TYPES.agentKbGrant, companyId, externalId);
    if (found) {
        await deleteEntity(ctx, ENTITY_TYPES.agentKbGrant, found.id);
    }
}
export async function listAgentNames(ctx, companyId) {
    const agents = await ctx.agents.list({ companyId, limit: 500, offset: 0 });
    const names = [];
    for (const agent of agents) {
        const name = asNonEmptyString(agent.name);
        if (name) {
            names.push(name);
        }
    }
    return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right));
}
export async function getKnowledgeBaseOverview(ctx, companyId) {
    const [knowledgeBases, grants, agents] = await Promise.all([
        listKnowledgeBases(ctx, companyId),
        listAgentKbGrants(ctx, companyId),
        listAgentNames(ctx, companyId),
    ]);
    return {
        knowledgeBases,
        grants,
        agents,
    };
}
