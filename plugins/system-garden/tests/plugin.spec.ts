import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const COMPANY_ID = "company-garden";
type SeedAgent = NonNullable<Parameters<ReturnType<typeof createTestHarness>["seed"]>[0]["agents"]>[number];
type SeedIssue = NonNullable<Parameters<ReturnType<typeof createTestHarness>["seed"]>[0]["issues"]>[number];

function makeAgent(overrides: Partial<SeedAgent>): SeedAgent {
  return {
    id: `agent-${Math.random().toString(36).slice(2)}`,
    companyId: COMPANY_ID,
    name: "Untitled agent",
    urlKey: "untitled-agent",
    role: "general",
    title: null,
    icon: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "process",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date("2026-03-23T00:00:00.000Z"),
    updatedAt: new Date("2026-03-23T00:00:00.000Z"),
    ...overrides,
  } satisfies SeedAgent;
}

function makeIssue(overrides: Partial<SeedIssue>): SeedIssue {
  return {
    id: `issue-${Math.random().toString(36).slice(2)}`,
    companyId: COMPANY_ID,
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Untitled issue",
    description: null,
    status: "todo",
    priority: "medium",
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
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
    updatedAt: new Date("2026-03-22T00:00:00.000Z"),
    ...overrides,
  } satisfies SeedIssue;
}

