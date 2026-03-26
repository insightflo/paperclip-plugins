export declare const PLUGIN_ID = "insightflo.knowledge-base";
export declare const PLUGIN_VERSION = "0.1.0";
export declare const PAGE_ROUTE = "knowledge-base";
export declare const SLOT_IDS: {
    readonly page: "knowledge-base-page";
    readonly sidebar: "knowledge-base-sidebar";
};
export declare const EXPORT_NAMES: {
    readonly page: "KnowledgeBasePage";
    readonly sidebar: "KnowledgeBaseSidebarLink";
};
export declare const ENTITY_TYPES: {
    readonly knowledgeBase: "knowledge-base";
    readonly agentKbGrant: "agent-kb-grant";
};
export declare const KB_TYPES: {
    readonly static: "static";
    readonly rag: "rag";
    readonly ontology: "ontology";
};
export declare const DEFAULT_MAX_TOKEN_BUDGET = 4096;
export declare const DATA_KEYS: {
    readonly overview: "knowledge-base.overview";
    readonly kbList: "knowledge-base.list";
    readonly kbGet: "knowledge-base.get";
    readonly grantList: "knowledge-base.grant.list";
    readonly agentList: "knowledge-base.agent.list";
    readonly kbCreate: "knowledge-base.create";
    readonly kbUpdate: "knowledge-base.update";
    readonly kbDelete: "knowledge-base.delete";
    readonly grantCreate: "knowledge-base.grant.create";
    readonly grantDelete: "knowledge-base.grant.delete";
};
export declare const ACTION_KEYS: {
    readonly kbCreate: "knowledge-base.create";
    readonly kbUpdate: "knowledge-base.update";
    readonly kbDelete: "knowledge-base.delete";
    readonly kbRestore: "knowledge-base.restore";
    readonly grantCreate: "knowledge-base.grant.create";
    readonly grantDelete: "knowledge-base.grant.delete";
};
