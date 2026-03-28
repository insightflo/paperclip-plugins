export declare const PLUGIN_ID = "insightflo.service-request-bridge";
export declare const PLUGIN_VERSION = "0.1.0";
export declare const SLOT_IDS: {
    readonly listTab: "service-request-bridge-list-tab";
    readonly detailTab: "service-request-bridge-detail-tab";
    readonly dashboardWidget: "service-request-bridge-dashboard-widget";
    readonly sidebar: "service-request-bridge-sidebar-link";
};
export declare const EXPORT_NAMES: {
    readonly listTab: "ServiceRequestBridgeListTab";
    readonly detailTab: "ServiceRequestBridgeDetailTab";
    readonly dashboardWidget: "BridgeDashboardWidget";
    readonly sidebar: "BridgeSidebarLink";
};
export declare const ENTITY_TYPES: {
    readonly bridgeLink: "service-request-bridge-link";
    readonly syncStamp: "service-request-bridge-sync-stamp";
    readonly idempotency: "service-request-bridge-idempotency";
};
export declare const BRIDGE_DIRECTIONS: {
    readonly twoWay: "two-way";
    readonly localToRemote: "local-to-remote";
    readonly remoteToLocal: "remote-to-local";
};
export declare const DATA_KEYS: {
    readonly listTab: "service-request-bridge.list-tab";
    readonly detailTab: "service-request-bridge.detail-tab";
    readonly dashboardWidget: "service-request-bridge.dashboard-widget";
    readonly createLink: "service-request-bridge.create-link";
};
export declare const ACTION_KEYS: {
    readonly createLink: "service-request-bridge.create-link";
};
export declare const SYNC_STAMP_TTL_MS: number;
