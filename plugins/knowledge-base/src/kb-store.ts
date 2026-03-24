import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_MAX_TOKEN_BUDGET,
  ENTITY_TYPES,
  KB_TYPES,
} from "./constants.js";

type JsonRecord = Record<string, unknown>;

type PluginEntityScopeKind =
  | "instance"
  | "company"
  | "project"
  | "project_workspace"
  | "agent"
  | "issue"
  | "goal"
  | "run";

type EntityQuery = Parameters<PluginContext["entities"]["list"]>[0];

type EntityCreateInput = {
  entityType: string;
  scopeKind: PluginEntityScopeKind;
  scopeId?: string;
  externalId?: string;
  title?: string;
  status?: string;
  data: JsonRecord;
};

type EntityUpdateInput = {
  externalId?: string;
  title?: string;
  status?: string;
  data?: JsonRecord;
};

type EntitiesCompatClient = PluginContext["entities"] & {
  get?: (id: string) => Promise<PluginEntityRecord | null>;
  create?: (input: EntityCreateInput) => Promise<PluginEntityRecord>;
  update?: (id: string, patch: EntityUpdateInput) => Promise<PluginEntityRecord>;
  delete?: (id: string) => Promise<void>;
  upsert?: (input: EntityCreateInput) => Promise<PluginEntityRecord>;
};

export type KnowledgeBaseType = "static" | "rag" | "ontology";

