export const PLUGIN_ID = "insightflo.ops-monitor";
export const PLUGIN_VERSION = "0.1.0";

export const JOB_KEYS = {
  wakeStuck: "wake-stuck",
  dailySummary: "daily-summary",
} as const;

export const TARGET_COMPANY_NAMES = new Set(["가즈아", "보수팀", "개발팀"]);

export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
