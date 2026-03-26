import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { COLUMN_UNASSIGNED, ISSUE_STATUS_LABELS, PLUGIN_DISPLAY_NAME, PRIORITY_WEIGHTS, UNIQUE_WORK_LABELS, } from "./constants.js";
const OPEN_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const IN_PROGRESS_STATUSES = new Set(["in_progress", "in_review"]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 5;
const UNIQUE_WORK_LABEL_SET = new Set(UNIQUE_WORK_LABELS);
function asString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function getCompanyId(ctx, params) {
    const fromParams = asString(params.companyId);
    if (fromParams) {
        return fromParams;
    }
    const fromContext = asString(ctx.companyId);
    return fromContext;
}
function toIsoString(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function parseDate(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function startOfWeekKst(now = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
    });
    const parts = Object.fromEntries(formatter
        .formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]));
    const weekdayOrder = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const weekday = weekdayOrder[parts.weekday] ?? 1;
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    return new Date(Date.UTC(year, month - 1, day + mondayOffset, -9, 0, 0, 0));
}
function endOfWeekKst(weekStart) {
    return new Date(weekStart.getTime() + (7 * MS_PER_DAY) - 1);
}
function formatWeekRangeLabel(weekStart, weekEnd) {
    const formatter = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    return `${formatter.format(weekStart)} - ${formatter.format(weekEnd)} (KST)`;
}
function issueLabelNames(issue) {
    const rawLabels = Array.isArray(issue.labels) ? issue.labels : [];
    const names = [];
    for (const rawLabel of rawLabels) {
        const labelName = asString(rawLabel.name);
        if (labelName) {
            names.push(labelName);
        }
    }
    return names;
}
function hasUniqueWorkLabel(issue) {
    return issueLabelNames(issue).some((label) => UNIQUE_WORK_LABEL_SET.has(label));
}
function isCancelledIssue(issue) {
    return issue.status === "cancelled" || parseDate(issue.cancelledAt) !== null;
}
function isDoneThisWeek(issue, weekStart) {
    if (issue.status !== "done")
        return false;
    const completedAt = parseDate(issue.completedAt);
    return Boolean(completedAt && completedAt >= weekStart);
}
function isLastWeekUnfinished(issue, weekStart) {
    const createdAt = parseDate(issue.createdAt);
    if (!createdAt)
        return false;
    const lastWeekStart = new Date(weekStart.getTime() - (7 * MS_PER_DAY));
    return createdAt >= lastWeekStart && createdAt < weekStart && issue.status !== "done" && !isCancelledIssue(issue);
}
function shouldIncludeIssueOnBoard(issue, weekStart) {
    if (isCancelledIssue(issue))
        return false;
    if (OPEN_STATUSES.has(issue.status))
        return true;
    if (isDoneThisWeek(issue, weekStart))
        return true;
    if (isLastWeekUnfinished(issue, weekStart))
        return true;
    return false;
}
function resolveInheritedLabels(issueId, issueById, memo, seen) {
    if (memo.has(issueId)) {
        return memo.get(issueId) ?? [];
    }
    const issue = issueById.get(issueId);
    if (!issue) {
        memo.set(issueId, []);
        return [];
    }
    const ownLabels = issueLabelNames(issue);
    if (ownLabels.length > 0) {
        memo.set(issueId, ownLabels);
        return ownLabels;
    }
    const currentSeen = seen ?? new Set();
    if (currentSeen.has(issueId)) {
        memo.set(issueId, []);
        return [];
    }
    currentSeen.add(issueId);
    const parentId = asString(issue.parentId);
    if (!parentId || !issueById.has(parentId)) {
        memo.set(issueId, []);
        return [];
    }
    const inherited = resolveInheritedLabels(parentId, issueById, memo, currentSeen);
    memo.set(issueId, inherited);
    return inherited;
}
function createIssueCard(issue, effectiveLabels, weekStart, now = new Date()) {
    const createdAt = parseDate(issue.createdAt);
    const updatedAt = parseDate(issue.updatedAt) ?? createdAt;
    const ageAnchor = updatedAt ?? createdAt ?? now;
    const ageDays = Math.max(0, Math.floor((now.getTime() - ageAnchor.getTime()) / MS_PER_DAY));
    return {
        id: issue.id,
        identifier: issue.identifier ?? null,
        title: issue.title,
        status: issue.status,
        statusLabel: ISSUE_STATUS_LABELS[issue.status] ?? issue.status,
        priority: issue.priority,
        parentId: issue.parentId ?? null,
        effectiveLabels,
        createdAt: toIsoString(issue.createdAt),
        updatedAt: toIsoString(issue.updatedAt),
        completedAt: toIsoString(issue.completedAt),
        ageDays,
        stale: issue.status !== "done" && ageDays >= STALE_AFTER_DAYS,
        overdueFromLastWeek: isLastWeekUnfinished(issue, weekStart),
    };
}
function comparePriority(left, right) {
    const rightWeight = PRIORITY_WEIGHTS[right.priority] ?? 0;
    const leftWeight = PRIORITY_WEIGHTS[left.priority] ?? 0;
    return rightWeight - leftWeight;
}
function sortTaskIssues(items) {
    return [...items].sort((left, right) => {
        if (left.overdueFromLastWeek !== right.overdueFromLastWeek)
            return left.overdueFromLastWeek ? -1 : 1;
        if (left.stale !== right.stale)
            return left.stale ? -1 : 1;
        const priorityDiff = comparePriority(left, right);
        if (priorityDiff !== 0)
            return priorityDiff;
        return (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "");
    });
}
function bucketOfIssue(issue) {
    if (issue.status === "done") {
        return "done";
    }
    if (IN_PROGRESS_STATUSES.has(issue.status)) {
        return "inProgress";
    }
    // 지연: 완료되지 않은 이슈가 N일(STALE_AFTER_DAYS) 이상 경과
    if (issue.stale || issue.overdueFromLastWeek) {
        return "delayed";
    }
    return "waiting";
}
function chooseMissionColumnName(rootIssue, taskCards, inheritedLabelByIssueId) {
    if (rootIssue) {
        const rootLabels = inheritedLabelByIssueId.get(rootIssue.id) ?? [];
        if (rootLabels.length > 0) {
            return rootLabels[0];
        }
    }
    for (const card of taskCards) {
        if (card.effectiveLabels.length > 0) {
            return card.effectiveLabels[0];
        }
    }
    return COLUMN_UNASSIGNED;
}
function missionTitle(rootIssue, missionId, taskCards) {
    if (rootIssue?.title) {
        return rootIssue.title;
    }
    if (taskCards.length > 0) {
        return taskCards[0].title;
    }
    return `Mission ${missionId.slice(0, 8)}`;
}
export function buildWorkBoardSnapshot(issues, options) {
    const now = options.now ?? new Date();
    const weekStart = startOfWeekKst(now);
    const weekEnd = endOfWeekKst(weekStart);
    const scopedIssues = issues.filter((issue) => !hasUniqueWorkLabel(issue));
    const issueById = new Map(scopedIssues.map((issue) => [issue.id, issue]));
    const inheritedLabelByIssueId = new Map();
    const candidateIssues = scopedIssues.filter((issue) => shouldIncludeIssueOnBoard(issue, weekStart));
    const missionMembers = new Map();
    for (const issue of candidateIssues) {
        const parentId = asString(issue.parentId);
        const missionId = parentId && issueById.has(parentId) ? parentId : issue.id;
        const bucket = missionMembers.get(missionId);
        if (bucket) {
            bucket.push(issue);
        }
        else {
            missionMembers.set(missionId, [issue]);
        }
    }
    const missions = [];
    for (const [missionId, members] of missionMembers.entries()) {
        const rootIssue = issueById.get(missionId) ?? null;
        const hasChildren = members.some((member) => asString(member.parentId) === missionId);
        let taskIssues = hasChildren
            ? members.filter((member) => member.id !== missionId)
            : members;
        if (taskIssues.length === 0 && rootIssue) {
            taskIssues = [rootIssue];
        }
        const taskCards = sortTaskIssues(taskIssues.map((issue) => {
            const inheritedLabels = resolveInheritedLabels(issue.id, issueById, inheritedLabelByIssueId);
            return createIssueCard(issue, inheritedLabels, weekStart, now);
        }));
        const columnName = chooseMissionColumnName(rootIssue, taskCards, inheritedLabelByIssueId);
        const buckets = [
            { key: "delayed", label: "지연", count: 0, items: [] },
            { key: "waiting", label: "대기", count: 0, items: [] },
            { key: "inProgress", label: "진행 중", count: 0, items: [] },
            { key: "done", label: "완료", count: 0, items: [] },
        ];
        for (const card of taskCards) {
            const key = bucketOfIssue(card);
            const bucket = buckets.find((item) => item.key === key);
            if (!bucket)
                continue;
            bucket.items.push(card);
            bucket.count += 1;
        }
        const doneCount = buckets.find((item) => item.key === "done")?.count ?? 0;
        const totalCount = taskCards.length;
        missions.push({
            missionId,
            missionIssueId: rootIssue?.id ?? null,
            missionIdentifier: rootIssue?.identifier ?? null,
            title: missionTitle(rootIssue, missionId, taskCards),
            columnName,
            labels: inheritedLabelByIssueId.get(missionId) ?? [],
            progress: {
                total: totalCount,
                done: doneCount,
                percent: totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
            },
            buckets,
            updatedAt: toIsoString(rootIssue?.updatedAt ?? taskCards[0]?.updatedAt ?? null),
        });
    }
    const columnsByName = new Map();
    for (const mission of missions) {
        const key = mission.columnName || COLUMN_UNASSIGNED;
        const bucket = columnsByName.get(key);
        if (bucket) {
            bucket.push(mission);
        }
        else {
            columnsByName.set(key, [mission]);
        }
    }
    const columns = Array.from(columnsByName.entries())
        .map(([name, missionCards]) => ({
        key: name,
        name,
        missionCount: missionCards.length,
        missions: [...missionCards].sort((left, right) => {
            const overdueDiff = (right.buckets.find((bucket) => bucket.key === "delayed")?.count ?? 0)
                - (left.buckets.find((bucket) => bucket.key === "delayed")?.count ?? 0);
            if (overdueDiff !== 0)
                return overdueDiff;
            const inProgressDiff = (right.buckets.find((bucket) => bucket.key === "inProgress")?.count ?? 0)
                - (left.buckets.find((bucket) => bucket.key === "inProgress")?.count ?? 0);
            if (inProgressDiff !== 0)
                return inProgressDiff;
            return left.title.localeCompare(right.title);
        }),
    }))
        .sort((left, right) => {
        if (left.name === COLUMN_UNASSIGNED)
            return 1;
        if (right.name === COLUMN_UNASSIGNED)
            return -1;
        return left.name.localeCompare(right.name);
    });
    const totals = {
        missions: missions.length,
        tasks: 0,
        done: 0,
        inProgress: 0,
        todo: 0,
        overdue: 0,
    };
    for (const mission of missions) {
        for (const bucket of mission.buckets) {
            totals.tasks += bucket.count;
            if (bucket.key === "done")
                totals.done += bucket.count;
            if (bucket.key === "inProgress")
                totals.inProgress += bucket.count;
            if (bucket.key === "waiting")
                totals.todo += bucket.count;
            if (bucket.key === "delayed")
                totals.overdue += bucket.count;
        }
    }
    return {
        companyId: options.companyId,
        generatedAt: now.toISOString(),
        weekRange: {
            start: weekStart.toISOString(),
            end: weekEnd.toISOString(),
            label: formatWeekRangeLabel(weekStart, weekEnd),
        },
        totals,
        columns,
    };
}
async function loadBoardSnapshot(ctx, companyId) {
    const issues = await ctx.issues.list({ companyId, limit: 500, offset: 0 });
    return buildWorkBoardSnapshot(issues, { companyId });
}
const plugin = definePlugin({
    async setup(ctx) {
        ctx.data.register("work-board-overview", async (params) => {
            const companyId = getCompanyId(ctx, params);
            if (!companyId) {
                return {
                    companyId: "",
                    generatedAt: new Date().toISOString(),
                    weekRange: {
                        start: new Date().toISOString(),
                        end: new Date().toISOString(),
                        label: "",
                    },
                    totals: {
                        missions: 0,
                        tasks: 0,
                        done: 0,
                        inProgress: 0,
                        todo: 0,
                        overdue: 0,
                    },
                    columns: [],
                };
            }
            return await loadBoardSnapshot(ctx, companyId);
        });
    },
    async onHealth() {
        return {
            status: "ok",
            message: `${PLUGIN_DISPLAY_NAME} worker ready`,
            details: {
                mode: "mission-first",
            },
        };
    },
});
export default plugin;
runWorker(plugin, import.meta.url);
//# sourceMappingURL=worker.js.map