export interface KnowledgeBaseData {
  name: string;
  type: KnowledgeBaseType;
  description?: string;
  companyId: string;
  maxTokenBudget: number;
  staticConfig?: {
    content: string;
  };
  ragConfig?: {
    mcpServerUrl?: string;
    topK?: number;
  };
  ontologyConfig?: {
    kgPath?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentKBGrantData {
  agentName: string;
  kbName: string;
  grantedBy: string;
  grantedAt: string;
}

export type KnowledgeBaseRecord = Omit<PluginEntityRecord, "data"> & {
  data: KnowledgeBaseData;
};

export type AgentKBGrantRecord = Omit<PluginEntityRecord, "data"> & {
  data: AgentKBGrantData;
};

type AgentRecord = Awaited<ReturnType<PluginContext["agents"]["list"]>>[number];

function entities(ctx: PluginContext): EntitiesCompatClient {
  return ctx.entities as unknown as EntitiesCompatClient;
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as JsonRecord;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  const normalized = asNonEmptyString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeKnowledgeBaseType(value: unknown): KnowledgeBaseType {
  const normalized = asNonEmptyString(value).toLowerCase();

  if (normalized === KB_TYPES.static || normalized === KB_TYPES.rag || normalized === KB_TYPES.ontology) {
    return normalized as KnowledgeBaseType;
  }

  return KB_TYPES.static;
}

function normalizeMaxTokenBudget(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_TOKEN_BUDGET;
  }

  const rounded = Math.floor(value);
  if (rounded <= 0) {
    return DEFAULT_MAX_TOKEN_BUDGET;
  }

  return rounded;
}

function normalizeStaticConfig(value: unknown): KnowledgeBaseData["staticConfig"] {
  const config = asRecord(value);
  return {
    content: typeof config.content === "string" ? config.content : "",
  };
}

function normalizeRagConfig(value: unknown): KnowledgeBaseData["ragConfig"] {
  const config = asRecord(value);
  const mcpServerUrl = asNonEmptyString(config.mcpServerUrl);

  let topK: number | undefined;
  if (typeof config.topK === "number" && Number.isFinite(config.topK) && config.topK > 0) {
    topK = Math.floor(config.topK);
  }

  return {
    mcpServerUrl: mcpServerUrl || undefined,
    topK,
  };
}

function normalizeOntologyConfig(value: unknown): KnowledgeBaseData["ontologyConfig"] {
  const config = asRecord(value);
  const kgPath = asNonEmptyString(config.kgPath);

  return {
    kgPath: kgPath || undefined,
  };
}

function toKnowledgeBaseData(
  input: Partial<KnowledgeBaseData>,
  nowIso: string,
  fallback?: KnowledgeBaseData,
): KnowledgeBaseData {
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

function toGrantData(
  input: Partial<AgentKBGrantData>,
  nowIso: string,
  fallback?: AgentKBGrantData,
): AgentKBGrantData {
  return {
    agentName: normalizeRequiredString(input.agentName ?? fallback?.agentName, "agentName"),
    kbName: normalizeRequiredString(input.kbName ?? fallback?.kbName, "kbName"),
    grantedBy: normalizeRequiredString(input.grantedBy ?? fallback?.grantedBy, "grantedBy"),
    grantedAt: asNonEmptyString(input.grantedAt ?? fallback?.grantedAt) || nowIso,
  };
}

function asDataRecord<T extends object>(value: T): JsonRecord {
  return value as unknown as JsonRecord;
}

function queryWithOptionalId(query: EntityQuery, id?: string): EntityQuery {
  if (!id) {
    return query;
  }

  return {
    ...(query as JsonRecord),
    id,
  } as EntityQuery;
}

async function listByType(
  ctx: PluginContext,
  entityType: string,
  companyId: string,
): Promise<PluginEntityRecord[]> {
  const listed = await entities(ctx).list({
    entityType,
    scopeKind: "company",
    scopeId: companyId,
    limit: 1000,
  } as EntityQuery);

  return listed
    .filter((record: PluginEntityRecord) => record.entityType === entityType)
    .filter((record: PluginEntityRecord) => asRecord(record.data).__deleted !== true);
}

async function findByExternalId(
  ctx: PluginContext,
  entityType: string,
  companyId: string,
  externalId: string,
): Promise<PluginEntityRecord | null> {
  const listClient = entities(ctx);

  const directMatches = await listClient.list({
    entityType,
    scopeKind: "company",
    scopeId: companyId,
    externalId,
    limit: 20,
  } as EntityQuery);

  const direct = directMatches.find((record: PluginEntityRecord) => record.externalId === externalId) ?? null;
  if (direct) {
    return direct;
  }

  const fallback = await listByType(ctx, entityType, companyId);
  return fallback.find((record: PluginEntityRecord) => record.externalId === externalId) ?? null;
}

async function getById(
  ctx: PluginContext,
  entityType: string,
  id: string,
): Promise<PluginEntityRecord | null> {
  const listClient = entities(ctx);
  const withId = await listClient.list(queryWithOptionalId({ entityType, limit: 10 } as EntityQuery, id));
  const fromList = withId.find(
    (record: PluginEntityRecord) => record.id === id && record.entityType === entityType,
  ) ?? null;

  if (fromList) {
    return fromList;
  }

  if (typeof listClient.get === "function") {
    const viaGet = await listClient.get(id);
    if (viaGet && viaGet.entityType === entityType) {
      return viaGet;
    }
  }

  return null;
}

async function createEntity(ctx: PluginContext, input: EntityCreateInput): Promise<PluginEntityRecord> {
  const client = entities(ctx);

  if (typeof client.create === "function") {
    return await client.create(input);
  }

  if (typeof client.upsert === "function") {
    return await client.upsert(input);
  }

  throw new Error("ctx.entities.create/upsert is not available on this host runtime");
}

async function updateEntity(
  ctx: PluginContext,
  id: string,
  patch: EntityUpdateInput,
): Promise<PluginEntityRecord> {
  const client = entities(ctx);

  if (typeof client.update === "function") {
    return await client.update(id, patch);
  }

  if (typeof client.get === "function" && typeof client.upsert === "function") {
    const current = await client.get(id);
    if (!current) {
      throw new Error(`Entity not found: ${id}`);
    }

    return await client.upsert({
      entityType: current.entityType,
      scopeKind: current.scopeKind as PluginEntityScopeKind,
      scopeId: current.scopeId ?? undefined,
      externalId: patch.externalId ?? current.externalId ?? undefined,
      title: patch.title ?? current.title ?? undefined,
      status: patch.status ?? current.status ?? undefined,
      data: patch.data ?? asRecord(current.data),
    });
  }

  throw new Error("ctx.entities.update is not available on this host runtime");
}

async function deleteEntity(ctx: PluginContext, id: string): Promise<void> {
  const client = entities(ctx);

  if (typeof client.delete === "function") {
    await client.delete(id);
    return;
  }

  if (typeof client.get === "function" && typeof client.update === "function") {
    const current = await client.get(id);
    if (!current) {
      return;
    }

    await client.update(id, {
      status: "deleted",
      data: {
        ...asRecord(current.data),
        __deleted: true,
        deletedAt: new Date().toISOString(),
      },
    });
    return;
  }

  throw new Error("ctx.entities.delete is not available on this host runtime");
}

function toKnowledgeBaseRecord(record: PluginEntityRecord): KnowledgeBaseRecord {
  return {
    ...record,
    data: toKnowledgeBaseData(asRecord(record.data) as Partial<KnowledgeBaseData>, record.updatedAt),
  };
}

function toGrantRecord(record: PluginEntityRecord): AgentKBGrantRecord {
  return {
    ...record,
    data: toGrantData(asRecord(record.data) as Partial<AgentKBGrantData>, record.updatedAt),
  };
}

function normalizeGrantExternalId(agentName: string, kbName: string): string {
  return `${agentName}::${kbName}`;
}

async function resolveKnowledgeBaseRecord(
  ctx: PluginContext,
  companyId: string,
  kbNameOrId: string,
): Promise<KnowledgeBaseRecord | null> {
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

export async function listKnowledgeBases(
  ctx: PluginContext,
  companyId: string,
): Promise<KnowledgeBaseRecord[]> {
  const listed = await listByType(ctx, ENTITY_TYPES.knowledgeBase, companyId);

  return listed
    .map(toKnowledgeBaseRecord)
    .sort((left, right) => left.data.name.localeCompare(right.data.name));
}

export async function getKnowledgeBaseByName(
  ctx: PluginContext,
  companyId: string,
  kbName: string,
): Promise<KnowledgeBaseRecord | null> {
  const normalizedName = asNonEmptyString(kbName);
  if (!normalizedName) {
    return null;
  }

  const found = await findByExternalId(ctx, ENTITY_TYPES.knowledgeBase, companyId, normalizedName);
  return found ? toKnowledgeBaseRecord(found) : null;
}

export async function getKnowledgeBaseById(
  ctx: PluginContext,
  id: string,
): Promise<KnowledgeBaseRecord | null> {
  const found = await getById(ctx, ENTITY_TYPES.knowledgeBase, asNonEmptyString(id));
  return found ? toKnowledgeBaseRecord(found) : null;
}

export async function upsertKnowledgeBase(
  ctx: PluginContext,
  companyId: string,
  input: Partial<KnowledgeBaseData> & { name: string; type?: KnowledgeBaseType },
): Promise<KnowledgeBaseRecord> {
  const nowIso = new Date().toISOString();
  const name = normalizeRequiredString(input.name, "name");
  const existing = await getKnowledgeBaseByName(ctx, companyId, name);
  const data = toKnowledgeBaseData(
    {
      ...input,
      companyId,
      name,
      updatedAt: nowIso,
    },
    nowIso,
    existing?.data,
  );

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

  const updated = await updateEntity(ctx, existing.id, {
    externalId: data.name,
    title: data.name,
    status: "active",
    data: asDataRecord(data),
  });

  return toKnowledgeBaseRecord(updated);
}

export async function deleteKnowledgeBase(
  ctx: PluginContext,
  companyId: string,
  kbNameOrId: string,
): Promise<void> {
  const record = await resolveKnowledgeBaseRecord(ctx, companyId, kbNameOrId);
  if (!record) {
    return;
  }

  const grants = await listAgentKbGrants(ctx, companyId, {
    kbName: record.data.name,
  });

  await Promise.all(grants.map(async (grant) => {
    await deleteEntity(ctx, grant.id);
  }));

  await deleteEntity(ctx, record.id);
}

export async function listAgentKbGrants(
  ctx: PluginContext,
  companyId: string,
  filters?: {
    agentName?: string;
    kbName?: string;
  },
): Promise<AgentKBGrantRecord[]> {
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

export async function grantKnowledgeBase(
  ctx: PluginContext,
  companyId: string,
  input: Partial<AgentKBGrantData>,
): Promise<AgentKBGrantRecord> {
  const nowIso = new Date().toISOString();
  const draft = toGrantData(input, nowIso);
  const kb = await getKnowledgeBaseByName(ctx, companyId, draft.kbName);

  if (!kb) {
    throw new Error(`Knowledge base not found: ${draft.kbName}`);
  }

  const externalId = normalizeGrantExternalId(draft.agentName, draft.kbName);
  const existing = await findByExternalId(ctx, ENTITY_TYPES.agentKbGrant, companyId, externalId);
  const data = toGrantData(
    {
      ...draft,
      kbName: kb.data.name,
      grantedAt: nowIso,
    },
    nowIso,
    existing ? toGrantRecord(existing).data : undefined,
  );

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

  const updated = await updateEntity(ctx, existing.id, {
    externalId,
    title: `${data.agentName} -> ${data.kbName}`,
    status: "active",
    data: asDataRecord(data),
  });

  return toGrantRecord(updated);
}

export async function revokeKnowledgeBaseGrant(
  ctx: PluginContext,
  companyId: string,
  input: {
    grantId?: string;
    agentName?: string;
    kbName?: string;
  },
): Promise<void> {
  const grantId = asNonEmptyString(input.grantId);

  if (grantId) {
    const found = await getById(ctx, ENTITY_TYPES.agentKbGrant, grantId);
    if (found && found.scopeId === companyId) {
      await deleteEntity(ctx, found.id);
    }
    return;
  }

  const agentName = normalizeRequiredString(input.agentName, "agentName");
  const kbName = normalizeRequiredString(input.kbName, "kbName");
  const externalId = normalizeGrantExternalId(agentName, kbName);
  const found = await findByExternalId(ctx, ENTITY_TYPES.agentKbGrant, companyId, externalId);

  if (found) {
    await deleteEntity(ctx, found.id);
  }
}

export async function listAgentNames(
  ctx: PluginContext,
  companyId: string,
): Promise<string[]> {
  const agents = await ctx.agents.list({ companyId, limit: 500, offset: 0 });
  const names: string[] = [];

  for (const agent of agents as AgentRecord[]) {
    const name = asNonEmptyString((agent as { name?: unknown }).name);
    if (name) {
      names.push(name);
    }
  }

  return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right));
}

export async function getKnowledgeBaseOverview(
  ctx: PluginContext,
  companyId: string,
): Promise<{
  knowledgeBases: KnowledgeBaseRecord[];
  grants: AgentKBGrantRecord[];
  agents: string[];
}> {
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
