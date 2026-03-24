export const PLUGIN_ID = "paperclipai.work-board";
export const PLUGIN_VERSION = "0.1.0";
export const PLUGIN_DISPLAY_NAME = "Work Board";
export const PAGE_ROUTE = "work-board";

export const SLOT_IDS = {
  page: "work-board-page",
  sidebar: "work-board-sidebar-link",
  dashboardWidget: "work-board-dashboard-widget",
} as const;

export const EXPORT_NAMES = {
  page: "WorkBoardPage",
  sidebar: "WorkBoardSidebarLink",
  dashboardWidget: "WorkBoardDashboardWidget",
} as const;

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
export const WORKSTREAMS: readonly WorkstreamDefinition[] = [];

export const ISSUE_STATUS_LABELS = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
} as const;

export const PRIORITY_WEIGHTS = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const;