describe("system-garden plugin", () => {
  it("builds a graph, health cards, and questions from seeded agents and issues", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const ceo = makeAgent({ id: "agent-ceo", name: "CEO", role: "ceo", urlKey: "ceo" });
    const cto = makeAgent({ id: "agent-cto", name: "CTO", role: "cto", urlKey: "cto", reportsTo: ceo.id });
    const engineer = makeAgent({
      id: "agent-eng",
      name: "Engineer",
      role: "engineer",
      urlKey: "engineer",
      reportsTo: cto.id,
      status: "running",
    });

    harness.seed({
      agents: [ceo, cto, engineer],
      issues: [
        makeIssue({
          id: "issue-done",
          identifier: "GAR-1",
          title: "배송",
          status: "done",
          completedAt: new Date("2026-03-23T01:00:00.000Z"),
          assigneeAgentId: engineer.id,
        }),
        makeIssue({
          id: "issue-review",
          identifier: "GAR-2",
          title: "검수 대기",
          status: "in_review",
          assigneeAgentId: engineer.id,
        }),
        makeIssue({
          id: "issue-open",
          identifier: "GAR-3",
          title: "남은 작업",
          status: "todo",
          assigneeAgentId: cto.id,
          updatedAt: new Date("2026-03-15T00:00:00.000Z"),
        }),
      ],
    });

    const data = await harness.getData<import("../src/worker.js").GardenSnapshot>("system-garden-snapshot", {
      companyId: COMPANY_ID,
    });

    expect(data.meta.agentCount).toBe(3);
    expect(data.meta.issueCount).toBe(3);
    expect(data.graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([ceo.id, cto.id, engineer.id]));
    expect(data.graph.edges).toEqual(expect.arrayContaining([
      { source: cto.id, target: ceo.id, label: "reportsTo" },
      { source: engineer.id, target: cto.id, label: "reportsTo" },
    ]));
    expect(data.cards.map((card) => card.name)).toEqual(expect.arrayContaining(["전체 가동률", "CEO", "CTO", "Engineer"]));
    expect(data.questions.length).toBeGreaterThan(0);
  });

  it("returns recent issues for the selected agent detail view", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const manager = makeAgent({ id: "agent-manager", name: "Manager", role: "general", urlKey: "manager" });

    harness.seed({
      agents: [manager],
      issues: [
        makeIssue({
          id: "issue-old",
          identifier: "GAR-11",
          title: "오래된 작업",
          assigneeAgentId: manager.id,
          updatedAt: new Date("2026-03-18T00:00:00.000Z"),
        }),
        makeIssue({
          id: "issue-new",
          identifier: "GAR-12",
          title: "최근 작업",
          assigneeAgentId: manager.id,
          updatedAt: new Date("2026-03-23T02:00:00.000Z"),
        }),
      ],
    });

    const detail = await harness.getData<import("../src/worker.js").AgentDetailSnapshot | null>("system-garden-agent-detail", {
      companyId: COMPANY_ID,
      agentId: manager.id,
    });

    expect(detail?.agentId).toBe(manager.id);
    expect(detail?.recentIssues.map((issue) => issue.identifier)).toEqual(["GAR-12", "GAR-11"]);
  });

  it("merges UA code knowledge graph nodes and edges into the agent graph", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const engineer = makeAgent({ id: "agent-eng", name: "Engineer", role: "engineer", urlKey: "engineer" });
    harness.seed({ agents: [engineer], issues: [] });

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "system-garden-kg-"));
    const kgPath = path.join(tempDir, "knowledge-graph.json");
    const previousEnv = process.env.SYSTEM_GARDEN_KG_PATH;
    process.env.SYSTEM_GARDEN_KG_PATH = kgPath;

    await writeFile(
      kgPath,
      JSON.stringify({
        nodes: [
          { id: "packages/plugins/system-garden/src/worker.ts", type: "file", label: "worker.ts", layer: "worker" },
          { id: "buildGardenSnapshot", type: "function", label: "buildGardenSnapshot", layer: "worker" },
        ],
        edges: [
          {
            source: "packages/plugins/system-garden/src/worker.ts",
            target: "buildGardenSnapshot",
            type: "contains",
          },
        ],
      }),
      "utf8",
    );

    try {
      const data = await harness.getData<import("../src/worker.js").GardenSnapshot>("system-garden-snapshot", {
        companyId: COMPANY_ID,
      });

      const codeNode = data.graph.nodes.find((node) => node.id === "code:buildGardenSnapshot");
      expect(codeNode).toBeTruthy();
      expect(codeNode?.kind).toBe("function");
      expect(data.graph.nodes.find((node) => node.id === "code:packages/plugins/system-garden/src/worker.ts")?.kind).toBe("module");
      expect(data.graph.edges).toEqual(expect.arrayContaining([
        {
          source: "code:packages/plugins/system-garden/src/worker.ts",
          target: "code:buildGardenSnapshot",
          label: "contains",
        },
      ]));
      expect(data.graph.nodes.map((node) => node.id)).toContain(engineer.id);
    } finally {
      if (previousEnv === undefined) delete process.env.SYSTEM_GARDEN_KG_PATH;
      else process.env.SYSTEM_GARDEN_KG_PATH = previousEnv;
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("caches tool-registry graph events and injects them when source is tool-registry", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const engineer = makeAgent({ id: "agent-eng", name: "Engineer", role: "engineer", urlKey: "engineer" });
    harness.seed({ agents: [engineer], issues: [] });

    await harness.emit(
      "plugin.insightflo.tool-registry.tool-graph-updated",
      {
        tools: [
          {
            name: "git-status",
            displayName: "Git Status",
            description: "Show current git status",
            command: "git status",
          },
        ],
        grants: [
          {
            agentName: "Engineer",
            toolName: "git-status",
          },
        ],
      },
      { companyId: COMPANY_ID },
    );

    const toolGraphSnapshot = await harness.getData<import("../src/worker.js").GardenSnapshot>("system-garden-snapshot", {
      companyId: COMPANY_ID,
      codeLayerSource: "tool-registry",
    });

    expect(toolGraphSnapshot.graph.nodes.map((node) => node.id)).toContain("tool:git-status");
    expect(toolGraphSnapshot.graph.nodes.find((node) => node.id === "tool:git-status")?.kind).toBe("tool");
    expect(toolGraphSnapshot.graph.edges).toEqual(expect.arrayContaining([
      {
        source: engineer.id,
        target: "tool:git-status",
        label: "uses",
      },
    ]));

    const noCodeSnapshot = await harness.getData<import("../src/worker.js").GardenSnapshot>("system-garden-snapshot", {
      companyId: COMPANY_ID,
      codeLayerSource: "none",
    });

    expect(noCodeSnapshot.graph.nodes.find((node) => node.id === "tool:git-status")).toBeFalsy();
  });
});
