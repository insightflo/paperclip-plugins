import type { PluginContext, PluginEntityRecord } from "@paperclipai/plugin-sdk";

import { ENTITY_TYPES, RUN_STATUSES, STEP_STATUSES } from "./constants.js";
import {
  getWorkflowDefinition,
  getWorkflowRun,
  listActiveRuns,
  listStepRuns,
  updateStepRun,
  updateWorkflowRun,
} from "./workflow-store.js";
import {
  TERMINAL_STEP_STATUSES,
  findStepDefinition,
  getStepAgentName,
  toWorkflowDefinitionRecord,
  toWorkflowRunRecord,
  toWorkflowStepRunRecord,
} from "./workflow-utils.js";

const STALE_THRESHOLD_MS = 300_000;

function isStale(record: PluginEntityRecord, thresholdMs: number): boolean {
  const updatedAt = new Date(record.updatedAt).getTime();
  return Date.now() - updatedAt > thresholdMs;
}

async function invokeAgentByName(
  ctx: PluginContext,
  agentName: string,
  stepTitle: string,
  workflowName: string,
  companyId: string,
): Promise<void> {
  const agents = await ctx.agents.list({ companyId });
  const agent = agents.find(
    (candidate: Awaited<ReturnType<PluginContext["agents"]["list"]>>[number]) => candidate.name === agentName,
  );

  if (!agent) {
    ctx.logger.warn("Reconciler: agent not found", { agentName, companyId });
    return;
  }

  await ctx.agents.invoke(agent.id, companyId, {
    prompt: `[Reconciler] workflow:${workflowName}/step — "${stepTitle}" appears stuck. Please check and continue.`,
    reason: `reconciler:${workflowName}`,
  });
}

export async function reconcileStuckSteps(ctx: PluginContext): Promise<void> {
  let runsChecked = 0;
  let stepsRetriggered = 0;

  try {
    const definitions = await ctx.entities.list({
      entityType: ENTITY_TYPES.workflowDefinition,
    });
    const companyIds = new Set<string>();

    for (const definition of definitions) {
      if (typeof definition.scopeId === "string" && definition.scopeId.trim()) {
        companyIds.add(definition.scopeId.trim());
      }
    }

    for (const companyId of companyIds) {
      let activeRuns: PluginEntityRecord[] = [];

      try {
        activeRuns = await listActiveRuns(ctx, companyId);
      } catch (error) {
        ctx.logger.warn("Reconciler: failed to list active runs", {
          companyId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      for (const runRecord of activeRuns) {
        runsChecked += 1;

        try {
          const workflowRun = await getWorkflowRun(ctx, runRecord.id);
          if (!workflowRun) {
            ctx.logger.warn("Reconciler: workflow run not found", {
              companyId,
              runId: runRecord.id,
            });
            continue;
          }

          const typedWorkflowRun = toWorkflowRunRecord(workflowRun);
          if (typedWorkflowRun.data.status !== RUN_STATUSES.running) {
            continue;
          }

          const workflowDefinition = await getWorkflowDefinition(ctx, typedWorkflowRun.data.workflowId);
          if (!workflowDefinition) {
            ctx.logger.warn("Reconciler: workflow definition not found", {
              companyId,
              runId: typedWorkflowRun.id,
              workflowId: typedWorkflowRun.data.workflowId,
            });
            continue;
          }

          const typedWorkflowDefinition = toWorkflowDefinitionRecord(workflowDefinition);
          const stepRuns = (await listStepRuns(ctx, typedWorkflowRun.id, companyId)).map(
            toWorkflowStepRunRecord,
          );
          const nowIso = new Date().toISOString();

          if (typeof typedWorkflowDefinition.data.timeoutMinutes === "number") {
            const startedAtMs = new Date(typedWorkflowRun.data.startedAt).getTime();
            const elapsedMs = Date.now() - startedAtMs;
            const timeoutMs = typedWorkflowDefinition.data.timeoutMinutes * 60_000;

            if (Number.isFinite(startedAtMs) && elapsedMs > timeoutMs) {
              for (const stepRun of stepRuns) {
                if (TERMINAL_STEP_STATUSES.has(stepRun.data.status)) {
                  continue;
                }

                await updateStepRun(ctx, stepRun.id, {
                  completedAt: stepRun.data.completedAt ?? nowIso,
                  status: STEP_STATUSES.failed,
                });
              }

              await updateWorkflowRun(ctx, typedWorkflowRun.id, {
                completedAt: typedWorkflowRun.data.completedAt ?? nowIso,
                status: RUN_STATUSES.timedOut,
              });

              ctx.logger.warn("Reconciler: workflow timed out", {
                companyId,
                runId: typedWorkflowRun.id,
                timeoutMinutes: typedWorkflowDefinition.data.timeoutMinutes,
                workflowId: typedWorkflowRun.data.workflowId,
                workflowName: typedWorkflowRun.data.workflowName,
              });
              continue;
            }
          }

          const staleTodoSteps = stepRuns.filter(
            (stepRun) =>
              stepRun.data.status === STEP_STATUSES.todo &&
              isStale(stepRun, STALE_THRESHOLD_MS),
          );

          for (const stepRun of staleTodoSteps) {
            const stepDef = findStepDefinition(typedWorkflowDefinition, stepRun.data.stepId);
            if (!stepDef) {
              ctx.logger.warn("Reconciler: step definition not found for stale step", {
                companyId,
                runId: typedWorkflowRun.id,
                stepId: stepRun.data.stepId,
                workflowId: typedWorkflowRun.data.workflowId,
              });
              continue;
            }

            const agentName = getStepAgentName(stepRun, stepDef);
            if (!agentName) {
              ctx.logger.warn("Reconciler: stale step has no resolvable agent", {
                companyId,
                runId: typedWorkflowRun.id,
                stepId: stepRun.data.stepId,
                workflowId: typedWorkflowRun.data.workflowId,
              });
              continue;
            }

            await invokeAgentByName(
              ctx,
              agentName,
              stepDef.title,
              typedWorkflowRun.data.workflowName,
              companyId,
            );

            await updateStepRun(ctx, stepRun.id, {
              status: STEP_STATUSES.todo,
            });

            stepsRetriggered += 1;
            ctx.logger.info("Reconciler: re-triggered stuck step", {
              agentName,
              companyId,
              runId: typedWorkflowRun.id,
              stepId: stepRun.data.stepId,
              workflowName: typedWorkflowRun.data.workflowName,
            });
          }
        } catch (error) {
          ctx.logger.warn("Reconciler: failed while processing workflow run", {
            companyId,
            error: error instanceof Error ? error.message : String(error),
            runId: runRecord.id,
          });
        }
      }
    }
  } catch (error) {
    ctx.logger.warn("Reconciler: unexpected failure", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    ctx.logger.info(`Reconciler completed: ${runsChecked} runs checked, ${stepsRetriggered} steps re-triggered`);
  }
}
