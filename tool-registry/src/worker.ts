import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEntityRecord,
  type PluginEvent,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import {
  ACTION_KEYS,
  DATA_KEYS,
  DEFAULT_MAX_LOGS,
  ENTITY_TYPES,
  TOOL_NAMES,
} from "./constants.js";
import { analyzeRunLog, createAuditIssue } from "./audit.js";
import {
  createTool,
  deleteTool,
  getToolByName,
  grantTool,
  isToolGrantedToAgent,
  listAgentGrants,
  listAllTools,
  listTools,
  restoreTool,
  revokeTool,
  updateTool,
  type JsonRecord,
} from "./tool-config.js";

type ExecuteToolPayload = {
  toolName?: string;
  args?: unknown;
};

type ExecutionLog = {
  timestamp: string;
  mode: "tool" | "denied" | "approval_required" | "audit";
  agentId: string;
  agentName: string;
  runId: string;
  companyId: string;
  projectId: string;
  toolName: string;
  command?: string;
  args?: unknown;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  success?: boolean;
  reason?: string;
};

const execFileAsync = promisify(execFile);

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as JsonRecord;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function normalizeCommandParts(command: string): string[] {
  const parts: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(command)) !== null) {
    const part = match[1] ?? match[2] ?? match[3] ?? "";
    if (part.length > 0) {
      parts.push(part);
    }
  }

  return parts;
}

function toFlagName(key: string): string {
  const normalized = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .toLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized.length === 1 ? `-${normalized}` : `--${normalized}`;
}

function appendFlag(args: string[], key: string, value: unknown): void {
  const flag = toFlagName(key);
  if (!flag) {
    return;
  }

  if (typeof value === "boolean") {
    if (value) {
      args.push(flag);
    }
    return;
  }

  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendFlag(args, key, item);
    }
    return;
  }

  if (typeof value === "object") {
    args.push(flag, JSON.stringify(value));
    return;
  }

  args.push(flag, String(value));
}

function buildCommandArgs(rawArgs: unknown): string[] {
  if (Array.isArray(rawArgs)) {
    return rawArgs.map((item) => String(item));
  }

  if (!rawArgs || typeof rawArgs !== "object") {
    return [];
  }

  const args: string[] = [];
  const input = rawArgs as Record<string, unknown>;

  for (const [key, value] of Object.entries(input)) {
    if (key === "_" || key === "positional") {
      continue;
    }
    appendFlag(args, key, value);
  }

  const positional = input._ ?? input.positional;
  if (Array.isArray(positional)) {
    for (const item of positional) {
      args.push(String(item));
    }
  }

  return args;
}

async function writeExecutionLog(ctx: PluginContext, log: ExecutionLog): Promise<void> {
  const externalId = `${log.timestamp}:${log.runId}:${log.agentId}:${log.toolName}:${log.mode}`;
  await ctx.entities.upsert({
    entityType: ENTITY_TYPES.executionLog,
    scopeKind: "company",
    scopeId: log.companyId,
    externalId,
    title: `${log.agentName} - ${log.toolName}`,
    status: log.success === false ? "failed" : "ok",
    data: log as unknown as Record<string, unknown>,
  });
}

async function listExecutionLogs(
  ctx: PluginContext,
  companyId: string,
  limit: number,
): Promise<Array<{ id: string; createdAt: string; data: ExecutionLog }>> {
  const pageSize = Math.max(limit, 200);
  const listed: PluginEntityRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await ctx.entities.list({
      entityType: ENTITY_TYPES.executionLog,
      scopeKind: "company",
      scopeId: companyId,
      limit: pageSize,
      offset,
    } as Parameters<PluginContext["entities"]["list"]>[0]);

    listed.push(...page);

    if (page.length < pageSize) {
      break;
    }

    offset += page.length;
  }

  return listed
    .filter((record) => record.entityType === ENTITY_TYPES.executionLog)
    .map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      data: asRecord(record.data) as ExecutionLog,
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.max(1, limit));
}

async function resolveCompanyId(
  ctx: PluginContext,
  params: Record<string, unknown>,
  fallbackCompanyId?: string,
): Promise<string> {
  const directCompanyId = asString(params.companyId);
  if (directCompanyId) {
    return directCompanyId;
  }

  const companyName = asString(params.companyName);
  if (companyName) {
    const companies = await ctx.companies.list({ limit: 200, offset: 0 });
    const matched = companies.find((company) => company.name === companyName)
      ?? companies.find((company) => company.name.toLowerCase() === companyName.toLowerCase());

    if (!matched) {
      throw new Error(`Company not found by name: ${companyName}`);
    }

    return matched.id;
  }

  if (fallbackCompanyId) {
    return fallbackCompanyId;
  }

  throw new Error("companyId or companyName is required");
}

