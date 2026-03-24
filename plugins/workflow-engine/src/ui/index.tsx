import {
  useHostContext,
  usePluginData,
  type PluginPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { type CSSProperties, type JSX } from "react";
import { PLUGIN_ID } from "../constants.js";

type WorkflowOverviewData = {
  workflows: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    steps: Array<{ id: string; title: string; dependsOn: string[] }>;
  }>;
  activeRuns: Array<{
    id: string;
    workflowName: string;
    status: string;
    startedAt: string;
  }>;
};

type OverviewData = WorkflowOverviewData;

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
  padding: "24px",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "var(--foreground, #f8fafc)",
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  padding: "16px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "12px",
  background: "var(--card, #0f172a)",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "28px",
  lineHeight: 1.2,
  fontWeight: 700,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "18px",
  lineHeight: 1.3,
  fontWeight: 600,
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: "var(--muted-foreground, #94a3b8)",
  fontSize: "14px",
  lineHeight: 1.5,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border, #334155)",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted-foreground, #94a3b8)",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid var(--border, #1e293b)",
  verticalAlign: "top",
};

const widgetStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "14px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "12px",
  background: "var(--card, #0f172a)",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "var(--foreground, #f8fafc)",
};

const widgetTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "14px",
  lineHeight: 1.2,
  fontWeight: 600,
};

const widgetCountStyle: CSSProperties = {
  fontSize: "28px",
  lineHeight: 1,
  fontWeight: 700,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const buttonStyle: CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--card, #0f172a)",
  color: "var(--foreground, #f8fafc)",
  cursor: "pointer",
  fontSize: "13px",
};

function useWorkflowOverview(companyId: string | null | undefined) {
  return usePluginData<OverviewData>("workflow-overview", {
    companyId: companyId ?? "",
  });
}

function statusBadgeStyle(status: string): CSSProperties {
  const normalized = status.trim().toLowerCase();

  if (normalized === "running" || normalized === "active") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: "999px",
      background: "#dbeafe",
      color: "#1d4ed8",
      fontSize: "12px",
      fontWeight: 600,
    };
  }

  if (normalized === "completed") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: "999px",
      background: "#dcfce7",
      color: "#15803d",
      fontSize: "12px",
      fontWeight: 600,
    };
  }

  if (normalized === "failed" || normalized === "aborted") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: "999px",
      background: "#fee2e2",
      color: "#b91c1c",
      fontSize: "12px",
      fontWeight: 600,
    };
  }

  if (normalized === "timed-out" || normalized === "paused") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: "999px",
      background: "#ffedd5",
      color: "#c2410c",
      fontSize: "12px",
      fontWeight: 600,
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: "999px",
    background: "#f3f4f6",
    color: "#4b5563",
    fontSize: "12px",
    fontWeight: 600,
  };
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function countStatuses(activeRuns: WorkflowOverviewData["activeRuns"]): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();

  for (const run of activeRuns) {
    const status = run.status.trim().toLowerCase() || "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div style={sectionStyle}>
      <p style={mutedTextStyle}>{message}</p>
      <div>
        <button onClick={onRetry} style={buttonStyle} type="button">
          Retry
        </button>
      </div>
    </div>
  );
}

