import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";
export type JsonRecord = Record<string, unknown>;
export interface ToolConfig {
    name: string;
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    requiresApproval: boolean;
    description?: string;
    instructions?: string;
    argsSchema?: JsonRecord;
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
}
export interface AgentToolGrant {
    agentName: string;
    toolName: string;
    grantedBy: string;
    grantedAt: string;
}
export interface ToolConfigRecord {
    id: string;
    entityType: string;
    scopeKind: string;
    scopeId: string | null;
    externalId: string | null;
    title: string | null;
    status: string | null;
    data: ToolConfig;
    createdAt: string;
    updatedAt: string;
}
export interface AgentToolGrantRecord {
    id: string;
    entityType: string;
    scopeKind: string;
    scopeId: string | null;
    externalId: string | null;
    title: string | null;
    status: string | null;
    data: AgentToolGrant;
    createdAt: string;
    updatedAt: string;
}
export declare function createTool(ctx: PluginContext, companyId: string, input: Partial<ToolConfig>): Promise<ToolConfigRecord>;
export declare function updateTool(ctx: PluginContext, companyId: string, toolName: string, patch: Partial<ToolConfig>): Promise<ToolConfigRecord>;
export declare function deleteTool(ctx: PluginContext, companyId: string, toolName: string): Promise<void>;
export declare function getToolByName(ctx: PluginContext, companyId: string, toolName: string): Promise<ToolConfigRecord | null>;
export declare function listTools(ctx: PluginContext, companyId: string): Promise<ToolConfigRecord[]>;
export declare function listAllTools(ctx: PluginContext, companyId: string): Promise<ToolConfigRecord[]>;
export declare function restoreTool(ctx: PluginContext, companyId: string, toolName: string): Promise<ToolConfigRecord>;
export declare function grantTool(ctx: PluginContext, companyId: string, input: Partial<AgentToolGrant>): Promise<AgentToolGrantRecord>;
export declare function revokeTool(ctx: PluginContext, companyId: string, agentName: string, toolName: string): Promise<void>;
export declare function listAgentGrants(ctx: PluginContext, companyId: string, filters?: {
    agentName?: string;
    toolName?: string;
}): Promise<AgentToolGrantRecord[]>;
export declare function isToolGrantedToAgent(ctx: PluginContext, companyId: string, agentName: string, toolName: string): Promise<boolean>;
export declare function getEntityRecordById(ctx: PluginContext, entityType: string, id: string): Promise<PluginEntityRecord | null>;
