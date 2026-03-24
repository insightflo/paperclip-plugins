import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginPageProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  type CSSProperties,
  type FormEvent,
  type JSX,
  useMemo,
  useState,
} from "react";
import { ACTION_KEYS, DATA_KEYS } from "../constants.js";

type ToolConfig = {
  name: string;
  command: string;
  workingDirectory?: string;
  env?: Record<string, string>;
  requiresApproval: boolean;
  description?: string;
  argsSchema?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

type ToolConfigRecord = {
  id: string;
  data: ToolConfig;
  createdAt: string;
  updatedAt: string;
};

type AgentToolGrantRecord = {
  id: string;
  data: {
    agentName: string;
    toolName: string;
    grantedBy: string;
    grantedAt: string;
  };
  createdAt: string;
  updatedAt: string;
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

type PageData = {
  companyId: string;
  companyName: string | null;
  tools: ToolConfigRecord[];
  grants: AgentToolGrantRecord[];
  logs: Array<{ id: string; createdAt: string; data: ExecutionLog }>;
  agents: Array<{ id: string; name: string; status: string; role: string }>;
};

type ToolFormState = {
  name: string;
  command: string;
  workingDirectory: string;
  description: string;
  requiresApproval: boolean;
};

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
  padding: "24px",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "#111827",
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  background: "#ffffff",
  padding: "16px",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "24px",
  lineHeight: 1.2,
  fontWeight: 700,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  lineHeight: 1.3,
  fontWeight: 600,
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  lineHeight: 1.4,
  color: "#6b7280",
};

const gridCols2Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "10px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "13px",
};

const buttonStyle: CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111827",
  cursor: "pointer",
  fontSize: "13px",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#111827",
  color: "#ffffff",
  borderColor: "#111827",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const thStyle: CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  padding: "8px 10px",
  fontSize: "11px",
  textTransform: "uppercase",
  color: "#6b7280",
  letterSpacing: "0.04em",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "9px 10px",
  verticalAlign: "top",
};

const codeStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "11px",
  lineHeight: 1.45,
  color: "#374151",
};

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function truncate(value: string | undefined, max = 120): string {
  if (!value) {
    return "";
  }

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}…`;
}

function ToolSection({
  data,
  companyId,
  refresh,
}: {
  data: PageData;
  companyId: string;
  refresh: () => void;
}): JSX.Element {
  const toast = usePluginToast();
  const createToolAction = usePluginAction(ACTION_KEYS.createTool);
  const updateToolAction = usePluginAction(ACTION_KEYS.updateTool);
  const deleteToolAction = usePluginAction(ACTION_KEYS.deleteTool);

  const [form, setForm] = useState<ToolFormState>({
    name: "",
    command: "",
    workingDirectory: "",
    description: "",
    requiresApproval: false,
  });

  async function onCreateTool(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await createToolAction({
      companyId,
      tool: {
        name: form.name,
        command: form.command,
        workingDirectory: form.workingDirectory,
        description: form.description,
        requiresApproval: form.requiresApproval,
      },
      actorName: "tool-registry-ui",
    });

    toast({ title: `Tool created: ${form.name}`, tone: "success" });
    setForm({ name: "", command: "", workingDirectory: "", description: "", requiresApproval: false });
    refresh();
  }

  async function onToggleApproval(tool: ToolConfigRecord): Promise<void> {
    await updateToolAction({
      companyId,
      toolName: tool.data.name,
      patch: {
        requiresApproval: !tool.data.requiresApproval,
      },
    });

    toast({
      title: `${tool.data.name} approval ${tool.data.requiresApproval ? "disabled" : "enabled"}`,
      tone: "info",
    });
    refresh();
  }

  async function onDeleteTool(toolName: string): Promise<void> {
    await deleteToolAction({ companyId, toolName });
    toast({ title: `Tool deleted: ${toolName}`, tone: "warn" });
    refresh();
  }

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <h2 style={sectionTitleStyle}>Tool Config</h2>
        <p style={mutedTextStyle}>{data.tools.length} tools</p>
      </div>

      <form onSubmit={(event) => void onCreateTool(event)} style={{ display: "grid", gap: "10px" }}>
        <div style={gridCols2Style}>
          <input
            placeholder="Tool name (e.g. ripgrep)"
            style={inputStyle}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            placeholder="Command (e.g. rg)"
            style={inputStyle}
            value={form.command}
            onChange={(event) => setForm((prev) => ({ ...prev, command: event.target.value }))}
            required
          />
          <input
            placeholder="Working directory (optional)"
            style={inputStyle}
            value={form.workingDirectory}
            onChange={(event) => setForm((prev) => ({ ...prev, workingDirectory: event.target.value }))}
          />
          <input
            placeholder="Description"
            style={inputStyle}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>

        <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px" }}>
          <input
            type="checkbox"
            checked={form.requiresApproval}
            onChange={(event) => setForm((prev) => ({ ...prev, requiresApproval: event.target.checked }))}
          />
          requiresApproval
        </label>

        <div>
          <button style={primaryButtonStyle} type="submit">
            Create Tool
          </button>
        </div>
      </form>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Command</th>
            <th style={thStyle}>Approval</th>
            <th style={thStyle}>Updated</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.tools.map((tool) => (
            <tr key={tool.id}>
              <td style={tdStyle}>
                <strong>{tool.data.name}</strong>
                <div style={mutedTextStyle}>{tool.data.description || "-"}</div>
              </td>
              <td style={tdStyle}>
                <code>{tool.data.command}</code>
                <div style={mutedTextStyle}>{tool.data.workingDirectory || "cwd: default"}</div>
              </td>
              <td style={tdStyle}>{tool.data.requiresApproval ? "Yes" : "No"}</td>
              <td style={tdStyle}>{formatDateTime(tool.data.updatedAt || tool.updatedAt)}</td>
              <td style={tdStyle}>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button type="button" style={buttonStyle} onClick={() => void onToggleApproval(tool)}>
                    Toggle Approval
                  </button>
                  <button type="button" style={buttonStyle} onClick={() => void onDeleteTool(tool.data.name)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {data.tools.length === 0 ? (
            <tr>
              <td colSpan={5} style={tdStyle}>
                <p style={mutedTextStyle}>No tools configured yet.</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function GrantSection({
  data,
  companyId,
  refresh,
}: {
  data: PageData;
  companyId: string;
  refresh: () => void;
}): JSX.Element {
  const toast = usePluginToast();
  const grantToolAction = usePluginAction(ACTION_KEYS.grantTool);
  const revokeToolAction = usePluginAction(ACTION_KEYS.revokeTool);

  const [agentName, setAgentName] = useState<string>("");
  const [toolName, setToolName] = useState<string>("");

  const sortedAgentNames = useMemo(
    () => data.agents.map((agent) => agent.name).sort((left, right) => left.localeCompare(right)),
    [data.agents],
  );

  async function onGrant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await grantToolAction({
      companyId,
      agentName,
      toolName,
      grantedBy: "tool-registry-ui",
    });

    toast({ title: `Granted ${toolName} to ${agentName}`, tone: "success" });
    refresh();
  }

  async function onRevoke(targetAgentName: string, targetToolName: string): Promise<void> {
    await revokeToolAction({
      companyId,
      agentName: targetAgentName,
      toolName: targetToolName,
    });

    toast({ title: `Revoked ${targetToolName} from ${targetAgentName}`, tone: "warn" });
    refresh();
  }

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <h2 style={sectionTitleStyle}>Agent Grants</h2>
        <p style={mutedTextStyle}>{data.grants.length} grants</p>
      </div>

      <form onSubmit={(event) => void onGrant(event)} style={{ display: "grid", gap: "10px" }}>
        <div style={gridCols2Style}>
          <select
            style={inputStyle}
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            required
          >
            <option value="">Select agent</option>
            {sortedAgentNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            style={inputStyle}
            value={toolName}
            onChange={(event) => setToolName(event.target.value)}
            required
          >
            <option value="">Select tool</option>
            {data.tools.map((tool) => (
              <option key={tool.id} value={tool.data.name}>
                {tool.data.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button style={primaryButtonStyle} type="submit">
            Grant Tool
          </button>
        </div>
      </form>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Agent</th>
            <th style={thStyle}>Tool</th>
            <th style={thStyle}>Granted By</th>
            <th style={thStyle}>Granted At</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.grants.map((grant) => (
            <tr key={grant.id}>
              <td style={tdStyle}>{grant.data.agentName}</td>
              <td style={tdStyle}>{grant.data.toolName}</td>
              <td style={tdStyle}>{grant.data.grantedBy}</td>
              <td style={tdStyle}>{formatDateTime(grant.data.grantedAt)}</td>
              <td style={tdStyle}>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => void onRevoke(grant.data.agentName, grant.data.toolName)}
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
          {data.grants.length === 0 ? (
            <tr>
              <td colSpan={5} style={tdStyle}>
                <p style={mutedTextStyle}>No grants configured yet.</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function LogsSection({ data }: { data: PageData }): JSX.Element {
  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <h2 style={sectionTitleStyle}>Recent Execution Logs</h2>
        <p style={mutedTextStyle}>{data.logs.length} entries</p>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Time</th>
            <th style={thStyle}>Agent</th>
            <th style={thStyle}>Tool</th>
            <th style={thStyle}>Mode</th>
            <th style={thStyle}>Exit</th>
            <th style={thStyle}>Summary</th>
          </tr>
        </thead>
        <tbody>
          {data.logs.map((entry) => {
            const log = entry.data;
            const summary = log.reason || log.stderr || log.stdout || "-";

            return (
              <tr key={entry.id}>
                <td style={tdStyle}>{formatDateTime(log.timestamp || entry.createdAt)}</td>
                <td style={tdStyle}>{log.agentName || log.agentId}</td>
                <td style={tdStyle}>{log.toolName}</td>
                <td style={tdStyle}>{log.mode}</td>
                <td style={tdStyle}>{log.exitCode == null ? "-" : String(log.exitCode)}</td>
                <td style={tdStyle}>
                  <pre style={codeStyle}>{truncate(summary, 160) || "-"}</pre>
                </td>
              </tr>
            );
          })}
          {data.logs.length === 0 ? (
            <tr>
              <td colSpan={6} style={tdStyle}>
                <p style={mutedTextStyle}>No execution logs yet.</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

export function ToolRegistryPage(props: PluginPageProps): JSX.Element {
  const hostContext = useHostContext();
  const toast = usePluginToast();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";

  const page = usePluginData<PageData>(DATA_KEYS.pageData, {
    companyId,
    maxLogEntries: 50,
  });

  if (!companyId) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>Tool Registry</h1>
        <p style={mutedTextStyle}>Company context is required.</p>
      </main>
    );
  }

  if (page.loading) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>Tool Registry</h1>
        <p style={mutedTextStyle}>Loading...</p>
      </main>
    );
  }

  if (page.error || !page.data) {
    return (
      <main style={pageStyle}>
        <h1 style={titleStyle}>Tool Registry</h1>
        <p style={mutedTextStyle}>{page.error?.message ?? "Failed to load tool registry data."}</p>
        <div>
          <button style={buttonStyle} type="button" onClick={() => page.refresh()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  const data = page.data;

  function refresh(): void {
    page.refresh();
  }

  return (
    <main style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>Tool Registry</h1>
          <p style={mutedTextStyle}>Company: {data.companyName ?? companyId}</p>
        </div>

        <button
          style={buttonStyle}
          type="button"
          onClick={() => {
            refresh();
            toast({ title: "Refreshed tool registry", tone: "info" });
          }}
        >
          Refresh
        </button>
      </div>

      <ToolSection data={data} companyId={companyId} refresh={refresh} />
      <GrantSection data={data} companyId={companyId} refresh={refresh} />
      <LogsSection data={data} />
    </main>
  );
}

export function ToolRegistrySidebarLink({ context }: { context: { companyPrefix?: string | null } }) {
  const href = context.companyPrefix ? `/${context.companyPrefix}/tool-registry` : "/tool-registry";
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
      <span>🔧 Tool Registry</span>
    </a>
  );
}
