import type { PluginContext } from "@paperclipai/plugin-sdk";
export declare function analyzeRunLog(log: string): string[];
export declare function createAuditIssue(ctx: PluginContext, companyId: string, agentName: string, violations: string[]): Promise<{
    issueId: string;
}>;
