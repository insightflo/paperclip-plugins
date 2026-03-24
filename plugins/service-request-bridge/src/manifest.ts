import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  EXPORT_NAMES,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
} from "./constants.js";

const capabilities = [
  "events.subscribe",
  "issues.read",
  "issues.create",
  "issues.update",
  "issue.comments.create",
  "companies.read",
  "plugin.state.read",
  "plugin.state.write",
  "ui.dashboardWidget.register",
  "ui.page.register",
  "ui.sidebar.register",
  "ui.detailTab.register",
] as unknown as PaperclipPluginManifestV1["capabilities"];

const slots = [
  {
    type: "page",
    id: SLOT_IDS.listTab,
    displayName: "Service Bridge",
    exportName: EXPORT_NAMES.listTab,
  },
  {
    type: "detailTab",
    id: SLOT_IDS.detailTab,
    displayName: "Service Bridge",
    exportName: EXPORT_NAMES.detailTab,
    entityTypes: ["issue"],
  },
  {
    type: "dashboardWidget",
    id: SLOT_IDS.dashboardWidget,
    displayName: "Service Bridge",
    exportName: EXPORT_NAMES.dashboardWidget,
  },
] as unknown as NonNullable<PaperclipPluginManifestV1["ui"]>["slots"];

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Service Request Bridge",
  description:
    "Links cross-company service issues and synchronizes status updates with loop-safe automation.",
  author: "InsightFlo",
  categories: ["automation", "automation"],
  capabilities,
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      providerCompanyName: {
        type: "string",
        title: "Provider company name",
        description: "Company that handles maintenance requests",
      },
      requesterLabelName: {
        type: "string",
        title: "Requester label",
        default: "유지보수",
      },
      autoCreateMirrorIssue: {
        type: "boolean",
        title: "Auto-create mirror issue on label match",
        default: true,
      },
    },
  },
  ui: {
    slots,
  } as PaperclipPluginManifestV1["ui"],
};

export default manifest;
