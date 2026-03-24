import { definePlugin, runWorker, type PluginContext } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_COMPANY_ID,
  ISSUE_STATUS_LABELS,
  PLUGIN_DISPLAY_NAME,
  PRIORITY_WEIGHTS,
  WORKSTREAMS,
  type WorkstreamDefinition,
} from "./constants.js";

type BoardBucketKey = "overdueLastWeek" | "todo" | "inProgress" | "doneThisWeek";
type WorkstreamTone = "neutral" | "attention" | "progress" | "complete";
type MatchType = "label" | "keyword";

type IssueRecord = Awaited<ReturnType<PluginContext["issues"]["list"]>>[number];

export type BoardIssueCard = {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  statusLabel: string;
  priority: string;
  projectId: string | null;
  goalId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  ageDays: number;
  stale: boolean;
  lastWeekUnfinished: boolean;
  failedThisWeek: boolean;
  matchedBy: MatchType;
};

export type BoardBucket = {
  key: BoardBucketKey;
  label: string;
  count: number;
  items: BoardIssueCard[];
};

export type WorkstreamSnapshot = {
  id: string;
  name: string;
  description: string;
  healthLabel: string;
  healthTone: WorkstreamTone;
  openCount: number;
  doneThisWeekCount: number;
  staleCount: number;
  summary: string;
  buckets: BoardBucket[];
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
    open: number;
    todo: number;
    inProgress: number;
    doneThisWeek: number;
    stale: number;
    unmatched: number;
    overdueLastWeek: number;
  };
  workstreams: WorkstreamSnapshot[];
  unmatched: BoardIssueCard[];
};

const OPEN_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const TODO_STATUSES = new Set(["backlog", "todo", "blocked"]);
const IN_PROGRESS_STATUSES = new Set(["in_progress", "in_review"]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 5;
const DEFAULT_WORKSTREAM_NAMES = new Set(WORKSTREAMS.map((stream) => stream.name));

function getCompanyId(params: Record<string, unknown>): string {
  const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
  return companyId;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCancelledIssue(issue: IssueRecord): boolean {
  return issue.status === "cancelled" || parseDate(issue.cancelledAt) !== null;
}

function startOfWeekKst(now = new Date()): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const weekdayOrder = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  } as const;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const weekday = weekdayOrder[parts.weekday as keyof typeof weekdayOrder] ?? 1;
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;

  return new Date(Date.UTC(year, month - 1, day + mondayOffset, -9, 0, 0, 0));
}

function endOfWeekKst(weekStart: Date): Date {
  return new Date(weekStart.getTime() + (7 * MS_PER_DAY) - 1);
}

