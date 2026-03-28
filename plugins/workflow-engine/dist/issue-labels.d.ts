import type { PluginContext } from "@paperclipai/plugin-sdk";
export declare function ensureIssueLabels(ctx: PluginContext, issueId: string, companyId: string, labelIds?: string[]): Promise<void>;
