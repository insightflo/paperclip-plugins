import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { DEFAULT_COMPANY_ID, WORKSTREAMS } from "../src/constants.js";

type SeedIssue = NonNullable<Parameters<ReturnType<typeof createTestHarness>["seed"]>[0]["issues"]>[number];

function makeIssue(overrides: Partial<SeedIssue>): SeedIssue {
  return {
    id: `issue-${Math.random().toString(36).slice(2)}`,
    companyId: DEFAULT_COMPANY_ID,
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Untitled issue",
    description: null,
    status: "todo" as const,
    priority: "medium" as const,
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: "local-board",
    issueNumber: null,
    identifier: null,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date("2026-03-17T01:00:00.000Z"),
    updatedAt: new Date("2026-03-18T01:00:00.000Z"),
    ...overrides,
  } satisfies SeedIssue;
}

describe("work-board plugin", () => {
  it("builds a weekly area board from direct ids and keyword matches", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    harness.seed({
      issues: [
        makeIssue({
          id: "issue-portfolio",
          identifier: "ALP-101",
          title: "watchlist 정리 및 포트폴리오 리밸런싱",
          priority: "high",
          status: "todo",
          labels: [{ id: "label-portfolio", companyId: DEFAULT_COMPANY_ID, name: WORKSTREAMS[0].name, color: "#f59e0b", createdAt: new Date(), updatedAt: new Date() }],
        }),
        makeIssue({
          id: "issue-weekly",
          identifier: "ALP-102",
          title: "주간 회고 초안 작성",
          priority: "medium",
          status: "in_progress",
          updatedAt: new Date("2026-03-20T00:00:00.000Z"),
          labels: [{ id: "label-weekly", companyId: DEFAULT_COMPANY_ID, name: WORKSTREAMS[1].name, color: "#3b82f6", createdAt: new Date(), updatedAt: new Date() }],
        }),
        makeIssue({
          id: "issue-data",
          identifier: "ALP-103",
          title: "morning_routine 데이터 수집 보강",
          priority: "critical",
          status: "done" as const,
          completedAt: new Date("2026-03-19T03:00:00.000Z"),
          labels: [{ id: "label-data", companyId: DEFAULT_COMPANY_ID, name: WORKSTREAMS[2].name, color: "#22c55e", createdAt: new Date(), updatedAt: new Date() }],
        }),
        makeIssue({
          id: "issue-failed",
          identifier: "ALP-106",
          title: "포트폴리오 액션 실행 실패",
          priority: "high",
          status: "cancelled" as const,
          cancelledAt: new Date("2026-03-19T05:00:00.000Z"),
          labels: [{ id: "label-portfolio-failed", companyId: DEFAULT_COMPANY_ID, name: WORKSTREAMS[0].name, color: "#f59e0b", createdAt: new Date(), updatedAt: new Date() }],
        }),
        makeIssue({
          id: "issue-overdue",
          identifier: "ALP-107",
          title: "지난주 주간 회고 후속 작업",
          priority: "medium",
          status: "todo" as const,
          createdAt: new Date("2026-03-12T01:00:00.000Z"),
          updatedAt: new Date("2026-03-13T01:00:00.000Z"),
          labels: [{ id: "label-weekly-overdue", companyId: DEFAULT_COMPANY_ID, name: WORKSTREAMS[1].name, color: "#3b82f6", createdAt: new Date(), updatedAt: new Date() }],
        }),
        makeIssue({
          id: "issue-unmatched",
          identifier: "ALP-104",
          title: "기타 운영 작업",
          priority: "low",
          status: "todo" as const,
        }),
        makeIssue({
          id: "issue-old-done",
          identifier: "ALP-105",
          title: "지난주 완료된 포트폴리오 점검",
          status: "done" as const,
          completedAt: new Date("2026-03-10T03:00:00.000Z"),
        }),
      ],
    });

    const data = await harness.getData<import("../src/worker.js").WorkBoardSnapshot>("work-board-overview", {
      companyId: DEFAULT_COMPANY_ID,
    });

    expect(data.workstreams).toHaveLength(3);
    expect(data.totals.open).toBe(4);
    expect(data.totals.todo).toBe(2);
    expect(data.totals.inProgress).toBe(1);
    expect(data.totals.doneThisWeek).toBe(1);
    expect(data.totals.unmatched).toBe(1);

    const portfolio = data.workstreams.find((stream) => stream.name === WORKSTREAMS[0].name);
    const weekly = data.workstreams.find((stream) => stream.name === WORKSTREAMS[1].name);
    const dataCollection = data.workstreams.find((stream) => stream.name === WORKSTREAMS[2].name);

    expect(portfolio?.buckets.find((bucket) => bucket.key === "todo")?.count).toBe(1);
    expect(weekly?.buckets.find((bucket) => bucket.key === "inProgress")?.count).toBe(1);
    expect(weekly?.buckets.find((bucket) => bucket.key === "overdueLastWeek")?.count).toBe(1);
    expect(dataCollection?.buckets.find((bucket) => bucket.key === "doneThisWeek")?.count).toBe(1);
    expect(data.workstreams.flatMap((stream) => stream.buckets.flatMap((bucket) => bucket.items)).map((item) => item.identifier)).not.toContain("ALP-106");
    expect(data.unmatched[0]?.identifier).toBe("ALP-104");
  });

  it("keeps default workstreams hidden when another company has no matching issues", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    harness.seed({
      issues: [
        makeIssue({
          id: "issue-other-company",
          companyId: "company-other",
          identifier: "OTH-201",
          title: "운영 위키 정리 및 portfolio review",
          description: "weekly report와 data collect 키워드가 있어도 기본 칼럼으로 가면 안 된다.",
          labels: [{ id: "label-backoffice", companyId: "company-other", name: "백오피스", color: "#64748b", createdAt: new Date(), updatedAt: new Date() }],
        }),
        makeIssue({
          id: "issue-other-unmatched",
          companyId: "company-other",
          identifier: "OTH-202",
          title: "policy review for release signal",
          description: "portfolio, weekly, data 같은 키워드가 있어도 라벨 없으면 미분류여야 한다.",
        }),
      ],
    });

    const data = await harness.getData<import("../src/worker.js").WorkBoardSnapshot>("work-board-overview", {
      companyId: "company-other",
    });

    expect(data.workstreams.map((stream) => stream.name)).toEqual(["백오피스"]);
    expect(data.workstreams.map((stream) => stream.name)).not.toEqual(expect.arrayContaining(WORKSTREAMS.map((stream) => stream.name)));
    expect(data.totals.todo).toBe(2);
    expect(data.totals.inProgress).toBe(0);
    expect(data.unmatched.map((item) => item.identifier)).toEqual(["OTH-202"]);
  });
});
