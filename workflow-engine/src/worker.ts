import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEntityRecord,
  type PluginEvent,
  type PluginJobContext,
} from "@paperclipai/plugin-sdk";
import { JOB_KEYS, RUN_STATUSES, STEP_STATUSES } from "./constants.js";
import {
  getEscalationTarget,
  getNextSteps,
  getRetryInfo,
  type WorkflowStep,
} from "./dag-engine.js";
import {
  checkIdempotency,
  createWorkflowDefinition,
  createWorkflowRun,
  listWorkflowRunsByWorkflowId,
  updateWorkflowDefinition,
  createStepRun,
  findStepRunByIssueId,
  getStepRun,
  getWorkflowDefinition,
  getWorkflowRun,
  listActiveRuns,
  listStepRuns,
  listWorkflowDefinitions,
  markIdempotency,
  updateStepRun,
  updateWorkflowRun,
  type WorkflowStepRun,
} from "./workflow-store.js";
import {
  TERMINAL_STEP_STATUSES,
  findStepDefinition,
  getStepAgentName,
  getStepAgentNameHint,
  toWorkflowDefinitionRecord,
  toWorkflowRunRecord,
  toWorkflowStepRunRecord,
  type WorkflowDefinitionRecord,
  type WorkflowRunRecord,
  type WorkflowStepRunRecord,
} from "./workflow-utils.js";
import { checkDailyRunGuard } from "./run-guards.js";
import { ensureIssueLabels } from "./issue-labels.js";
import {
  autoCompleteWorkflowStepIssue,
  syncWorkflowStepIssueStatus,
  syncWorkflowStepIssueStatusFromStepRun,
} from "./run-event-utils.js";

type WorkflowStepMetadata = WorkflowStep & {
  description?: string;
  assigneeAgentId?: string;
  sessionMode?: "fresh" | "reuse";
};
type AgentRecord = Awaited<ReturnType<PluginContext["agents"]["list"]>>[number];
type IssueRecord = Awaited<ReturnType<PluginContext["issues"]["list"]>>[number];
type IssueListStatus = Parameters<PluginContext["issues"]["list"]>[0]["status"];
type IssueUpdatePatch = Parameters<PluginContext["issues"]["update"]>[1];
type IssueCreateInput = Parameters<PluginContext["issues"]["create"]>[0];
type ReconcilerModule = {
  reconcileStuckSteps?: (ctx: PluginContext) => Promise<void>;
  runScheduledWorkflows?: (ctx: PluginContext) => Promise<void>;
  setStartWorkflowFn?: (fn: (ctx: PluginContext, workflowId: string, companyId: string, options?: { createParentIssue?: boolean; parentIssueId?: string }) => Promise<unknown>) => void;
};
const OPEN_ISSUE_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);

function resolveTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\$(\w+)\}/g, (_, key) => vars[key] ?? `{$${key}}`);
}

function extractLabelNames(payload: Record<string, unknown>): string[] {
  const names: string[] = [];
  const candidates = [
    payload.labels,
    (payload.issue as Record<string, unknown> | undefined)?.labels,
  ];
  for (const raw of candidates) {
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      const name = typeof item === "string" ? item.trim()
        : typeof item === "object" && item !== null ? String((item as Record<string, unknown>).name ?? "").trim()
        : "";
      if (name) names.push(name);
    }
  }
  return names;
}

async function matchWorkflowTrigger(
  ctx: PluginContext,
  companyId: string,
  labels: string[],
): Promise<WorkflowDefinitionRecord[]> {
  const definitions = await listWorkflowDefinitions(ctx, companyId);
  const lowerLabels = labels.map((l) => l.toLowerCase());
  return definitions
    .map(toWorkflowDefinitionRecord)
    .filter((def) => def.data.status === "active")
    .filter((def) => {
      const triggerLabels = def.data.triggerLabels ?? [];
      return triggerLabels.length > 0 &&
        triggerLabels.some((tl) => lowerLabels.includes(tl.toLowerCase()));
    });
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  if (normalized < 0) {
    return undefined;
  }

  return normalized;
}

function parseOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

async function createIssueWithLabels(
  ctx: PluginContext,
  input: IssueCreateInput,
  labelIds?: string[],
): Promise<ReturnType<typeof ctx.issues.create>> {
  const issue = await ctx.issues.create(input);
  await ensureIssueLabels(ctx, issue.id, input.companyId, labelIds);
  return issue;
}

function sortIssuesByCreatedAt(issues: IssueRecord[]): IssueRecord[] {
  return [...issues].sort((left, right) => {
    const leftMs = Date.parse(String(left.createdAt ?? ""));
    const rightMs = Date.parse(String(right.createdAt ?? ""));
    if (!Number.isFinite(leftMs) && !Number.isFinite(rightMs)) return 0;
    if (!Number.isFinite(leftMs)) return 1;
    if (!Number.isFinite(rightMs)) return -1;
    return leftMs - rightMs;
  });
}

async function listCompanyIssues(
  ctx: PluginContext,
  companyId: string,
  status?: IssueListStatus,
): Promise<IssueRecord[]> {
  const pageSize = 200;
  let offset = 0;
  const issues: IssueRecord[] = [];

  while (true) {
    const page = await ctx.issues.list({
      companyId,
      limit: pageSize,
      offset,
      status,
    });
    issues.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += page.length;
  }

  return issues;
}

async function findDuplicateStepIssues(
  ctx: PluginContext,
  companyId: string,
  title: string,
  parentIssueId?: string,
): Promise<IssueRecord[]> {
  if (!parentIssueId) {
    return [];
  }

  const issues = await listCompanyIssues(ctx, companyId);
  return sortIssuesByCreatedAt(
    issues.filter((issue) =>
      issue.parentId === parentIssueId &&
      issue.title === title &&
      OPEN_ISSUE_STATUSES.has(String(issue.status ?? ""))
    ),
  );
}

async function reconcileDuplicateStepIssues(
  ctx: PluginContext,
  companyId: string,
  title: string,
  parentIssueId?: string,
): Promise<IssueRecord | null> {
  const duplicates = await findDuplicateStepIssues(ctx, companyId, title, parentIssueId);
  if (duplicates.length === 0) {
    return null;
  }

  const canonical = duplicates[0] ?? null;
  for (const duplicate of duplicates.slice(1)) {
    try {
      await ctx.issues.update(duplicate.id, { status: "cancelled" } as IssueUpdatePatch, companyId);
      await ctx.issues.createComment(
        duplicate.id,
        `Cancelled as duplicate of issue ${canonical?.id ?? ""} for workflow step "${title}".`,
        companyId,
      );
    } catch (error) {
      ctx.logger.warn("Failed to cancel duplicate workflow step issue", {
        companyId,
        duplicateIssueId: duplicate.id,
        error: summarizeError(error),
        parentIssueId,
        title,
      });
    }
  }

  return canonical;
}

function buildIdempotencyKey(event: PluginEvent): string {
  return `${event.eventType}:${event.eventId}`;
}

function getStepMetadata(stepDef: WorkflowStep): WorkflowStepMetadata {
  return stepDef as WorkflowStepMetadata;
}

function getStepDescription(stepDef: WorkflowStep): string | undefined {
  const description = getStepMetadata(stepDef).description;
  return typeof description === "string" && description.trim() ? description.trim() : undefined;
}

function getStepAgentIdHint(stepDef: WorkflowStep): string | null {
  const assigneeAgentId = getStepMetadata(stepDef).assigneeAgentId;
  if (typeof assigneeAgentId !== "string" || !assigneeAgentId.trim()) {
    return null;
  }

  return assigneeAgentId.trim();
}

async function resolveStepAgent(
  ctx: PluginContext,
  companyId: string,
  stepDef: WorkflowStep,
  fallbackAgentName?: string,
): Promise<{ agentId: string | null; agentName: string | null }> {
  const preferredName = typeof fallbackAgentName === "string" && fallbackAgentName.trim()
    ? fallbackAgentName.trim()
    : getStepAgentNameHint(stepDef);

  if (preferredName) {
    const agents = await ctx.agents.list({ companyId });
    const agent = agents.find((candidate: AgentRecord) => candidate.name === preferredName) ?? null;
    return {
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? preferredName,
    };
  }

  const agentIdHint = getStepAgentIdHint(stepDef);
  if (!agentIdHint) {
    return {
      agentId: null,
      agentName: null,
    };
  }

  const agent = await ctx.agents.get(agentIdHint, companyId);
  return {
    agentId: agent?.id ?? null,
    agentName: agent?.name ?? null,
  };
}

