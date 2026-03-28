export declare const PLUGIN_ID = "insightflo.tool-registry";
export declare const PLUGIN_VERSION = "0.1.0";
export declare const PAGE_ROUTE = "tool-registry";
export declare const SLOT_IDS: {
    readonly page: "tool-registry-page";
    readonly sidebar: "tool-registry-sidebar-link";
};
export declare const EXPORT_NAMES: {
    readonly page: "ToolRegistryPage";
    readonly sidebar: "ToolRegistrySidebarLink";
};
export declare const TOOL_NAMES: {
    readonly genericCliExecutor: "generic-cli-executor";
};
export declare const ENTITY_TYPES: {
    readonly toolConfig: "tool-config";
    readonly agentToolGrant: "agent-tool-grant";
    readonly executionLog: "tool-execution-log";
};
export declare const DATA_KEYS: {
    readonly pageData: "tool-registry.page-data";
};
export declare const ACTION_KEYS: {
    readonly createTool: "tool-registry.create-tool";
    readonly updateTool: "tool-registry.update-tool";
    readonly deleteTool: "tool-registry.delete-tool";
    readonly restoreTool: "tool-registry.restore-tool";
    readonly grantTool: "tool-registry.grant-tool";
    readonly revokeTool: "tool-registry.revoke-tool";
};
export declare const DEFAULT_MAX_LOGS = 50;
