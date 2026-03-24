import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  EXPORT_NAMES,
  PAGE_ROUTE,
  PLUGIN_DISPLAY_NAME,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
} from "./constants.js";

const capabilities = [
  "issues.read",
  "agents.read",
  "events.subscribe",
  "plugin.state.read",
  "plugin.state.write",
  "ui.page.register",
  "ui.sidebar.register",
] as unknown as PaperclipPluginManifestV1["capabilities"];

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: PLUGIN_DISPLAY_NAME,
  description: "Agent dependency garden with health and metacognition signals.",
  author: "Paperclip",
  categories: ["ui"],
  capabilities,
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: PLUGIN_DISPLAY_NAME,
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "sidebar",
        id: SLOT_IDS.sidebar,
        displayName: PLUGIN_DISPLAY_NAME,
        exportName: EXPORT_NAMES.sidebar,
      },
    ],
  },
};

export default manifest;
