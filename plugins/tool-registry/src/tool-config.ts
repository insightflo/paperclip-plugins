import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";
import { ENTITY_TYPES } from "./constants.js";

export type JsonRecord = Record<string, unknown>;

type PluginEntityScopeKind = "instance" | "company" | "project" | "project_workspace" | "agent" | "issue" | "goal" | "run";

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

export interface ToolConfig {
  name: string;
  command: string;
  workingDirectory?: string;
  env?: Record<string, string>;
  requiresApproval: boolean;
  description?: string;
  argsSchema?: JsonRecord;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolGrant {
  agentName: string;
  toolName: string;
  grantedBy: string;
  grantedAt: string;
}

export interface ToolConfigRecord {
  id: string;
  entityType: string;
  scopeKind: string;
  scopeId: string | null;
  externalId: string | null;
  title: string | null;
  status: string | null;
  data: ToolConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolGrantRecord {
  id: string;
  entityType: string;
  scopeKind: string;
  scopeId: string | null;
  externalId: string | null;
  title: string | null;
  status: string | null;
  data: AgentToolGrant;
  createdAt: string;
  updatedAt: string;
}

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

function normalizeName(value: unknown, fieldName: string): string {
  const normalized = asNonEmptyString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function normalizeEnv(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
    .map(([key, raw]) => [key.trim(), raw] as const)
    .filter(([key, raw]) => key.length > 0 && raw.length > 0);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function normalizeArgsSchema(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return value as JsonRecord;
}

function toToolConfigData(input: Partial<ToolConfig>, nowIso: string): ToolConfig {
  return {
    name: normalizeName(input.name, "name"),
    command: normalizeName(input.command, "command"),
    workingDirectory: asNonEmptyString(input.workingDirectory) || undefined,
    env: normalizeEnv(input.env),
    requiresApproval: normalizeBoolean(input.requiresApproval, false),
    description: asNonEmptyString(input.description) || undefined,
    argsSchema: normalizeArgsSchema(input.argsSchema),
    createdBy: asNonEmptyString(input.createdBy) || undefined,
    createdAt: asNonEmptyString(input.createdAt) || nowIso,
    updatedAt: asNonEmptyString(input.updatedAt) || nowIso,
  };
}

function toGrantData(input: Partial<AgentToolGrant>, nowIso: string): AgentToolGrant {
  return {
    agentName: normalizeName(input.agentName, "agentName"),
    toolName: normalizeName(input.toolName, "toolName"),
    grantedBy: normalizeName(input.grantedBy, "grantedBy"),
    grantedAt: asNonEmptyString(input.grantedAt) || nowIso,
  };
}

function asDataRecord<T extends object>(value: T): JsonRecord {
  return value as unknown as JsonRecord;
}

function queryWithOptionalId(
  query: EntityQuery,
  id?: string,
): EntityQuery {
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
    limit: 500,
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

  const direct = directMatches.find((record: PluginEntityRecord) => record.externalId === externalId);
  if (direct) {
    return direct;
  }

  const all = await listByType(ctx, entityType, companyId);
  return all.find((record: PluginEntityRecord) => record.externalId === externalId) ?? null;
}

async function getById(
  ctx: PluginContext,
  entityType: string,
  id: string,
): Promise<PluginEntityRecord | null> {
  const listClient = entities(ctx);
  const withId = await listClient.list(queryWithOptionalId({ entityType, limit: 10 } as EntityQuery, id));
  const fromList = withId.find((record: PluginEntityRecord) => record.id === id && record.entityType === entityType) ?? null;
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

function toToolConfigRecord(record: PluginEntityRecord): ToolConfigRecord {
  return {
    ...record,
    data: toToolConfigData(asRecord(record.data) as Partial<ToolConfig>, record.updatedAt),
  };
}

function toGrantRecord(record: PluginEntityRecord): AgentToolGrantRecord {
  return {
    ...record,
    data: toGrantData(asRecord(record.data) as Partial<AgentToolGrant>, record.updatedAt),
  };
}

export async function createTool(
  ctx: PluginContext,
  companyId: string,
  input: Partial<ToolConfig>,
): Promise<ToolConfigRecord> {
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

export async function updateTool(
  ctx: PluginContext,
  companyId: string,
  toolName: string,
  patch: Partial<ToolConfig>,
): Promise<ToolConfigRecord> {
  const normalizedToolName = normalizeName(toolName, "toolName");
  const existing = await findByExternalId(ctx, ENTITY_TYPES.toolConfig, companyId, normalizedToolName);
  if (!existing) {
    throw new Error(`Tool not found: ${normalizedToolName}`);
  }

  const current = toToolConfigRecord(existing);
  const merged = toToolConfigData(
    {
      ...current.data,
      ...patch,
      name: current.data.name,
      createdAt: current.data.createdAt,
      updatedAt: new Date().toISOString(),
    },
    new Date().toISOString(),
  );

  const updated = await updateEntity(ctx, existing.id, {
    title: merged.name,
    status: "active",
    externalId: merged.name,
    data: asDataRecord(merged),
  });

  return toToolConfigRecord(updated);
}

export async function deleteTool(
  ctx: PluginContext,
  companyId: string,
  toolName: string,
): Promise<void> {
  const normalizedToolName = normalizeName(toolName, "toolName");
  const existing = await findByExternalId(ctx, ENTITY_TYPES.toolConfig, companyId, normalizedToolName);
  if (!existing) {
    return;
  }

  await deleteEntity(ctx, existing.id);
}

export async function getToolByName(
  ctx: PluginContext,
  companyId: string,
  toolName: string,
): Promise<ToolConfigRecord | null> {
  const normalizedToolName = normalizeName(toolName, "toolName");
  const found = await findByExternalId(ctx, ENTITY_TYPES.toolConfig, companyId, normalizedToolName);
  return found ? toToolConfigRecord(found) : null;
}

export async function listTools(
  ctx: PluginContext,
  companyId: string,
): Promise<ToolConfigRecord[]> {
  const records = await listByType(ctx, ENTITY_TYPES.toolConfig, companyId);
  return records
    .map((record) => toToolConfigRecord(record))
    .sort((left, right) => left.data.name.localeCompare(right.data.name));
}

export async function grantTool(
  ctx: PluginContext,
  companyId: string,
  input: Partial<AgentToolGrant>,
): Promise<AgentToolGrantRecord> {
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

export async function revokeTool(
  ctx: PluginContext,
  companyId: string,
  agentName: string,
  toolName: string,
): Promise<void> {
  const normalizedAgentName = normalizeName(agentName, "agentName");
  const normalizedToolName = normalizeName(toolName, "toolName");
  const externalId = `${normalizedAgentName}::${normalizedToolName}`;
  const existing = await findByExternalId(ctx, ENTITY_TYPES.agentToolGrant, companyId, externalId);

  if (!existing) {
    return;
  }

  await deleteEntity(ctx, existing.id);
}

export async function listAgentGrants(
  ctx: PluginContext,
  companyId: string,
  filters?: { agentName?: string; toolName?: string },
): Promise<AgentToolGrantRecord[]> {
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

export async function isToolGrantedToAgent(
  ctx: PluginContext,
  companyId: string,
  agentName: string,
  toolName: string,
): Promise<boolean> {
  const grants = await listAgentGrants(ctx, companyId, {
    agentName,
    toolName,
  });

  return grants.length > 0;
}

export async function getEntityRecordById(
  ctx: PluginContext,
  entityType: string,
  id: string,
): Promise<PluginEntityRecord | null> {
  return await getById(ctx, entityType, id);
}