function eventPayload(event: PluginEvent): Record<string, unknown> {
  return asRecord(event.payload);
}

function getNestedString(payload: Record<string, unknown>, ...path: string[]): string {
  let current: unknown = payload;

  for (const token of path) {
    if (!current || typeof current !== "object") {
      return "";
    }
    current = (current as Record<string, unknown>)[token];
  }

  return asString(current);
}

function extractRunEventRefs(event: PluginEvent): {
  agentId: string;
  issueId: string;
  runId: string;
  projectId: string;
  agentName: string;
  stdout: string;
  stderr: string;
  log: string;
} {
  const payload = eventPayload(event);

  const agentId = asString(payload.agentId)
    || asString(payload.agent_id)
    || getNestedString(payload, "agent", "id");

  const issueId = asString(payload.issueId)
    || asString(payload.issue_id)
    || getNestedString(payload, "issue", "id")
    || getNestedString(payload, "context", "issueId");

  const runId = asString(payload.runId)
    || asString(payload.run_id)
    || (event.entityType === "run" ? asString(event.entityId) : "");

  const projectId = asString(payload.projectId)
    || asString(payload.project_id)
    || getNestedString(payload, "project", "id")
    || getNestedString(payload, "context", "projectId");

  const agentName = asString(payload.agentName)
    || asString(payload.agent_name)
    || getNestedString(payload, "agent", "name");

  const stdout = asString(payload.stdout) || asString(payload.stdoutExcerpt);
  const stderr = asString(payload.stderr) || asString(payload.stderrExcerpt);
  const log = asString(payload.log) || asString(payload.output);

  return {
    agentId,
    issueId,
    runId,
    projectId,
    agentName,
    stdout,
    stderr,
    log,
  };
}

async function getAgentName(ctx: PluginContext, companyId: string, agentId: string): Promise<string> {
  if (!agentId) {
    return "";
  }

  const agent = await ctx.agents.get(agentId, companyId);
  return asString(agent?.name);
}

function buildAllowedToolsComment(agentName: string, tools: string[]): string {
  if (tools.length === 0) {
    return [
      "### Tool Registry",
      `Agent **${agentName}** has no granted plugin tools for this run.`,
      "Request a grant through Tool Registry UI before using /plugins/tools/execute.",
    ].join("\n\n");
  }

  const lines = tools.map((toolName) => `- ${toolName}`).join("\n");

  return [
    "### Tool Registry",
    `Allowed tools for agent **${agentName}** at run start:`,
    lines,
    "Use only allow-listed tools through plugin tool execution.",
  ].join("\n\n");
}

async function handleRunStarted(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const refs = extractRunEventRefs(event);
  const companyId = event.companyId;

  if (!companyId || !refs.agentId) {
    return;
  }

  const resolvedAgentName = refs.agentName || await getAgentName(ctx, companyId, refs.agentId);
  if (!resolvedAgentName) {
    return;
  }

  const grants = await listAgentGrants(ctx, companyId, { agentName: resolvedAgentName });
  const allowedToolNames = Array.from(new Set(grants.map((grant) => grant.data.toolName))).sort((left, right) => left.localeCompare(right));

  if (refs.issueId) {
    const commentBody = buildAllowedToolsComment(resolvedAgentName, allowedToolNames);
    await ctx.issues.createComment(refs.issueId, commentBody, companyId);
  }

  ctx.logger.info("Injected allowed tool list on agent.run.started", {
    companyId,
    agentId: refs.agentId,
    agentName: resolvedAgentName,
    issueId: refs.issueId || null,
    toolCount: allowedToolNames.length,
  });
}

