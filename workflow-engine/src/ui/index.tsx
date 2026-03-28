import {
  useHostContext,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type JSX } from "react";
import { PLUGIN_ID } from "../constants.js";

// Fix: prevent parent window from capturing arrow keys in textareas
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (target?.tagName === "TEXTAREA" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.stopPropagation();
    }
  }, true);
}


type StepDraft = {
  id: string;
  title: string;
  description: string;
  type: "agent" | "tool";
  toolName: string;
  toolArgs: string;
  agentName: string;
  tools: string;
  dependsOn: string;
  onFailure: string;
};

type ProjectOption = { id: string; name: string };
type LabelOption = { id: string; name: string; color: string };

type WorkflowOverviewData = {
  projects?: ProjectOption[];
  labels?: LabelOption[];
  workflows: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    triggerLabels?: string[];
    labelIds?: string[];
    schedule?: string;
    maxDailyRuns?: number;
    timezone?: string;
    deadlineTime?: string;
    projectId?: string;
    steps: Array<{ id: string; title: string; type?: string; toolName?: string; agentName?: string; dependsOn: string[] }>;
  }>;
  activeRuns: Array<{
    id: string;
    workflowName: string;
    status: string;
    startedAt: string;
    parentIssueId?: string;
    parentIssueIdentifier?: string;
    runLabel?: string;
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
  minHeight: "150px",
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

type StatusFilter = "active" | "archived";

const filterTabStyle = (isActive: boolean): CSSProperties => ({
  padding: "6px 14px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "6px",
  background: isActive
    ? "color-mix(in srgb, var(--foreground, #f8fafc) 14%, var(--card, #0f172a))"
    : "var(--card, #0f172a)",
  color: "var(--foreground, #f8fafc)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: isActive ? 700 : 500,
  opacity: isActive ? 1 : 0.7,
});

const LABEL_COLOR_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#6366f1", "#ec4899"];

function normalizeLabel(input: Record<string, unknown>): LabelOption {
  return {
    id: String(input.id ?? ""),
    name: String(input.name ?? input.id ?? ""),
    color: typeof input.color === "string" && input.color.trim() ? input.color : "#6366f1",
  };
}

function apiBaseUrl(): string {
  if (typeof window !== "undefined" && typeof window.location?.origin === "string" && window.location.origin.startsWith("http")) {
    return window.location.origin;
  }
  return "http://localhost:3100";
}

function companyLabelsUrl(companyId: string): string {
  return `${apiBaseUrl()}/api/companies/${encodeURIComponent(companyId)}/labels`;
}

async function fetchCompanyLabels(companyId: string): Promise<LabelOption[]> {
  if (!companyId.trim()) {
    return [];
  }

  try {
    const res = await fetch(companyLabelsUrl(companyId));
    if (!res.ok) {
      return [];
    }
    const raw = await res.json() as Array<Record<string, unknown>>;
    return raw.map(normalizeLabel).filter((label) => label.id);
  } catch {
    return [];
  }
}

async function createCompanyLabel(companyId: string, name: string, color: string): Promise<LabelOption> {
  const res = await fetch(companyLabelsUrl(companyId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `레이블 생성 실패 (${res.status})`);
  }
  const payload = await res.json() as Record<string, unknown>;
  return normalizeLabel(payload);
}

function toggleLabelId(selectedIds: string[], labelId: string): string[] {
  return selectedIds.includes(labelId)
    ? selectedIds.filter((id) => id !== labelId)
    : [...selectedIds, labelId];
}

function labelChipStyle(color: string, selected: boolean): CSSProperties {
  return {
    ...inputStyle,
    width: "auto",
    padding: "6px 10px",
    border: `1px solid ${color}`,
    background: selected ? color : "transparent",
    color: selected ? "#ffffff" : color,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

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

function normalizeMaxDailyRunsInput(value: string): { value: number | undefined; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: undefined };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { value: undefined, error: "maxDailyRuns는 0 이상의 정수여야 합니다." };
  }

  return { value: parsed };
}

const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: "28px",
};

const stepCardStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--background, #020617)",
};

const stepRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
};

function emptyStep(): StepDraft {
  return { id: "", title: "", description: "", type: "agent", toolName: "", toolArgs: "{}", agentName: "", tools: "", dependsOn: "", onFailure: "" };
}

const collapsedStepHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 12px",
  border: "1px solid var(--border, #334155)",
  borderRadius: "8px",
  background: "var(--background, #020617)",
  cursor: "pointer",
  fontSize: "13px",
  userSelect: "none",
};

const selectedStepOutlineStyle: CSSProperties = {
  outline: "2px solid color-mix(in srgb, var(--foreground, #f8fafc) 40%, transparent)",
  outlineOffset: "-2px",
};