async function executeToolStep(
  ctx: PluginContext,
  stepRunRecord: WorkflowStepRunRecord,
  stepDef: WorkflowStep,
  workflowName: string,
  companyId: string,
): Promise<void> {
  const toolName = stepDef.toolName;
  if (!toolName) {
    ctx.logger.warn("Tool step missing toolName", { stepId: stepDef.id, workflowName });
    return;
  }

  const requestId = `${stepRunRecord.data.runId}:${stepDef.id}:${Date.now()}`;
  await ctx.events.emit("execute-tool-request", companyId, {
    requestId,
    toolName,
    args: stepDef.toolArgs ?? {},
    companyId,
    workflowRunId: stepRunRecord.data.runId,
    stepId: stepDef.id,
    stepRunId: stepRunRecord.id,
    issueId: stepRunRecord.data.issueId,
  });

  ctx.logger.info("Emitted tool execution request for workflow step", {
    toolName, companyId, workflowName,
    stepId: stepDef.id, runId: stepRunRecord.data.runId,
  });
}

async function invokeAgentForStep(
  ctx: PluginContext,
  stepRunRecord: WorkflowStepRunRecord,
  stepDef: WorkflowStep,
  workflowName: string,
  companyId: string,
): Promise<WorkflowStepRunRecord> {
  const agentName = getStepAgentName(stepRunRecord, stepDef);
  if (!agentName) {
    ctx.logger.warn("Agent name is missing for workflow step", {
      companyId,
      runId: stepRunRecord.data.runId,
      stepId: stepDef.id,
      workflowName,
    });
    return stepRunRecord;
  }

  const agents = await ctx.agents.list({ companyId });
  const agent = agents.find((candidate: AgentRecord) => candidate.name === agentName) ?? null;

  if (!agent) {
    ctx.logger.warn("Agent not found for step", {
      agentName,
      companyId,
      runId: stepRunRecord.data.runId,
      stepId: stepDef.id,
      workflowName,
    });
    return stepRunRecord;
  }

  const prompt = `workflow:${workflowName}/step:${stepDef.id} — "${stepDef.title}" is ready. Please proceed with the assigned task.`;
  const reason = `workflow:${workflowName}/step:${stepDef.id}`;
  const sessionMode = getStepMetadata(stepDef).sessionMode === "reuse" ? "reuse" : "fresh";

  if (sessionMode === "reuse") {
    let sessionId = typeof stepRunRecord.data.sessionId === "string" && stepRunRecord.data.sessionId.trim()
      ? stepRunRecord.data.sessionId.trim()
      : "";

    if (!sessionId) {
      const session = await ctx.agents.sessions.create(agent.id, companyId, {
        reason,
      });
      sessionId = session.sessionId;
      stepRunRecord = toWorkflowStepRunRecord(await updateStepRun(ctx, stepRunRecord.id, {
        sessionId,
      }));
    }

    await ctx.agents.sessions.sendMessage(sessionId, companyId, {
      prompt,
      reason,
    });

    ctx.logger.info("Sent workflow step prompt via agent session", {
      agentId: agent.id,
      agentName,
      companyId,
      runId: stepRunRecord.data.runId,
      sessionId,
      stepId: stepDef.id,
      workflowName,
    });
    return stepRunRecord;
  }

  // Use wakeup API directly with issueId, because ctx.agents.invoke
  // does not pass issueId to the wakeup context, causing the agent
  // to not check out the specific issue.
  const apiUrl = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
  const wakeupRes = await fetch(`${apiUrl}/api/agents/${agent.id}/wakeup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "assignment",
      payload: { issueId: stepRunRecord.data.issueId },
      forceFreshSession: true,
    }),
  });
  if (!wakeupRes.ok) {
    let errorDetail = "";
    try {
      const body = await wakeupRes.json() as Record<string, unknown>;
      errorDetail = String(body.error ?? "");
      const details = body.details as Record<string, unknown> | undefined;
      if (details?.status === "paused") {
        ctx.logger.error("Agent is paused — cannot execute workflow step. Unpause the agent in the UI.", {
          agentId: agent.id,
          agentName,
          companyId,
          issueId: stepRunRecord.data.issueId,
          stepId: stepDef.id,
          workflowName,
        });
        return stepRunRecord;
      }
    } catch { /* ignore parse error */ }
    ctx.logger.warn("Agent wakeup API failed, falling back to ctx.agents.invoke", {
      agentId: agent.id,
      agentName,
      error: errorDetail,
      status: wakeupRes.status,
      stepId: stepDef.id,
      workflowName,
    });
    await ctx.agents.invoke(agent.id, companyId, { prompt, reason });
  }

  ctx.logger.info("Invoked agent for workflow step", {
    agentId: agent.id,
    agentName,
    companyId,
    runId: stepRunRecord.data.runId,
    stepId: stepDef.id,
    workflowName,
  });

  return stepRunRecord;
}

async function fetchToolInstructions(
  ctx: PluginContext,
  toolNames: string[],
  companyId: string,
): Promise<string> {
  if (toolNames.length === 0) return "";

  try {
    const apiUrl = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
    const trPlugins = await fetch(`${apiUrl}/api/plugins`).then((r) => r.json()) as Array<Record<string, unknown>>;
    const trPlugin = trPlugins.find((p) => p.pluginKey === "insightflo.tool-registry");
    if (!trPlugin) return "";

    const res = await fetch(`${apiUrl}/api/plugins/${trPlugin.id}/bridge/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "tool-registry.page-data", params: { companyId } }),
    });
    if (!res.ok) return "";

    const data = (await res.json() as Record<string, unknown>).data as Record<string, unknown>;
    const tools = (data?.tools ?? []) as Array<{ data: { name: string; command: string; description?: string; instructions?: string } }>;

    const parts: string[] = [];
    for (const name of toolNames) {
      const tool = tools.find((t) => t.data.name === name);
      if (!tool) continue;
      const lines = [`### Tool: ${tool.data.name}`];
      if (tool.data.description) lines.push(tool.data.description);
      if (tool.data.instructions) lines.push(tool.data.instructions);
      lines.push(`Command: \`${tool.data.command}\``);
      parts.push(lines.join("\n"));
    }

    return parts.length > 0 ? `\n\n--- Available Tools ---\n${parts.join("\n\n")}` : "";
  } catch {
    return "";
  }
}

async function collectDependencyOutputs(
  ctx: PluginContext,
  stepDef: WorkflowStep,
  runId: string,
  companyId: string,
): Promise<string> {
  if (stepDef.dependsOn.length === 0) return "";

  const stepRuns = (await listStepRuns(ctx, runId, companyId)).map(toWorkflowStepRunRecord);
  const parts: string[] = [];

  for (const depId of stepDef.dependsOn) {
    const depRun = stepRuns.find((sr) => sr.data.stepId === depId);
    if (!depRun?.data.issueId) continue;

    try {
      const comments = await ctx.issues.listComments(depRun.data.issueId, companyId);
      const toolComments = comments.filter((c: { body?: string }) =>
        typeof c.body === "string" && c.body.includes("### Tool Execution:"),
      );
      for (const comment of toolComments) {
        parts.push(`--- Output from step "${depId}" ---\n${(comment as { body: string }).body}`);
      }
    } catch {
      // comments not available, skip
    }
  }

  return parts.join("\n\n");
}

