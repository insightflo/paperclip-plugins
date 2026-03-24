import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";
import { BRIDGE_DIRECTIONS, ENTITY_TYPES } from "./constants.js";

export type BridgeDirection =
  | typeof BRIDGE_DIRECTIONS.twoWay
  | typeof BRIDGE_DIRECTIONS.localToRemote
  | typeof BRIDGE_DIRECTIONS.remoteToLocal;

export type BridgeLinkData = {
  localCompanyId: string;
  localIssueId: string;
  remoteCompanyId: string;
  remoteIssueId: string;
  direction: BridgeDirection;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  lastSyncedStatus?: string;
  lastSyncSourceIssueId?: string;
};

export type BridgeLinkRecord = PluginEntityRecord & { data: BridgeLinkData };

export type SyncStampData = {
  localIssueId: string;
  remoteCompanyId: string;
  remoteIssueId: string;
  status: string;
  createdAt: string;
};

function toEntityData(value: Record<string, unknown>): Record<string, unknown> {
  return value;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asString(item)).filter((item) => item.length > 0);
}

export function normalizeDirection(value: unknown): BridgeDirection {
  const normalized = asString(value).toLowerCase();

  if (normalized === BRIDGE_DIRECTIONS.localToRemote) {
    return BRIDGE_DIRECTIONS.localToRemote;
  }

  if (normalized === BRIDGE_DIRECTIONS.remoteToLocal) {
    return BRIDGE_DIRECTIONS.remoteToLocal;
  }

  return BRIDGE_DIRECTIONS.twoWay;
}

export function mirrorDirection(direction: BridgeDirection): BridgeDirection {
  if (direction === BRIDGE_DIRECTIONS.localToRemote) {
    return BRIDGE_DIRECTIONS.remoteToLocal;
  }

  if (direction === BRIDGE_DIRECTIONS.remoteToLocal) {
    return BRIDGE_DIRECTIONS.localToRemote;
  }

  return BRIDGE_DIRECTIONS.twoWay;
}

export function canPropagateLocalToRemote(direction: BridgeDirection): boolean {
  return direction === BRIDGE_DIRECTIONS.twoWay || direction === BRIDGE_DIRECTIONS.localToRemote;
}

export function toBridgeRecord(record: PluginEntityRecord): BridgeLinkRecord {
  return record as BridgeLinkRecord;
}

export function makeBridgeExternalId(
  localCompanyId: string,
  localIssueId: string,
  remoteCompanyId: string,
  remoteIssueId: string,
): string {
  return `${localCompanyId}:${localIssueId}<->${remoteCompanyId}:${remoteIssueId}`;
}

export function makeSyncStampExternalId(args: {
  localIssueId: string;
  remoteCompanyId: string;
  remoteIssueId: string;
  status: string;
}): string {
  return [
    args.localIssueId,
    args.remoteCompanyId,
    args.remoteIssueId,
    args.status,
  ].join("::");
}

export async function listBridgeLinksByCompany(
  ctx: PluginContext,
  companyId: string,
): Promise<BridgeLinkRecord[]> {
  const listed = await ctx.entities.list({
    entityType: ENTITY_TYPES.bridgeLink,
    scopeKind: "company",
    scopeId: companyId,
    limit: 1000,
  });

  return listed
    .filter((record: PluginEntityRecord) => record.entityType === ENTITY_TYPES.bridgeLink)
    .map((record: PluginEntityRecord) => toBridgeRecord(record));
}

export async function listBridgeLinksForLocalIssue(
  ctx: PluginContext,
  companyId: string,
  localIssueId: string,
): Promise<BridgeLinkRecord[]> {
  const links = await listBridgeLinksByCompany(ctx, companyId);
  return links.filter((link) => link.data.localIssueId === localIssueId);
}

export async function findBridgeByExternalId(
  ctx: PluginContext,
  companyId: string,
  externalId: string,
): Promise<BridgeLinkRecord | null> {
  const listed = await ctx.entities.list({
    entityType: ENTITY_TYPES.bridgeLink,
    scopeKind: "company",
    scopeId: companyId,
    externalId,
    limit: 1,
  });

  const matched = listed.find((record: PluginEntityRecord) => record.entityType === ENTITY_TYPES.bridgeLink);
  return matched ? toBridgeRecord(matched) : null;
}

async function upsertBridgeLink(
  ctx: PluginContext,
  params: {
    localCompanyId: string;
    localIssueId: string;
    remoteCompanyId: string;
    remoteIssueId: string;
    direction: BridgeDirection;
    createdBy: string;
  },
): Promise<BridgeLinkRecord> {
  const now = new Date().toISOString();
  const externalId = makeBridgeExternalId(
    params.localCompanyId,
    params.localIssueId,
    params.remoteCompanyId,
    params.remoteIssueId,
  );
  const current = await findBridgeByExternalId(ctx, params.localCompanyId, externalId);

  const nextData: BridgeLinkData = {
    localCompanyId: params.localCompanyId,
    localIssueId: params.localIssueId,
    remoteCompanyId: params.remoteCompanyId,
    remoteIssueId: params.remoteIssueId,
    direction: params.direction,
    createdBy: current?.data.createdBy ?? params.createdBy,
    createdAt: current?.data.createdAt ?? now,
    updatedAt: now,
    lastSyncedAt: current?.data.lastSyncedAt,
    lastSyncedStatus: current?.data.lastSyncedStatus,
    lastSyncSourceIssueId: current?.data.lastSyncSourceIssueId,
  };

  if (current) {
    const updated = await ctx.entities.update(current.id, {
      title: `Bridge ${params.localIssueId} -> ${params.remoteCompanyId}:${params.remoteIssueId}`,
      status: "active",
      data: toEntityData(nextData as unknown as Record<string, unknown>),
    });
    return toBridgeRecord(updated);
  }

  const created = await ctx.entities.create({
    entityType: ENTITY_TYPES.bridgeLink,
    scopeKind: "company",
    scopeId: params.localCompanyId,
    externalId,
    title: `Bridge ${params.localIssueId} -> ${params.remoteCompanyId}:${params.remoteIssueId}`,
    status: "active",
    data: toEntityData(nextData as unknown as Record<string, unknown>),
  });
  return toBridgeRecord(created);
}