function formatWeekRangeLabel(weekStart: Date, weekEnd: Date): string {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)} (KST)`;
}

function containsKeyword(haystack: string, keywords: readonly string[]): number {
  const normalized = haystack.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword.toLowerCase())) score += 1;
  }
  return score;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function classifyWorkstream(
  issue: IssueRecord,
  options?: { allowKeywordFallback?: boolean },
): { stream: WorkstreamDefinition | null; matchedBy: MatchType | null } {
  const labels = issue.labels ?? [];
  for (const stream of WORKSTREAMS) {
    const streamName = normalizeName(stream.name);
    const labelMatch = labels.find((label) => normalizeName(label.name) === streamName);
    if (labelMatch) {
      return { stream, matchedBy: "label" };
    }
  }

  if (!options?.allowKeywordFallback) {
    return { stream: null, matchedBy: null };
  }

  const searchableText = [issue.title, issue.description ?? ""].join("\n");
  let bestMatch: { stream: WorkstreamDefinition; score: number } | null = null;

  for (const stream of WORKSTREAMS) {
    const score = containsKeyword(searchableText, stream.keywords);
    if (score === 0) continue;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { stream, score };
    }
  }

  if (!bestMatch) return { stream: null, matchedBy: null };
  return { stream: bestMatch.stream, matchedBy: "keyword" };
}

function createIssueCard(issue: IssueRecord, matchedBy: MatchType, now = new Date()): BoardIssueCard {
  const createdAt = parseDate(issue.createdAt);
  const updatedAt = parseDate(issue.updatedAt) ?? createdAt;
  const ageAnchor = updatedAt ?? createdAt ?? now;
  const ageDays = Math.max(0, Math.floor((now.getTime() - ageAnchor.getTime()) / MS_PER_DAY));

  return {
    id: issue.id,
    identifier: issue.identifier ?? null,
    title: issue.title,
    status: issue.status,
    statusLabel: ISSUE_STATUS_LABELS[issue.status as keyof typeof ISSUE_STATUS_LABELS] ?? issue.status,
    priority: issue.priority,
    projectId: issue.projectId,
    goalId: issue.goalId,
    createdAt: toIsoString(issue.createdAt),
    updatedAt: toIsoString(issue.updatedAt),
    completedAt: toIsoString(issue.completedAt),
    cancelledAt: toIsoString(issue.cancelledAt),
    ageDays,
    stale: issue.status !== "done" && !isCancelledIssue(issue) && ageDays >= STALE_AFTER_DAYS,
    lastWeekUnfinished: false,
    failedThisWeek: false,
    matchedBy,
  };
}

function isDoneThisWeek(issue: IssueRecord, weekStart: Date): boolean {
  if (issue.status !== "done") return false;
  const completedAt = parseDate(issue.completedAt);
  return Boolean(completedAt && completedAt >= weekStart);
}

function isLastWeekUnfinished(issue: IssueRecord, weekStart: Date): boolean {
  const createdAt = parseDate(issue.createdAt);
  if (!createdAt) return false;
  const lastWeekStart = new Date(weekStart.getTime() - (7 * MS_PER_DAY));
  return createdAt >= lastWeekStart && createdAt < weekStart && issue.status !== "done" && !isCancelledIssue(issue);
}

function shouldIncludeIssueOnBoard(issue: IssueRecord, weekStart: Date): boolean {
  // cancelled는 상태값/타임스탬프 어떤 형태로 표기돼도 보드에서 완전 제외한다.
  if (isCancelledIssue(issue)) return false;
  if (OPEN_STATUSES.has(issue.status)) return true;
  if (isDoneThisWeek(issue, weekStart)) return true;
  if (isLastWeekUnfinished(issue, weekStart)) return true;
  return false;
}

function getBucketCount(stream: WorkstreamSnapshot, key: BoardBucketKey): number {
  return stream.buckets.find((bucket) => bucket.key === key)?.count ?? 0;
}

function shouldShowWorkstream(name: string, items: BoardIssueCard[]): boolean {
  if (items.length > 0) return true;
  return !DEFAULT_WORKSTREAM_NAMES.has(name);
}

function calculateTotals(workstreams: WorkstreamSnapshot[], unmatched: BoardIssueCard[]): WorkBoardSnapshot["totals"] {
  const overdueLastWeek = workstreams.reduce((sum, stream) => sum + getBucketCount(stream, "overdueLastWeek"), 0);
  const matchedTodo = workstreams.reduce((sum, stream) => sum + getBucketCount(stream, "todo"), 0);
  const matchedInProgress = workstreams.reduce((sum, stream) => sum + getBucketCount(stream, "inProgress"), 0);
  const unmatchedOverdue = unmatched.filter((item) => item.lastWeekUnfinished).length;
  const unmatchedTodo = unmatched.filter((item) => !item.lastWeekUnfinished && TODO_STATUSES.has(item.status)).length;
  const unmatchedInProgress = unmatched.filter((item) => !item.lastWeekUnfinished && IN_PROGRESS_STATUSES.has(item.status)).length;
  const todo = matchedTodo + unmatchedTodo;
  const inProgress = matchedInProgress + unmatchedInProgress;
  const open = overdueLastWeek + unmatchedOverdue + todo + inProgress;
  const doneThisWeek = workstreams.reduce((sum, stream) => sum + getBucketCount(stream, "doneThisWeek"), 0);
  const stale = workstreams.reduce((sum, stream) => sum + stream.staleCount, 0) + unmatched.filter((item) => item.stale).length;

  return {
    open,
    todo,
    inProgress,
    doneThisWeek,
    stale,
    unmatched: unmatched.length,
    overdueLastWeek: overdueLastWeek + unmatchedOverdue,
  };
}

function comparePriority(left: BoardIssueCard, right: BoardIssueCard): number {
  const rightWeight = PRIORITY_WEIGHTS[right.priority as keyof typeof PRIORITY_WEIGHTS] ?? 0;
  const leftWeight = PRIORITY_WEIGHTS[left.priority as keyof typeof PRIORITY_WEIGHTS] ?? 0;
  return rightWeight - leftWeight;
}

function sortOpenIssues(items: BoardIssueCard[]): BoardIssueCard[] {
  return [...items].sort((left, right) => {
    if (left.stale !== right.stale) return left.stale ? -1 : 1;
    const priorityDiff = comparePriority(left, right);
    if (priorityDiff !== 0) return priorityDiff;
    return (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "");
  });
}

function sortDoneIssues(items: BoardIssueCard[]): BoardIssueCard[] {
  return [...items].sort((left, right) => (right.completedAt ?? "").localeCompare(left.completedAt ?? ""));
}

function summarizeWorkstream(stream: WorkstreamDefinition, items: BoardIssueCard[]): WorkstreamSnapshot {
  const overdueItems = sortOpenIssues(items.filter((item) => item.lastWeekUnfinished));
  const todoItems = sortOpenIssues(
    items.filter((item) => !item.lastWeekUnfinished && (TODO_STATUSES.has(item.status) || item.failedThisWeek)),
  );
  const inProgressItems = sortOpenIssues(
    items.filter((item) => !item.lastWeekUnfinished && IN_PROGRESS_STATUSES.has(item.status)),
  );
  const doneItems = sortDoneIssues(items.filter((item) => item.status === "done"));
  const openCount = overdueItems.length + todoItems.length + inProgressItems.length;
  const staleCount = [...overdueItems, ...todoItems, ...inProgressItems].filter((item) => item.stale).length;

  let healthTone: WorkstreamTone = "neutral";
  let healthLabel = "이번 주 항목 없음";
  let summary = "이번 주에 표시할 이슈가 아직 없다.";

  if (overdueItems.length > 0) {
    healthTone = "attention";
    healthLabel = "지난주 미완료";
    summary = `지난주에서 넘어온 미완료 ${overdueItems.length}건이 먼저 처리 대상이다.`;
  } else if (openCount === 0 && doneItems.length > 0) {
    healthTone = "complete";
    healthLabel = "이번 주 완료";
    summary = `이번 주 완료 ${doneItems.length}건. 열린 이슈는 없다.`;
  } else if (staleCount > 0) {
    healthTone = "attention";
    healthLabel = "막힘 있음";
    summary = `열린 이슈 ${openCount}건 중 ${staleCount}건이 ${STALE_AFTER_DAYS}일 이상 정체되어 있다.`;
  } else if (inProgressItems.length > 0) {
    healthTone = "progress";
    healthLabel = "진행 중";
    summary = `진행 중 ${inProgressItems.length}건, 아직 착수 전 ${todoItems.length}건.`;
  } else if (todoItems.length > 0) {
    healthTone = "attention";
    healthLabel = "착수 필요";
    summary = `이번 주에 시작해야 할 이슈 ${todoItems.length}건이 남아 있다.`;
  }

  return {
    id: stream.name,
    name: stream.name,
    description: stream.description,
    healthLabel,
    healthTone,
    openCount,
    doneThisWeekCount: doneItems.length,
    staleCount,
    summary,
    buckets: [
      {
        key: "overdueLastWeek",
        label: "지난주 미완료",
        count: overdueItems.length,
        items: overdueItems,
      },
      {
        key: "todo",
        label: "이번 주 해야 할",
        count: todoItems.length,
        items: todoItems,
      },
      {
        key: "inProgress",
        label: "진행 중",
        count: inProgressItems.length,
        items: inProgressItems,
      },
      {
        key: "doneThisWeek",
        label: "이번 주 완료",
        count: doneItems.length,
        items: doneItems,
      },
    ],
  };
}

export function buildWorkBoardSnapshot(
  issues: IssueRecord[],
  options?: { companyId?: string; now?: Date },
): WorkBoardSnapshot {
  const now = options?.now ?? new Date();
  const weekStart = startOfWeekKst(now);
  const weekEnd = endOfWeekKst(weekStart);
  const allowKeywordFallback = options?.companyId === DEFAULT_COMPANY_ID;

  const grouped = new Map<string, BoardIssueCard[]>();
  const unmatched: BoardIssueCard[] = [];
  const discoveredStreams = new Map<string, WorkstreamDefinition>();

  // 기본 워크스트림 칼럼과 키워드 fallback은 Alpha-Prime 기본 회사에서만 사용한다.
  if (allowKeywordFallback) {
    for (const stream of WORKSTREAMS) {
      grouped.set(stream.name, []);
      discoveredStreams.set(stream.name, stream);
    }
  }

  for (const issue of issues) {
    if (!shouldIncludeIssueOnBoard(issue, weekStart)) continue;

    // 1차: 이슈 라벨로 매칭 (동적 칼럼)
    const labels = issue.labels ?? [];
    let matched = false;
    for (const label of labels) {
      const labelName = label.name?.trim();
      if (!labelName) continue;
      if (!grouped.has(labelName)) {
        grouped.set(labelName, []);
        discoveredStreams.set(labelName, { name: labelName, description: "", keywords: [] });
      }
      const card = createIssueCard(issue, "label", now);
      card.lastWeekUnfinished = isLastWeekUnfinished(issue, weekStart);
      grouped.get(labelName)?.push(card);
      matched = true;
      break; // 첫 번째 라벨로만 분류
    }

    if (matched) continue;

    // 2차: 키워드 매칭 (WORKSTREAMS 기반)
    const { stream, matchedBy } = classifyWorkstream(issue, { allowKeywordFallback });
    const card = createIssueCard(issue, matchedBy ?? "keyword", now);
    card.lastWeekUnfinished = isLastWeekUnfinished(issue, weekStart);
    if (!stream || !matchedBy) {
      if (issue.status !== "done") {
        unmatched.push(card);
      }
      continue;
    }
    grouped.get(stream.name)?.push(card);
  }

  // 이슈가 있는 칼럼만 표시 (빈 칼럼 숨김)
  const workstreams = Array.from(grouped.entries())
    .filter(([name, items]) => shouldShowWorkstream(name, items))
    .map(([name, items]) => summarizeWorkstream(
      discoveredStreams.get(name) ?? { name, description: "", keywords: [] },
      items,
    ));
  const unmatchedSorted = sortOpenIssues(unmatched);
  const totals = calculateTotals(workstreams, unmatchedSorted);

  return {
    companyId: options?.companyId ?? "",
    generatedAt: now.toISOString(),
    weekRange: {
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
      label: formatWeekRangeLabel(weekStart, weekEnd),
    },
    totals,
    workstreams,
    unmatched: unmatchedSorted,
  };
}

async function loadBoardSnapshot(ctx: PluginContext, companyId: string): Promise<WorkBoardSnapshot> {
  const issues = await ctx.issues.list({ companyId, limit: 500, offset: 0 });
  return buildWorkBoardSnapshot(issues, { companyId });
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("work-board-overview", async (params) => {
      const companyId = getCompanyId(params);
      return await loadBoardSnapshot(ctx, companyId);
    });
  },

  async onHealth() {
    return {
      status: "ok",
      message: `${PLUGIN_DISPLAY_NAME} worker ready`,
      details: {
        workstreams: WORKSTREAMS.length,
      },
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
