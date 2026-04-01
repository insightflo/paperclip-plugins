export const PLUGIN_ID = "insightflo.service-request-bridge";
export const PLUGIN_VERSION = "0.1.0";
export const SLOT_IDS = {
    listTab: "service-request-bridge-list-tab",
    detailTab: "service-request-bridge-detail-tab",
    dashboardWidget: "service-request-bridge-dashboard-widget",
    sidebar: "service-request-bridge-sidebar-link",
    settingsTab: "service-request-bridge-settings-tab",
};
export const EXPORT_NAMES = {
    listTab: "ServiceRequestBridgeListTab",
    detailTab: "ServiceRequestBridgeDetailTab",
    dashboardWidget: "BridgeDashboardWidget",
    sidebar: "BridgeSidebarLink",
    settingsTab: "BridgeSettingsTab",
};
export const ENTITY_TYPES = {
    bridgeLink: "service-request-bridge-link",
    syncStamp: "service-request-bridge-sync-stamp",
    idempotency: "service-request-bridge-idempotency"
};
export const BRIDGE_DIRECTIONS = {
    twoWay: "two-way",
    localToRemote: "local-to-remote",
    remoteToLocal: "remote-to-local"
};
export const DATA_KEYS = {
    listTab: "service-request-bridge.list-tab",
    detailTab: "service-request-bridge.detail-tab",
    dashboardWidget: "service-request-bridge.dashboard-widget",
    settingsGet: "service-request-bridge.settings-get",
    createLink: "service-request-bridge.create-link",
};
export const ACTION_KEYS = {
    createLink: DATA_KEYS.createLink,
    settingsSave: "service-request-bridge.settings-save",
};
export const JOB_KEYS = {
    mirrorBackfill: "mirror-backfill",
};
export const SYNC_STAMP_TTL_MS = 10 * 60 * 1000;
