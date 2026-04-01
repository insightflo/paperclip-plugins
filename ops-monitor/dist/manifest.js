import { JOB_KEYS, PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";
const manifest = {
    id: PLUGIN_ID,
    apiVersion: 1,
    version: PLUGIN_VERSION,
    displayName: "Ops Monitor",
    description: "Wakes stuck todos every 5 min and sends daily Telegram ops summary at 08:00 KST",
    author: "InsightFlo",
    categories: ["automation"],
    capabilities: [
        "issues.read",
        "issue.comments.create",
        "agents.read",
        "agents.invoke",
        "companies.read",
        "jobs.schedule",
    ],
    instanceConfigSchema: {
        type: "object",
        properties: {
            wakeStuck: {
                type: "object",
                title: "Stuck todo wake-up",
                description: "Wake assigned idle agents for todo issues that have no active execution run.",
                properties: {
                    enabled: {
                        type: "boolean",
                        title: "Enable stuck todo wake-up",
                        description: "If disabled, ops-monitor will not wake assigned agents for stale todo issues.",
                        default: true,
                    },
                    cron: {
                        type: "string",
                        title: "Cron",
                        description: "Informational. The installed plugin schedules this job every 5 minutes.",
                        default: "*/5 * * * *",
                        readOnly: true,
                    },
                    timezone: {
                        type: "string",
                        title: "Timezone",
                        description: "Informational. This job runs every 5 minutes, so timezone is not operationally significant.",
                        default: "UTC",
                        readOnly: true,
                    },
                },
            },
            inReviewWake: {
                type: "object",
                title: "In-review inspector wake-up",
                description: "Dispatch idle inspectors with issueCompletionAuthority to waiting in_review issues.",
                properties: {
                    enabled: {
                        type: "boolean",
                        title: "Enable in-review inspector wake-up",
                        description: "If disabled, ops-monitor will not wake inspectors for in_review issues.",
                        default: true,
                    },
                    cron: {
                        type: "string",
                        title: "Cron",
                        description: "Informational. The installed plugin schedules this job every 5 minutes.",
                        default: "*/5 * * * *",
                        readOnly: true,
                    },
                    timezone: {
                        type: "string",
                        title: "Timezone",
                        description: "Informational. This job runs every 5 minutes, so timezone is not operationally significant.",
                        default: "UTC",
                        readOnly: true,
                    },
                },
            },
            dailySummary: {
                type: "object",
                title: "Daily Telegram summary",
                description: "Send the daily Telegram digest of stuck issues, review backlog, and optional agent errors.",
                properties: {
                    enabled: {
                        type: "boolean",
                        title: "Enable daily Telegram summary",
                        description: "If disabled, ops-monitor will not send the daily Telegram summary.",
                        default: true,
                    },
                    cron: {
                        type: "string",
                        title: "Cron",
                        description: "Informational. 08:00 KST is scheduled as 23:00 UTC on the previous day.",
                        default: "0 23 * * *",
                        readOnly: true,
                    },
                    timezone: {
                        type: "string",
                        title: "Timezone",
                        description: "Informational. Daily summary is sent at 08:00 Asia/Seoul.",
                        default: "Asia/Seoul",
                        readOnly: true,
                    },
                    includeErrorAgents: {
                        type: "boolean",
                        title: "Include agent errors in daily summary",
                        description: "Append agents with status=error to the daily Telegram summary.",
                        default: true,
                    },
                },
            },
            targetCompanyNames: {
                type: "array",
                title: "Target company names",
                description: "Companies to include for wake-up checks and daily summary",
                items: { type: "string" },
                default: ["가즈아", "보수팀", "개발팀"],
            },
            staleThresholdHours: {
                type: "number",
                title: "Stale threshold hours",
                description: "Todo issues older than this are included in daily summary as stuck",
                default: 2,
                minimum: 1,
                maximum: 168,
            },
        },
    },
    entrypoints: {
        worker: "./dist/worker.js",
    },
    jobs: [
        {
            jobKey: JOB_KEYS.wakeStuck,
            displayName: "Wake Stuck Todos",
            description: "Wakes idle agents assigned to stuck todos and dispatches in_review issues to inspectors",
            schedule: "*/5 * * * *",
        },
        {
            jobKey: JOB_KEYS.dailySummary,
            displayName: "Daily Ops Summary",
            description: "Sends daily Telegram message with stuck issues, in-review count, and agent errors at 08:00 KST",
            schedule: "0 23 * * *",
        },
    ],
};
export default manifest;
