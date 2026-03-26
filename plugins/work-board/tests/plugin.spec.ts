import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

type SeedIssue = NonNullable<Parameters<ReturnType<typeof createTestHarness>["seed"]>[0]["issues"]>[number];
const TEST_COMPANY_ID = "company-work-board-test";

type SeedLabel = {
  id: string;
  companyId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

function makeLabel(name: string, companyId = TEST_COMPANY_ID): SeedLabel {
  return {
    id: `label-${Math.random().toString(36).slice(2)}`,
    companyId,
    name,
    color: "#3b82f6",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeIssue(overrides: Partial<SeedIssue>): SeedIssue {
  return {
    id: `issue-${Math.random().toString(36).slice(2)}`,
    companyId: TEST_COMPANY_ID,
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
  it("groups child issues into parent mission and inherits parent labels", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const mission = makeIssue({
      id: "mission-1",
      identifier: "MIS-1",
      title: "결제 장애 대응",
      labels: [makeLabel("플랫폼") as unknown as SeedIssue["labels"][number]],
    });

    const childTodo = makeIssue({
      id: "task-1",
      identifier: "MIS-2",
      parentId: mission.id,
      title: "로그 수집",
      status: "todo",
      labels: [],
    });

    const childDone = makeIssue({
      id: "task-2",
      identifier: "MIS-3",
      parentId: mission.id,
      title: "핫픽스 배포",
      status: "done",
      completedAt: new Date("2026-03-19T03:00:00.000Z"),
      labels: [],
    });

    const uniqueWork = makeIssue({
      id: "task-unique",
      identifier: "MIS-99",
      title: "내부 고유업무",
      labels: [makeLabel("[고유업무]") as unknown as SeedIssue["labels"][number]],
    });

    harness.seed({ issues: [mission, childTodo, childDone, uniqueWork] });

    const data = await harness.getData<import("../src/worker.js").WorkBoardSnapshot>("work-board-overview", {
      companyId: TEST_COMPANY_ID,
    });

    expect(data.columns.find((column) => column.name === "플랫폼")).toBeTruthy();
    const platformColumn = data.columns.find((column) => column.name === "플랫폼");
    expect(platformColumn?.missions).toHaveLength(1);

    const missionCard = platformColumn?.missions[0];
    expect(missionCard?.title).toBe("결제 장애 대응");
    expect(missionCard?.progress.total).toBe(2);
    expect(missionCard?.progress.done).toBe(1);

    const todoBucket = missionCard?.buckets.find((bucket) => bucket.key === "todo");
    const doneBucket = missionCard?.buckets.find((bucket) => bucket.key === "done");

    expect(todoBucket?.items.map((item) => item.identifier)).toContain("MIS-2");
    expect(doneBucket?.items.map((item) => item.identifier)).toContain("MIS-3");

    const allIdentifiers = data.columns
      .flatMap((column) => column.missions)
      .flatMap((card) => card.buckets)
      .flatMap((bucket) => bucket.items)
      .map((item) => item.identifier);

    expect(allIdentifiers).not.toContain("MIS-99");
  });

  it("falls back to unassigned column when labels are missing", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    harness.seed({
      issues: [
        makeIssue({
          id: "orphan-1",
          companyId: TEST_COMPANY_ID,
          identifier: "ORP-1",
          title: "라벨 없는 단독 작업",
          status: "todo",
          labels: [],
        }),
      ],
    });

    const data = await harness.getData<import("../src/worker.js").WorkBoardSnapshot>("work-board-overview", {
      companyId: TEST_COMPANY_ID,
    });

    const unassigned = data.columns.find((column) => column.name === "미분류");
    expect(unassigned).toBeTruthy();
    expect(unassigned?.missions.length).toBe(1);
    expect(unassigned?.missions[0]?.title).toBe("라벨 없는 단독 작업");
  });
});
