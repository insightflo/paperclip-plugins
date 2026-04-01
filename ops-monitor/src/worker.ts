import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginJobContext,
} from "@paperclipai/plugin-sdk";
import { JOB_KEYS, STALE_THRESHOLD_MS, TARGET_COMPANY_NAMES } from "./constants.js";

type AgentRecord = Awaited<ReturnType<PluginContext["agents"]["list"]>>[number];
type IssueRecord = Awaited<ReturnType<PluginContext["issues"]["list"]>>[number];
type CompanyRecord = Awaited<ReturnType<PluginContext["companies"]["list"]>>[number];
type OpsMonitorConfig = {
  enableDailySummary: boolean;
  enableInReviewWake: boolean;
  enableWakeStuck: boolean;
  includeErrorAgentsInSummary: boolean;
  staleThresholdMs: number;
  targetCompanyNames: Set<string>;
};

function getPaperclipApiUrl(): string {
  return process.env.PAPERCLIP_API_URL || "http://localhost:3100";
}

async function wakeupAgent(
  agentId: string,
  issueId: string,
  reason: string,
  forceFreshSession = false,
): Promise<boolean> {
  const apiUrl = getPaperclipApiUrl();
  try {
    const res = await fetch(`${apiUrl}/api/agents/${agentId}/wakeup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "automation",
        payload: {
          issueId,
          taskKey: `ops:${reason}:${agentId}:${issueId}`,
        },
        reason,
        forceFreshSession,
      }),
    });
    return res.ok;
  } catch (error) {
    console.error("[ops-monitor] wakeup API failed", {
      agentId,
      issueId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function parseDateMs(value?: string | Date): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function isIdleAgent(agent: AgentRecord): boolean {
  return agent.status !== "running" && agent.status !== "paused";
}

function isInspectorAgent(agent: AgentRecord): boolean {
  const metadata = (agent.metadata ?? {}) as Record<string, unknown>;
  const name = typeof agent.name === "string" ? agent.name : "";
  const title = typeof agent.title === "string" ? agent.title : "";
  const role = typeof agent.role === "string" ? agent.role : "";

  if (metadata.issueCompletionAuthority !== true) {
    return false;
  }

  return /(감찰관|inspector|auditor)/i.test(`${name} ${title} ${role}`);
}

function hoursAgoText(updatedAt: string | Date | undefined): string {
  const updatedMs = parseDateMs(updatedAt);
  const diffMs = Math.max(0, Date.now() - updatedMs);
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  return `${hours}h 전`;
}

function kstNowLabel(): string {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul",
    hour12: false,
  }).replace(" ", " ");
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function getStaleThresholdMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value * 60 * 60 * 1000;
  }
  return STALE_THRESHOLD_MS;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getNestedRecord(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = root[key];
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function readConfig(ctx: PluginContext): Promise<OpsMonitorConfig> {
  const raw = await ctx.config.get();
  const targetCompanyNames = new Set(toStringArray((raw as Record<string, unknown> | null)?.targetCompanyNames));
  const record = (raw as Record<string, unknown> | null) ?? {};
  const wakeStuck = getNestedRecord(record, "wakeStuck");
  const inReviewWake = getNestedRecord(record, "inReviewWake");
  const dailySummary = getNestedRecord(record, "dailySummary");
  return {
    enableDailySummary: getBoolean(dailySummary.enabled, true),
    enableInReviewWake: getBoolean(inReviewWake.enabled, true),
    enableWakeStuck: getBoolean(wakeStuck.enabled, true),
    includeErrorAgentsInSummary: getBoolean(dailySummary.includeErrorAgents, true),
    staleThresholdMs: getStaleThresholdMs(record.staleThresholdHours),
    targetCompanyNames: targetCompanyNames.size > 0 ? targetCompanyNames : new Set(TARGET_COMPANY_NAMES),
  };
}

async function resolveTargetCompanies(ctx: PluginContext, config: OpsMonitorConfig): Promise<CompanyRecord[]> {
  const companies = await ctx.companies.list();
  return companies.filter((company) => config.targetCompanyNames.has(company.name));
}

async function listIssuesByStatus(
  ctx: PluginContext,
  companyId: string,
  status: "todo" | "in_review",
): Promise<IssueRecord[]> {
  return ctx.issues.list({ companyId, status, limit: 500, offset: 0 });
}


async function wakeStuckTodosForCompany(
  ctx: PluginContext,
  company: CompanyRecord,
): Promise<void> {
  const [issues, agents] = await Promise.all([
    listIssuesByStatus(ctx, company.id, "todo"),
    ctx.agents.list({ companyId: company.id }),
  ]);
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));

  for (const issue of issues) {
    const assigneeAgentId = issue.assigneeAgentId?.trim();
    if (!assigneeAgentId) continue;
    const assignee = agentMap.get(assigneeAgentId);
    if (!assignee) continue;
    if (!isIdleAgent(assignee)) continue;
    if (issue.executionRunId) continue;

    const forceFreshSession = isInspectorAgent(assignee);
    await wakeupAgent(assigneeAgentId, issue.id, "stuck_todo_wakeup", forceFreshSession);
  }
}

function getInspectionAgents(agents: AgentRecord[]): AgentRecord[] {
  return agents.filter((agent) => isInspectorAgent(agent) && isIdleAgent(agent));
}

async function wakeInReviewForCompany(
  ctx: PluginContext,
  company: CompanyRecord,
): Promise<void> {
  const [issues, agents] = await Promise.all([
    listIssuesByStatus(ctx, company.id, "in_review"),
    ctx.agents.list({ companyId: company.id }),
  ]);

  const idleInspectors = getInspectionAgents(agents);
  if (idleInspectors.length === 0) {
    console.warn("[ops-monitor] no idle inspector agent found for in_review wake", {
      companyId: company.id,
      companyName: company.name,
    });
    return;
  }

  const candidates = issues
    .filter((issue) => !issue.executionRunId)
    .sort((left, right) => parseDateMs(left.updatedAt) - parseDateMs(right.updatedAt));

  const count = Math.min(idleInspectors.length, candidates.length);
  for (let index = 0; index < count; index += 1) {
    const inspector = idleInspectors[index];
    const candidate = candidates[index];
    await wakeupAgent(inspector.id, candidate.id, "in_review_inspection_wakeup", true);
  }
}

async function wakeStuckJob(ctx: PluginContext): Promise<void> {
  const config = await readConfig(ctx);
  if (!config.enableWakeStuck && !config.enableInReviewWake) return;
  const companies = await resolveTargetCompanies(ctx, config);
  for (const company of companies) {
    if (config.enableWakeStuck) {
      await wakeStuckTodosForCompany(ctx, company);
    }
    if (config.enableInReviewWake) {
      await wakeInReviewForCompany(ctx, company);
    }
  }
}

async function collectStuckAndReview(
  ctx: PluginContext,
  company: CompanyRecord,
  config: OpsMonitorConfig,
): Promise<{
  reviewItems: Array<{ companyName: string; identifier: string; updatedAt?: string | Date }>;
  stuckItems: Array<{ assigneeName: string; companyName: string; identifier: string; updatedAt?: string | Date }>;
}> {
  const [todoIssues, reviewIssues, agents] = await Promise.all([
    listIssuesByStatus(ctx, company.id, "todo"),
    listIssuesByStatus(ctx, company.id, "in_review"),
    ctx.agents.list({ companyId: company.id }),
  ]);
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const thresholdMs = Date.now() - config.staleThresholdMs;

  const stuckItems = todoIssues
    .filter((issue) => !issue.executionRunId && parseDateMs(issue.updatedAt) <= thresholdMs)
    .map((issue) => {
      const assignee = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : undefined;
      return {
        assigneeName: assignee?.name || "Unassigned",
        companyName: company.name,
        identifier: issue.identifier || issue.id,
        updatedAt: issue.updatedAt,
      };
    });

  const reviewItems = reviewIssues.map((issue) => ({
    companyName: company.name,
    identifier: issue.identifier || issue.id,
    updatedAt: issue.updatedAt,
  }));

  return { reviewItems, stuckItems };
}

async function collectErrorAgents(
  ctx: PluginContext,
  company: CompanyRecord,
): Promise<Array<{ companyName: string; name: string; updatedAt?: string | Date }>> {
  const agents = await ctx.agents.list({ companyId: company.id });
  return agents
    .filter((agent) => agent.status === "error")
    .map((agent) => ({
      companyName: company.name,
      name: agent.name,
      updatedAt: agent.updatedAt,
    }));
}

function buildMessage(input: {
  errorAgents: Array<{ companyName: string; name: string; updatedAt?: string | Date }>;
  reviewItems: Array<{ companyName: string; identifier: string; updatedAt?: string | Date }>;
  stuckItems: Array<{ assigneeName: string; companyName: string; identifier: string; updatedAt?: string | Date }>;
}): string {
  const nowLabel = kstNowLabel().slice(0, 16);
  const lines = [
    `📋 운영 요약 ${nowLabel} KST`,
    "",
    `🔴 멈춘 이슈 ${input.stuckItems.length}개`,
  ];

  if (input.stuckItems.length === 0) {
    lines.push("✅ 없음");
  } else {
    for (const item of input.stuckItems) {
      lines.push(`- ${item.identifier} [${item.companyName}] 담당: ${item.assigneeName} · ${hoursAgoText(item.updatedAt)}`);
    }
  }

  lines.push("", `🟡 검수 대기 ${input.reviewItems.length}개`);
  if (input.reviewItems.length === 0) {
    lines.push("✅ 없음");
  } else {
    for (const item of input.reviewItems) {
      lines.push(`- ${item.identifier} [${item.companyName}] · ${hoursAgoText(item.updatedAt)}`);
    }
  }

  if (input.errorAgents.length > 0) {
    lines.push("", `🔥 에이전트 오류 ${input.errorAgents.length}개`);
    for (const agent of input.errorAgents) {
      lines.push(`- ${agent.name} [${agent.companyName}] · ${hoursAgoText(agent.updatedAt)}`);
    }
  }

  return lines.join("\n");
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    console.warn("[ops-monitor] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing; skipping Telegram send");
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[ops-monitor] Telegram send failed", {
        body,
        status: response.status,
      });
    }
  } catch (error) {
    console.error("[ops-monitor] Telegram send failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function dailySummaryJob(ctx: PluginContext): Promise<void> {
  const config = await readConfig(ctx);
  if (!config.enableDailySummary) return;
  const companies = await resolveTargetCompanies(ctx, config);
  const stuckItems: Array<{ assigneeName: string; companyName: string; identifier: string; updatedAt?: string | Date }> = [];
  const reviewItems: Array<{ companyName: string; identifier: string; updatedAt?: string | Date }> = [];
  const errorAgents: Array<{ companyName: string; name: string; updatedAt?: string | Date }> = [];

  for (const company of companies) {
    const [issueSummary, companyErrorAgents] = await Promise.all([
      collectStuckAndReview(ctx, company, config),
      collectErrorAgents(ctx, company),
    ]);
    stuckItems.push(...issueSummary.stuckItems);
    reviewItems.push(...issueSummary.reviewItems);
    if (config.includeErrorAgentsInSummary) {
      errorAgents.push(...companyErrorAgents);
    }
  }

  stuckItems.sort((left, right) => parseDateMs(left.updatedAt) - parseDateMs(right.updatedAt));
  reviewItems.sort((left, right) => parseDateMs(left.updatedAt) - parseDateMs(right.updatedAt));
  errorAgents.sort((left, right) => parseDateMs(left.updatedAt) - parseDateMs(right.updatedAt));

  await sendTelegram(buildMessage({ errorAgents, reviewItems, stuckItems }));
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.jobs.register(JOB_KEYS.wakeStuck, async (_jobCtx: PluginJobContext) => {
      await wakeStuckJob(ctx);
    });

    ctx.jobs.register(JOB_KEYS.dailySummary, async (_jobCtx: PluginJobContext) => {
      await dailySummaryJob(ctx);
    });
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
