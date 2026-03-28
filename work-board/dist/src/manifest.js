const PLUGIN_ID = "paperclipai.work-board";
const PLUGIN_VERSION = "0.1.0";
const PLUGIN_DISPLAY_NAME = "Work Board";
const PAGE_ROUTE = "work-board";
const manifest = {
    id: PLUGIN_ID,
    apiVersion: 1,
    version: PLUGIN_VERSION,
    displayName: PLUGIN_DISPLAY_NAME,
    description: "Area-based weekly work board for Alpha-Prime OS.",
    author: "Paperclip",
    categories: ["ui"],
    capabilities: [
        "issues.read",
        "projects.read",
        "agents.read",
        "issue.comments.read",
        "ui.page.register",
        "ui.sidebar.register",
        "ui.dashboardWidget.register"
    ],
    entrypoints: {
        worker: "./dist/worker.js",
        ui: "./dist/ui"
    },
    ui: {
        slots: [
            {
                type: "page",
                id: "work-board-page",
                displayName: PLUGIN_DISPLAY_NAME,
                exportName: "WorkBoardPage",
                routePath: PAGE_ROUTE
            },
            {
                type: "sidebar",
                id: "work-board-sidebar-link",
                displayName: PLUGIN_DISPLAY_NAME,
                exportName: "WorkBoardSidebarLink"
            },
            {
                type: "dashboardWidget",
                id: "work-board-dashboard-widget",
                displayName: "Mission Board",
                exportName: "WorkBoardDashboardWidget"
            }
        ]
    }
};
export default manifest;
//# sourceMappingURL=manifest.js.map