export async function upsertBridgePair(
  ctx: PluginContext,
  params: {
    localCompanyId: string;
    localIssueId: string;
    remoteCompanyId: string;
    remoteIssueId: string;
    direction: BridgeDirection;
    createdBy: string;
  },
): Promise<{ local: BridgeLinkRecord; mirror: BridgeLinkRecord }> {
  const local = await upsertBridgeLink(ctx, params);
  const mirror = await upsertBridgeLink(ctx, {
    localCompanyId: params.remoteCompanyId,
    localIssueId: params.remoteIssueId,
    remoteCompanyId: params.localCompanyId,
    remoteIssueId: params.localIssueId,
    direction: mirrorDirection(params.direction),
    createdBy: params.createdBy,
  });

  return { local, mirror };
}

export async function touchBridgeSyncMeta(
  ctx: PluginContext,
  link: BridgeLinkRecord,
  syncInfo: {
    syncedAt: string;
    status: string;
    sourceIssueId: string;
  },
): Promise<BridgeLinkRecord> {
  const nextData: BridgeLinkData = {
    ...link.data,
    updatedAt: syncInfo.syncedAt,
    lastSyncedAt: syncInfo.syncedAt,
    lastSyncedStatus: syncInfo.status,
    lastSyncSourceIssueId: syncInfo.sourceIssueId,
  };

  const updated = await ctx.entities.update(link.id, {
    title: link.title,
    status: link.status,
    data: toEntityData(nextData as unknown as Record<string, unknown>),
  });

  return toBridgeRecord(updated);
}

export async function hasActiveSyncStamp(
  ctx: PluginContext,
  companyId: string,
  externalId: string,
  ttlMs: number,
): Promise<boolean> {
  const listed = await ctx.entities.list({
    entityType: ENTITY_TYPES.syncStamp,
    scopeKind: "company",
    scopeId: companyId,
    externalId,
    limit: 1,
  });

  const matched = listed.find((record: PluginEntityRecord) => record.entityType === ENTITY_TYPES.syncStamp);
  if (!matched) {
    return false;
  }

  const data = asRecord(matched.data) as Partial<SyncStampData>;
  const createdAt = asString(data.createdAt);
  if (!createdAt) {
    return false;
  }

  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) {
    return false;
  }

  const ageMs = Date.now() - createdMs;
  return ageMs >= 0 && ageMs <= ttlMs;
}

export async function upsertSyncStamp(
  ctx: PluginContext,
  companyId: string,
  externalId: string,
  data: SyncStampData,
): Promise<void> {
  const listed = await ctx.entities.list({
    entityType: ENTITY_TYPES.syncStamp,
    scopeKind: "company",
    scopeId: companyId,
    externalId,
    limit: 1,
  });

  const matched = listed.find((record: PluginEntityRecord) => record.entityType === ENTITY_TYPES.syncStamp);
  if (matched) {
    await ctx.entities.update(matched.id, {
      title: `Sync stamp ${data.localIssueId} -> ${data.remoteCompanyId}:${data.remoteIssueId}`,
      status: "active",
      data: toEntityData(data as unknown as Record<string, unknown>),
    });
    return;
  }

  await ctx.entities.create({
    entityType: ENTITY_TYPES.syncStamp,
    scopeKind: "company",
    scopeId: companyId,
    externalId,
    title: `Sync stamp ${data.localIssueId} -> ${data.remoteCompanyId}:${data.remoteIssueId}`,
    status: "active",
    data: toEntityData(data as unknown as Record<string, unknown>),
  });
}

export async function isEventProcessed(
  ctx: PluginContext,
  companyId: string,
  eventId: string,
): Promise<boolean> {
  const listed = await ctx.entities.list({
    entityType: ENTITY_TYPES.idempotency,
    scopeKind: "company",
    scopeId: companyId,
    externalId: eventId,
    limit: 1,
  });

  return listed.length > 0;
}

export async function markEventProcessed(
  ctx: PluginContext,
  companyId: string,
  eventId: string,
): Promise<void> {
  await ctx.entities.create({
    entityType: ENTITY_TYPES.idempotency,
    scopeKind: "company",
    scopeId: companyId,
    externalId: eventId,
    title: `Processed event ${eventId}`,
    status: "processed",
    data: {
      processedAt: new Date().toISOString(),
    },
  });
}