async function activateBacklogStep(
  ctx: PluginContext,
  stepRunRecord: WorkflowStepRunRecord,
  stepDef: WorkflowStep,
  workflowName: string,
  companyId: string,
  options?: {
    parentIssueId?: string;
    runLabel?: string;
    templateVars?: Record<string, string>;
    projectId?: string;
    goalId?: string;
    labelIds?: string[];
  },
): Promise<WorkflowStepRunRecord> {
  if (stepRunRecord.data.status !== STEP_STATUSES.backlog) {
    return stepRunRecord;
  }

  const isToolStep = (stepDef.type ?? "agent") === "tool";
  const resolvedAgent = isToolStep
    ? { agentId: null, agentName: "system" }
    : await resolveStepAgent(ctx, companyId, stepDef, stepRunRecord.data.agentName);
  const issueTitle = `[${workflowName}] ${resolveTemplateVars(stepDef.title, options?.templateVars ?? {})}`;

  let issueId = typeof stepRunRecord.data.issueId === "string" && stepRunRecord.data.issueId.trim()
    ? stepRunRecord.data.issueId.trim()
    : "";
  const stepDescription = getStepDescription(stepDef) ?? `Workflow step: ${stepDef.id}`;
  const depOutputs = !isToolStep
    ? await collectDependencyOutputs(ctx, stepDef, stepRunRecord.data.runId, companyId)
    : "";
  const toolInstructions = !isToolStep && (stepDef.tools ?? []).length > 0
    ? await fetchToolInstructions(ctx, stepDef.tools!, companyId)
    : "";
  const fullDescription = [stepDescription, depOutputs, toolInstructions].filter(Boolean).join("\n\n");
  let stepIssue: IssueRecord | null = null;

  if (!issueId) {
    stepIssue = await reconcileDuplicateStepIssues(
      ctx,
      companyId,
      issueTitle,
      options?.parentIssueId,
    );

    if (!stepIssue) {
      stepIssue = await createIssueWithLabels(ctx, {
        assigneeAgentId: resolvedAgent.agentId ?? undefined,
        companyId,
        description: fullDescription,
        parentId: options?.parentIssueId,
        goalId: options?.goalId || undefined,
        projectId: options?.projectId || undefined,
        title: issueTitle,
      }, options?.labelIds);
      await ctx.issues.update(stepIssue.id, { status: "todo" } as IssueUpdatePatch, companyId);
    }

    const canonicalIssue = await reconcileDuplicateStepIssues(
      ctx,
      companyId,
      issueTitle,
      options?.parentIssueId,
    );
    if (canonicalIssue) {
      stepIssue = canonicalIssue;
    }
    issueId = stepIssue.id;
  } else {
    try {
      stepIssue = await ctx.issues.get(issueId, companyId);
    } catch {
      stepIssue = null;
    }
  }

  if (!stepIssue) {
    const issue = await createIssueWithLabels(ctx, {
      assigneeAgentId: resolvedAgent.agentId ?? undefined,
      companyId,
      description: fullDescription,
      parentId: options?.parentIssueId,
      goalId: options?.goalId || undefined,
      projectId: options?.projectId || undefined,
      title: issueTitle,
    }, options?.labelIds);
    await ctx.issues.update(issue.id, { status: "todo" } as IssueUpdatePatch, companyId);
    stepIssue = issue;
    issueId = issue.id;
  }
  await ensureIssueLabels(ctx, issueId, companyId, options?.labelIds);

  const nextStartedAt = stepRunRecord.data.startedAt ?? new Date().toISOString();
  let updatedStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, stepRunRecord.id, {
    agentName: resolvedAgent.agentName ?? stepRunRecord.data.agentName,
    issueId,
    startedAt: nextStartedAt,
    status: STEP_STATUSES.todo,
  }));

  const stepType = stepDef.type ?? "agent";
  if (stepType === "tool") {
    await executeToolStep(ctx, updatedStepRun, stepDef, workflowName, companyId);
  } else {
    updatedStepRun = await invokeAgentForStep(
      ctx,
      updatedStepRun,
      stepDef,
      workflowName,
      companyId,
    );
    // wakeup 직후 즉시 in_progress로 변경 — todo 상태로 5분 지나면 Reconciler가 stuck으로 오판
    const inProgressRecord = await updateStepRun(ctx, updatedStepRun.id, {
      status: STEP_STATUSES.inProgress,
      startedAt: updatedStepRun.data.startedAt ?? new Date().toISOString(),
    });
    updatedStepRun = toWorkflowStepRunRecord(inProgressRecord);
  }

  return updatedStepRun;
}

async function startWorkflow(
  ctx: PluginContext,
  workflowId: string,
  companyId: string,
  options?: {
    createParentIssue?: boolean;
    parentIssueId?: string;
  },
): Promise<{
  activatedStepIds: string[];
  parentIssueId: string | null;
  runId: string;
  workflowId: string;
}> {
  const workflowDefinition = await getWorkflowDefinition(ctx, workflowId);
  if (!workflowDefinition) {
    throw new Error(`Workflow definition not found: ${workflowId}`);
  }

  const typedWorkflowDefinition = toWorkflowDefinitionRecord(workflowDefinition);
  if (typedWorkflowDefinition.data.companyId !== companyId) {
    throw new Error(`Workflow does not belong to company: ${workflowId}`);
  }

  // Build run label with date + daily run number
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const existingRuns = await listWorkflowRunsByWorkflowId(ctx, companyId, workflowId);
  const todayRuns = existingRuns.filter((r: PluginEntityRecord) => {
    const started = (r.data as Record<string, unknown>).startedAt;
    return typeof started === "string" && started.startsWith(dateStr);
  });
  const runNumber = todayRuns.length + 1;
  const runLabel = `#${dateStr}-${runNumber}`;
  const templateVars: Record<string, string> = {
    date: dateStr,
    runNumber: String(runNumber),
    runLabel,
    workflowName: typedWorkflowDefinition.data.name,
  };

  let parentIssueId = typeof options?.parentIssueId === "string" && options.parentIssueId.trim()
    ? options.parentIssueId.trim()
    : "";
  if (!parentIssueId && options?.createParentIssue) {
    const parentIssue = await createIssueWithLabels(ctx, {
      companyId,
      description: typedWorkflowDefinition.data.description || `Workflow run: ${typedWorkflowDefinition.data.name}`,
      goalId: typedWorkflowDefinition.data.goalId || undefined,
      projectId: typedWorkflowDefinition.data.projectId || undefined,
      title: `[${typedWorkflowDefinition.data.name}] ${runLabel}`,
    }, typedWorkflowDefinition.data.labelIds as string[] | undefined);
    parentIssueId = parentIssue.id;
  }
  if (parentIssueId) {
    await ensureIssueLabels(
      ctx,
      parentIssueId,
      companyId,
      typedWorkflowDefinition.data.labelIds as string[] | undefined,
    );
  }

  const workflowRun = toWorkflowRunRecord(await createWorkflowRun(ctx, {
    companyId,
    parentIssueId: parentIssueId || undefined,
    runLabel,
    startedAt: new Date().toISOString(),
    status: RUN_STATUSES.running,
    workflowId: typedWorkflowDefinition.id,
    workflowName: typedWorkflowDefinition.data.name,
  }));

  const agents = await ctx.agents.list({ companyId });
  const agentsByName = new Map<string, AgentRecord>();
  for (const agent of agents) {
    agentsByName.set(agent.name, agent);
  }

  const pendingRootSteps: Array<{ stepDef: WorkflowStep; stepRun: WorkflowStepRunRecord }> = [];
  for (const stepDef of typedWorkflowDefinition.data.steps) {
    const agentNameHint = getStepAgentNameHint(stepDef);
    const matchedAgent = agentNameHint ? agentsByName.get(agentNameHint) ?? null : null;
    const resolvedAgent = matchedAgent
      ? { agentId: matchedAgent.id, agentName: matchedAgent.name }
      : await resolveStepAgent(ctx, companyId, stepDef, agentNameHint ?? undefined);

    if (!resolvedAgent.agentName && (stepDef.type ?? "agent") === "agent") {
      throw new Error(`Unable to resolve step assignee for "${stepDef.id}"`);
    }

    const stepRun = toWorkflowStepRunRecord(await createStepRun(ctx, companyId, {
      agentName: resolvedAgent.agentName ?? "system",
      retryCount: 0,
      runId: workflowRun.id,
      status: STEP_STATUSES.backlog,
      stepId: stepDef.id,
    }));

    if (stepDef.dependsOn.length === 0 && stepDef.triggerOn !== "escalation") {
      pendingRootSteps.push({ stepDef, stepRun });
    }
  }

  const activatedStepIds: string[] = [];
  for (const pending of pendingRootSteps) {
    await activateBacklogStep(
      ctx,
      pending.stepRun,
      pending.stepDef,
      typedWorkflowDefinition.data.name,
      companyId,
      {
        parentIssueId: parentIssueId || undefined,
        runLabel,
        templateVars,
        projectId: typedWorkflowDefinition.data.projectId,
        goalId: typedWorkflowDefinition.data.goalId,
        labelIds: typedWorkflowDefinition.data.labelIds as string[] | undefined,
      },
    );
    activatedStepIds.push(pending.stepDef.id);
  }

  ctx.logger.info("Started workflow run", {
    activatedStepIds,
    companyId,
    parentIssueId: parentIssueId || null,
    runLabel,
    runId: workflowRun.id,
    workflowId: typedWorkflowDefinition.id,
    workflowName: typedWorkflowDefinition.data.name,
  });

  return {
    activatedStepIds,
    parentIssueId: parentIssueId || null,
    runId: workflowRun.id,
    workflowId: typedWorkflowDefinition.id,
  };
}

