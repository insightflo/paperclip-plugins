import { EXPORT_NAMES, PLUGIN_ID, PLUGIN_VERSION, SLOT_IDS, } from "./constants.js";
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
];
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
];
const manifest = {
    id: PLUGIN_ID,
    apiVersion: 1,
    version: PLUGIN_VERSION,
    displayName: "Service Request Bridge",
    description: "Links cross-company service issues and synchronizes status updates with loop-safe automation.",
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
            workflowTriggerLabel: {
                type: "string",
                title: "Workflow trigger label for mirror issues",
                description: "Label to add to mirror issues to auto-start a workflow (e.g. wf:maintenance-triage)",
            },
        },
    },
    ui: {
        slots,
    },
};
export default manifest;