function StepEditor({
  steps,
  onChange,
}: {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
}): JSX.Element {
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(() => new Set(steps.map((_, i) => i)));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  function toggleCollapse(index: number) {
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function update(index: number, patch: Partial<StepDraft>) {
    const next = steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(next);
  }

  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index));
    setCollapsedSet((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
    if (selectedIndex === index) setSelectedIndex(null);
    else if (selectedIndex !== null && selectedIndex > index) setSelectedIndex(selectedIndex - 1);
  }

  function add() {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < steps.length) {
      const afterStep = steps[selectedIndex];
      const newStep = { ...emptyStep(), dependsOn: afterStep.id.trim() };
      const insertAt = selectedIndex + 1;
      const next = [...steps.slice(0, insertAt), newStep, ...steps.slice(insertAt)];
      onChange(next);
      setCollapsedSet((prev) => {
        const shifted = new Set<number>();
        for (const idx of prev) {
          if (idx < insertAt) shifted.add(idx);
          else shifted.add(idx + 1);
        }
        return shifted;
      });
      setSelectedIndex(insertAt);
    } else {
      onChange([...steps, emptyStep()]);
      setSelectedIndex(steps.length);
    }
  }

  const allIds = steps.map((s) => s.id).filter(Boolean);

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ ...mutedTextStyle, fontWeight: 600 }}>Steps ({steps.length})</span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {selectedIndex !== null && (
            <span style={{ fontSize: "11px", color: "var(--muted-foreground, #94a3b8)" }}>
              insert after step {selectedIndex + 1}
            </span>
          )}
          <button type="button" style={buttonStyle} onClick={add}>+ Add Step</button>
        </div>
      </div>
      {steps.map((step, i) => {
        const isCollapsed = collapsedSet.has(i);
        const isSelected = selectedIndex === i;

        if (isCollapsed) {
          return (
            <div
              key={i}
              style={{
                ...collapsedStepHeaderStyle,
                ...(isSelected ? selectedStepOutlineStyle : {}),
              }}
              onClick={() => {
                setSelectedIndex(isSelected ? null : i);
              }}
              onDoubleClick={() => toggleCollapse(i)}
            >
              <span style={{ fontSize: "11px", color: "var(--muted-foreground, #94a3b8)", minWidth: "18px" }}>{i + 1}</span>
              <span style={{ fontSize: "13px" }}>{step.type === "tool" ? "\uD83D\uDD27" : "\uD83E\uDD16"}</span>
              <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--foreground, #f8fafc)" }}>
                {step.id || "(no id)"}
              </span>
              {step.title && (
                <span style={{ color: "var(--muted-foreground, #94a3b8)", fontSize: "12px" }}>
                  — {step.title}
                </span>
              )}
              <span style={{ marginLeft: "auto", display: "flex", gap: "4px", alignItems: "center" }}>
                <button
                  type="button"
                  style={{ ...buttonStyle, padding: "2px 8px", fontSize: "11px" }}
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(i); }}
                >Expand</button>
                <button
                  type="button"
                  style={{ ...dangerButtonStyle, padding: "2px 8px", fontSize: "11px" }}
                  onClick={(e) => { e.stopPropagation(); remove(i); }}
                >Remove</button>
              </span>
            </div>
          );
        }

        return (
          <div
            key={i}
            style={{
              ...stepCardStyle,
              ...(isSelected ? selectedStepOutlineStyle : {}),
            }}
            onClick={() => setSelectedIndex(isSelected ? null : i)}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted-foreground, #94a3b8)" }}>
                Step {i + 1} — {step.type === "tool" ? "\uD83D\uDD27 Tool" : "\uD83E\uDD16 Agent"}
              </span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button type="button" style={{ ...buttonStyle, padding: "4px 8px", fontSize: "11px" }} onClick={(e) => { e.stopPropagation(); toggleCollapse(i); }}>Collapse</button>
                <button type="button" style={{ ...dangerButtonStyle, padding: "4px 8px", fontSize: "11px" }} onClick={(e) => { e.stopPropagation(); remove(i); }}>Remove</button>
              </div>
            </div>
            <div style={stepRowStyle} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>ID</label>
                <input style={inputStyle} value={step.id} placeholder="gather" onChange={(e) => update(i, { id: e.target.value })} />
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Title</label>
                <input style={inputStyle} value={step.title} placeholder="데이터 수집" onChange={(e) => update(i, { title: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "grid", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
              <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Description (에이전트에게 전달할 작업 지시)</label>
              <textarea style={{ ...textareaStyle, minHeight: "120px" }} value={step.description} placeholder="수집된 데이터를 분석하여 보고서를 작성하세요." onChange={(e) => update(i, { description: e.target.value })} rows={2} />
            </div>
            <div style={stepRowStyle} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Type</label>
                <select style={selectStyle} value={step.type} onChange={(e) => update(i, { type: e.target.value as "agent" | "tool" })}>
                  <option value="tool">{"\uD83D\uDD27"} Tool (시스템 실행)</option>
                  <option value="agent">{"\uD83E\uDD16"} Agent (에이전트 작업)</option>
                </select>
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                {step.type === "tool" ? (
                  <>
                    <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Tool Name</label>
                    <input style={inputStyle} value={step.toolName} placeholder="daily-tech-scout" onChange={(e) => update(i, { toolName: e.target.value })} />
                  </>
                ) : (
                  <>
                    <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Agent Name</label>
                    <input style={inputStyle} value={step.agentName} placeholder="헐크" onChange={(e) => update(i, { agentName: e.target.value })} />
                  </>
                )}
              </div>
            </div>
            {step.type === "agent" && (
              <div style={{ display: "grid", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Tools (에이전트가 사용할 도구, comma-separated)</label>
                <input style={inputStyle} value={step.tools} placeholder="write-obsidian-report" onChange={(e) => update(i, { tools: e.target.value })} />
              </div>
            )}
            <div style={stepRowStyle} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Depends On (comma-separated IDs)</label>
                <input style={inputStyle} value={step.dependsOn} placeholder={allIds.filter((id) => id !== step.id).join(", ") || "none"} onChange={(e) => update(i, { dependsOn: e.target.value })} />
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>On Failure</label>
                <select style={selectStyle} value={step.onFailure} onChange={(e) => update(i, { onFailure: e.target.value })}>
                  <option value="">default</option>
                  <option value="retry">retry</option>
                  <option value="skip">skip</option>
                  <option value="abort_workflow">abort workflow</option>
                </select>
              </div>
            </div>
          </div>
        );
      })}
      {steps.length === 0 && <p style={mutedTextStyle}>No steps yet. Click "+ Add Step" to begin.</p>}
    </div>
  );
}

function stepsToJson(drafts: StepDraft[]): unknown[] {
  return drafts.map((d) => {
    const step: Record<string, unknown> = {
      id: d.id.trim(),
      title: d.title.trim(),
      description: d.description.trim() || undefined,
      type: d.type,
      dependsOn: d.dependsOn.split(",").map((s) => s.trim()).filter(Boolean),
    };
    if (d.type === "tool") {
      step.toolName = d.toolName.trim();
      try { step.toolArgs = JSON.parse(d.toolArgs || "{}"); } catch { step.toolArgs = {}; }
    } else {
      if (d.agentName.trim()) step.agentName = d.agentName.trim();
      const toolsList = d.tools.split(",").map((t) => t.trim()).filter(Boolean);
      if (toolsList.length > 0) step.tools = toolsList;
    }
    if (d.onFailure) step.onFailure = d.onFailure;
    return step;
  });
}

function jsonToSteps(steps: WorkflowOverviewData["workflows"][number]["steps"]): StepDraft[] {
  return steps.map((s) => {
    const raw = s as Record<string, unknown>;
    return {
      id: s.id,
      title: s.title,
      description: raw.description as string || "",
      type: (s.type as "agent" | "tool") || "agent",
      toolName: s.toolName || "",
      toolArgs: "{}",
      agentName: s.agentName || "",
      tools: Array.isArray(raw.tools) ? (raw.tools as string[]).join(", ") : "",
      dependsOn: s.dependsOn.join(", "),
      onFailure: "",
    };
  });
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
  projects,
  labels,
  refreshLabels,
}: {
  workflows: WorkflowOverviewData["workflows"];
  companyId: string;
  refreshOverview: () => Promise<void>;
  projects: ProjectOption[];
  labels: LabelOption[];
  refreshLabels: () => Promise<LabelOption[]>;
}): JSX.Element {
  const updateWorkflow = usePluginAction("update-workflow");
  const deleteWorkflow = usePluginAction("delete-workflow");
  const runWorkflow = usePluginAction("start-workflow");
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [editingDescription, setEditingDescription] = useState<string>("");
  const [editingStatus, setEditingStatus] = useState<string>("active");
  const [editingTriggerLabels, setEditingTriggerLabels] = useState<string>("");
  const [editingLabelIds, setEditingLabelIds] = useState<string[]>([]);
  const [showNewLabelForm, setShowNewLabelForm] = useState<boolean>(false);
  const [newLabelName, setNewLabelName] = useState<string>("");
  const [newLabelColor, setNewLabelColor] = useState<string>("#6366f1");
  const [creatingLabel, setCreatingLabel] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<string>("");
  const [editingMaxDailyRuns, setEditingMaxDailyRuns] = useState<string>("");
  const [editingTimezone, setEditingTimezone] = useState<string>("Asia/Seoul");
  const [editingProjectId, setEditingProjectId] = useState<string>("");
  const [editingSteps, setEditingSteps] = useState<StepDraft[]>([]);
  const [editJsonMode, setEditJsonMode] = useState(false);
  const [editJsonText, setEditJsonText] = useState("");
  const [pendingWorkflowId, setPendingWorkflowId] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string>("");

  function beginEdit(workflow: WorkflowOverviewData["workflows"][number]): void {
    setTableError("");
    setEditingWorkflowId(workflow.id);
    setEditingName(workflow.name);
    setEditingDescription(workflow.description);
    setEditingStatus(workflow.status);
    setEditingTriggerLabels((workflow.triggerLabels ?? []).join(", "));
    setEditingLabelIds(workflow.labelIds ?? []);
    setShowNewLabelForm(false);
    setNewLabelName("");
    setNewLabelColor("#6366f1");
    const rawWorkflow = workflow as Record<string, unknown>;
    const rawSchedule = rawWorkflow.schedule;
    const rawProjectId = rawWorkflow.projectId;
    const rawTimezone = rawWorkflow.timezone;
    const rawMaxDailyRuns = rawWorkflow.maxDailyRuns;
    setEditingSchedule(typeof rawSchedule === "string" ? rawSchedule : "");
    setEditingProjectId(typeof rawProjectId === "string" ? rawProjectId : "");
    setEditingTimezone(typeof rawTimezone === "string" && rawTimezone.trim() ? rawTimezone : "Asia/Seoul");
    setEditingMaxDailyRuns(
      typeof rawMaxDailyRuns === "number" && Number.isFinite(rawMaxDailyRuns)
        ? String(Math.trunc(rawMaxDailyRuns))
        : "",
    );
    setEditingSteps(jsonToSteps(workflow.steps));
    setEditJsonMode(false);
    setEditJsonText(JSON.stringify(workflow.steps, null, 2));
  }

  function cancelEdit(): void {
    setEditingWorkflowId(null);
    setEditingName("");
    setEditingDescription("");
    setEditingStatus("active");
    setEditingTriggerLabels("");
    setEditingLabelIds([]);
    setShowNewLabelForm(false);
    setNewLabelName("");
    setNewLabelColor("#6366f1");
    setEditingSchedule("");
    setEditingMaxDailyRuns("");
    setEditingTimezone("Asia/Seoul");
    setEditingProjectId("");
    setEditingSteps([]);
    setEditJsonMode(false);
    setEditJsonText("");
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
      const parsedMaxDailyRuns = normalizeMaxDailyRunsInput(editingMaxDailyRuns);
      if (parsedMaxDailyRuns.error) {
        setTableError(parsedMaxDailyRuns.error);
        return;
      }
      const triggerLabels = editingTriggerLabels.split(",").map((l) => l.trim()).filter(Boolean);
      const labelIds = editingLabelIds.map((l) => l.trim()).filter(Boolean);
      let steps: unknown[];
      if (editJsonMode) {
        try {
          steps = JSON.parse(editJsonText);
          if (!Array.isArray(steps)) { setTableError("steps는 JSON 배열이어야 합니다."); return; }
        } catch (e) { setTableError(`JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`); return; }
      } else {
        steps = stepsToJson(editingSteps);
      }
      const patch = {
        name: nextName,
        description: editingDescription.trim(),
        status: editingStatus.trim() || "active",
        triggerLabels,
        labelIds,
        steps,
        schedule: editingSchedule.trim(),
        maxDailyRuns: parsedMaxDailyRuns.value,
        timezone: editingTimezone.trim(),
        projectId: editingProjectId.trim(),
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

  async function onCreateLabelForEditForm(): Promise<void> {
    const name = newLabelName.trim();
    if (!name) {
      setTableError("새 레이블 이름을 입력하세요.");
      return;
    }
    if (!companyId.trim()) {
      setTableError("companyId가 없어 레이블을 생성할 수 없습니다.");
      return;
    }

    setTableError("");
    setCreatingLabel(true);
    try {
      const created = await createCompanyLabel(companyId, name, newLabelColor);
      const nextLabels = await refreshLabels();
      const createdId = nextLabels.find((label) => label.id === created.id)?.id ?? created.id;
      setEditingLabelIds((prev) => (prev.includes(createdId) ? prev : [...prev, createdId]));
      setNewLabelName("");
      setNewLabelColor("#6366f1");
      setShowNewLabelForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`레이블 생성 실패: ${message}`);
    } finally {
      setCreatingLabel(false);
    }
  }

  async function onDeleteWorkflow(workflow: WorkflowOverviewData["workflows"][number]): Promise<void> {
    const accepted = typeof window !== "undefined"
      ? window.confirm(`"${workflow.name}" 워크플로를 보관할까요?`)
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

  async function onRestoreWorkflow(workflow: WorkflowOverviewData["workflows"][number]): Promise<void> {
    setPendingWorkflowId(workflow.id);
    setTableError("");
    try {
      await updateWorkflow({
        companyId,
        workflowId: workflow.id,
        id: workflow.id,
        patch: { status: "active" },
        status: "active",
      });
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTableError(`복원 실패: ${message}`);
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
                <td style={tdStyle} colSpan={isEditing ? 4 : 1}>
                  {isEditing ? (
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div style={stepRowStyle}>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Name</label>
                          <input
                            style={inputStyle}
                            value={editingName}
                            onChange={(event) => setEditingName(event.target.value)}
                            required
                          />
                        </div>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Status</label>
                          <select
                            style={selectStyle}
                            value={editingStatus}
                            onChange={(event) => setEditingStatus(event.target.value)}
                          >
                            <option value="active">active</option>
                            <option value="paused">paused</option>
                            <option value="archived">archived</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: "4px" }}>
                        <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Description</label>
                        <textarea
                          style={textareaStyle}
                          value={editingDescription}
                          onChange={(event) => setEditingDescription(event.target.value)}
                          rows={2}
                        />
                      </div>
                      <div style={stepRowStyle}>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Schedule (cron)</label>
                          <input style={inputStyle} value={editingSchedule} onChange={(e) => setEditingSchedule(e.target.value)} placeholder="0 9 * * * (매일 9시)" />
                        </div>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Project</label>
                          <select style={selectStyle} value={editingProjectId} onChange={(e) => setEditingProjectId(e.target.value)}>
                            <option value="">— none —</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={stepRowStyle}>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Timezone</label>
                          <input style={inputStyle} value={editingTimezone} onChange={(e) => setEditingTimezone(e.target.value)} placeholder="Asia/Seoul" />
                        </div>
                        <div style={{ display: "grid", gap: "4px" }}>
                          <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Max Daily Runs (optional)</label>
                          <input style={inputStyle} type="number" min={0} step={1} value={editingMaxDailyRuns} onChange={(e) => setEditingMaxDailyRuns(e.target.value)} placeholder="blank=1/day, 0=unlimited" />
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: "4px" }}>
                        <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Trigger Labels (comma-separated)</label>
                        <input
                          style={inputStyle}
                          value={editingTriggerLabels}
                          onChange={(event) => setEditingTriggerLabels(event.target.value)}
                          placeholder="daily-tech-research"
                        />
                      </div>
                      <div style={{ display: "grid", gap: "4px" }}>
                        <label style={{ ...mutedTextStyle, fontSize: "11px" }}>레이블 선택</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {(labels ?? []).map((label) => {
                            const selected = editingLabelIds.includes(label.id);
                            return (
                              <button
                                key={label.id}
                                type="button"
                                style={labelChipStyle(label.color, selected)}
                                onClick={() => setEditingLabelIds((prev) => toggleLabelId(prev, label.id))}
                              >
                                <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: selected ? "rgba(255,255,255,0.95)" : label.color }} />
                                {label.name}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            style={buttonStyle}
                            onClick={() => {
                              setTableError("");
                              setShowNewLabelForm((prev) => !prev);
                            }}
                          >
                            + 새 레이블
                          </button>
                        </div>
                        {(labels ?? []).length === 0 ? (
                          <p style={{ ...mutedTextStyle, fontSize: "11px" }}>사용 가능한 레이블이 없습니다.</p>
                        ) : null}
                        {showNewLabelForm ? (
                          <div style={{ display: "grid", gap: "6px", marginTop: "6px", padding: "8px", border: "1px solid var(--border, #334155)", borderRadius: "8px" }}>
                            <input
                              style={inputStyle}
                              value={newLabelName}
                              onChange={(event) => setNewLabelName(event.target.value)}
                              placeholder="새 레이블 이름"
                            />
                            <select style={selectStyle} value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)}>
                              {LABEL_COLOR_PRESETS.map((color) => (
                                <option key={color} value={color}>{color}</option>
                              ))}
                            </select>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                type="button"
                                style={creatingLabel ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle}
                                disabled={creatingLabel}
                                onClick={() => {
                                  void onCreateLabelForEditForm();
                                }}
                              >
                                만들기
                              </button>
                              <button
                                type="button"
                                style={buttonStyle}
                                onClick={() => {
                                  setShowNewLabelForm(false);
                                  setNewLabelName("");
                                  setNewLabelColor("#6366f1");
                                }}
                              >
                                닫기
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ ...mutedTextStyle, fontWeight: 600 }}>Steps</span>
                        <button type="button" style={{ ...buttonStyle, padding: "4px 10px", fontSize: "11px" }} onClick={() => {
                          if (!editJsonMode) {
                            setEditJsonText(JSON.stringify(stepsToJson(editingSteps), null, 2));
                          } else {
                            try { setEditingSteps(jsonToSteps(JSON.parse(editJsonText))); } catch { /* keep visual */ }
                          }
                          setEditJsonMode(!editJsonMode);
                        }}>{editJsonMode ? "Visual" : "JSON"}</button>
                      </div>
                      {editJsonMode ? (
                        <textarea
                          style={{ ...textareaStyle, minHeight: "250px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px" }}
                          value={editJsonText}
                          onChange={(e) => setEditJsonText(e.target.value)}
                          rows={10}
                        />
                      ) : (
                        <StepEditor steps={editingSteps} onChange={setEditingSteps} />
                      )}
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          style={isPending ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle}
                          disabled={isPending}
                          onClick={() => { void onSaveEdit(workflow.id); }}
                        >Save</button>
                        <button
                          type="button"
                          style={isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle}
                          disabled={isPending}
                          onClick={cancelEdit}
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "4px" }}>
                      <strong>{workflow.name}</strong>
                      <span style={mutedTextStyle}>{workflow.description || "-"}</span>
                      {(workflow.triggerLabels ?? []).length > 0 && (
                        <span style={{ ...mutedTextStyle, fontSize: "11px" }}>Labels: {workflow.triggerLabels!.join(", ")}</span>
                      )}
                    </div>
                  )}
                </td>
                {!isEditing && (
                  <td style={tdStyle}>
                    <span style={statusBadgeStyle(workflow.status)}>{workflow.status}</span>
                  </td>
                )}
                {!isEditing && (
                  <td style={tdStyle}>{workflow.steps.length}</td>
                )}
                {!isEditing && (
                <td style={tdStyle}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {normalizedStatus === "archived" ? (
                      <button type="button" style={isPending ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle} disabled={isPending} onClick={() => { void onRestoreWorkflow(workflow); }}>복원</button>
                    ) : (
                      <>
                        <button type="button" style={isPending ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle} disabled={isPending || normalizedStatus !== "active"} onClick={() => {
                          setPendingWorkflowId(workflow.id);
                          setTableError("");
                          void (async () => {
                            try {
                              await runWorkflow({ companyId, workflowId: workflow.id, createParentIssue: true });
                              await refreshOverview();
                            } catch (e) { setTableError(`Run 실패: ${e instanceof Error ? e.message : String(e)}`); }
                            finally { setPendingWorkflowId(null); }
                          })();
                        }}>▶ Run</button>
                        <button type="button" style={isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle} disabled={isPending} onClick={() => beginEdit(workflow)}>Edit</button>
                        <button type="button" style={isPending ? { ...dangerButtonStyle, ...buttonDisabledStyle } : dangerButtonStyle} disabled={isPending} onClick={() => { void onDeleteWorkflow(workflow); }}>보관</button>
                        <button type="button" style={isPending ? { ...buttonStyle, ...buttonDisabledStyle } : buttonStyle} disabled={isPending || (normalizedStatus !== "active" && normalizedStatus !== "paused")} onClick={() => { void onToggleStatus(workflow); }}>{normalizedStatus === "active" ? "Pause" : "Activate"}</button>
                      </>
                    )}
                  </div>
                </td>
                )}
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

