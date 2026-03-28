import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";
export type KnowledgeBaseType = "static" | "rag" | "ontology";
export interface KnowledgeBaseData {
    name: string;
    type: KnowledgeBaseType;
    description?: string;
    companyId: string;
    maxTokenBudget: number;
    staticConfig?: {
        content: string;
    };
    ragConfig?: {
        mcpServerUrl?: string;
        topK?: number;
    };
    ontologyConfig?: {
        kgPath?: string;
    };
    createdAt: string;
    updatedAt: string;
}
export interface AgentKBGrantData {
    agentName: string;
    kbName: string;
    grantedBy: string;
    grantedAt: string;
}
export type KnowledgeBaseRecord = Omit<PluginEntityRecord, "data"> & {
    data: KnowledgeBaseData;
};
export type AgentKBGrantRecord = Omit<PluginEntityRecord, "data"> & {
    data: AgentKBGrantData;
};
export declare function listKnowledgeBases(ctx: PluginContext, companyId: string): Promise<KnowledgeBaseRecord[]>;
export declare function listAllKnowledgeBases(ctx: PluginContext, companyId: string): Promise<KnowledgeBaseRecord[]>;
export declare function restoreKnowledgeBase(ctx: PluginContext, companyId: string, kbNameOrId: string): Promise<KnowledgeBaseRecord>;
export declare function getKnowledgeBaseByName(ctx: PluginContext, companyId: string, kbName: string): Promise<KnowledgeBaseRecord | null>;
export declare function getKnowledgeBaseById(ctx: PluginContext, id: string): Promise<KnowledgeBaseRecord | null>;
export declare function upsertKnowledgeBase(ctx: PluginContext, companyId: string, input: Partial<KnowledgeBaseData> & {
    name: string;
    type?: KnowledgeBaseType;
}): Promise<KnowledgeBaseRecord>;
export declare function deleteKnowledgeBase(ctx: PluginContext, companyId: string, kbNameOrId: string): Promise<void>;
export declare function listAgentKbGrants(ctx: PluginContext, companyId: string, filters?: {
    agentName?: string;
    kbName?: string;
}): Promise<AgentKBGrantRecord[]>;
export declare function grantKnowledgeBase(ctx: PluginContext, companyId: string, input: Partial<AgentKBGrantData>): Promise<AgentKBGrantRecord>;
export declare function revokeKnowledgeBaseGrant(ctx: PluginContext, companyId: string, input: {
    grantId?: string;
    agentName?: string;
    kbName?: string;
}): Promise<void>;
export declare function listAgentNames(ctx: PluginContext, companyId: string): Promise<string[]>;
export declare function getKnowledgeBaseOverview(ctx: PluginContext, companyId: string): Promise<{
    knowledgeBases: KnowledgeBaseRecord[];
    grants: AgentKBGrantRecord[];
    agents: string[];
}>;
