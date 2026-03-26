import { type PluginContext } from "@paperclipai/plugin-sdk";
type BoardBucketKey = "delayed" | "waiting" | "inProgress" | "done";
type IssueRecord = Awaited<ReturnType<PluginContext["issues"]["list"]>>[number];
type MissionProgress = {
    total: number;
    done: number;
    percent: number;
};
export type BoardIssueCard = {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    statusLabel: string;
    priority: string;
    parentId: string | null;
    effectiveLabels: string[];
    createdAt: string | null;
    updatedAt: string | null;
    completedAt: string | null;
    ageDays: number;
    stale: boolean;
    overdueFromLastWeek: boolean;
};
export type MissionBucket = {
    key: BoardBucketKey;
    label: string;
    count: number;
    items: BoardIssueCard[];
};
export type MissionCard = {
    missionId: string;
    missionIssueId: string | null;
    missionIdentifier: string | null;
    title: string;
    columnName: string;
    labels: string[];
    progress: MissionProgress;
    buckets: MissionBucket[];
    updatedAt: string | null;
};
export type MissionColumn = {
    key: string;
    name: string;
    missionCount: number;
    missions: MissionCard[];
};
export type WorkBoardSnapshot = {
    companyId: string;
    generatedAt: string;
    weekRange: {
        start: string;
        end: string;
        label: string;
    };
    totals: {
        missions: number;
        tasks: number;
        done: number;
        inProgress: number;
        todo: number;
        overdue: number;
    };
    columns: MissionColumn[];
};
export declare function buildWorkBoardSnapshot(issues: IssueRecord[], options: {
    companyId: string;
    now?: Date;
}): WorkBoardSnapshot;
declare const plugin: import("@paperclipai/plugin-sdk").PaperclipPlugin;
export default plugin;
//# sourceMappingURL=worker.d.ts.map