function ActiveRunsTable({ activeRuns, onAbort }: { activeRuns: WorkflowOverviewData["activeRuns"]; onAbort: (runId: string) => void }): JSX.Element {
  if (activeRuns.length === 0) {
    return <p style={mutedTextStyle}>No active runs.</p>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Workflow</th>
          <th style={thStyle}>Run</th>
          <th style={thStyle}>Issue</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Started</th>
          <th style={thStyle}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {activeRuns.map((run) => (
          <tr key={run.id}>
            <td style={tdStyle}>{run.workflowName}</td>
            <td style={tdStyle}>
              {run.runLabel && <span style={{ fontSize: "12px", fontWeight: 600 }}>{run.runLabel}</span>}
            </td>
            <td style={tdStyle}>
              {run.parentIssueId && (
                <a
                  href={`/issues/${run.parentIssueId}`}
                  style={{ color: "var(--link, #60a5fa)", fontSize: "12px", textDecoration: "none" }}
                  title={run.parentIssueId}
                >
                  {run.parentIssueIdentifier || run.parentIssueId.slice(0, 8)}
                </a>
              )}
            </td>
            <td style={tdStyle}>
              <span style={statusBadgeStyle(run.status)}>{run.status}</span>
            </td>
            <td style={tdStyle}>{formatDateTime(run.startedAt)}</td>
            <td style={tdStyle}>
              <button type="button" style={dangerButtonStyle} onClick={() => onAbort(run.id)}>Abort</button>
            </td>
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
  const abortRun = usePluginAction("abort-run");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState<StatusFilter>("active");
  const [showNewWorkflowForm, setShowNewWorkflowForm] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowDescription, setNewWorkflowDescription] = useState("");
  const [newWorkflowSteps, setNewWorkflowSteps] = useState<StepDraft[]>([]);
  const [newJsonMode, setNewJsonMode] = useState(false);
  const [newJsonText, setNewJsonText] = useState("[]");
  const [newTriggerLabels, setNewTriggerLabels] = useState("");
  const [newLabelIds, setNewLabelIds] = useState<string[]>([]);
  const [showNewLabelForm, setShowNewLabelForm] = useState<boolean>(false);
  const [newLabelName, setNewLabelName] = useState<string>("");
  const [newLabelColor, setNewLabelColor] = useState<string>("#6366f1");
  const [creatingLabel, setCreatingLabel] = useState<boolean>(false);
  const [newSchedule, setNewSchedule] = useState("");
  const [newMaxDailyRuns, setNewMaxDailyRuns] = useState("");
  const [newTimezone, setNewTimezone] = useState("Asia/Seoul");
  const [newProjectId, setNewProjectId] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [labels, setLabels] = useState<LabelOption[]>([]);

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

  useEffect(() => {
    const nextLabels = overview.data?.labels ?? [];
    setLabels(nextLabels.map((label) => ({
      id: String(label.id),
      name: String(label.name ?? label.id),
      color: typeof label.color === "string" && label.color.trim() ? label.color : "#6366f1",
    })));
  }, [overview.data?.labels]);

  useEffect(() => {
    if (!companyId.trim()) {
      setLabels([]);
    }
  }, [companyId]);

  async function refreshLabels(): Promise<LabelOption[]> {
    const next = await fetchCompanyLabels(companyId);
    setLabels(next);
    return next;
  }

  function resetCreateForm(): void {
    setNewWorkflowName("");
    setNewWorkflowDescription("");
    setNewWorkflowSteps([]);
    setNewJsonMode(false);
    setNewJsonText("[]");
    setNewTriggerLabels("");
    setNewLabelIds([]);
    setShowNewLabelForm(false);
    setNewLabelName("");
    setNewLabelColor("#6366f1");
    setNewSchedule("");
    setNewMaxDailyRuns("");
    setNewTimezone("Asia/Seoul");
    setNewProjectId("");
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

    let parsedSteps: unknown[];
    if (newJsonMode) {
      try {
        parsedSteps = JSON.parse(newJsonText);
        if (!Array.isArray(parsedSteps)) { setCreateError("steps는 JSON 배열이어야 합니다."); return; }
      } catch (e) { setCreateError(`JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`); return; }
    } else {
      parsedSteps = stepsToJson(newWorkflowSteps);
    }
    const invalidStep = parsedSteps.find((s) => !(s as Record<string, unknown>).id);
    if (invalidStep) {
      setCreateError("모든 step에 ID가 필요합니다.");
      return;
    }

    setCreateError("");
    setIsCreating(true);
    try {
      const parsedMaxDailyRuns = normalizeMaxDailyRunsInput(newMaxDailyRuns);
      if (parsedMaxDailyRuns.error) {
        setCreateError(parsedMaxDailyRuns.error);
        return;
      }
      const description = newWorkflowDescription.trim();
      const triggerLabels = newTriggerLabels.split(",").map((l) => l.trim()).filter(Boolean);
      const labelIds = newLabelIds.map((l) => l.trim()).filter(Boolean);
      const workflow = {
        name,
        description,
        status: "active",
        steps: parsedSteps,
        maxDailyRuns: parsedMaxDailyRuns.value,
        timezone: newTimezone.trim() || undefined,
        ...(triggerLabels.length > 0 ? { triggerLabels } : {}),
        ...(labelIds.length > 0 ? { labelIds } : {}),
        ...(newSchedule.trim() ? { schedule: newSchedule.trim() } : {}),
        ...(newProjectId.trim() ? { projectId: newProjectId.trim() } : {}),
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

  async function onCreateLabelForCreateForm(): Promise<void> {
    const name = newLabelName.trim();
    if (!name) {
      setCreateError("새 레이블 이름을 입력하세요.");
      return;
    }
    if (!companyId.trim()) {
      setCreateError("companyId가 없어 레이블을 생성할 수 없습니다.");
      return;
    }

    setCreateError("");
    setCreatingLabel(true);
    try {
      const created = await createCompanyLabel(companyId, name, newLabelColor);
      const nextLabels = await refreshLabels();
      const createdId = nextLabels.find((label) => label.id === created.id)?.id ?? created.id;
      setNewLabelIds((prev) => (prev.includes(createdId) ? prev : [...prev, createdId]));
      setNewLabelName("");
      setNewLabelColor("#6366f1");
      setShowNewLabelForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreateError(`레이블 생성 실패: ${message}`);
    } finally {
      setCreatingLabel(false);
    }
  }

  const refreshButtonLabel = isRefreshing ? "갱신 중..." : "↻ Refresh";

  const allWorkflows = overview.data?.workflows ?? [];
  const activeWorkflows = useMemo(
    () => allWorkflows.filter((w) => w.status.trim().toLowerCase() !== "archived"),
    [allWorkflows],
  );
  const archivedWorkflows = useMemo(
    () => allWorkflows.filter((w) => w.status.trim().toLowerCase() === "archived"),
    [allWorkflows],
  );
  const filteredWorkflows = workflowStatusFilter === "active" ? activeWorkflows : archivedWorkflows;

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

  const data = overview.data ?? { workflows: [], activeRuns: [], projects: [], labels: [] };

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
          <div style={{ display: "flex", gap: "6px" }}>
            <button type="button" style={filterTabStyle(workflowStatusFilter === "active")} onClick={() => setWorkflowStatusFilter("active")}>
              활성 ({activeWorkflows.length})
            </button>
            <button type="button" style={filterTabStyle(workflowStatusFilter === "archived")} onClick={() => setWorkflowStatusFilter("archived")}>
              보관 ({archivedWorkflows.length})
            </button>
          </div>
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
            <div style={stepRowStyle}>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Schedule (cron)</label>
                <input style={inputStyle} value={newSchedule} onChange={(e) => setNewSchedule(e.target.value)} placeholder="0 9 * * * (매일 9시)" />
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Project</label>
                <select style={selectStyle} value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
                  <option value="">— none —</option>
                  {(data.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={stepRowStyle}>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Timezone</label>
                <input style={inputStyle} value={newTimezone} onChange={(e) => setNewTimezone(e.target.value)} placeholder="Asia/Seoul" />
              </div>
              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ ...mutedTextStyle, fontSize: "11px" }}>Max Daily Runs (optional)</label>
                <input style={inputStyle} type="number" min={0} step={1} value={newMaxDailyRuns} onChange={(e) => setNewMaxDailyRuns(e.target.value)} placeholder="blank=1/day, 0=unlimited" />
              </div>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <label style={mutedTextStyle}>trigger labels (comma-separated)</label>
              <input
                style={inputStyle}
                value={newTriggerLabels}
                onChange={(event) => setNewTriggerLabels(event.target.value)}
                placeholder="daily-tech-research"
              />
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <label style={mutedTextStyle}>레이블 선택</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {labels.map((label) => {
                  const selected = newLabelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      style={labelChipStyle(label.color, selected)}
                      onClick={() => setNewLabelIds((prev) => toggleLabelId(prev, label.id))}
                    >
                      <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: selected ? "rgba(255,255,255,0.95)" : label.color }} />
                      {label.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => {
                    setCreateError("");
                    setShowNewLabelForm((prev) => !prev);
                  }}
                >
                  + 새 레이블
                </button>
              </div>
              {labels.length === 0 ? (
                <p style={{ ...mutedTextStyle, fontSize: "11px" }}>사용 가능한 레이블이 없습니다.</p>
              ) : null}
              {showNewLabelForm ? (
                <div style={{ display: "grid", gap: "6px", marginTop: "6px", padding: "8px", border: "1px solid var(--border, #334155)", borderRadius: "8px" }}>
                  <input
                    style={inputStyle}
                    value={newLabelName}
                    onChange={(event) => setNewLabelName(event.target.value)}
                    placeholder="새 레이블 이름"
                  />
                  <select style={selectStyle} value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)}>
                    {LABEL_COLOR_PRESETS.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      style={creatingLabel ? { ...primaryButtonStyle, ...buttonDisabledStyle } : primaryButtonStyle}
                      disabled={creatingLabel}
                      onClick={() => {
                        void onCreateLabelForCreateForm();
                      }}
                    >
                      만들기
                    </button>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => {
                        setShowNewLabelForm(false);
                        setNewLabelName("");
                        setNewLabelColor("#6366f1");
                      }}
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ ...mutedTextStyle, fontWeight: 600 }}>Steps</span>
              <button type="button" style={{ ...buttonStyle, padding: "4px 10px", fontSize: "11px" }} onClick={() => {
                if (!newJsonMode) {
                  setNewJsonText(JSON.stringify(stepsToJson(newWorkflowSteps), null, 2));
                } else {
                  try { setNewWorkflowSteps(jsonToSteps(JSON.parse(newJsonText))); } catch { /* keep visual */ }
                }
                setNewJsonMode(!newJsonMode);
              }}>{newJsonMode ? "Visual" : "JSON"}</button>
            </div>
            {newJsonMode ? (
              <textarea
                style={{ ...textareaStyle, minHeight: "250px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px" }}
                value={newJsonText}
                onChange={(e) => setNewJsonText(e.target.value)}
                rows={10}
              />
            ) : (
              <StepEditor steps={newWorkflowSteps} onChange={setNewWorkflowSteps} />
            )}
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
        <DefinitionsTable
          workflows={filteredWorkflows}
          companyId={companyId}
          refreshOverview={refreshOverview}
          projects={data.projects ?? []}
          labels={labels}
          refreshLabels={refreshLabels}
        />
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
        <ActiveRunsTable activeRuns={data.activeRuns} onAbort={(runId) => {
          void (async () => {
            try {
              await abortRun({ runId });
              await refreshOverview();
            } catch { /* ignore */ }
          })();
        }} />
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={sectionTitleStyle}>Help</h2>
          <button type="button" style={buttonStyle} onClick={() => setShowHelp(!showHelp)}>
            {showHelp ? "닫기" : "도움말"}
          </button>
        </div>
        {showHelp && (
          <div style={mutedTextStyle}>
            <p style={{ ...mutedTextStyle, fontWeight: 600, fontSize: "15px", marginBottom: "8px" }}>Workflow Engine 도움말</p>

            <p style={{ ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }}>기본 개념</p>
            <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
              <li><strong>Workflow</strong>: 여러 Step으로 구성된 자동화 파이프라인</li>
              <li><strong>Step</strong>: Tool(시스템 실행) 또는 Agent(에이전트 작업) 유형</li>
              <li><strong>Tool Step</strong>: Tool Registry에 등록된 도구를 시스템이 직접 실행</li>
              <li><strong>Agent Step</strong>: 지정된 에이전트가 이슈를 받아 작업 수행</li>
            </ul>

            <p style={{ ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }}>Step 설정</p>
            <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
              <li><strong>ID</strong>: 고유 식별자 (dependsOn에서 참조)</li>
              <li><strong>Type</strong>: Tool(도구 실행) / Agent(에이전트 작업)</li>
              <li><strong>Depends On</strong>: 선행 step ID (쉼표 구분, 비워두면 첫 step)</li>
              <li><strong>Tools</strong>: Agent step에서 사용할 도구 이름 (사용법이 자동 전달됨)</li>
              <li><strong>On Failure</strong>: 실패 시 정책 (retry/skip/abort)</li>
            </ul>

            <p style={{ ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }}>변수</p>
            <p style={mutedTextStyle}>Step title에 사용 가능한 변수:</p>
            <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
              <li><code>{"{$date}"}</code> — 실행 날짜 (2026-03-25)</li>
              <li><code>{"{$runNumber}"}</code> — 당일 실행 번호 (1, 2, ...)</li>
              <li><code>{"{$runLabel}"}</code> — 실행 라벨 (#2026-03-25-1)</li>
              <li><code>{"{$workflowName}"}</code> — 워크플로우 이름</li>
            </ul>

            <p style={{ ...mutedTextStyle, fontWeight: 600, marginTop: "12px" }}>Schedule (Cron)</p>
            <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
              <li>형식: 분 시 일 월 요일 (예: <code>0 9 * * *</code> = 매일 9시)</li>
              <li>Reconciler가 5분 간격으로 체크하여 실행</li>
            </ul>
          </div>
        )}
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

  const data = overview.data ?? { workflows: [], activeRuns: [], projects: [], labels: [] };
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