function DefinitionsTable({ workflows }: { workflows: WorkflowOverviewData["workflows"] }): JSX.Element {
  if (workflows.length === 0) {
    return <p style={mutedTextStyle}>No workflows defined yet.</p>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Step Count</th>
        </tr>
      </thead>
      <tbody>
        {workflows.map((workflow) => (
          <tr key={workflow.id}>
            <td style={tdStyle}>
              <div style={{ display: "grid", gap: "4px" }}>
                <strong>{workflow.name}</strong>
                <span style={mutedTextStyle}>{workflow.description}</span>
              </div>
            </td>
            <td style={tdStyle}>
              <span style={statusBadgeStyle(workflow.status)}>{workflow.status}</span>
            </td>
            <td style={tdStyle}>{workflow.steps.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActiveRunsTable({ activeRuns }: { activeRuns: WorkflowOverviewData["activeRuns"] }): JSX.Element {
  if (activeRuns.length === 0) {
    return <p style={mutedTextStyle}>No active runs.</p>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Workflow</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Started</th>
        </tr>
      </thead>
      <tbody>
        {activeRuns.map((run) => (
          <tr key={run.id}>
            <td style={tdStyle}>{run.workflowName}</td>
            <td style={tdStyle}>
              <span style={statusBadgeStyle(run.status)}>{run.status}</span>
            </td>
            <td style={tdStyle}>{formatDateTime(run.startedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WorkflowPage(props: PluginPageProps): JSX.Element {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";
  const overview = useWorkflowOverview(companyId);

  if (overview.loading) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
        <h1 style={titleStyle}>Workflows</h1>
        <p style={mutedTextStyle}>Loading workflows...</p>
      </div>
    );
  }

  if (overview.error) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
        <h1 style={titleStyle}>Workflows</h1>
        <ErrorState
          message={`Failed to load workflows: ${overview.error.message}`}
          onRetry={() => {
            void overview.refresh();
          }}
        />
      </div>
    );
  }

  const data = overview.data ?? { workflows: [], activeRuns: [] };

  return (
    <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
      <div style={headerRowStyle}>
        <h1 style={titleStyle}>Workflows</h1>
      </div>

      <section style={sectionStyle}>
        <div style={{ display: "grid", gap: "4px" }}>
          <h2 style={sectionTitleStyle}>Workflow Definitions</h2>
          <p style={mutedTextStyle}>Definitions available for this company.</p>
        </div>
        <DefinitionsTable workflows={data.workflows} />
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "grid", gap: "4px" }}>
          <h2 style={sectionTitleStyle}>Active Runs</h2>
          <p style={mutedTextStyle}>Currently running or unresolved workflow executions.</p>
        </div>
        <ActiveRunsTable activeRuns={data.activeRuns} />
      </section>
    </div>
  );
}

export function WorkflowDashboardWidget(props: PluginWidgetProps): JSX.Element {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";
  const overview = useWorkflowOverview(companyId);

  if (overview.loading) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={widgetStyle}>
        <h2 style={widgetTitleStyle}>Workflows</h2>
        <span style={mutedTextStyle}>Loading workflows...</span>
      </div>
    );
  }

  if (overview.error) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={widgetStyle}>
        <h2 style={widgetTitleStyle}>Workflows</h2>
        <span style={mutedTextStyle}>Unable to load workflow summary.</span>
      </div>
    );
  }

  const data = overview.data ?? { workflows: [], activeRuns: [] };
  const statusCounts = countStatuses(data.activeRuns);

  return (
    <div data-plugin-id={PLUGIN_ID} style={widgetStyle}>
      <h2 style={widgetTitleStyle}>Workflows</h2>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={widgetCountStyle}>{data.activeRuns.length}</span>
        <span style={mutedTextStyle}>active runs</span>
      </div>
      <div style={badgeRowStyle}>
        {statusCounts.length > 0 ? (
          statusCounts.map((item) => (
            <span key={item.status} style={statusBadgeStyle(item.status)}>
              {item.status}: {item.count}
            </span>
          ))
        ) : (
          <span style={mutedTextStyle}>No active runs.</span>
        )}
      </div>
    </div>
  );
}

export function WorkflowSidebarLink({ context }: { context: { companyPrefix?: string | null } }) {
  const href = context.companyPrefix ? `/${context.companyPrefix}/workflows` : "/workflows";
  const isActive = typeof window !== "undefined" && window.location.pathname === href;
  return (
    <a
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px",
        fontSize: "13px", fontWeight: 500, textDecoration: "none",
        color: isActive ? "var(--foreground, #f8fafc)" : "color-mix(in srgb, var(--foreground, #f8fafc) 80%, transparent)",
        background: isActive ? "var(--accent, rgba(125,211,252,0.12))" : "transparent",
        borderRadius: "8px",
      }}
    >
      <span>⚡ Workflows</span>
    </a>
  );
}
