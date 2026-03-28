export const PLUGIN_ID = "insightflo.service-request-bridge";
export const PLUGIN_VERSION = "0.1.0";

export const SLOT_IDS = {
  listTab: "service-request-bridge-list-tab",
  detailTab: "service-request-bridge-detail-tab",
  dashboardWidget: "service-request-bridge-dashboard-widget",
  sidebar: "service-request-bridge-sidebar-link",
} as const;

export const EXPORT_NAMES = {
  listTab: "ServiceRequestBridgeListTab",
  detailTab: "ServiceRequestBridgeDetailTab",
  dashboardWidget: "BridgeDashboardWidget",
  sidebar: "BridgeSidebarLink",
} as const;

export const ENTITY_TYPES = {
  bridgeLink: "service-request-bridge-link",
  syncStamp: "service-request-bridge-sync-stamp",
  idempotency: "service-request-bridge-idempotency"
} as const;

export const BRIDGE_DIRECTIONS = {
  twoWay: "two-way",
  localToRemote: "local-to-remote",
  remoteToLocal: "remote-to-local"
} as const;

export const DATA_KEYS = {
  listTab: "service-request-bridge.list-tab",
  detailTab: "service-request-bridge.detail-tab",
  dashboardWidget: "service-request-bridge.dashboard-widget",
  createLink: "service-request-bridge.create-link",
} as const;

export const ACTION_KEYS = {
  createLink: DATA_KEYS.createLink
} as const;

export const SYNC_STAMP_TTL_MS = 10 * 60 * 1000;
