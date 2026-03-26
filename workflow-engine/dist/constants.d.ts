export declare const PLUGIN_ID = "insightflo.workflow-engine";
export declare const PLUGIN_VERSION = "0.1.0";
export declare const PAGE_ROUTE = "workflows";
export declare const SLOT_IDS: {
    readonly page: "workflow-engine-page";
    readonly dashboardWidget: "workflow-engine-dashboard-widget";
    readonly sidebar: "workflow-engine-sidebar-link";
};
export declare const EXPORT_NAMES: {
    readonly page: "WorkflowPage";
    readonly dashboardWidget: "WorkflowDashboardWidget";
    readonly sidebar: "WorkflowSidebarLink";
};
export declare const JOB_KEYS: {
    readonly reconciler: "workflow-reconciler";
};
export declare const ENTITY_TYPES: {
    readonly workflowDefinition: "workflow-definition";
    readonly workflowRun: "workflow-run";
    readonly workflowStepRun: "workflow-step-run";
    readonly idempotencyKey: "idempotency-key";
};
export declare const WORKFLOW_STATUSES: {
    readonly active: "active";
    readonly paused: "paused";
    readonly archived: "archived";
};
export declare const RUN_STATUSES: {
    readonly running: "running";
    readonly completed: "completed";
    readonly failed: "failed";
    readonly aborted: "aborted";
    readonly timedOut: "timed-out";
};
export declare const STEP_STATUSES: {
    readonly backlog: "backlog";
    readonly todo: "todo";
    readonly inProgress: "in_progress";
    readonly done: "done";
    readonly failed: "failed";
    readonly skipped: "skipped";
    readonly escalated: "escalated";
};