async function advanceWorkflow(
  ctx: PluginContext,
  stepRunRecord: PluginEntityRecord,
  companyId: string,
): Promise<void> {
  const completedStepRun = toWorkflowStepRunRecord(stepRunRecord);
  const workflowRun = await getWorkflowRun(ctx, completedStepRun.data.runId);

  if (!workflowRun) {
    ctx.logger.warn("Workflow run not found while advancing workflow", {
      companyId,
      runId: completedStepRun.data.runId,
      stepId: completedStepRun.data.stepId,
    });
    return;
  }

  const typedWorkflowRun = toWorkflowRunRecord(workflowRun);
  if (typedWorkflowRun.data.status !== RUN_STATUSES.running) {
    return;
  }

  const workflowDefinition = await getWorkflowDefinition(ctx, typedWorkflowRun.data.workflowId);
  if (!workflowDefinition) {
    ctx.logger.warn("Workflow definition not found while advancing workflow", {
      companyId,
      runId: typedWorkflowRun.id,
      stepId: completedStepRun.data.stepId,
      workflowId: typedWorkflowRun.data.workflowId,
    });
    return;
  }

  const typedWorkflowDefinition = toWorkflowDefinitionRecord(workflowDefinition);
  const stepRuns = (await listStepRuns(ctx, typedWorkflowRun.id, companyId)).map(toWorkflowStepRunRecord);
  const completed = new Set<string>();
  const failed = new Set<string>();
  const skipped = new Set<string>();

  for (const candidate of stepRuns) {
    if (candidate.data.status === STEP_STATUSES.done) {
      completed.add(candidate.data.stepId);
      continue;
    }

    if (candidate.data.status === STEP_STATUSES.failed) {
      failed.add(candidate.data.stepId);
      continue;
    }

    if (candidate.data.status === STEP_STATUSES.skipped) {
      skipped.add(candidate.data.stepId);
    }
  }

  const nextSteps = getNextSteps(
    typedWorkflowDefinition.data.steps,
    completed,
    failed,
    skipped,
  );
  const stepRunsById = new Map(stepRuns.map((candidate) => [candidate.data.stepId, candidate]));

  for (const stepId of nextSteps.readyStepIds) {
    const stepDef = findStepDefinition(typedWorkflowDefinition, stepId);
    if (!stepDef) {
      ctx.logger.warn("Ready workflow step definition not found", {
        companyId,
        runId: typedWorkflowRun.id,
        stepId,
      });
      continue;
    }

    let stepRun = stepRunsById.get(stepId) ?? null;
    if (!stepRun) {
      const resolvedAgent = await resolveStepAgent(ctx, companyId, stepDef);
      if (!resolvedAgent.agentName) {
        ctx.logger.warn("Unable to create missing step run without agent assignment", {
          companyId,
          runId: typedWorkflowRun.id,
          stepId,
        });
        continue;
      }

      stepRun = toWorkflowStepRunRecord(await createStepRun(ctx, companyId, {
        agentName: resolvedAgent.agentName,
        retryCount: 0,
        runId: typedWorkflowRun.id,
        status: STEP_STATUSES.backlog,
        stepId,
      }));
      stepRunsById.set(stepId, stepRun);
    }

    await activateBacklogStep(
      ctx,
      stepRun,
      stepDef,
      typedWorkflowRun.data.workflowName,
      companyId,
      {
        parentIssueId: typedWorkflowRun.data.parentIssueId,
        projectId: typedWorkflowDefinition.data.projectId,
        goalId: typedWorkflowDefinition.data.goalId,
        labelIds: typedWorkflowDefinition.data.labelIds as string[] | undefined,
        runLabel: typedWorkflowRun.data.runLabel,
        templateVars: {
          date: (typedWorkflowRun.data.startedAt ?? "").slice(0, 10),
          runNumber: String(typedWorkflowRun.data.runLabel ?? "").replace(/^#\d{4}-\d{2}-\d{2}-/, ""),
          runLabel: typedWorkflowRun.data.runLabel ?? "",
          workflowName: typedWorkflowRun.data.workflowName,
        },
      },
    );
  }

  if (!nextSteps.isWorkflowComplete || (typedWorkflowRun.data.status as string) === RUN_STATUSES.completed) {
    return;
  }

  await updateWorkflowRun(ctx, typedWorkflowRun.id, {
    completedAt: typedWorkflowRun.data.completedAt ?? new Date().toISOString(),
    status: RUN_STATUSES.completed,
  });

  ctx.logger.info("Workflow completed", {
    companyId,
    runId: typedWorkflowRun.id,
    workflowId: typedWorkflowRun.data.workflowId,
    workflowName: typedWorkflowRun.data.workflowName,
  });
}

async function activateEscalationStep(
  ctx: PluginContext,
  workflowRun: WorkflowRunRecord,
  workflowDefinition: WorkflowDefinitionRecord,
  sourceStepRun: WorkflowStepRunRecord,
  escalationTargetId: string,
  companyId: string,
): Promise<void> {
  const escalationStep = findStepDefinition(workflowDefinition, escalationTargetId);
  if (!escalationStep) {
    throw new Error(`Escalation target step not found: ${escalationTargetId}`);
  }

  const stepRuns = (await listStepRuns(ctx, workflowRun.id, companyId)).map(toWorkflowStepRunRecord);
  let escalationStepRun = stepRuns.find((candidate) => candidate.data.stepId === escalationTargetId) ?? null;
  const resolvedAgent = await resolveStepAgent(
    ctx,
    companyId,
    escalationStep,
    escalationStepRun?.data.agentName,
  );

  if (!resolvedAgent.agentName) {
    throw new Error(`Escalation target step "${escalationTargetId}" has no resolvable agent`);
  }

  if (!escalationStepRun) {
    escalationStepRun = toWorkflowStepRunRecord(await createStepRun(ctx, companyId, {
      agentName: resolvedAgent.agentName,
      retryCount: 0,
      runId: workflowRun.id,
      status: STEP_STATUSES.backlog,
      stepId: escalationTargetId,
    }));
  }

  if (!escalationStepRun.data.issueId) {
    const issue = await createIssueWithLabels(ctx, {
      assigneeAgentId: resolvedAgent.agentId ?? undefined,
      companyId,
      description: [
        getStepDescription(escalationStep),
        `Escalated from workflow "${workflowRun.data.workflowName}" step "${sourceStepRun.data.stepId}".`,
        sourceStepRun.data.issueId ? `Origin issue: ${sourceStepRun.data.issueId}.` : undefined,
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n\n"),
      parentId: workflowRun.data.parentIssueId ?? sourceStepRun.data.issueId,
      title: `${workflowRun.data.workflowName}: ${escalationStep.title}`,
    }, workflowDefinition.data.labelIds as string[] | undefined);

    escalationStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, escalationStepRun.id, {
      issueId: issue.id,
    }));
  }
  if (escalationStepRun.data.issueId) {
    await ensureIssueLabels(
      ctx,
      escalationStepRun.data.issueId,
      companyId,
      workflowDefinition.data.labelIds as string[] | undefined,
    );
  }

  const shouldActivate = escalationStepRun.data.status === STEP_STATUSES.backlog;
  if (shouldActivate) {
    escalationStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, escalationStepRun.id, {
      status: STEP_STATUSES.todo,
    }));
  }

  if (shouldActivate) {
    await invokeAgentForStep(
      ctx,
      escalationStepRun,
      escalationStep,
      workflowRun.data.workflowName,
      companyId,
    );
  }
}

