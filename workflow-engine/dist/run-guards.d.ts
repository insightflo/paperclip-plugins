import type { PluginContext } from "@paperclipai/plugin-sdk";
export interface DailyRunGuardResult {
    blocked: boolean;
    dayKey: string;
    existingRunId?: string;
    existingStatus?: string;
}
export declare function checkDailyRunGuard(ctx: PluginContext, companyId: string, workflowId: string, referenceDate?: Date, timezone?: string): Promise<DailyRunGuardResult>;
