import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";
import { BRIDGE_DIRECTIONS } from "./constants.js";
export type BridgeDirection = typeof BRIDGE_DIRECTIONS.twoWay | typeof BRIDGE_DIRECTIONS.localToRemote | typeof BRIDGE_DIRECTIONS.remoteToLocal;
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
export type BridgeLinkRecord = PluginEntityRecord & {
    data: BridgeLinkData;
};
export type SyncStampData = {
    localIssueId: string;
    remoteCompanyId: string;
    remoteIssueId: string;
    status: string;
    createdAt: string;
};
export declare function asRecord(value: unknown): Record<string, unknown>;
export declare function asString(value: unknown): string;
export declare function asStringArray(value: unknown): string[];
export declare function normalizeDirection(value: unknown): BridgeDirection;
export declare function mirrorDirection(direction: BridgeDirection): BridgeDirection;
export declare function canPropagateLocalToRemote(direction: BridgeDirection): boolean;
export declare function toBridgeRecord(record: PluginEntityRecord): BridgeLinkRecord;
export declare function makeBridgeExternalId(localCompanyId: string, localIssueId: string, remoteCompanyId: string, remoteIssueId: string): string;
export declare function makeSyncStampExternalId(args: {
    localIssueId: string;
    remoteCompanyId: string;
    remoteIssueId: string;
    status: string;
}): string;
export declare function listBridgeLinksByCompany(ctx: PluginContext, companyId: string): Promise<BridgeLinkRecord[]>;
export declare function listBridgeLinksForLocalIssue(ctx: PluginContext, companyId: string, localIssueId: string): Promise<BridgeLinkRecord[]>;
export declare function findBridgeByExternalId(ctx: PluginContext, companyId: string, externalId: string): Promise<BridgeLinkRecord | null>;
export declare function upsertBridgePair(ctx: PluginContext, params: {
    localCompanyId: string;
    localIssueId: string;
    remoteCompanyId: string;
    remoteIssueId: string;
    direction: BridgeDirection;
    createdBy: string;
}): Promise<{
    local: BridgeLinkRecord;
    mirror: BridgeLinkRecord;
}>;
export declare function touchBridgeSyncMeta(ctx: PluginContext, link: BridgeLinkRecord, syncInfo: {
    syncedAt: string;
    status: string;
    sourceIssueId: string;
}): Promise<BridgeLinkRecord>;
export declare function hasActiveSyncStamp(ctx: PluginContext, companyId: string, externalId: string, ttlMs: number): Promise<boolean>;
export declare function upsertSyncStamp(ctx: PluginContext, companyId: string, externalId: string, data: SyncStampData): Promise<void>;
export declare function isEventProcessed(ctx: PluginContext, companyId: string, eventId: string): Promise<boolean>;
export declare function markEventProcessed(ctx: PluginContext, companyId: string, eventId: string): Promise<void>;
