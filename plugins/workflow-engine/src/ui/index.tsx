import {
  useHostContext,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { useState, type CSSProperties, type FormEvent, type JSX } from "react";
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
  borderBottom: "1px solid var(--border, #334155)",
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

const buttonDisabledStyle: CSSProperties = {
  opacity: 0.65,
  cursor: "not-allowed",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "color-mix(in srgb, var(--foreground, #f8fafc) 14%, var(--card, #0f172a))",
};

const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "color-mix(in srgb, var(--muted-foreground, #94a3b8) 24%, var(--card, #0f172a))",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--background, #020617)",
  color: "var(--foreground, #f8fafc)",
  fontSize: "13px",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "84px",
  resize: "vertical",
};

const formPanelStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "10px",
  background: "var(--card, #0f172a)",
};

function useWorkflowOverview(companyId: string | null | undefined) {
  return usePluginData<OverviewData>("workflow-overview", {
    companyId: companyId ?? "",
  });
}

function statusBadgeStyle(status: string): CSSProperties {
  const normalized = status.trim().toLowerCase();
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    border: "1px solid var(--border, #334155)",
    color: "var(--foreground, #f8fafc)",
  };

  if (normalized === "running" || normalized === "active") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--foreground, #f8fafc) 16%, var(--background, #020617))",
    };
  }

  if (normalized === "completed") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--foreground, #f8fafc) 22%, var(--background, #020617))",
    };
  }

  if (normalized === "failed" || normalized === "aborted") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--muted-foreground, #94a3b8) 26%, var(--background, #020617))",
    };
  }

  if (normalized === "timed-out" || normalized === "paused") {
    return {
      ...base,
      background: "color-mix(in srgb, var(--muted-foreground, #94a3b8) 20%, var(--background, #020617))",
    };
  }

  return {
    ...base,
    background: "color-mix(in srgb, var(--background, #020617) 78%, var(--card, #0f172a))",
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
  retrying,
}: {
  message: string;
  onRetry: () => Promise<void>;
  retrying: boolean;
}): JSX.Element {
  return (
    <div style={sectionStyle}>
      <p style={mutedTextStyle}>{message}</p>
      <div>
        <button
          onClick={() => {
            void onRetry();
          }}
          style={retrying ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
          type="button"
          disabled={retrying}
        >
          {retrying ? "갱신 중..." : "Retry"}
        </button>
      </div>
    </div>
  );
}

function DefinitionsTable({
  workflows,
  companyId,
  refreshOverview,
}: {
  workflows: WorkflowOverviewData["workflows"];
  companyId: string;
  refreshOverview: () => Promise<void>;
}): JSX.Element {
  const updateWorkflow = usePluginAction("update-workflow");
  const deleteWorkflow = usePluginAction("delete-workflow");
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [editingDescription, setEditingDescription] = useState<string>("");
  const [editingStatus, setEditingStatus] = useState<string>("active");
  const [pendingWorkflowId, setPendingWorkflowId] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string>("");

  function beginEdit(workflow: WorkflowOverviewData["workflows"][number]): void {
    setTableError("");
    setEditingWorkflowId(workflow.id);
    setEditingName(workflow.name);
    setEditingDescription(workflow.description);
    setEditingStatus(workflow.status);
  }

  function cancelEdit(): void {
    setEditingWorkflowId(null);
    setEditingName("");
    setEditingDescription("");
    setEditingStatus("active");
    setTableError("");
  }

  async function onSaveEdit(workflowId: string): Promise<void> {
    const nextName = editingName.trim();
    if (!nextName) {
      setTableError("name은 필수입니다.");
      return;
    }

    setPendingWorkflowId(workflowId);
    setTableError("");
    try {
      const patch = {
        name: nextName,
        description: editingDescription.trim(),
        status: editingStatus.trim() || "active",
      };
      await updateWorkflow({
        companyId,
        workflowId,
        id: workflowId,
        patch,
        ...patch,
      });
      cancelEdit();
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`수정 실패: ${message}`);
    } finally {
      setPendingWorkflowId(null);
    }
  }

  async function onDeleteWorkflow(workflow: WorkflowOverviewData["workflows"][number]): Promise<void> {
    const accepted = typeof window !== "undefined"
      ? window.confirm(`"${workflow.name}" 워크플로를 archived 상태로 변경할까요?`)
      : true;
    if (!accepted) {
      return;
    }

    setPendingWorkflowId(workflow.id);
    setTableError("");
    try {
      await deleteWorkflow({
        companyId,
        workflowId: workflow.id,
        id: workflow.id,
        status: "archived",
      });
      if (editingWorkflowId === workflow.id) {
        cancelEdit();
      }
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`삭제 실패: ${message}`);
    } finally {
      setPendingWorkflowId(null);
    }
  }

  async function onToggleStatus(workflow: WorkflowOverviewData["workflows"][number]): Promise<void> {
    const normalized = workflow.status.trim().toLowerCase();
    if (normalized !== "active" && normalized !== "paused") {
      return;
    }

    const nextStatus = normalized === "active" ? "paused" : "active";
    setPendingWorkflowId(workflow.id);
    setTableError("");
    try {
      await updateWorkflow({
        companyId,
        workflowId: workflow.id,
        id: workflow.id,
        patch: { status: nextStatus },
        status: nextStatus,
      });
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`status 변경 실패: ${message}`);
    } finally {
      setPendingWorkflowId(null);
    }
  }

  if (workflows.length === 0) {
    return <p style={mutedTextStyle}>No workflows defined yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      {tableError ? <p style={mutedTextStyle}>{tableError}</p> : null}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Step Count</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workflows.map((workflow) => {
            const isEditing = editingWorkflowId === workflow.id;
            const isPending = pendingWorkflowId === workflow.id;
            const normalizedStatus = workflow.status.trim().toLowerCase();

            return (
              <tr key={workflow.id}>
                <td style={tdStyle}>
                  {isEditing ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      <input
                        style={inputStyle}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        required
                      />
                      <textarea
                        style={textareaStyle}
                        value={editingDescription}
                        onChange={(event) => setEditingDescription(event.target.value)}
                        rows={3}
                      />
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "4px" }}>
                      <strong>{workflow.name}</strong>
                      <span style={mutedTextStyle}>{workflow.description || "-"}</span>
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  {isEditing ? (
                    <select
                      style={inputStyle}
                      value={editingStatus}
                      onChange={(event) => setEditingStatus(event.target.value)}
                    >
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="archived">archived</option>
                    </select>
                  ) : (
                    <span style={statusBadgeStyle(workflow.status)}>{workflow.status}</span>
                  )}
                </td>
                <td style={tdStyle}>{workflow.steps.length}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          style={isPending ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle}
                          disabled={isPending}
                          onClick={() => {
                            void onSaveEdit(workflow.id);
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          style={isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
                          disabled={isPending}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          style={isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
                          disabled={isPending}
                          onClick={() => beginEdit(workflow)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          style={isPending ? { ...dangerButtonStyle, ...buttonDisabledStyle } : dangerButtonStyle}
                          disabled={isPending}
                          onClick={() => {
                            void onDeleteWorkflow(workflow);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          style={isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
                          disabled={isPending || (normalizedStatus !== "active" && normalizedStatus !== "paused")}
                          onClick={() => {
                            void onToggleStatus(workflow);
                          }}
                        >
                          {normalizedStatus === "active" ? "Pause" : "Activate"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {workflows.length === 0 ? (
            <tr>
              <td colSpan={4} style={tdStyle}>
                <p style={mutedTextStyle}>No workflows defined yet.</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
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
  const createWorkflow = usePluginAction("create-workflow");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNewWorkflowForm, setShowNewWorkflowForm] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowDescription, setNewWorkflowDescription] = useState("");
  const [newWorkflowSteps, setNewWorkflowSteps] = useState("[]");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function refreshOverview(): Promise<void> {
    if (isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await overview.refresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  function resetCreateForm(): void {
    setNewWorkflowName("");
    setNewWorkflowDescription("");
    setNewWorkflowSteps("[]");
    setCreateError("");
    setShowNewWorkflowForm(false);
  }

  async function onCreateWorkflow(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = newWorkflowName.trim();
    if (!name) {
      setCreateError("name은 필수입니다.");
      return;
    }

    let parsedSteps: unknown = [];
    try {
      parsedSteps = newWorkflowSteps.trim() ? JSON.parse(newWorkflowSteps) : [];
    } catch (error) {
      setCreateError(`steps JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (!Array.isArray(parsedSteps)) {
      setCreateError("steps는 JSON 배열이어야 합니다.");
      return;
    }

    setCreateError("");
    setIsCreating(true);
    try {
      const description = newWorkflowDescription.trim();
      const workflow = {
        name,
        description,
        status: "active",
        steps: parsedSteps,
      };
      await createWorkflow({
        companyId,
        workflow,
        ...workflow,
      });
      resetCreateForm();
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreateError(`생성 실패: ${message}`);
    } finally {
      setIsCreating(false);
    }
  }

  const refreshButtonLabel = isRefreshing ? "갱신 중..." : "↻ Refresh";

  if (overview.loading) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
        <div style={headerRowStyle}>
          <h1 style={titleStyle}>Workflows</h1>
          <button
            type="button"
            onClick={() => {
              void refreshOverview();
            }}
            disabled={isRefreshing}
            style={isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
          >
            {refreshButtonLabel}
          </button>
        </div>
        <p style={mutedTextStyle}>Loading workflows...</p>
      </div>
    );
  }

  if (overview.error) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
        <div style={headerRowStyle}>
          <h1 style={titleStyle}>Workflows</h1>
          <button
            type="button"
            onClick={() => {
              void refreshOverview();
            }}
            disabled={isRefreshing}
            style={isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
          >
            {refreshButtonLabel}
          </button>
        </div>
        <ErrorState
          message={`Failed to load workflows: ${overview.error.message}`}
          onRetry={refreshOverview}
          retrying={isRefreshing}
        />
      </div>
    );
  }

  const data = overview.data ?? { workflows: [], activeRuns: [] };

  return (
    <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
      <div style={headerRowStyle}>
        <h1 style={titleStyle}>Workflows</h1>
        <button
          type="button"
          onClick={() => {
            void refreshOverview();
          }}
          disabled={isRefreshing}
          style={isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
        >
          {refreshButtonLabel}
        </button>
      </div>

      <section style={sectionStyle}>
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ ...headerRowStyle, justifyContent: "space-between" }}>
            <h2 style={sectionTitleStyle}>Workflow Definitions</h2>
            <button
              type="button"
              style={showNewWorkflowForm ? { ...buttonStyle, ...buttonDisabledStyle } : primaryButtonStyle}
              disabled={showNewWorkflowForm}
              onClick={() => {
                setCreateError("");
                setShowNewWorkflowForm(true);
              }}
            >
              + New Workflow
            </button>
          </div>
          <p style={mutedTextStyle}>Definitions available for this company.</p>
        </div>
        {showNewWorkflowForm ? (
          <form style={formPanelStyle} onSubmit={(event) => void onCreateWorkflow(event)}>
            <div style={{ display: "grid", gap: "6px" }}>
              <label style={mutedTextStyle}>name</label>
              <input
                style={inputStyle}
                value={newWorkflowName}
                onChange={(event) => setNewWorkflowName(event.target.value)}
                required
              />
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <label style={mutedTextStyle}>description</label>
              <textarea
                style={textareaStyle}
                value={newWorkflowDescription}
                onChange={(event) => setNewWorkflowDescription(event.target.value)}
                rows={3}
              />
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <label style={mutedTextStyle}>steps (JSON)</label>
              <textarea
                style={{ ...textareaStyle, minHeight: "120px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                value={newWorkflowSteps}
                onChange={(event) => setNewWorkflowSteps(event.target.value)}
                rows={6}
              />
            </div>
            {createError ? <p style={mutedTextStyle}>{createError}</p> : null}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="submit"
                style={isCreating ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle}
                disabled={isCreating}
              >
                Save
              </button>
              <button
                type="button"
                style={isCreating ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
                disabled={isCreating}
                onClick={resetCreateForm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        <DefinitionsTable workflows={data.workflows} companyId={companyId} refreshOverview={refreshOverview} />
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ ...headerRowStyle, justifyContent: "space-between" }}>
            <h2 style={sectionTitleStyle}>Active Runs</h2>
            <button
              type="button"
              onClick={() => {
                void refreshOverview();
              }}
              disabled={isRefreshing}
              style={isRefreshing ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
            >
              {refreshButtonLabel}
            </button>
          </div>
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