async function handleStepFailureEvent(
  ctx: PluginContext,
  event: PluginEvent,
  options: { allowRetry: boolean },
): Promise<void> {
  const idempotencyKey = buildIdempotencyKey(event);
  if (await checkIdempotency(ctx, idempotencyKey, event.companyId)) {
    return;
  }

  const payload = event.payload as { issueId?: string };
  const issueId = typeof payload.issueId === "string" && payload.issueId.trim()
    ? payload.issueId.trim()
    : "";

  if (!issueId) {
    return;
  }

  const stepRunRecord = await findStepRunByIssueId(ctx, issueId, event.companyId);
  if (!stepRunRecord) {
    return;
  }

  const typedStepRun = toWorkflowStepRunRecord(stepRunRecord);
  if (TERMINAL_STEP_STATUSES.has(typedStepRun.data.status)) {
    return;
  }

  const workflowRun = await getWorkflowRun(ctx, typedStepRun.data.runId);
  if (!workflowRun) {
    ctx.logger.warn("Workflow run not found for failed step", {
      companyId: event.companyId,
      issueId,
      runId: typedStepRun.data.runId,
      stepId: typedStepRun.data.stepId,
    });
    return;
  }

  const typedWorkflowRun = toWorkflowRunRecord(workflowRun);
  if (typedWorkflowRun.data.status !== RUN_STATUSES.running) {
    return;
  }

  const workflowDefinition = await getWorkflowDefinition(ctx, typedWorkflowRun.data.workflowId);
  if (!workflowDefinition) {
    ctx.logger.warn("Workflow definition not found for failed step", {
      companyId: event.companyId,
      issueId,
      runId: typedWorkflowRun.id,
      stepId: typedStepRun.data.stepId,
      workflowId: typedWorkflowRun.data.workflowId,
    });
    return;
  }

  const typedWorkflowDefinition = toWorkflowDefinitionRecord(workflowDefinition);
  const stepDef = findStepDefinition(typedWorkflowDefinition, typedStepRun.data.stepId);
  if (!stepDef) {
    ctx.logger.warn("Workflow step definition not found for failed step", {
      companyId: event.companyId,
      issueId,
      runId: typedWorkflowRun.id,
      stepId: typedStepRun.data.stepId,
    });
    return;
  }

  if (options.allowRetry) {
    const retryInfo = getRetryInfo(typedWorkflowDefinition.data.steps, typedStepRun.data.stepId);
    if (retryInfo.shouldRetry && typedStepRun.data.retryCount < retryInfo.maxRetries) {
      const retriedStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, typedStepRun.id, {
        completedAt: undefined,
        retryCount: typedStepRun.data.retryCount + 1,
        status: STEP_STATUSES.todo,
      }));

      await invokeAgentForStep(
        ctx,
        retriedStepRun,
        stepDef,
        typedWorkflowRun.data.workflowName,
        event.companyId,
      );

      await markIdempotency(ctx, idempotencyKey, event.companyId);
      ctx.logger.info("Retried workflow step after agent run failure", {
        companyId: event.companyId,
        issueId,
        retryCount: retriedStepRun.data.retryCount,
        runId: typedWorkflowRun.id,
        stepId: typedStepRun.data.stepId,
      });
      return;
    }
  }

  if (stepDef.onFailure === "skip") {
    const skippedStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, typedStepRun.id, {
      completedAt: new Date().toISOString(),
      status: STEP_STATUSES.skipped,
    }));

    await syncWorkflowStepIssueStatus(ctx, event, "done");
    await advanceWorkflow(ctx, skippedStepRun, event.companyId);
    await markIdempotency(ctx, idempotencyKey, event.companyId);
    ctx.logger.info("Skipped workflow step after agent run failure", {
      companyId: event.companyId,
      issueId,
      runId: typedWorkflowRun.id,
      stepId: typedStepRun.data.stepId,
    });
    return;
  }

  if (stepDef.onFailure === "abort_workflow") {
    await updateStepRun(ctx, typedStepRun.id, {
      completedAt: new Date().toISOString(),
      status: STEP_STATUSES.failed,
    });
    await updateWorkflowRun(ctx, typedWorkflowRun.id, {
      completedAt: typedWorkflowRun.data.completedAt ?? new Date().toISOString(),
      status: RUN_STATUSES.aborted,
    });
    await syncWorkflowStepIssueStatus(
      ctx,
      event,
      event.eventType === "agent.run.cancelled" ? "cancelled" : "blocked",
      {
        comment: [
          "### Workflow step status updated by workflow engine",
          "",
          `The agent run ${event.eventType === "agent.run.cancelled" ? "was cancelled" : "failed"} for this step.`,
          "The workflow engine marked this issue terminal so the workflow does not hang on an open task.",
        ].join("\n"),
      },
    );
    await markIdempotency(ctx, idempotencyKey, event.companyId);
    ctx.logger.warn("Aborted workflow after agent run failure", {
      companyId: event.companyId,
      issueId,
      runId: typedWorkflowRun.id,
      stepId: typedStepRun.data.stepId,
    });
    return;
  }

  if (stepDef.onFailure === "escalate") {
    const escalationTargetId = getEscalationTarget(
      typedWorkflowDefinition.data.steps,
      typedStepRun.data.stepId,
    );

    if (!escalationTargetId) {
      await updateStepRun(ctx, typedStepRun.id, {
        completedAt: new Date().toISOString(),
        status: STEP_STATUSES.failed,
      });
      await updateWorkflowRun(ctx, typedWorkflowRun.id, {
        completedAt: typedWorkflowRun.data.completedAt ?? new Date().toISOString(),
        status: RUN_STATUSES.failed,
      });
      await markIdempotency(ctx, idempotencyKey, event.companyId);
      ctx.logger.warn("Escalation target missing; workflow marked failed", {
        companyId: event.companyId,
        issueId,
        runId: typedWorkflowRun.id,
        stepId: typedStepRun.data.stepId,
      });
      return;
    }

    const escalatedStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, typedStepRun.id, {
      completedAt: new Date().toISOString(),
      status: STEP_STATUSES.escalated,
    }));

    await activateEscalationStep(
      ctx,
      typedWorkflowRun,
      typedWorkflowDefinition,
      escalatedStepRun,
      escalationTargetId,
      event.companyId,
    );

    await syncWorkflowStepIssueStatus(ctx, event, "blocked", {
      comment: [
        "### Workflow step status updated by workflow engine",
        "",
        "This step was escalated to a downstream workflow step.",
        "The original issue is now blocked to reflect the handoff.",
      ].join("\n"),
    });

    await markIdempotency(ctx, idempotencyKey, event.companyId);
    ctx.logger.warn("Escalated workflow step after agent run failure", {
      companyId: event.companyId,
      escalationTargetId,
      issueId,
      runId: typedWorkflowRun.id,
      stepId: typedStepRun.data.stepId,
    });
    return;
  }

  await updateStepRun(ctx, typedStepRun.id, {
    completedAt: new Date().toISOString(),
    status: STEP_STATUSES.failed,
  });
  await updateWorkflowRun(ctx, typedWorkflowRun.id, {
    completedAt: typedWorkflowRun.data.completedAt ?? new Date().toISOString(),
    status: RUN_STATUSES.failed,
  });
  await syncWorkflowStepIssueStatus(ctx, event, event.eventType === "agent.run.cancelled" ? "cancelled" : "blocked", {
    comment: [
      "### Workflow step status updated by workflow engine",
      "",
      `The agent run ${event.eventType === "agent.run.cancelled" ? "was cancelled" : "failed"} and the step has no recovery policy.`,
      "The issue was marked terminal so the workflow can surface the blocker explicitly.",
    ].join("\n"),
  });
  await markIdempotency(ctx, idempotencyKey, event.companyId);

  ctx.logger.warn("Workflow step failed without recovery policy", {
    companyId: event.companyId,
    issueId,
    runId: typedWorkflowRun.id,
    stepId: typedStepRun.data.stepId,
  });
}

