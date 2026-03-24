import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";

import { ENTITY_TYPES } from "./constants.js";
import type { WorkflowStep } from "./dag-engine.js";

export interface WorkflowDefinition {
  name: string;
  description: string;
  companyId: string;
  status: "active" | "paused" | "archived";
  steps: WorkflowStep[];
  timeoutMinutes?: number;
  maxConcurrentRuns?: number;
}

export interface WorkflowRun {
  workflowId: string;
  workflowName: string;
  companyId: string;
  status: "running" | "completed" | "failed" | "aborted" | "timed-out";
  parentIssueId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface WorkflowStepRun {
  runId: string;
  stepId: string;
  issueId?: string;
  agentName: string;
  status:
    | "backlog"
    | "todo"
    | "in_progress"
    | "done"
    | "failed"
    | "skipped"
    | "escalated";
  retryCount: number;
  startedAt?: string;
  completedAt?: string;
  sessionId?: string;
}

type TypedEntityRecord<T> = Omit<PluginEntityRecord, "data"> & { data: T };

function toTypedRecord<T>(
  record: PluginEntityRecord,
  entityType: string,
): TypedEntityRecord<T> {
  if (record.entityType !== entityType) {
    throw new Error(`Expected entity type "${entityType}", got "${record.entityType}"`);
  }

  return record as TypedEntityRecord<T>;
}

function toEntityData<T>(value: T): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function mergeEntityData<T extends object>(
  record: PluginEntityRecord,
  updates: Partial<T>,
): T {
  return {
    ...(record.data as T),
    ...updates,
  };
}

async function getEntityByType<T>(
  ctx: PluginContext,
  id: string,
  entityType: string,
): Promise<TypedEntityRecord<T> | null> {
  const listQuery = {
    entityType,
    id,
    limit: 1,
  } as Record<string, unknown>;

  const listed = await ctx.entities.list(
    listQuery as Parameters<PluginContext["entities"]["list"]>[0],
  );
  const listedRecord = listed.find(
    (record: PluginEntityRecord) => record.id === id,
  ) ?? null;

  if (listedRecord) {
    if (listedRecord.entityType !== entityType) {
      return null;
    }

    return toTypedRecord<T>(listedRecord, entityType);
  }

  // Fallback: some host SDK variants ignore `id` on entities.list().
  // Keep defensive type verification on direct get() until id-filter support is universal.
  const record = await ctx.entities.get(id);
  if (!record) {
    return null;
  }

  if (record.entityType !== entityType) {
    return null;
  }

  return toTypedRecord<T>(record, entityType);
}

async function requireEntityByType<T>(
  ctx: PluginContext,
  id: string,
  entityType: string,
  label: string,
): Promise<TypedEntityRecord<T>> {
  const record = await getEntityByType<T>(ctx, id, entityType);

  if (!record) {
    throw new Error(`${label} not found: ${id}`);
  }

  return record;
}

export async function createWorkflowDefinition(
  ctx: PluginContext,
  def: WorkflowDefinition,
): Promise<PluginEntityRecord> {
  return await ctx.entities.create({
    entityType: ENTITY_TYPES.workflowDefinition,
    scopeKind: "company",
    scopeId: def.companyId,
    title: def.name,
    status: def.status,
    data: toEntityData(def),
  });
}

export async function getWorkflowDefinition(
  ctx: PluginContext,
  id: string,
): Promise<(PluginEntityRecord & { data: WorkflowDefinition }) | null> {
  return await getEntityByType<WorkflowDefinition>(
    ctx,
    id,
    ENTITY_TYPES.workflowDefinition,
  );
}

export async function listWorkflowDefinitions(
  ctx: PluginContext,
  companyId: string,
): Promise<PluginEntityRecord[]> {
  return await ctx.entities.list({
    entityType: ENTITY_TYPES.workflowDefinition,
    scopeKind: "company",
    scopeId: companyId,
  });
}

export async function updateWorkflowDefinition(
  ctx: PluginContext,
  id: string,
  updates: Partial<WorkflowDefinition>,
): Promise<PluginEntityRecord> {
  const current = await requireEntityByType<WorkflowDefinition>(
    ctx,
    id,
    ENTITY_TYPES.workflowDefinition,
    "Workflow definition",
  );
  const data = mergeEntityData<WorkflowDefinition>(current, updates);

  return await ctx.entities.update(id, {
    title: data.name,
    status: data.status,
    data: toEntityData(data),
  });
}

export async function createWorkflowRun(
  ctx: PluginContext,
  run: WorkflowRun,
): Promise<PluginEntityRecord> {
  return await ctx.entities.create({
    entityType: ENTITY_TYPES.workflowRun,
    scopeKind: "company",
    scopeId: run.companyId,
    title: `${run.workflowName} run`,
    status: run.status,
    data: toEntityData(run),
  });
}

export async function getWorkflowRun(
  ctx: PluginContext,
  id: string,
): Promise<(PluginEntityRecord & { data: WorkflowRun }) | null> {
  return await getEntityByType<WorkflowRun>(ctx, id, ENTITY_TYPES.workflowRun);
}

export async function listActiveRuns(
  ctx: PluginContext,
  companyId: string,
): Promise<PluginEntityRecord[]> {
  const runs = await ctx.entities.list({
    entityType: ENTITY_TYPES.workflowRun,
    scopeKind: "company",
    scopeId: companyId,
  });

  return runs.filter((run: PluginEntityRecord) => run.status === "running");
}

export async function updateWorkflowRun(
  ctx: PluginContext,
  id: string,
  updates: Partial<WorkflowRun>,
): Promise<PluginEntityRecord> {
  const current = await requireEntityByType<WorkflowRun>(
    ctx,
    id,
    ENTITY_TYPES.workflowRun,
    "Workflow run",
  );
  const data = mergeEntityData<WorkflowRun>(current, updates);

  return await ctx.entities.update(id, {
    title: `${data.workflowName} run`,
    status: data.status,
    data: toEntityData(data),
  });
}

export async function createStepRun(
  ctx: PluginContext,
  companyId: string,
  stepRun: WorkflowStepRun,
): Promise<PluginEntityRecord> {
  return await ctx.entities.create({
    entityType: ENTITY_TYPES.workflowStepRun,
    scopeKind: "company",
    scopeId: companyId,
    externalId: `${stepRun.runId}:${stepRun.stepId}`,
    title: stepRun.stepId,
    status: stepRun.status,
    data: toEntityData(stepRun),
  });
}

export async function getStepRun(
  ctx: PluginContext,
  id: string,
): Promise<(PluginEntityRecord & { data: WorkflowStepRun }) | null> {
  return await getEntityByType<WorkflowStepRun>(
    ctx,
    id,
    ENTITY_TYPES.workflowStepRun,
  );
}

export async function listStepRuns(
  ctx: PluginContext,
  runId: string,
  companyId: string,
): Promise<PluginEntityRecord[]> {
  const stepRuns = await ctx.entities.list({
    entityType: ENTITY_TYPES.workflowStepRun,
    scopeKind: "company",
    scopeId: companyId,
  });

  return stepRuns.filter(
    (stepRun: PluginEntityRecord) =>
      (stepRun.data as Partial<WorkflowStepRun>).runId === runId,
  );
}

export async function findStepRunByIssueId(
  ctx: PluginContext,
  issueId: string,
  companyId: string,
): Promise<PluginEntityRecord | null> {
  const stepRuns = await ctx.entities.list({
    entityType: ENTITY_TYPES.workflowStepRun,
    scopeKind: "company",
    scopeId: companyId,
  });

  return (
    stepRuns.find(
      (stepRun: PluginEntityRecord) =>
        (stepRun.data as Partial<WorkflowStepRun>).issueId === issueId,
    ) ?? null
  );
}

export async function updateStepRun(
  ctx: PluginContext,
  id: string,
  updates: Partial<WorkflowStepRun>,
): Promise<PluginEntityRecord> {
  const current = await requireEntityByType<WorkflowStepRun>(
    ctx,
    id,
    ENTITY_TYPES.workflowStepRun,
    "Workflow step run",
  );
  const data = mergeEntityData<WorkflowStepRun>(current, updates);

  return await ctx.entities.update(id, {
    externalId: `${data.runId}:${data.stepId}`,
    title: data.stepId,
    status: data.status,
    data: toEntityData(data),
  });
}

export async function checkIdempotency(
  ctx: PluginContext,
  key: string,
  companyId: string,
): Promise<boolean> {
  const matches = await ctx.entities.list({
    entityType: ENTITY_TYPES.idempotencyKey,
    scopeKind: "company",
    scopeId: companyId,
    externalId: key,
    limit: 1,
  });

  return matches.length > 0;
}

export async function markIdempotency(
  ctx: PluginContext,
  key: string,
  companyId: string,
): Promise<void> {
  await ctx.entities.create({
    entityType: ENTITY_TYPES.idempotencyKey,
    scopeKind: "company",
    scopeId: companyId,
    externalId: key,
    data: {
      processedAt: new Date().toISOString(),
    },
  });
}