async function handleRunFinished(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const config = await ctx.config.get();
  const auditDirectBash = asBoolean(config.auditDirectBash, false);
  if (!auditDirectBash) {
    return;
  }

  const refs = extractRunEventRefs(event);
  const companyId = event.companyId;

  if (!companyId || !refs.agentId) {
    return;
  }

  const mergedLogText = [refs.log, refs.stdout, refs.stderr].filter((value) => value.length > 0).join("\n");
  const violations = analyzeRunLog(mergedLogText);

  if (violations.length === 0) {
    return;
  }

  const resolvedAgentName = refs.agentName || await getAgentName(ctx, companyId, refs.agentId) || refs.agentId;
  const createIssue = asBoolean(config.createAuditIssueOnViolation, true);
  const pauseAgent = asBoolean(config.pauseAgentOnViolation, false);

  if (createIssue) {
    const auditResult = await createAuditIssue(ctx, companyId, resolvedAgentName, violations);
    ctx.logger.warn("Audit issue created for direct shell usage", {
      companyId,
      agentId: refs.agentId,
      agentName: resolvedAgentName,
      issueId: auditResult.issueId,
      violations,
    });
  }

  if (pauseAgent) {
    try {
      await ctx.agents.pause(refs.agentId, companyId);
      ctx.logger.warn("Agent paused due to tool audit violation", {
        companyId,
        agentId: refs.agentId,
        agentName: resolvedAgentName,
      });
    } catch (error) {
      ctx.logger.error("Failed to pause agent after tool audit violation", {
        companyId,
        agentId: refs.agentId,
        agentName: resolvedAgentName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await writeExecutionLog(ctx, {
    timestamp: new Date().toISOString(),
    mode: "audit",
    companyId,
    projectId: refs.projectId,
    runId: refs.runId,
    agentId: refs.agentId,
    agentName: resolvedAgentName,
    toolName: "audit.direct-shell",
    stdout: refs.stdout,
    stderr: refs.stderr,
    reason: violations.join("; "),
    success: false,
  });
}

function toToolParams(input: unknown): ExecuteToolPayload {
  const record = asRecord(input);
  return {
    toolName: asString(record.toolName),
    args: record.args,
  };
}

function stringifyOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

async function executeRegisteredTool(
  ctx: PluginContext,
  params: unknown,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const payload = toToolParams(params);
  const toolName = asString(payload.toolName);

  if (!toolName) {
    return { error: "toolName is required" };
  }

  const tool = await getToolByName(ctx, runCtx.companyId, toolName);
  if (!tool) {
    return {
      error: `Tool not found: ${toolName}`,
      data: {
        toolName,
      },
    };
  }

  const agent = await ctx.agents.get(runCtx.agentId, runCtx.companyId);
  const agentName = asString(agent?.name);

  if (!agentName) {
    return {
      error: `Agent not found for runContext.agentId: ${runCtx.agentId}`,
      data: {
        toolName,
      },
    };
  }

  const allowed = await isToolGrantedToAgent(ctx, runCtx.companyId, agentName, toolName);
  if (!allowed) {
    await writeExecutionLog(ctx, {
      timestamp: new Date().toISOString(),
      mode: "denied",
      companyId: runCtx.companyId,
      projectId: runCtx.projectId,
      runId: runCtx.runId,
      agentId: runCtx.agentId,
      agentName,
      toolName,
      reason: "allow-list denied",
      success: false,
    });

    return {
      error: `Tool access denied for agent \"${agentName}\": ${toolName}`,
      data: {
        toolName,
        deniedBy: "allow-list",
      },
    };
  }

  if (tool.data.requiresApproval) {
    await writeExecutionLog(ctx, {
      timestamp: new Date().toISOString(),
      mode: "approval_required",
      companyId: runCtx.companyId,
      projectId: runCtx.projectId,
      runId: runCtx.runId,
      agentId: runCtx.agentId,
      agentName,
      toolName,
      reason: "requires approval",
      success: false,
    });

    return {
      error: `Tool \"${toolName}\" requires approval. Use Paperclip approval flow before execution.`,
      data: {
        requiresApproval: true,
        toolName,
      },
    };
  }

  const commandParts = normalizeCommandParts(tool.data.command);
  if (commandParts.length === 0) {
    return {
      error: `Configured command is empty for tool: ${toolName}`,
    };
  }

  const executable = commandParts[0];
  const presetArgs = commandParts.slice(1);
  const dynamicArgs = buildCommandArgs(payload.args);
  const allArgs = [...presetArgs, ...dynamicArgs];
  const executionStart = new Date().toISOString();

  try {
    const result = await execFileAsync(executable, allArgs, {
      cwd: tool.data.workingDirectory || undefined,
      env: {
        ...process.env,
        ...(tool.data.env ?? {}),
      },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });

    const stdout = stringifyOutput(result.stdout);
    const stderr = stringifyOutput(result.stderr);

    await writeExecutionLog(ctx, {
      timestamp: executionStart,
      mode: "tool",
      companyId: runCtx.companyId,
      projectId: runCtx.projectId,
      runId: runCtx.runId,
      agentId: runCtx.agentId,
      agentName,
      toolName,
      command: tool.data.command,
      args: payload.args,
      exitCode: 0,
      stdout,
      stderr,
      success: true,
    });

    return {
      content: `Executed tool ${toolName}`,
      data: {
        toolName,
        command: tool.data.command,
        args: payload.args ?? {},
        stdout,
        stderr,
        exitCode: 0,
      },
    };
  } catch (error) {
    const typed = error as Error & {
      code?: string | number;
      stdout?: unknown;
      stderr?: unknown;
    };

    const exitCode = typeof typed.code === "number" ? typed.code : null;
    const stdout = stringifyOutput(typed.stdout);
    const stderr = stringifyOutput(typed.stderr);
    const message = typed.message || String(error);

    await writeExecutionLog(ctx, {
      timestamp: executionStart,
      mode: "tool",
      companyId: runCtx.companyId,
      projectId: runCtx.projectId,
      runId: runCtx.runId,
      agentId: runCtx.agentId,
      agentName,
      toolName,
      command: tool.data.command,
      args: payload.args,
      exitCode,
      stdout,
      stderr,
      reason: message,
      success: false,
    });

    return {
      error: `Tool execution failed: ${message}`,
      data: {
        toolName,
        command: tool.data.command,
        args: payload.args ?? {},
        stdout,
        stderr,
        exitCode,
      },
    };
  }
}

async function executeToolForSystem(
  ctx: PluginContext,
  companyId: string,
  toolName: string,
  args: unknown,
): Promise<{
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}> {
  const tool = await getToolByName(ctx, companyId, toolName);
  if (!tool) {
    return { success: false, stdout: "", stderr: "", exitCode: null, error: `Tool not found: ${toolName}` };
  }

  const commandParts = normalizeCommandParts(tool.data.command);
  if (commandParts.length === 0) {
    return { success: false, stdout: "", stderr: "", exitCode: null, error: `Empty command for tool: ${toolName}` };
  }

  const executable = commandParts[0];
  const presetArgs = commandParts.slice(1);
  const dynamicArgs = buildCommandArgs(args);
  const allArgs = [...presetArgs, ...dynamicArgs];
  const executionStart = new Date().toISOString();

  try {
    const shellCmd = [executable, ...allArgs].map((a) => /[\s"']/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a).join(" ") + " < /dev/null";
    const execShellAsync = promisify(exec);
    const result = await execShellAsync(shellCmd, {
      cwd: tool.data.workingDirectory || undefined,
      env: { ...process.env, ...(tool.data.env ?? {}) },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });

    const stdout = stringifyOutput(result.stdout);
    const stderr = stringifyOutput(result.stderr);

    await writeExecutionLog(ctx, {
      timestamp: executionStart,
      mode: "tool",
      companyId,
      projectId: "",
      runId: "system",
      agentId: "system",
      agentName: "system",
      toolName,
      command: tool.data.command,
      args,
      exitCode: 0,
      stdout,
      stderr,
      success: true,
    });

    return { success: true, stdout, stderr, exitCode: 0 };
  } catch (error) {
    const typed = error as Error & { code?: string | number; stdout?: unknown; stderr?: unknown };
    const exitCode = typeof typed.code === "number" ? typed.code : null;
    const stdout = stringifyOutput(typed.stdout);
    const stderr = stringifyOutput(typed.stderr);
    const message = typed.message || String(error);

    await writeExecutionLog(ctx, {
      timestamp: executionStart,
      mode: "tool",
      companyId,
      projectId: "",
      runId: "system",
      agentId: "system",
      agentName: "system",
      toolName,
      command: tool.data.command,
      args,
      exitCode,
      stdout,
      stderr,
      reason: message,
      success: false,
    });

    return { success: false, stdout, stderr, exitCode, error: message };
  }
}

async function buildPageData(
  ctx: PluginContext,
  params: Record<string, unknown>,
): Promise<unknown> {
  const companyId = await resolveCompanyId(ctx, params);
  const companies = await ctx.companies.list({ limit: 200, offset: 0 });
  const company = companies.find((candidate) => candidate.id === companyId) ?? null;
  const maxLogEntries = asNumber(params.maxLogEntries, DEFAULT_MAX_LOGS);

  const [tools, grants, logs, agents] = await Promise.all([
    listAllTools(ctx, companyId),
    listAgentGrants(ctx, companyId),
    listExecutionLogs(ctx, companyId, maxLogEntries),
    ctx.agents.list({ companyId, limit: 300, offset: 0 }),
  ]);

  return {
    companyId,
    companyName: company?.name ?? null,
    tools: tools.map((tool) => ({
      ...tool,
      data: {
        ...tool.data,
        __deleted: tool.status === "deleted" || undefined,
      },
    })),
    grants,
    logs,
    agents: agents
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        role: agent.role,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

type ToolGraphUpdatedTool = {
  name: string;
  displayName: string;
  description: string;
  command: string;
};

type ToolGraphUpdatedGrant = {
  agentName: string;
  toolName: string;
};

type ToolGraphUpdatedPayload = {
  tools: ToolGraphUpdatedTool[];
  grants: ToolGraphUpdatedGrant[];
};

async function emitToolGraphUpdated(ctx: PluginContext, companyId: string): Promise<void> {
  const [tools, grants] = await Promise.all([
    listTools(ctx, companyId),
    listAgentGrants(ctx, companyId),
  ]);

  const payload: ToolGraphUpdatedPayload = {
    tools: tools.map((tool) => ({
      name: tool.data.name,
      displayName: tool.title ?? tool.data.name,
      description: tool.data.description ?? "",
      command: tool.data.command,
    })),
    grants: grants.map((grant) => ({
      agentName: grant.data.agentName,
      toolName: grant.data.toolName,
    })),
  };

  await ctx.events.emit("tool-graph-updated", companyId, payload);
}

async function registerDataHandlers(ctx: PluginContext): Promise<void> {
  ctx.data.register(DATA_KEYS.pageData, async (rawParams) => {
    const params = asRecord(rawParams);
    return await buildPageData(ctx, params);
  });
}

async function registerActionHandlers(ctx: PluginContext): Promise<void> {
  ctx.actions.register(ACTION_KEYS.createTool, async (rawParams) => {
    const params = asRecord(rawParams);
    const companyId = await resolveCompanyId(ctx, params);
    const toolInput = asRecord(params.tool);

    const created = await createTool(ctx, companyId, {
      name: asString(toolInput.name),
      command: asString(toolInput.command),
      workingDirectory: asString(toolInput.workingDirectory) || undefined,
      env: asRecord(toolInput.env) as Record<string, string>,
      requiresApproval: asBoolean(toolInput.requiresApproval, false),
      description: asString(toolInput.description) || undefined,
      argsSchema: asRecord(toolInput.argsSchema),
      createdBy: asString(params.actorName) || "tool-registry-ui",
    });
    await emitToolGraphUpdated(ctx, companyId);
    return created;
  });

  ctx.actions.register(ACTION_KEYS.updateTool, async (rawParams) => {
    const params = asRecord(rawParams);
    const companyId = await resolveCompanyId(ctx, params);
    const toolName = asString(params.toolName);
    const patch = asRecord(params.patch);
    const patchData: Record<string, unknown> = {};

    if (typeof patch.command === "string") {
      patchData.command = asString(patch.command);
    }

    if (typeof patch.workingDirectory === "string") {
      patchData.workingDirectory = asString(patch.workingDirectory);
    }

    if (typeof patch.description === "string") {
      patchData.description = asString(patch.description);
    }

    if (typeof patch.requiresApproval === "boolean") {
      patchData.requiresApproval = patch.requiresApproval;
    }

    if (patch.env && typeof patch.env === "object") {
      patchData.env = patch.env;
    }

    if (patch.argsSchema && typeof patch.argsSchema === "object") {
      patchData.argsSchema = patch.argsSchema;
    }

    if (typeof patch.instructions === "string") {
      patchData.instructions = asString(patch.instructions);
    }

    const updated = await updateTool(ctx, companyId, toolName, {
      ...(patchData as Partial<{
        command: string;
        workingDirectory: string;
        env: Record<string, string>;
        requiresApproval: boolean;
        description: string;
        instructions: string;
        argsSchema: Record<string, unknown>;
      }>),
    });
    await emitToolGraphUpdated(ctx, companyId);
    return updated;
  });

  ctx.actions.register(ACTION_KEYS.deleteTool, async (rawParams) => {
    const params = asRecord(rawParams);
    const companyId = await resolveCompanyId(ctx, params);
    const toolName = asString(params.toolName);

    await deleteTool(ctx, companyId, toolName);
    await emitToolGraphUpdated(ctx, companyId);
    return {
      ok: true,
      toolName,
    };
  });

  ctx.actions.register(ACTION_KEYS.restoreTool, async (rawParams) => {
    const params = asRecord(rawParams);
    const companyId = await resolveCompanyId(ctx, params);
    const toolName = asString(params.toolName);

    const restored = await restoreTool(ctx, companyId, toolName);
    await emitToolGraphUpdated(ctx, companyId);
    return restored;
  });

  ctx.actions.register(ACTION_KEYS.grantTool, async (rawParams) => {
    const params = asRecord(rawParams);
    const companyId = await resolveCompanyId(ctx, params);

    const granted = await grantTool(ctx, companyId, {
      agentName: asString(params.agentName),
      toolName: asString(params.toolName),
      grantedBy: asString(params.grantedBy) || "tool-registry-ui",
    });
    await emitToolGraphUpdated(ctx, companyId);
    return granted;
  });

  ctx.actions.register(ACTION_KEYS.revokeTool, async (rawParams) => {
    const params = asRecord(rawParams);
    const companyId = await resolveCompanyId(ctx, params);
    const agentName = asString(params.agentName);
    const toolName = asString(params.toolName);

    await revokeTool(ctx, companyId, agentName, toolName);
    await emitToolGraphUpdated(ctx, companyId);
    return {
      ok: true,
      agentName,
      toolName,
    };
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.tools.register(
      TOOL_NAMES.genericCliExecutor,
      {
        displayName: "Generic CLI Executor",
        description: "Execute an approved CLI tool from Tool Registry",
        parametersSchema: {
          type: "object",
          properties: {
            toolName: { type: "string" },
            args: { type: "object", additionalProperties: true },
          },
          required: ["toolName"],
        },
      },
      async (params, runCtx) => {
        return await executeRegisteredTool(ctx, params, runCtx);
      },
    );

    await registerDataHandlers(ctx);
    await registerActionHandlers(ctx);

    ctx.events.on("agent.run.started", async (event) => {
      await handleRunStarted(ctx, event);
    });

    ctx.events.on("agent.run.finished", async (event) => {
      await handleRunFinished(ctx, event);
    });

    ctx.events.on(
      "plugin.insightflo.workflow-engine.execute-tool-request" as Parameters<typeof ctx.events.on>[0],
      async (event: PluginEvent) => {
        const payload = asRecord(event.payload);
        const toolName = asString(payload.toolName);
        const companyId = asString(payload.companyId) || event.companyId;
        const issueId = asString(payload.issueId);
        const stepRunId = asString(payload.stepRunId);
        const stepId = asString(payload.stepId);
        const workflowRunId = asString(payload.workflowRunId);
        const requestId = asString(payload.requestId);
        const args = payload.args;

        ctx.logger.info("Received tool execution request from Workflow Engine", {
          requestId, toolName, companyId, stepId,
        });

        const result = await executeToolForSystem(ctx, companyId, toolName, args);

        if (issueId) {
          const status = result.success ? "completed" : "failed";
          const output = result.stdout || result.stderr || result.error || "(no output)";
          const truncated = output.length > 4000 ? output.slice(0, 4000) + "\n...(truncated)" : output;
          const comment = [
            `### Tool Execution: ${toolName} [${status}]`,
            `Exit code: ${result.exitCode ?? "N/A"}`,
            "```",
            truncated,
            "```",
          ].join("\n");

          try {
            await ctx.issues.createComment(issueId, comment, companyId);
          } catch (commentError) {
            ctx.logger.warn("Failed to post tool result comment", {
              issueId, error: commentError instanceof Error ? commentError.message : String(commentError),
            });
          }
        }

        await ctx.events.emit("tool-execution-result", companyId, {
          requestId,
          stepRunId,
          stepId,
          workflowRunId,
          issueId,
          success: result.success,
          toolName,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          error: result.error,
        });

        ctx.logger.info("Tool execution completed, result emitted", {
          requestId, toolName, success: result.success,
        });
      },
    );

    ctx.logger.info("Tool Registry plugin worker initialized");
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
