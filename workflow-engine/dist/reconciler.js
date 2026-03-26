import { ENTITY_TYPES, RUN_STATUSES, STEP_STATUSES } from "./constants.js";
import { getWorkflowDefinition, getWorkflowRun, listActiveRuns, listStepRuns, listWorkflowDefinitions, listWorkflowRunsByWorkflowId, updateStepRun, updateWorkflowDefinition, updateWorkflowRun, } from "./workflow-store.js";
import { checkDailyRunGuard } from "./run-guards.js";
import { TERMINAL_STEP_STATUSES, findStepDefinition, getStepAgentName, toWorkflowDefinitionRecord, toWorkflowRunRecord, toWorkflowStepRunRecord, } from "./workflow-utils.js";
const DEFAULT_STEP_TIMEOUT_MS = 300_000;
function isStale(record, thresholdMs) {
    const updatedAt = new Date(record.updatedAt).getTime();
    return Date.now() - updatedAt > thresholdMs;
}
async function invokeAgentByName(ctx, agentName, stepTitle, workflowName, companyId) {
    const agents = await ctx.agents.list({ companyId });
    const agent = agents.find((candidate) => candidate.name === agentName);
    if (!agent) {
        ctx.logger.warn("Reconciler: agent not found", { agentName, companyId });
        return;
    }
    await ctx.agents.invoke(agent.id, companyId, {
        prompt: `[Reconciler] workflow:${workflowName}/step — "${stepTitle}" appears stuck. Please check and continue.`,
        reason: `reconciler:${workflowName}`,
    });
}
function matchesCronField(field, value) {
    if (field === "*")
        return true;
    for (const part of field.split(",")) {
        const trimmed = part.trim();
        if (trimmed.includes("/")) {
            const [, stepStr] = trimmed.split("/");
            const step = Number(stepStr);
            if (Number.isFinite(step) && step > 0 && value % step === 0)
                return true;
        }
        else if (trimmed.includes("-")) {
            const [lowStr, highStr] = trimmed.split("-");
            const low = Number(lowStr);
            const high = Number(highStr);
            if (value >= low && value <= high)
                return true;
        }
        else {
            if (Number(trimmed) === value)
                return true;
        }
    }
    return false;
}
function cronMatchesNow(cron, now) {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5)
        return false;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    return (matchesCronField(minute, now.getMinutes()) &&
        matchesCronField(hour, now.getHours()) &&
        matchesCronField(dayOfMonth, now.getDate()) &&
        matchesCronField(month, now.getMonth() + 1) &&
        matchesCronField(dayOfWeek, now.getDay()));
}
function parseMaxDailyRuns(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }
    const normalized = Math.trunc(value);
    if (normalized < 0) {
        return undefined;
    }
    return normalized;
}
function toIsoDay(value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return new Date(parsed).toISOString().slice(0, 10);
}
function readDateTimePart(parts, type) {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) {
        return null;
    }
    const parsed = Number(part.value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return parsed;
}
function getDateInTimezone(date, timezone) {
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
        const parts = formatter.formatToParts(date);
        const year = readDateTimePart(parts, "year");
        const month = readDateTimePart(parts, "month");
        const day = readDateTimePart(parts, "day");
        const hour = readDateTimePart(parts, "hour");
        const minute = readDateTimePart(parts, "minute");
        const second = readDateTimePart(parts, "second");
        if (year === null ||
            month === null ||
            day === null ||
            hour === null ||
            minute === null ||
            second === null) {
            return null;
        }
        return new Date(year, month - 1, day, hour, minute, second);
    }
    catch {
        return null;
    }
}
function parseDeadlineTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) {
        return null;
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
        return null;
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }
    return { hour, minute };
}
function hasExceededDeadline(now, deadlineTime) {
    const parsedDeadline = parseDeadlineTime(deadlineTime);
    if (!parsedDeadline) {
        return false;
    }
    const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const deadlineSeconds = parsedDeadline.hour * 3600 + parsedDeadline.minute * 60;
    return nowSeconds > deadlineSeconds;
}
function getStepTimeoutMs(stepDef) {
    const raw = stepDef.timeoutSeconds;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
        return raw * 1000;
    }
    return DEFAULT_STEP_TIMEOUT_MS;
}
function isStepTimedOut(stepRun, thresholdMs) {
    const runData = stepRun.data;
    const startedAtRaw = typeof runData.startedAt === "string" ? runData.startedAt : "";
    const startedAt = startedAtRaw ? Date.parse(startedAtRaw) : Number.NaN;
    const referenceMs = Number.isFinite(startedAt) ? startedAt : Date.parse(stepRun.updatedAt);
    if (!Number.isFinite(referenceMs)) {
        return false;
    }
    return Date.now() - referenceMs > thresholdMs;
}
async function countWorkflowRunsForDay(ctx, companyId, workflowId, dayKey) {
    const runs = await listWorkflowRunsByWorkflowId(ctx, companyId, workflowId);
    let count = 0;
    for (const runRecord of runs) {
        const run = toWorkflowRunRecord(runRecord);
        if (toIsoDay(run.data.startedAt) === dayKey) {
            count += 1;
        }
    }
    return count;
}
let _startWorkflowFn = null;
export function setStartWorkflowFn(fn) {
    _startWorkflowFn = fn;
}
export async function runScheduledWorkflows(ctx) {
    if (!_startWorkflowFn)
        return;
    const now = new Date();
    const definitions = await ctx.entities.list({
        entityType: ENTITY_TYPES.workflowDefinition,
    });
    const companyIds = new Set();
    for (const def of definitions) {
        if (typeof def.scopeId === "string" && def.scopeId.trim()) {
            companyIds.add(def.scopeId.trim());
        }
    }
    for (const companyId of companyIds) {
        const defs = await listWorkflowDefinitions(ctx, companyId);
        for (const defRecord of defs) {
            const def = toWorkflowDefinitionRecord(defRecord);
            // Defensive: skip entities that leaked from a different company scope
            const defCompanyId = typeof def.data.companyId === "string" ? def.data.companyId.trim() : "";
            if (defCompanyId && defCompanyId !== companyId)
                continue;
            if (def.data.status !== "active")
                continue;
            const schedule = def.data.schedule;
            if (!schedule || typeof schedule !== "string" || !schedule.trim())
                continue;
            const timezone = typeof def.data.timezone === "string" ? def.data.timezone.trim() : "";
            const nowForSchedule = timezone ? getDateInTimezone(now, timezone) : null;
            const effectiveScheduleNow = nowForSchedule ?? now;
            if (timezone && !nowForSchedule) {
                ctx.logger.warn("Invalid workflow timezone. Falling back to system local time for cron matching.", {
                    companyId,
                    timezone,
                    workflowId: def.id,
                    workflowName: def.data.name,
                });
            }
            if (!cronMatchesNow(schedule, effectiveScheduleNow))
                continue;
            // Prevent duplicate runs within the same 5-minute window
            const lastRun = def.data.lastScheduledRunAt;
            if (lastRun) {
                const lastRunTime = new Date(lastRun).getTime();
                if (Number.isFinite(lastRunTime) && now.getTime() - lastRunTime < 4 * 60_000) {
                    continue;
                }
            }
            const maxDailyRuns = parseMaxDailyRuns(def.data.maxDailyRuns);
            if (maxDailyRuns !== 0) {
                if (typeof maxDailyRuns === "number" && maxDailyRuns > 0) {
                    const dayKey = now.toISOString().slice(0, 10);
                    const runCountToday = await countWorkflowRunsForDay(ctx, companyId, def.id, dayKey);
                    if (runCountToday >= maxDailyRuns) {
                        ctx.logger.info("Skipped scheduled workflow start because maxDailyRuns was reached", {
                            companyId,
                            dayKey,
                            maxDailyRuns,
                            runCountToday,
                            workflowId: def.id,
                            workflowName: def.data.name,
                        });
                        continue;
                    }
                }
                else {
                    const dailyGuard = await checkDailyRunGuard(ctx, companyId, def.id, now);
                    if (dailyGuard.blocked) {
                        ctx.logger.info("Skipped scheduled workflow start because a same-day run already exists", {
                            companyId,
                            dayKey: dailyGuard.dayKey,
                            existingRunId: dailyGuard.existingRunId,
                            existingStatus: dailyGuard.existingStatus,
                            workflowId: def.id,
                            workflowName: def.data.name,
                        });
                        continue;
                    }
                }
            }
            try {
                await _startWorkflowFn(ctx, def.id, companyId, { createParentIssue: true });
                await updateWorkflowDefinition(ctx, def.id, {
                    lastScheduledRunAt: now.toISOString(),
                });
                ctx.logger.info("Scheduled workflow started", {
                    companyId,
                    workflowId: def.id,
                    workflowName: def.data.name,
                    schedule,
                    timezone: timezone || undefined,
                });
            }
            catch (error) {
                ctx.logger.warn("Failed to start scheduled workflow", {
                    companyId,
                    workflowId: def.id,
                    workflowName: def.data.name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
}
export async function reconcileStuckSteps(ctx) {
    let runsChecked = 0;
    let stepsRetriggered = 0;
    let stepsTimedOut = 0;
    try {
        const definitions = await ctx.entities.list({
            entityType: ENTITY_TYPES.workflowDefinition,
        });
        const companyIds = new Set();
        for (const definition of definitions) {
            if (typeof definition.scopeId === "string" && definition.scopeId.trim()) {
                companyIds.add(definition.scopeId.trim());
            }
        }
        for (const companyId of companyIds) {
            let activeRuns = [];
            try {
                activeRuns = await listActiveRuns(ctx, companyId);
            }
            catch (error) {
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
                    const stepRuns = (await listStepRuns(ctx, typedWorkflowRun.id, companyId)).map(toWorkflowStepRunRecord);
                    const now = new Date();
                    const nowIso = now.toISOString();
                    const timezone = typeof typedWorkflowDefinition.data.timezone === "string"
                        ? typedWorkflowDefinition.data.timezone.trim()
                        : "";
                    const nowForDeadline = timezone ? getDateInTimezone(now, timezone) : null;
                    const effectiveNowForDeadline = nowForDeadline ?? now;
                    if (timezone && !nowForDeadline) {
                        ctx.logger.warn("Invalid workflow timezone. Falling back to system local time for deadline checks.", {
                            companyId,
                            runId: typedWorkflowRun.id,
                            timezone,
                            workflowId: typedWorkflowRun.data.workflowId,
                            workflowName: typedWorkflowRun.data.workflowName,
                        });
                    }
                    const deadlineTime = typeof typedWorkflowDefinition.data.deadlineTime === "string"
                        ? typedWorkflowDefinition.data.deadlineTime.trim()
                        : "";
                    if (deadlineTime) {
                        if (parseDeadlineTime(deadlineTime) === null) {
                            ctx.logger.warn("Invalid workflow deadlineTime. Expected HH:MM format.", {
                                companyId,
                                deadlineTime,
                                runId: typedWorkflowRun.id,
                                workflowId: typedWorkflowRun.data.workflowId,
                                workflowName: typedWorkflowRun.data.workflowName,
                            });
                        }
                        else if (hasExceededDeadline(effectiveNowForDeadline, deadlineTime)) {
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
                            ctx.logger.warn("Reconciler: workflow timed out due to deadlineTime", {
                                companyId,
                                deadlineTime,
                                runId: typedWorkflowRun.id,
                                timezone: timezone || undefined,
                                workflowId: typedWorkflowRun.data.workflowId,
                                workflowName: typedWorkflowRun.data.workflowName,
                            });
                            continue;
                        }
                    }
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
                    let workflowFailedByStepTimeout = false;
                    const staleTodoSteps = stepRuns.filter((stepRun) => stepRun.data.status === STEP_STATUSES.todo);
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
                        const timeoutMs = getStepTimeoutMs(stepDef);
                        if (!isStepTimedOut(stepRun, timeoutMs)) {
                            continue;
                        }
                        const hasStepTimeout = typeof stepDef.timeoutSeconds === "number" &&
                            Number.isFinite(stepDef.timeoutSeconds) &&
                            stepDef.timeoutSeconds > 0;
                        if (hasStepTimeout) {
                            await updateStepRun(ctx, stepRun.id, {
                                completedAt: stepRun.data.completedAt ?? nowIso,
                                status: STEP_STATUSES.failed,
                            });
                            await updateWorkflowRun(ctx, typedWorkflowRun.id, {
                                completedAt: typedWorkflowRun.data.completedAt ?? nowIso,
                                status: RUN_STATUSES.failed,
                            });
                            stepsTimedOut += 1;
                            workflowFailedByStepTimeout = true;
                            ctx.logger.warn("Reconciler: workflow step timed out", {
                                companyId,
                                runId: typedWorkflowRun.id,
                                stepId: stepRun.data.stepId,
                                timeoutSeconds: stepDef.timeoutSeconds,
                                workflowId: typedWorkflowRun.data.workflowId,
                                workflowName: typedWorkflowRun.data.workflowName,
                            });
                            break;
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
                        await invokeAgentByName(ctx, agentName, stepDef.title, typedWorkflowRun.data.workflowName, companyId);
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
                    if (workflowFailedByStepTimeout) {
                        continue;
                    }
                }
                catch (error) {
                    ctx.logger.warn("Reconciler: failed while processing workflow run", {
                        companyId,
                        error: error instanceof Error ? error.message : String(error),
                        runId: runRecord.id,
                    });
                }
            }
        }
    }
    catch (error) {
        ctx.logger.warn("Reconciler: unexpected failure", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    finally {
        ctx.logger.info(`Reconciler completed: ${runsChecked} runs checked, ${stepsRetriggered} steps re-triggered, ${stepsTimedOut} steps timed out`);
    }
}
