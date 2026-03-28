import { definePlugin, runWorker, } from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, BRIDGE_DIRECTIONS, DATA_KEYS, PLUGIN_ID, SYNC_STAMP_TTL_MS, } from "./constants.js";
import { asRecord, asString, asStringArray, canPropagateLocalToRemote, hasActiveSyncStamp, isEventProcessed, listBridgeLinksByCompany, listBridgeLinksForLocalIssue, makeSyncStampExternalId, markEventProcessed, normalizeDirection, touchBridgeSyncMeta, upsertBridgePair, upsertSyncStamp, } from "./store.js";
const DEFAULT_REQUESTER_LABEL = "유지보수";
const MIRROR_TITLE_PREFIX = "[유지보수]";
function getNestedString(record, ...path) {
    let cursor = record;
    for (const key of path) {
        if (!cursor || typeof cursor !== "object") {
            return "";
        }
        cursor = cursor[key];
    }
    return asString(cursor);
}
function asBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
        return value;
    }
    return fallback;
}
function getCompanyIdFromParams(params) {
    return asString(params.companyId) || asString(params.localCompanyId);
}
function registerDataHandler(ctx, key, handler) {
    const dataClient = ctx.data;
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
function registerActionHandler(ctx, key, handler) {
    const actionClient = ctx.actions;
    if (typeof actionClient.register === "function") {
        actionClient.register(key, handler);
        return;
    }
    throw new Error("Plugin action client does not support handler registration");
}
function toIssueSnapshot(issue) {
    return {
        id: issue.id,
        identifier: issue.identifier ?? null,
        title: issue.title,
        status: issue.status,
    };
}
async function listIssues(ctx, companyId) {
    return await ctx.issues.list({ companyId, limit: 500, offset: 0 });
}
async function findIssueByIdOrIdentifier(ctx, companyId, issueKey) {
    const issueId = asString(issueKey);
    if (!issueId) {
        return null;
    }
    const issues = await listIssues(ctx, companyId);
    return issues.find((issue) => issue.id === issueId || issue.identifier === issueId) ?? null;
}
async function listCompanies(ctx) {
    return await ctx.companies.list({ limit: 500, offset: 0 });
}
function normalizeName(value) {
    return value.trim().toLowerCase();
}
function getLabelNames(rawLabels) {
    if (!Array.isArray(rawLabels)) {
        return [];
    }
    const names = [];
    for (const item of rawLabels) {
        if (typeof item === "string" && item.trim()) {
            names.push(item.trim());
            continue;
        }
        if (item && typeof item === "object") {
            const labelRecord = item;
            const name = asString(labelRecord.name) || asString(labelRecord.label);
            if (name) {
                names.push(name);
            }
        }
    }
    return names;
}
function isMatchingLabel(labels, expectedLabelName) {
    const expected = normalizeName(expectedLabelName);
    if (!expected) {
        return false;
    }
    return labels.some((label) => normalizeName(label) === expected);
}
async function getBridgeConfig(ctx) {
    const raw = asRecord(await ctx.config.get());
    return {
        providerCompanyName: asString(raw.providerCompanyName),
        requesterLabelName: asString(raw.requesterLabelName) || DEFAULT_REQUESTER_LABEL,
        autoCreateMirrorIssue: asBoolean(raw.autoCreateMirrorIssue, true),
        workflowTriggerLabel: asString(raw.workflowTriggerLabel),
    };
}
async function findCompanyByName(ctx, name) {
    const providerName = asString(name);
    if (!providerName) {
        return null;
    }
    const companies = await listCompanies(ctx);
    const exact = companies.find((company) => company.name === providerName);
    if (exact) {
        return exact;
    }
    const normalizedName = normalizeName(providerName);
    return companies.find((company) => normalizeName(company.name) === normalizedName) ?? null;
}
function companyNameMap(companies) {
    return new Map(companies.map((company) => [company.id, company.name]));
}
function dashboardStatusBucket(status) {
    const normalized = normalizeName(status);
    if (normalized === "done" || normalized === "resolved" || normalized === "closed" || normalized === "cancelled") {
        return "resolved";
    }
    if (normalized === "in_progress" || normalized === "in_review" || normalized === "review") {
        return "inProgress";
    }
    if (normalized === "backlog" || normalized === "todo" || normalized === "open" || normalized === "blocked") {
        return "open";
    }
    return "unknown";
}
async function buildDashboardWidgetSnapshot(ctx, params) {
    const companyId = getCompanyIdFromParams(params);
    if (!companyId) {
        return {
            companyId: "",
            generatedAt: new Date().toISOString(),
            totalActiveLinks: 0,
            statusCounts: {
                open: 0,
                inProgress: 0,
                resolved: 0,
                unknown: 0,
            },
        };
    }
    const [issues, links] = await Promise.all([
        listIssues(ctx, companyId),
        listBridgeLinksByCompany(ctx, companyId),
    ]);
    const issueStatusMap = new Map(issues.map((issue) => [issue.id, issue.status]));
    const statusCounts = {
        open: 0,
        inProgress: 0,
        resolved: 0,
        unknown: 0,
    };
    for (const link of links) {
        const localIssueStatus = issueStatusMap.get(link.data.localIssueId) ?? "unknown";
        statusCounts[dashboardStatusBucket(localIssueStatus)] += 1;
    }
    return {
        companyId,
        generatedAt: new Date().toISOString(),
        totalActiveLinks: links.length,
        statusCounts,
    };
}
async function buildListTabSnapshot(ctx, params) {
    const companyId = getCompanyIdFromParams(params);
    if (!companyId) {
        return {
            companyId: "",
            generatedAt: new Date().toISOString(),
            totals: {
                issues: 0,
                linked: 0,
                unlinked: 0,
            },
            items: [],
        };
    }
    const requestedIssueIds = new Set(asStringArray(params.issueIds));
    const [issues, links, companies] = await Promise.all([
        listIssues(ctx, companyId),
        listBridgeLinksByCompany(ctx, companyId),
        listCompanies(ctx),
    ]);
    const visibleIssues = requestedIssueIds.size > 0
        ? issues.filter((issue) => requestedIssueIds.has(issue.id) || (issue.identifier ? requestedIssueIds.has(issue.identifier) : false))
        : issues;
    const byLocalIssue = new Map();
    for (const link of links) {
        const bucket = byLocalIssue.get(link.data.localIssueId);
        if (bucket) {
            bucket.push(link);
        }
        else {
            byLocalIssue.set(link.data.localIssueId, [link]);
        }
    }
    const names = companyNameMap(companies);
    const remoteIssueCache = new Map();
    async function resolveRemoteIssue(company, issueId) {
        const key = `${company}:${issueId}`;
        if (remoteIssueCache.has(key)) {
            return remoteIssueCache.get(key) ?? null;
        }
        const issue = await findIssueByIdOrIdentifier(ctx, company, issueId);
        const snapshot = issue ? toIssueSnapshot(issue) : null;
        remoteIssueCache.set(key, snapshot);
        return snapshot;
    }
    const items = [];
    for (const issue of visibleIssues) {
        const mapped = byLocalIssue.get(issue.id) ?? [];
        const linkRows = [];
        for (const link of mapped) {
            const remote = await resolveRemoteIssue(link.data.remoteCompanyId, link.data.remoteIssueId);
            linkRows.push({
                bridgeId: link.id,
                direction: link.data.direction,
                remoteCompanyId: link.data.remoteCompanyId,
                remoteCompanyName: names.get(link.data.remoteCompanyId) ?? null,
                remoteIssueId: link.data.remoteIssueId,
                remoteIdentifier: remote?.identifier ?? null,
                remoteTitle: remote?.title ?? null,
                remoteStatus: remote?.status ?? null,
            });
        }
        items.push({
            issueId: issue.id,
            identifier: issue.identifier ?? null,
            title: issue.title,
            status: issue.status,
            linkCount: linkRows.length,
            links: linkRows,
        });
    }
    items.sort((left, right) => {
        if (left.linkCount !== right.linkCount) {
            return right.linkCount - left.linkCount;
        }
        return left.title.localeCompare(right.title);
    });
    const linked = items.filter((item) => item.linkCount > 0).length;
    return {
        companyId,
        generatedAt: new Date().toISOString(),
        totals: {
            issues: items.length,
            linked,
            unlinked: Math.max(items.length - linked, 0),
        },
        items,
    };
}
async function buildDetailTabSnapshot(ctx, params) {
    const companyId = getCompanyIdFromParams(params);
    const issueId = asString(params.issueId) || asString(params.localIssueId);
    if (!companyId) {
        return {
            companyId: "",
            generatedAt: new Date().toISOString(),
            issue: null,
            links: [],
            remoteCompanies: [],
        };
    }
    const [issue, links, companies] = await Promise.all([
        issueId ? findIssueByIdOrIdentifier(ctx, companyId, issueId) : Promise.resolve(null),
        issueId ? listBridgeLinksForLocalIssue(ctx, companyId, issueId) : Promise.resolve([]),
        listCompanies(ctx),
    ]);
    const names = companyNameMap(companies);
    const remoteIssueCache = new Map();
    async function resolveRemoteIssue(company, remoteIssueId) {
        const key = `${company}:${remoteIssueId}`;
        if (remoteIssueCache.has(key)) {
            return remoteIssueCache.get(key) ?? null;
        }
        const remoteIssue = await findIssueByIdOrIdentifier(ctx, company, remoteIssueId);
        const snapshot = remoteIssue ? toIssueSnapshot(remoteIssue) : null;
        remoteIssueCache.set(key, snapshot);
        return snapshot;
    }
    const rows = [];
    for (const link of links) {
        const remote = await resolveRemoteIssue(link.data.remoteCompanyId, link.data.remoteIssueId);
        rows.push({
            bridgeId: link.id,
            direction: link.data.direction,
            remoteCompanyId: link.data.remoteCompanyId,
            remoteCompanyName: names.get(link.data.remoteCompanyId) ?? null,
            remoteIssueId: link.data.remoteIssueId,
            remoteIdentifier: remote?.identifier ?? null,
            remoteTitle: remote?.title ?? null,
            remoteStatus: remote?.status ?? null,
            updatedAt: link.data.updatedAt,
            lastSyncedAt: link.data.lastSyncedAt,
            lastSyncedStatus: link.data.lastSyncedStatus,
        });
    }
    rows.sort((left, right) => left.remoteCompanyId.localeCompare(right.remoteCompanyId) || left.remoteIssueId.localeCompare(right.remoteIssueId));
    return {
        companyId,
        generatedAt: new Date().toISOString(),
        issue: issue ? toIssueSnapshot(issue) : null,
        links: rows,
        remoteCompanies: companies
            .filter((company) => company.id !== companyId)
            .map((company) => ({ id: company.id, name: company.name }))
            .sort((left, right) => left.name.localeCompare(right.name)),
    };
}
async function createBridgeLinkFromParams(ctx, params) {
    const localCompanyId = getCompanyIdFromParams(params);
    const remoteCompanyId = asString(params.remoteCompanyId);
    const localIssueKey = asString(params.localIssueId);
    const remoteIssueKey = asString(params.remoteIssueId);
    const direction = normalizeDirection(params.direction);
    const createdBy = asString(params.createdBy) || "service-request-bridge-ui";
    if (!localCompanyId || !remoteCompanyId || !localIssueKey || !remoteIssueKey) {
        throw new Error("create-link requires companyId, remoteCompanyId, localIssueId, remoteIssueId");
    }
    if (localCompanyId === remoteCompanyId) {
        throw new Error("Bridge requires two different companies");
    }
    const [localIssue, remoteIssue] = await Promise.all([
        findIssueByIdOrIdentifier(ctx, localCompanyId, localIssueKey),
        findIssueByIdOrIdentifier(ctx, remoteCompanyId, remoteIssueKey),
    ]);
    if (!localIssue) {
        throw new Error(`Local issue not found: ${localIssueKey}`);
    }
    if (!remoteIssue) {
        throw new Error(`Remote issue not found: ${remoteIssueKey}`);
    }
    const result = await upsertBridgePair(ctx, {
        localCompanyId,
        localIssueId: localIssue.id,
        remoteCompanyId,
        remoteIssueId: remoteIssue.id,
        direction,
        createdBy,
    });
    return {
        id: result.local.id,
        mirrorId: result.mirror.id,
        direction,
    };
}
function extractIssueCreatedRefs(event) {
    const payload = asRecord(event.payload);
    const issuePayload = asRecord(payload.issue);
    const companyId = asString(payload.companyId)
        || asString(payload.company_id)
        || asString(issuePayload.companyId)
        || asString(issuePayload.company_id)
        || asString(event.companyId)
        || asString(event.scopeId);
    const issueId = asString(payload.issueId)
        || asString(payload.issue_id)
        || asString(issuePayload.id)
        || (event.entityType === "issue" ? asString(event.entityId) : "");
    const title = asString(payload.title)
        || asString(issuePayload.title);
    const description = asString(payload.description)
        || asString(issuePayload.description);
    const labels = [
        ...getLabelNames(payload.labels),
        ...getLabelNames(issuePayload.labels),
    ];
    return {
        companyId,
        issueId,
        title,
        description,
        labels,
    };
}
function extractIssueUpdatedRefs(event) {
    const payload = asRecord(event.payload);
    const companyId = asString(payload.companyId)
        || asString(payload.company_id)
        || getNestedString(payload, "issue", "companyId")
        || getNestedString(payload, "issue", "company_id")
        || getNestedString(payload, "context", "companyId")
        || getNestedString(payload, "context", "company_id")
        || asString(event.companyId)
        || asString(event.scopeId);
    const issueId = asString(payload.issueId)
        || asString(payload.issue_id)
        || getNestedString(payload, "issue", "id")
        || getNestedString(payload, "context", "issueId")
        || getNestedString(payload, "context", "issue", "id")
        || (event.entityType === "issue" ? asString(event.entityId) : "");
    const status = asString(payload.status)
        || getNestedString(payload, "issue", "status")
        || getNestedString(payload, "changes", "status", "to");
    return {
        companyId,
        issueId,
        status,
    };
}
async function resolveCurrentIssueStatus(ctx, companyId, issueId, fallbackStatus) {
    if (fallbackStatus) {
        return fallbackStatus;
    }
    const issue = await findIssueByIdOrIdentifier(ctx, companyId, issueId);
    return issue?.status ?? "";
}
async function syncLinkedIssueStatus(ctx, source, link) {
    const sourceStatus = asString(source.status);
    if (!sourceStatus) {
        return;
    }
    const routeStampKey = makeSyncStampExternalId({
        localIssueId: link.data.localIssueId,
        remoteCompanyId: link.data.remoteCompanyId,
        remoteIssueId: link.data.remoteIssueId,
        status: sourceStatus,
    });
    const shouldSkip = await hasActiveSyncStamp(ctx, source.companyId, routeStampKey, SYNC_STAMP_TTL_MS);
    if (shouldSkip) {
        ctx.logger.info("Skipped bridge sync due to active sync stamp", {
            companyId: source.companyId,
            issueId: source.issueId,
            remoteCompanyId: link.data.remoteCompanyId,
            remoteIssueId: link.data.remoteIssueId,
            status: sourceStatus,
        });
        return;
    }
    const remoteIssue = await findIssueByIdOrIdentifier(ctx, link.data.remoteCompanyId, link.data.remoteIssueId);
    if (!remoteIssue) {
        ctx.logger.warn("Bridge target issue not found", {
            companyId: source.companyId,
            issueId: source.issueId,
            remoteCompanyId: link.data.remoteCompanyId,
            remoteIssueId: link.data.remoteIssueId,
        });
        return;
    }
    if (remoteIssue.status !== sourceStatus) {
        await ctx.issues.update(remoteIssue.id, { status: sourceStatus }, link.data.remoteCompanyId);
        ctx.logger.info("Bridge synchronized issue status", {
            fromCompanyId: source.companyId,
            fromIssueId: source.issueId,
            toCompanyId: link.data.remoteCompanyId,
            toIssueId: remoteIssue.id,
            status: sourceStatus,
        });
    }
    const stampCreatedAt = new Date().toISOString();
    const reverseStampKey = makeSyncStampExternalId({
        localIssueId: remoteIssue.id,
        remoteCompanyId: source.companyId,
        remoteIssueId: source.issueId,
        status: sourceStatus,
    });
    await upsertSyncStamp(ctx, link.data.remoteCompanyId, reverseStampKey, {
        localIssueId: remoteIssue.id,
        remoteCompanyId: source.companyId,
        remoteIssueId: source.issueId,
        status: sourceStatus,
        createdAt: stampCreatedAt,
    });
    await touchBridgeSyncMeta(ctx, link, {
        syncedAt: stampCreatedAt,
        status: sourceStatus,
        sourceIssueId: source.issueId,
    });
}
async function handleIssueCreated(ctx, event) {
    const refs = extractIssueCreatedRefs(event);
    if (!refs.companyId || !refs.issueId) {
        return;
    }
    const eventId = asString(event.eventId);
    if (eventId) {
        const processed = await isEventProcessed(ctx, refs.companyId, eventId);
        if (processed) {
            return;
        }
    }
    const config = await getBridgeConfig(ctx);
    if (!config.autoCreateMirrorIssue) {
        if (eventId) {
            await markEventProcessed(ctx, refs.companyId, eventId);
        }
        return;
    }
    const sourceIssue = await findIssueByIdOrIdentifier(ctx, refs.companyId, refs.issueId);
    const sourceIssueId = sourceIssue?.id ?? refs.issueId;
    const sourceTitle = sourceIssue?.title ?? refs.title;
    const sourceDescription = asString(sourceIssue?.description) || refs.description;
    const sourceLabels = [
        ...getLabelNames(sourceIssue?.labels),
        ...refs.labels,
    ];
    if (!sourceTitle || !isMatchingLabel(sourceLabels, config.requesterLabelName)) {
        if (eventId) {
            await markEventProcessed(ctx, refs.companyId, eventId);
        }
        return;
    }
    const providerCompany = await findCompanyByName(ctx, config.providerCompanyName);
    if (!providerCompany) {
        ctx.logger.warn("Provider company name is not configured or not found", {
            companyId: refs.companyId,
            providerCompanyName: config.providerCompanyName,
            issueId: sourceIssueId,
        });
        if (eventId) {
            await markEventProcessed(ctx, refs.companyId, eventId);
        }
        return;
    }
    if (providerCompany.id === refs.companyId) {
        ctx.logger.warn("Provider company equals requester company. Auto mirror skipped.", {
            companyId: refs.companyId,
            issueId: sourceIssueId,
            providerCompanyId: providerCompany.id,
        });
        if (eventId) {
            await markEventProcessed(ctx, refs.companyId, eventId);
        }
        return;
    }
    const existingLinks = await listBridgeLinksForLocalIssue(ctx, refs.companyId, sourceIssueId);
    const alreadyLinked = existingLinks.some((link) => link.data.remoteCompanyId === providerCompany.id);
    if (alreadyLinked) {
        if (eventId) {
            await markEventProcessed(ctx, refs.companyId, eventId);
        }
        return;
    }
    const workflowLabel = typeof config.workflowTriggerLabel === "string" && config.workflowTriggerLabel.trim()
        ? config.workflowTriggerLabel.trim()
        : "";
    const mirrorTitle = workflowLabel
        ? `[${workflowLabel}] ${MIRROR_TITLE_PREFIX} ${sourceTitle}`
        : `${MIRROR_TITLE_PREFIX} ${sourceTitle}`;
    const mirrorCreateParams = {
        companyId: providerCompany.id,
        title: mirrorTitle,
        description: sourceDescription,
    };
    if (workflowLabel) {
        mirrorCreateParams.labels = [workflowLabel];
    }
    const mirrorIssue = await ctx.issues.create(mirrorCreateParams);
    await upsertBridgePair(ctx, {
        localCompanyId: refs.companyId,
        localIssueId: sourceIssueId,
        remoteCompanyId: providerCompany.id,
        remoteIssueId: mirrorIssue.id,
        direction: BRIDGE_DIRECTIONS.twoWay,
        createdBy: "service-request-bridge-auto",
    });
    ctx.logger.info("Auto-created mirror issue and bridge link", {
        localCompanyId: refs.companyId,
        localIssueId: sourceIssueId,
        providerCompanyId: providerCompany.id,
        remoteIssueId: mirrorIssue.id,
    });
    if (eventId) {
        await markEventProcessed(ctx, refs.companyId, eventId);
    }
}
async function handleIssueUpdated(ctx, event) {
    const refs = extractIssueUpdatedRefs(event);
    if (!refs.companyId || !refs.issueId) {
        return;
    }
    const eventId = asString(event.eventId);
    if (eventId) {
        const processed = await isEventProcessed(ctx, refs.companyId, eventId);
        if (processed) {
            return;
        }
    }
    const currentStatus = await resolveCurrentIssueStatus(ctx, refs.companyId, refs.issueId, refs.status);
    if (!currentStatus) {
        return;
    }
    const links = await listBridgeLinksForLocalIssue(ctx, refs.companyId, refs.issueId);
    if (links.length === 0) {
        if (eventId) {
            await markEventProcessed(ctx, refs.companyId, eventId);
        }
        return;
    }
    for (const link of links) {
        if (!canPropagateLocalToRemote(link.data.direction)) {
            continue;
        }
        await syncLinkedIssueStatus(ctx, {
            companyId: refs.companyId,
            issueId: refs.issueId,
            status: currentStatus,
        }, link);
    }
    if (eventId) {
        await markEventProcessed(ctx, refs.companyId, eventId);
    }
}
function registerDataHandlers(ctx) {
    registerDataHandler(ctx, DATA_KEYS.listTab, async (params) => {
        return await buildListTabSnapshot(ctx, params);
    });
    registerDataHandler(ctx, DATA_KEYS.detailTab, async (params) => {
        return await buildDetailTabSnapshot(ctx, params);
    });
    registerDataHandler(ctx, DATA_KEYS.dashboardWidget, async (params) => {
        return await buildDashboardWidgetSnapshot(ctx, params);
    });
    registerDataHandler(ctx, DATA_KEYS.createLink, async (params) => {
        return await createBridgeLinkFromParams(ctx, params);
    });
}
function registerActionHandlers(ctx) {
    registerActionHandler(ctx, ACTION_KEYS.createLink, async (params) => {
        return await createBridgeLinkFromParams(ctx, params);
    });
}
const plugin = definePlugin({
    async setup(ctx) {
        registerDataHandlers(ctx);
        registerActionHandlers(ctx);
        ctx.events.on("issue.created", async (event) => {
            await handleIssueCreated(ctx, event);
        });
        ctx.events.on("issue.updated", async (event) => {
            await handleIssueUpdated(ctx, event);
        });
        ctx.logger.info("Service Request Bridge plugin worker initialized", {
            pluginId: PLUGIN_ID,
            supportedDirections: [
                BRIDGE_DIRECTIONS.twoWay,
                BRIDGE_DIRECTIONS.localToRemote,
                BRIDGE_DIRECTIONS.remoteToLocal,
            ],
        });
    },
    async onHealth() {
        return {
            status: "ok",
            message: "Service Request Bridge worker ready",
        };
    },
});
export default plugin;
runWorker(plugin, import.meta.url);
