export declare const PLUGIN_ID = "paperclipai.work-board";
export declare const PLUGIN_VERSION = "0.1.0";
export declare const PLUGIN_DISPLAY_NAME = "Mission Board";
export declare const PAGE_ROUTE = "work-board";
export declare const COLUMN_UNASSIGNED = "\uBBF8\uBD84\uB958";
export declare const UNIQUE_WORK_LABELS: readonly ["[고유업무]", "고유업무"];
export declare const SLOT_IDS: {
    readonly page: "work-board-page";
    readonly sidebar: "work-board-sidebar-link";
    readonly dashboardWidget: "work-board-dashboard-widget";
};
export declare const EXPORT_NAMES: {
    readonly page: "WorkBoardPage";
    readonly sidebar: "WorkBoardSidebarLink";
    readonly dashboardWidget: "WorkBoardDashboardWidget";
};
export type WorkstreamDefinition = {
    name: string;
    description: string;
    keywords: string[];
};
/**
 * 키워드 기반 fallback 매칭용.
 * 라벨만으로 운영하려면 빈 배열로 두세요.
 * 라벨 없는 이슈를 자동 분류하려면 아래처럼 추가:
 *
 * @example
 * { name: "개발", description: "기능 개발, 버그 수정", keywords: ["dev", "feature", "bug", "fix"] },
 * { name: "QA", description: "테스트, 품질 검증", keywords: ["QA", "test", "검증"] },
 */
export declare const WORKSTREAMS: readonly WorkstreamDefinition[];
export declare const ISSUE_STATUS_LABELS: {
    readonly backlog: "Backlog";
    readonly todo: "Todo";
    readonly in_progress: "In Progress";
    readonly in_review: "In Review";
    readonly blocked: "Blocked";
    readonly done: "Done";
    readonly cancelled: "Cancelled";
};
export declare const PRIORITY_WEIGHTS: {
    readonly critical: 4;
    readonly high: 3;
    readonly medium: 2;
    readonly low: 1;
};
//# sourceMappingURL=constants.d.ts.map