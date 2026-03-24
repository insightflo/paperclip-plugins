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
  createWorkflowRun,
  createStepRun,
  findStepRunByIssueId,
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

type WorkflowStepMetadata = WorkflowStep & {
  description?: string;
  assigneeAgentId?: string;
  sessionMode?: "fresh" | "reuse";
};
type AgentRecord = Awaited<ReturnType<PluginContext["agents"]["list"]>>[number];
type IssueUpdatePatch = Parameters<PluginContext["issues"]["update"]>[1];
type ReconcilerModule = {
  reconcileStuckSteps?: (ctx: PluginContext) => Promise<void>;
};

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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

  await ctx.agents.invoke(agent.id, companyId, {
    prompt,
    reason,
  });

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

async function activateBacklogStep(
  ctx: PluginContext,
  stepRunRecord: WorkflowStepRunRecord,
  stepDef: WorkflowStep,
  workflowName: string,
  companyId: string,
  options?: { parentIssueId?: string },
): Promise<WorkflowStepRunRecord> {
  if (stepRunRecord.data.status !== STEP_STATUSES.backlog) {
    return stepRunRecord;
  }

  const resolvedAgent = await resolveStepAgent(
    ctx,
    companyId,
    stepDef,
    stepRunRecord.data.agentName,
  );

  let issueId = typeof stepRunRecord.data.issueId === "string" && stepRunRecord.data.issueId.trim()
    ? stepRunRecord.data.issueId.trim()
    : "";
  const stepDescription = getStepDescription(stepDef) ?? `Workflow step: ${stepDef.id}`;

  if (!issueId) {
    const issue = await ctx.issues.create({
      assigneeAgentId: resolvedAgent.agentId ?? undefined,
      companyId,
      description: stepDescription,
      parentId: options?.parentIssueId,
      title: `[${workflowName}] ${stepDef.title}`,
    });
    await ctx.issues.update(issue.id, { status: "todo" } as IssueUpdatePatch, companyId);
    issueId = issue.id;
  }

  const nextStartedAt = stepRunRecord.data.startedAt ?? new Date().toISOString();
  let updatedStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, stepRunRecord.id, {
    agentName: resolvedAgent.agentName ?? stepRunRecord.data.agentName,
    issueId,
    startedAt: nextStartedAt,
    status: STEP_STATUSES.todo,
  }));

  updatedStepRun = await invokeAgentForStep(
    ctx,
    updatedStepRun,
    stepDef,
    workflowName,
    companyId,
  );

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

  let parentIssueId = typeof options?.parentIssueId === "string" && options.parentIssueId.trim()
    ? options.parentIssueId.trim()
    : "";
  if (!parentIssueId && options?.createParentIssue) {
    const parentIssue = await ctx.issues.create({
      companyId,
      description: typedWorkflowDefinition.data.description || `Workflow run: ${typedWorkflowDefinition.data.name}`,
      title: `[${typedWorkflowDefinition.data.name}] Workflow run`,
    });
    parentIssueId = parentIssue.id;
  }

  const workflowRun = toWorkflowRunRecord(await createWorkflowRun(ctx, {
    companyId,
    parentIssueId: parentIssueId || undefined,
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

    if (!resolvedAgent.agentName) {
      throw new Error(`Unable to resolve step assignee for "${stepDef.id}"`);
    }

    const stepRun = toWorkflowStepRunRecord(await createStepRun(ctx, companyId, {
      agentName: resolvedAgent.agentName,
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
      { parentIssueId: parentIssueId || undefined },
    );
    activatedStepIds.push(pending.stepDef.id);
  }

  ctx.logger.info("Started workflow run", {
    activatedStepIds,
    companyId,
    parentIssueId: parentIssueId || null,
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
      { parentIssueId: typedWorkflowRun.data.parentIssueId },
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
    const issue = await ctx.issues.create({
      assigneeAgentId: resolvedAgent.agentId ?? undefined,
      companyId,
      description: [
        getStepDescription(escalationStep),
        `Escalated from workflow "${workflowRun.data.workflowName}" step "${sourceStepRun.data.stepId}".`,
        sourceStepRun.data.issueId ? `Origin issue: ${sourceStepRun.data.issueId}.` : undefined,
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n\n"),
      parentId: workflowRun.data.parentIssueId ?? sourceStepRun.data.issueId,
      title: `${workflowRun.data.workflowName}: ${escalationStep.title}`,
    });

    escalationStepRun = toWorkflowStepRunRecord(await updateStepRun(ctx, escalationStepRun.id, {
      issueId: issue.id,
    }));
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
    if (typeof module.reconcileStuckSteps !== "function") {
      ctx.logger.warn("Reconciler module does not export reconcileStuckSteps");
      return;
    }

    await module.reconcileStuckSteps(ctx);
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
        if (issueStatus === "done") {
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
        ctx.logger.warn("Failed to handle issue.created event", {
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

    registerDataHandler(ctx, "workflow-overview", async (params: Record<string, unknown>) => {
      try {
        const companyId = typeof params.companyId === "string" ? params.companyId.trim() : "";
        if (!companyId) {
          return { workflows: [], activeRuns: [] };
        }

        const [workflowDefinitions, activeRuns] = await Promise.all([
          listWorkflowDefinitions(ctx, companyId),
          listActiveRuns(ctx, companyId),
        ]);

        return {
          activeRuns: activeRuns.map((record) => {
            const run = toWorkflowRunRecord(record);
            return {
              id: run.id,
              
              ...run.data,
              status: (run.data as Record<string, unknown>).status as string ?? run.status,
            };
          }),
          workflows: workflowDefinitions.map((record) => {
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
        return { workflows: [], activeRuns: [] };
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
