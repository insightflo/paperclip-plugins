const PLUGIN_ID = "paperclipai.system-garden";
const PLUGIN_VERSION = "0.1.0";
const PLUGIN_DISPLAY_NAME = "System Garden";
const PAGE_ROUTE = "system-garden";
const SLOT_IDS = {
  page: "system-garden-page",
  sidebar: "system-garden-sidebar-link"
};
const EXPORT_NAMES = {
  page: "SystemGardenPage",
  sidebar: "SystemGardenSidebarLink"
};
const NODE_COLORS = {
  agent: "#22c55e",
  schedule: "#3b82f6",
  data: "#f59e0b",
  output: "#a855f7",
  module: "#3b82f6",
  file: "#3b82f6",
  function: "#a855f7",
  class: "#f97316",
  tool: "#f59e0b",
  default: "#64748b"
};
const HEALTH_THRESHOLDS = {
  good: 80,
  warning: 50
};
const HEALTH_LABELS = {
  good: "\uC6B8\uCC3D",
  warning: "\uC131\uC7A5 \uC911",
  bad: "\uC2DC\uB4E6"
};
export {
  EXPORT_NAMES,
  HEALTH_LABELS,
  HEALTH_THRESHOLDS,
  NODE_COLORS,
  PAGE_ROUTE,
  PLUGIN_DISPLAY_NAME,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS
};
