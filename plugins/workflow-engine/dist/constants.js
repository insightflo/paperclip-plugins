export const PLUGIN_ID = "insightflo.workflow-engine";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "workflows";
export const SLOT_IDS = {
    page: "workflow-engine-page",
    dashboardWidget: "workflow-engine-dashboard-widget",
    sidebar: "workflow-engine-sidebar-link",
};
export const EXPORT_NAMES = {
    page: "WorkflowPage",
    dashboardWidget: "WorkflowDashboardWidget",
    sidebar: "WorkflowSidebarLink",
};
export const JOB_KEYS = {
    reconciler: "workflow-reconciler",
};
export const ENTITY_TYPES = {
    workflowDefinition: "workflow-definition",
    workflowRun: "workflow-run",
    workflowStepRun: "workflow-step-run",
    idempotencyKey: "idempotency-key",
};
export const WORKFLOW_STATUSES = {
    active: "active",
    paused: "paused",
    archived: "archived",
};
export const RUN_STATUSES = {
    running: "running",
    completed: "completed",
    failed: "failed",
    aborted: "aborted",
    timedOut: "timed-out",
};
export const STEP_STATUSES = {
    backlog: "backlog",
    todo: "todo",
    inProgress: "in_progress",
    done: "done",
    failed: "failed",
    skipped: "skipped",
    escalated: "escalated",
};
