import {
  EXPORT_NAMES,
  PAGE_ROUTE,
  PLUGIN_DISPLAY_NAME,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS
} from "./constants.js";
const capabilities = [
  "issues.read",
  "agents.read",
  "events.subscribe",
  "plugin.state.read",
  "plugin.state.write",
  "ui.page.register",
  "ui.sidebar.register"
];
const manifest = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: PLUGIN_DISPLAY_NAME,
  description: "Agent dependency garden with health and metacognition signals.",
  author: "Paperclip",
  categories: ["ui"],
  capabilities,
  instanceConfigSchema: {
    type: "object",
    properties: {
      codeLayerSource: {
        type: "string",
        title: "Code layer source",
        enum: ["none", "tool-registry", "knowledge-graph"],
        default: "none",
        description: "none: \uCF54\uB4DC \uB808\uC774\uC5B4 \uBE44\uD65C\uC131, tool-registry: Tool Registry \uB3C4\uAD6C+\uAD8C\uD55C \uADF8\uB798\uD504, knowledge-graph: UA KG \uC784\uBCA0\uB529"
      }
    }
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: PLUGIN_DISPLAY_NAME,
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE
      },
      {
        type: "sidebar",
        id: SLOT_IDS.sidebar,
        displayName: PLUGIN_DISPLAY_NAME,
        exportName: EXPORT_NAMES.sidebar
      }
    ]
  }
};
var manifest_default = manifest;
export {
  manifest_default as default
};
//# sourceMappingURL=manifest.js.map