async function runReconciler(ctx: PluginContext): Promise<void> {
  const modulePath = "./reconciler.js";

  try {
    const module = await import(modulePath) as ReconcilerModule;
    if (typeof module.setStartWorkflowFn === "function") {
      module.setStartWorkflowFn(startWorkflow);
    }
    if (typeof module.reconcileStuckSteps !== "function") {
      ctx.logger.warn("Reconciler module does not export reconcileStuckSteps");
      return;
    }

    await module.reconcileStuckSteps(ctx);

    if (typeof module.runScheduledWorkflows === "function") {
      await module.runScheduledWorkflows(ctx);
    }
  } catch (error) {
    ctx.logger.warn("Failed to run workflow reconciler", {
      error: summarizeError(error),
    });
  }
}

function registerDataHandler(
  ctx: PluginContext,
  key: string,
  handler: (params: Record<string, unknown>) => Promise<unknown>,
): void {
  const dataClient = ctx.data as {
    handle?: (handlerKey: string, handlerFn: (params: Record<string, unknown>) => Promise<unknown>) => void;
    register?: (handlerKey: string, handlerFn: (params: Record<string, unknown>) => Promise<unknown>) => void;
  };

  if (typeof dataClient.handle === "function") {
    dataClient.handle(key, handler);
    return;
  }

  if (typeof dataClient.register === "function") {
    dataClient.register(key, handler);
    return;
  }

  throw new Error("Plugin data client does not support handler registration");
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    ctx.events.on("issue.updated", async (event: PluginEvent) => {
      try {
        const idempotencyKey = buildIdempotencyKey(event);
        if (await checkIdempotency(ctx, idempotencyKey, event.companyId)) {
          return;
        }

        const issueId = typeof event.entityId === "string" && event.entityId.trim()
          ? event.entityId.trim()
          : "";
        if (!issueId) {
          return;
        }

        const stepRunRecord = await findStepRunByIssueId(ctx, issueId, event.companyId);
        if (!stepRunRecord) {
          return;
        }

        const stepRun = toWorkflowStepRunRecord(stepRunRecord);
        const payload = event.payload as { status?: string };
        const issueStatus = typeof payload.status === "string" ? payload.status : undefined;

        let nextStepStatus: string | null = null;
        if (issueStatus === "done" || issueStatus === "in_review") {
          nextStepStatus = STEP_STATUSES.done;
        } else if (issueStatus === "in_progress") {
          nextStepStatus = STEP_STATUSES.inProgress;
        }

        if (!nextStepStatus || stepRun.data.status === nextStepStatus) {
          return;
        }

        if (TERMINAL_STEP_STATUSES.has(stepRun.data.status)) {
          return;
        }

        const updatedStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, stepRun.id, {
          completedAt: nextStepStatus === STEP_STATUSES.done ? new Date().toISOString() : undefined,
          startedAt: nextStepStatus === STEP_STATUSES.inProgress
            ? stepRun.data.startedAt ?? new Date().toISOString()
            : stepRun.data.startedAt,
          status: nextStepStatus as WorkflowStepRun["status"],
        }));

        if (updatedStepRun.data.status === STEP_STATUSES.done) {
          await advanceWorkflow(ctx, updatedStepRun, event.companyId);
        }

        await markIdempotency(ctx, idempotencyKey, event.companyId);
        ctx.logger.info("Workflow step run updated from issue event", {
          companyId: event.companyId,
          issueId,
          status: updatedStepRun.data.status,
          stepId: updatedStepRun.data.stepId,
        });
      } catch (error) {
        ctx.logger.warn("Failed to handle issue.updated event", {
          companyId: event.companyId,
          error: summarizeError(error),
          eventId: event.eventId,
        });
      }
    });

    ctx.events.on("issue.created", async (event: PluginEvent) => {
      try {
        const idempotencyKey = buildIdempotencyKey(event);
        if (await checkIdempotency(ctx, idempotencyKey, event.companyId)) {
          return;
        }

        const payload = event.payload as {
          id?: string;
          parentId?: string;
          assigneeAgentId?: string;
        };
        const issueId = typeof event.entityId === "string" && event.entityId.trim()
          ? event.entityId.trim()
          : typeof payload.id === "string" && payload.id.trim()
            ? payload.id.trim()
            : "";

        const parentId = typeof payload.parentId === "string" && payload.parentId.trim()
          ? payload.parentId.trim()
          : "";
        const assigneeAgentId = typeof payload.assigneeAgentId === "string" && payload.assigneeAgentId.trim()
          ? payload.assigneeAgentId.trim()
          : "";

        if (!issueId || parentId || !assigneeAgentId) {
          await markIdempotency(ctx, idempotencyKey, event.companyId);
          return;
        }

        const agent = await ctx.agents.get(assigneeAgentId, event.companyId);
        const metadata = agent?.metadata as Record<string, unknown> | undefined;
        const defaultParentIssueId = typeof metadata?.defaultParentIssueId === "string" && metadata.defaultParentIssueId.trim()
          ? metadata.defaultParentIssueId.trim()
          : "";

        if (!defaultParentIssueId) {
          await markIdempotency(ctx, idempotencyKey, event.companyId);
          return;
        }

        await ctx.issues.update(
          issueId,
          { parentId: defaultParentIssueId } as IssueUpdatePatch,
          event.companyId,
        );
        await markIdempotency(ctx, idempotencyKey, event.companyId);

        ctx.logger.info("parentId filler: populated issue parentId from agent metadata", {
          assigneeAgentId,
          companyId: event.companyId,
          issueId,
          parentId: defaultParentIssueId,
        });
      } catch (error) {
        ctx.logger.warn("Failed to handle issue.created event (parentId filler)", {
          companyId: event.companyId,
          error: summarizeError(error),
          eventId: event.eventId,
        });
      }

      try {
        const fullPayload = event.payload as Record<string, unknown>;
        let labels = extractLabelNames(fullPayload);

        // If no labels in event payload, fetch issue to check labels
        if (labels.length === 0) {
          const triggerIssueId = typeof event.entityId === "string" && event.entityId.trim()
            ? event.entityId.trim()
            : "";
          if (triggerIssueId) {
            try {
              const issue = await ctx.issues.get(triggerIssueId, event.companyId);
              if (issue) {
                labels = extractLabelNames({ labels: (issue as unknown as Record<string, unknown>).labels });
              }
            } catch { /* issue fetch failed, skip */ }
          }
        }

        if (labels.length > 0) {
          const matched = await matchWorkflowTrigger(ctx, event.companyId, labels);
          const triggerIssueId = typeof event.entityId === "string" && event.entityId.trim()
            ? event.entityId.trim()
            : "";
          for (const def of matched) {
            const dailyGuard = await checkDailyRunGuard(ctx, event.companyId, def.id);
            if (dailyGuard.blocked) {
              ctx.logger.info("Skipped workflow auto-start from issue label trigger because a same-day run already exists", {
                companyId: event.companyId,
                dayKey: dailyGuard.dayKey,
                existingRunId: dailyGuard.existingRunId,
                existingStatus: dailyGuard.existingStatus,
                issueId: triggerIssueId,
                matchedLabels: labels,
                workflowId: def.id,
                workflowName: def.data.name,
              });
              continue;
            }

            await startWorkflow(ctx, def.id, event.companyId, {
              parentIssueId: triggerIssueId || undefined,
            });
            ctx.logger.info("Auto-started workflow from issue label trigger", {
              companyId: event.companyId,
              issueId: triggerIssueId,
              workflowId: def.id,
              workflowName: def.data.name,
              matchedLabels: labels,
            });
          }
        }
      } catch (error) {
        ctx.logger.warn("Failed to handle issue.created event (workflow trigger)", {
          companyId: event.companyId,
          error: summarizeError(error),
          eventId: event.eventId,
        });
      }
    });

    ctx.events.on("agent.run.failed", async (event: PluginEvent) => {
      try {
        await handleStepFailureEvent(ctx, event, { allowRetry: true });
      } catch (error) {
        ctx.logger.warn("Failed to handle agent.run.failed event", {
          companyId: event.companyId,
          error: summarizeError(error),
          eventId: event.eventId,
        });
      }
    });

    ctx.events.on("agent.run.cancelled", async (event: PluginEvent) => {
      try {
        await handleStepFailureEvent(ctx, event, { allowRetry: false });
      } catch (error) {
        ctx.logger.warn("Failed to handle agent.run.cancelled event", {
          companyId: event.companyId,
          error: summarizeError(error),
          eventId: event.eventId,
        });
      }
    });

    ctx.events.on("agent.run.finished", async (event: PluginEvent) => {
      try {
        const idempotencyKey = buildIdempotencyKey(event);
        if (await checkIdempotency(ctx, idempotencyKey, event.companyId)) {
          return;
        }

        const result = await autoCompleteWorkflowStepIssue(ctx, event);
        if (result.completed) {
          ctx.logger.info("Auto-completed workflow step issue from finished agent run", {
            companyId: event.companyId,
            issueId: result.issueId,
            stepId: result.stepId,
          });
        }

        if (result.completed || (result.reason !== "issue not found" && result.reason !== "missing issueId")) {
          await markIdempotency(ctx, idempotencyKey, event.companyId);
        }
      } catch (error) {
        ctx.logger.warn("Failed to handle agent.run.finished event", {
          companyId: event.companyId,
          error: summarizeError(error),
          eventId: event.eventId,
        });
      }
    });

    ctx.events.on(
      "plugin.insightflo.tool-registry.tool-execution-result" as Parameters<typeof ctx.events.on>[0],
      async (event: PluginEvent) => {
        try {
          const payload = event.payload as Record<string, unknown>;
          const stepRunId = typeof payload.stepRunId === "string" ? payload.stepRunId.trim() : "";
          const success = payload.success === true;
          const toolName = typeof payload.toolName === "string" ? payload.toolName : "";

          if (!stepRunId) {
            ctx.logger.warn("tool-execution-result missing stepRunId", { payload });
            return;
          }

          const stepRunRecord = await getStepRun(ctx, stepRunId);
          if (!stepRunRecord) {
            ctx.logger.warn("Step run not found for tool result", { stepRunId });
            return;
          }

          const typedStepRun = toWorkflowStepRunRecord(stepRunRecord);
          if (TERMINAL_STEP_STATUSES.has(typedStepRun.data.status)) {
            return;
          }

          const nextStatus = success ? STEP_STATUSES.done : STEP_STATUSES.failed;
          const updatedStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, stepRunId, {
            completedAt: new Date().toISOString(),
            status: nextStatus as WorkflowStepRun["status"],
          }));

          ctx.logger.info("Tool step completed from execution result", {
            companyId: event.companyId,
            stepId: updatedStepRun.data.stepId,
            stepRunId,
            success,
            toolName,
          });

        if (success) {
          const issueSyncResult = await syncWorkflowStepIssueStatusFromStepRun(
            ctx,
            updatedStepRun,
            event.companyId,
            "done",
          );
          if (issueSyncResult.completed) {
            ctx.logger.info("Auto-completed workflow step issue from tool execution result", {
              companyId: event.companyId,
              issueId: issueSyncResult.issueId,
              stepId: issueSyncResult.stepId,
            });
          }

          await advanceWorkflow(ctx, updatedStepRun, event.companyId);
        } else {
            // Apply failure policy for failed tool steps
            const workflowRun = await getWorkflowRun(ctx, typedStepRun.data.runId);
            if (workflowRun) {
              const typedRun = toWorkflowRunRecord(workflowRun);
              const workflowDef = await getWorkflowDefinition(ctx, typedRun.data.workflowId);
              if (workflowDef) {
                const typedDef = toWorkflowDefinitionRecord(workflowDef);
                const stepDef = findStepDefinition(typedDef, updatedStepRun.data.stepId);
                const policy = stepDef?.onFailure ?? "abort_workflow";
                if (policy === "skip") {
                  await updateStepRun(ctx, stepRunId, { status: STEP_STATUSES.skipped as WorkflowStepRun["status"] });
                  await advanceWorkflow(ctx, updatedStepRun, event.companyId);
                } else {
                  await updateWorkflowRun(ctx, typedRun.id, {
                    completedAt: new Date().toISOString(),
                    status: policy === "abort_workflow" ? RUN_STATUSES.aborted : RUN_STATUSES.failed,
                  });
                  ctx.logger.warn("Workflow failed due to tool step failure", {
                    companyId: event.companyId,
                    runId: typedRun.id,
                    stepId: updatedStepRun.data.stepId,
                    policy,
                  });
                }
              }
            }
          }
        } catch (error) {
          ctx.logger.warn("Failed to handle tool-execution-result", {
            companyId: event.companyId,
            error: summarizeError(error),
          });
        }
      },
    );

    ctx.actions.register("start-workflow", async (rawParams: unknown) => {
      const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;
      const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim() : "";
      const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
      const createParentIssue = params.createParentIssue === true;
      const parentIssueId = typeof params.parentIssueId === "string" ? params.parentIssueId.trim() : "";
      if (!workflowId || !companyId) {
        throw new Error("start-workflow requires workflowId and companyId");
      }
      return await startWorkflow(ctx, workflowId, companyId, {
        createParentIssue,
        parentIssueId: parentIssueId || undefined,
      });
    });

    ctx.actions.register("update-workflow", async (rawParams: unknown) => {
      const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;
      const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim()
        : typeof params.id === "string" ? params.id.trim() : "";
      if (!workflowId) {
        throw new Error("update-workflow requires workflowId");
      }
      const patch: Record<string, unknown> = {};
      const p = params.patch as Record<string, unknown> | undefined;
      const source = p ?? params;
      if (typeof source.name === "string") patch.name = source.name;
      if (typeof source.description === "string") patch.description = source.description;
      if (typeof source.status === "string") patch.status = source.status;
      if (Array.isArray(source.triggerLabels)) patch.triggerLabels = source.triggerLabels.map(String);
      if (Array.isArray(source.labelIds)) patch.labelIds = source.labelIds.map(String);
      if (Array.isArray(source.steps)) patch.steps = source.steps;
      if ("schedule" in source) patch.schedule = typeof source.schedule === "string" ? source.schedule.trim() || undefined : undefined;
      if ("projectId" in source) patch.projectId = typeof source.projectId === "string" ? source.projectId.trim() || undefined : undefined;
      if ("goalId" in source) patch.goalId = typeof source.goalId === "string" ? source.goalId.trim() || undefined : undefined;
      if ("maxDailyRuns" in source) {
        patch.maxDailyRuns = parseOptionalNonNegativeInteger(source.maxDailyRuns);
      }
      if ("timezone" in source) {
        patch.timezone = parseOptionalTrimmedString(source.timezone);
      }
      if ("deadlineTime" in source) {
        patch.deadlineTime = parseOptionalTrimmedString(source.deadlineTime);
      }
      const updated = await updateWorkflowDefinition(ctx, workflowId, patch);
      return { id: updated.id, ...updated.data };
    });

    ctx.actions.register("abort-run", async (rawParams: unknown) => {
      const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;
      const runId = typeof params.runId === "string" ? params.runId.trim() : "";
      if (!runId) throw new Error("abort-run requires runId");
      const run = await getWorkflowRun(ctx, runId);
      if (!run) throw new Error(`Run not found: ${runId}`);
      const typedRun = toWorkflowRunRecord(run);
      if (typedRun.data.status !== RUN_STATUSES.running) {
        return { id: runId, status: typedRun.data.status, message: "already terminal" };
      }
      await updateWorkflowRun(ctx, runId, {
        completedAt: new Date().toISOString(),
        status: RUN_STATUSES.aborted,
      });
      return { id: runId, status: "aborted" };
    });

    ctx.actions.register("delete-workflow", async (rawParams: unknown) => {
      const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;
      const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim()
        : typeof params.id === "string" ? params.id.trim() : "";
      if (!workflowId) {
        throw new Error("delete-workflow requires workflowId");
      }
      const updated = await updateWorkflowDefinition(ctx, workflowId, { status: "archived" });
      return { id: updated.id, status: "archived" };
    });

    ctx.jobs.register(JOB_KEYS.reconciler, async (_job: PluginJobContext) => {
      await runReconciler(ctx);
    });

    registerDataHandler(ctx, "start-workflow", async (params: Record<string, unknown>) => {
      const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim() : "";
      const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
      const parentIssueId = typeof params.parentIssueId === "string" ? params.parentIssueId.trim() : "";
      const createParentIssue = params.createParentIssue === true;

      if (!workflowId || !companyId) {
        throw new Error("start-workflow requires workflowId and companyId");
      }

      return await startWorkflow(ctx, workflowId, companyId, {
        createParentIssue,
        parentIssueId: parentIssueId || undefined,
      });
    });

    registerDataHandler(ctx, "create-workflow", async (params: Record<string, unknown>) => {
      const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
      const workflow = params.workflow as Record<string, unknown> | undefined;
      if (!companyId || !workflow) {
        throw new Error("create-workflow requires companyId and workflow");
      }
      const def = {
        name: String(workflow.name ?? ""),
        description: String(workflow.description ?? ""),
        companyId,
        status: (String(workflow.status ?? "active")) as "active" | "paused" | "archived",
        steps: (workflow.steps ?? []) as WorkflowStep[],
        timeoutMinutes: typeof workflow.timeoutMinutes === "number" ? workflow.timeoutMinutes : undefined,
        maxDailyRuns: parseOptionalNonNegativeInteger(workflow.maxDailyRuns),
        maxConcurrentRuns: typeof workflow.maxConcurrentRuns === "number" ? workflow.maxConcurrentRuns : undefined,
        triggerLabels: Array.isArray(workflow.triggerLabels) ? workflow.triggerLabels.map(String) : undefined,
        labelIds: Array.isArray(workflow.labelIds) ? workflow.labelIds.map(String) : undefined,
        schedule: typeof workflow.schedule === "string" ? workflow.schedule.trim() || undefined : undefined,
        timezone: parseOptionalTrimmedString(workflow.timezone),
        deadlineTime: parseOptionalTrimmedString(workflow.deadlineTime),
        projectId: typeof workflow.projectId === "string" ? workflow.projectId.trim() || undefined : undefined,
        goalId: typeof workflow.goalId === "string" ? workflow.goalId.trim() || undefined : undefined,
      };
      const created = await createWorkflowDefinition(ctx, def);
      return { id: created.id, ...def };
    });

    registerDataHandler(ctx, "update-workflow", async (params: Record<string, unknown>) => {
      const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim()
        : typeof params.id === "string" ? params.id.trim() : "";
      const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
      if (!workflowId) {
        throw new Error("update-workflow requires workflowId");
      }
      const patch: Record<string, unknown> = {};
      const p = params.patch as Record<string, unknown> | undefined;
      const source = p ?? params;
      if (typeof source.name === "string") patch.name = source.name.trim();
      if (typeof source.description === "string") patch.description = source.description.trim();
      if (typeof source.status === "string") patch.status = source.status.trim();
      if (Array.isArray(source.triggerLabels)) patch.triggerLabels = source.triggerLabels.map(String);
      if (Array.isArray(source.labelIds)) patch.labelIds = source.labelIds.map(String);
      if (Array.isArray(source.steps)) patch.steps = source.steps;
      if ("schedule" in source) patch.schedule = typeof source.schedule === "string" ? source.schedule.trim() || undefined : undefined;
      if ("projectId" in source) patch.projectId = typeof source.projectId === "string" ? source.projectId.trim() || undefined : undefined;
      if ("goalId" in source) patch.goalId = typeof source.goalId === "string" ? source.goalId.trim() || undefined : undefined;
      if ("maxDailyRuns" in source) {
        patch.maxDailyRuns = parseOptionalNonNegativeInteger(source.maxDailyRuns);
      }
      if ("timezone" in source) {
        patch.timezone = parseOptionalTrimmedString(source.timezone);
      }
      if ("deadlineTime" in source) {
        patch.deadlineTime = parseOptionalTrimmedString(source.deadlineTime);
      }
      const updated = await updateWorkflowDefinition(ctx, workflowId, patch);
      return { id: updated.id, ...updated.data };
    });

    registerDataHandler(ctx, "delete-workflow", async (params: Record<string, unknown>) => {
      const workflowId = typeof params.workflowId === "string" ? params.workflowId.trim()
        : typeof params.id === "string" ? params.id.trim() : "";
      if (!workflowId) {
        throw new Error("delete-workflow requires workflowId");
      }
      const updated = await updateWorkflowDefinition(ctx, workflowId, { status: "archived" });
      return { id: updated.id, status: "archived" };
    });

    registerDataHandler(ctx, "workflow-overview", async (params: Record<string, unknown>) => {
      try {
        const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
        if (!companyId) {
          return { workflows: [], activeRuns: [], projects: [], labels: [] };
        }

        let projectsList: Array<{ id: string; name: string }> = [];
        let labelsList: Array<{ id: string; name: string; color: string }> = [];
        try {
          const apiUrl = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
          const res = await fetch(`${apiUrl}/api/companies/${companyId}/projects?limit=200`);
          if (res.ok) {
            const raw = await res.json() as Array<Record<string, unknown>>;
            projectsList = raw.map((p) => ({ id: String(p.id), name: String(p.name ?? p.title ?? p.id) }));
          }
        } catch { /* projects not available */ }
        try {
          const apiUrl = process.env.PAPERCLIP_API_URL || "http://localhost:3100";
          const res = await fetch(`${apiUrl}/api/companies/${companyId}/labels`);
          if (res.ok) {
            const raw = await res.json() as Array<Record<string, unknown>>;
            labelsList = raw.map((label) => ({
              id: String(label.id),
              name: String(label.name ?? label.id),
              color: typeof label.color === "string" && label.color.trim() ? label.color : "#6366f1",
            }));
          }
        } catch { /* labels not available */ }

        const [workflowDefinitions, activeRuns] = await Promise.all([
          listWorkflowDefinitions(ctx, companyId),
          listActiveRuns(ctx, companyId),
        ]);

        return {
          projects: projectsList,
          labels: labelsList,
          activeRuns: await Promise.all(activeRuns.map(async (record) => {
            const run = toWorkflowRunRecord(record);
            const parentIssueId = typeof run.data.parentIssueId === "string" ? run.data.parentIssueId : "";
            let parentIssueIdentifier: string | undefined;
            if (parentIssueId) {
              try {
                const issue = await ctx.issues.get(parentIssueId, companyId);
                parentIssueIdentifier = (issue as unknown as Record<string, unknown>).identifier as string | undefined;
              } catch { /* issue not found */ }
            }
            return {
              id: run.id,
              ...run.data,
              status: (run.data as Record<string, unknown>).status as string ?? run.status,
              parentIssueIdentifier,
            };
          })),
          workflows: workflowDefinitions
            .filter((record) => {
              const data = record.data as Record<string, unknown>;
              const defCompanyId = typeof data.companyId === "string" ? data.companyId.trim() : "";
              return !defCompanyId || defCompanyId === companyId;
            })
            .map((record) => {
              const workflow = toWorkflowDefinitionRecord(record);
              return {
                id: workflow.id,

                ...workflow.data,
                status: (workflow.data as Record<string, unknown>).status as string ?? workflow.status,
              };
            }),
        };
      } catch (error) {
        ctx.logger.warn("Failed to load workflow overview data", {
          error: summarizeError(error),
        });
        return { workflows: [], activeRuns: [], projects: [], labels: [] };
      }
    });

    registerDataHandler(ctx, "workflow-run-detail", async (params: Record<string, unknown>) => {
      try {
        const runId = typeof params.runId === "string" ? params.runId.trim() : "";
        if (!runId) {
          return null;
        }

        const workflowRun = await getWorkflowRun(ctx, runId);
        if (!workflowRun) {
          return null;
        }

        const typedWorkflowRun = toWorkflowRunRecord(workflowRun);
        const [workflowDefinition, stepRuns] = await Promise.all([
          getWorkflowDefinition(ctx, typedWorkflowRun.data.workflowId),
          listStepRuns(ctx, typedWorkflowRun.id, typedWorkflowRun.data.companyId),
        ]);

        return {
          run: {
            ...typedWorkflowRun.data,
            id: typedWorkflowRun.id,
            status: typedWorkflowRun.status,
          },
          stepRuns: stepRuns.map((record: PluginEntityRecord) => {
            const stepRun = toWorkflowStepRunRecord(record);
            return {
              ...stepRun.data,
              id: stepRun.id,
              status: stepRun.status,
            };
          }),
          workflow: workflowDefinition
            ? {
              ...toWorkflowDefinitionRecord(workflowDefinition).data,
              id: workflowDefinition.id,
              status: workflowDefinition.status,
            }
            : null,
        };
      } catch (error) {
        ctx.logger.warn("Failed to load workflow run detail data", {
          error: summarizeError(error),
        });
        return null;
      }
    });
  },
});

runWorker(plugin, import.meta.url);

export default plugin;
