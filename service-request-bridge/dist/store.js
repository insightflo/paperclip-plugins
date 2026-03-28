import { BRIDGE_DIRECTIONS, ENTITY_TYPES } from "./constants.js";
function toEntityData(value) {
    return value;
}
function toScopeKind(value) {
    if (value === "instance" || value === "company" || value === "project" || value === "issue") {
        return value;
    }
    return "company";
}
export function asRecord(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return value;
}
export function asString(value) {
    return typeof value === "string" ? value.trim() : "";
}
export function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => asString(item)).filter((item) => item.length > 0);
}
export function normalizeDirection(value) {
    const normalized = asString(value).toLowerCase();
    if (normalized === BRIDGE_DIRECTIONS.localToRemote) {
        return BRIDGE_DIRECTIONS.localToRemote;
    }
    if (normalized === BRIDGE_DIRECTIONS.remoteToLocal) {
        return BRIDGE_DIRECTIONS.remoteToLocal;
    }
    return BRIDGE_DIRECTIONS.twoWay;
}
export function mirrorDirection(direction) {
    if (direction === BRIDGE_DIRECTIONS.localToRemote) {
        return BRIDGE_DIRECTIONS.remoteToLocal;
    }
    if (direction === BRIDGE_DIRECTIONS.remoteToLocal) {
        return BRIDGE_DIRECTIONS.localToRemote;
    }
    return BRIDGE_DIRECTIONS.twoWay;
}
export function canPropagateLocalToRemote(direction) {
    return direction === BRIDGE_DIRECTIONS.twoWay || direction === BRIDGE_DIRECTIONS.localToRemote;
}
export function toBridgeRecord(record) {
    return record;
}
export function makeBridgeExternalId(localCompanyId, localIssueId, remoteCompanyId, remoteIssueId) {
    return `${localCompanyId}:${localIssueId}<->${remoteCompanyId}:${remoteIssueId}`;
}
export function makeSyncStampExternalId(args) {
    return [
        args.localIssueId,
        args.remoteCompanyId,
        args.remoteIssueId,
        args.status,
    ].join("::");
}
async function listCompanyEntitiesByType(ctx, entityType, companyId) {
    const pageSize = 500;
    let offset = 0;
    const all = [];
    while (true) {
        const listed = await ctx.entities.list({
            entityType,
            scopeKind: "company",
            scopeId: companyId,
            limit: pageSize,
            offset,
        });
        all.push(...listed.filter((record) => record.entityType === entityType));
        if (listed.length < pageSize) {
            break;
        }
        offset += listed.length;
    }
    return all;
}
export async function listBridgeLinksByCompany(ctx, companyId) {
    const listed = await listCompanyEntitiesByType(ctx, ENTITY_TYPES.bridgeLink, companyId);
    return listed
        .map((record) => toBridgeRecord(record));
}
export async function listBridgeLinksForLocalIssue(ctx, companyId, localIssueId) {
    const links = await listBridgeLinksByCompany(ctx, companyId);
    return links.filter((link) => link.data.localIssueId === localIssueId);
}
export async function findBridgeByExternalId(ctx, companyId, externalId) {
    const listed = await listCompanyEntitiesByType(ctx, ENTITY_TYPES.bridgeLink, companyId);
    const matched = listed.find((record) => record.externalId === externalId);
    return matched ? toBridgeRecord(matched) : null;
}
async function upsertBridgeLink(ctx, params) {
    const now = new Date().toISOString();
    const externalId = makeBridgeExternalId(params.localCompanyId, params.localIssueId, params.remoteCompanyId, params.remoteIssueId);
    const current = await findBridgeByExternalId(ctx, params.localCompanyId, externalId);
    const nextData = {
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
    const upserted = await ctx.entities.upsert({
        entityType: ENTITY_TYPES.bridgeLink,
        scopeKind: toScopeKind(current?.scopeKind),
        scopeId: current?.scopeId ?? params.localCompanyId,
        externalId,
        title: `Bridge ${params.localIssueId} -> ${params.remoteCompanyId}:${params.remoteIssueId}`,
        status: "active",
        data: toEntityData(nextData),
    });
    return toBridgeRecord(upserted);
}
export async function upsertBridgePair(ctx, params) {
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
export async function touchBridgeSyncMeta(ctx, link, syncInfo) {
    const nextData = {
        ...link.data,
        updatedAt: syncInfo.syncedAt,
        lastSyncedAt: syncInfo.syncedAt,
        lastSyncedStatus: syncInfo.status,
        lastSyncSourceIssueId: syncInfo.sourceIssueId,
    };
    const updated = await ctx.entities.upsert({
        entityType: link.entityType,
        scopeKind: toScopeKind(link.scopeKind),
        scopeId: link.scopeId ?? undefined,
        externalId: link.externalId ?? makeBridgeExternalId(link.data.localCompanyId, link.data.localIssueId, link.data.remoteCompanyId, link.data.remoteIssueId),
        title: link.title ?? undefined,
        status: link.status ?? undefined,
        data: toEntityData(nextData),
    });
    return toBridgeRecord(updated);
}
export async function hasActiveSyncStamp(ctx, companyId, externalId, ttlMs) {
    const listed = await listCompanyEntitiesByType(ctx, ENTITY_TYPES.syncStamp, companyId);
    const matched = listed.find((record) => record.externalId === externalId);
    if (!matched) {
        return false;
    }
    const data = asRecord(matched.data);
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
export async function upsertSyncStamp(ctx, companyId, externalId, data) {
    const listed = await listCompanyEntitiesByType(ctx, ENTITY_TYPES.syncStamp, companyId);
    const matched = listed.find((record) => record.externalId === externalId) ?? null;
    const nextData = {
        ...data,
        createdAt: asString(asRecord(matched?.data).createdAt) || data.createdAt,
    };
    await ctx.entities.upsert({
        entityType: ENTITY_TYPES.syncStamp,
        scopeKind: toScopeKind(matched?.scopeKind),
        scopeId: matched?.scopeId ?? companyId,
        externalId,
        title: `Sync stamp ${nextData.localIssueId} -> ${nextData.remoteCompanyId}:${nextData.remoteIssueId}`,
        status: "active",
        data: toEntityData(nextData),
    });
}
export async function isEventProcessed(ctx, companyId, eventId) {
    const listed = await listCompanyEntitiesByType(ctx, ENTITY_TYPES.idempotency, companyId);
    return listed.some((record) => record.externalId === eventId);
}
export async function markEventProcessed(ctx, companyId, eventId) {
    await ctx.entities.upsert({
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
