import {
  useHostContext,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  type CSSProperties,
  type FormEvent,
  type JSX,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ACTION_KEYS,
  DATA_KEYS,
  KB_TYPES,
  PAGE_ROUTE,
  PLUGIN_ID,
} from "../constants.js";

type KnowledgeBaseItem = {
  id: string;
  name: string;
  type: "static" | "rag" | "ontology";
  description?: string;
  maxTokenBudget: number;
  createdAt: string;
  updatedAt: string;
};

type KnowledgeBaseDetail = KnowledgeBaseItem & {
  staticConfig?: {
    content: string;
  };
  ragConfig?: {
    mcpServerUrl?: string;
    topK?: number;
  };
  ontologyConfig?: {
    kgPath?: string;
  };
};

type KnowledgeBaseGrant = {
  id: string;
  agentName: string;
  kbName: string;
  grantedBy: string;
  grantedAt: string;
};

type OverviewData = {
  knowledgeBases: KnowledgeBaseItem[];
  grants: KnowledgeBaseGrant[];
  agents: string[];
};

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
  padding: "24px",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "#111827",
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  background: "#ffffff",
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

const mutedStyle: CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#6b7280",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "12px",
  letterSpacing: "0.03em",
  color: "#6b7280",
  textTransform: "uppercase",
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  padding: "8px 12px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: "14px",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "140px",
  resize: "vertical",
  lineHeight: 1.5,
};

function hostPath(companyPrefix: string | null | undefined, suffix: string): string {
  return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}

function pluginPagePath(companyPrefix: string | null | undefined): string {
  return hostPath(companyPrefix, `/${PAGE_ROUTE}`);
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

export function KnowledgeBasePage(props: PluginPageProps): JSX.Element {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId ?? props.context.companyId ?? "";

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<"static" | "rag" | "ontology">("static");
  const [createDescription, setCreateDescription] = useState("");
  const [createTokenBudget, setCreateTokenBudget] = useState("4096");
  const [createStaticContent, setCreateStaticContent] = useState("");

  const [detailDescription, setDetailDescription] = useState("");
  const [detailTokenBudget, setDetailTokenBudget] = useState("4096");
  const [detailStaticContent, setDetailStaticContent] = useState("");

  const [grantAgentName, setGrantAgentName] = useState("");
  const [grantKbName, setGrantKbName] = useState("");

  const overview = usePluginData<OverviewData>(DATA_KEYS.overview, {
    companyId,
    refreshNonce,
  });
  const selectedDetail = usePluginData<KnowledgeBaseDetail | null>(DATA_KEYS.kbGet, {
    companyId,
    id: selectedKbId,
    refreshNonce,
  });

  const createKnowledgeBase = usePluginAction(ACTION_KEYS.kbCreate);
  const updateKnowledgeBase = usePluginAction(ACTION_KEYS.kbUpdate);
  const deleteKnowledgeBase = usePluginAction(ACTION_KEYS.kbDelete);
  const createGrant = usePluginAction(ACTION_KEYS.grantCreate);
  const deleteGrant = usePluginAction(ACTION_KEYS.grantDelete);

  const knowledgeBases = overview.data?.knowledgeBases ?? [];
  const grants = overview.data?.grants ?? [];
  const agents = overview.data?.agents ?? [];

  useEffect(() => {
    if (!selectedKbId && knowledgeBases.length > 0) {
      setSelectedKbId(knowledgeBases[0].id);
      return;
    }

    if (selectedKbId && !knowledgeBases.some((item) => item.id === selectedKbId)) {
      setSelectedKbId(knowledgeBases[0]?.id ?? "");
    }
  }, [knowledgeBases, selectedKbId]);

  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKbId) ?? null,
    [knowledgeBases, selectedKbId],
  );

  useEffect(() => {
    const detail = selectedDetail.data;
    if (detail) {
      setDetailDescription(detail.description ?? "");
      setDetailTokenBudget(String(detail.maxTokenBudget || 4096));
      setDetailStaticContent(detail.staticConfig?.content ?? "");
      return;
    }

    if (!selectedKnowledgeBase) {
      return;
    }

    setDetailDescription(selectedKnowledgeBase.description ?? "");
    setDetailTokenBudget(String(selectedKnowledgeBase.maxTokenBudget || 4096));

    setDetailStaticContent("");
  }, [selectedDetail.data, selectedKnowledgeBase]);

  useEffect(() => {
    if (!selectedKnowledgeBase) {
      return;
    }

    if (!grantKbName) {
      setGrantKbName(selectedKnowledgeBase.name);
    }
  }, [grantKbName, selectedKnowledgeBase]);

  const selectedKbGrants = useMemo(
    () => grants.filter((grant) => grant.kbName === selectedKnowledgeBase?.name),
    [grants, selectedKnowledgeBase],
  );

  async function refreshOverview() {
    setRefreshNonce((value) => value + 1);
    await overview.refresh();
  }

  async function onCreateKnowledgeBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    try {
      const result = await createKnowledgeBase({
        companyId,
        name: createName,
        type: createType,
        description: createDescription,
        maxTokenBudget: Number(createTokenBudget),
        staticContent: createStaticContent,
      }) as { id?: string };

      setCreateName("");
      setCreateDescription("");
      setCreateTokenBudget("4096");
      setCreateStaticContent("");
      setCreateType("static");

      await refreshOverview();
      if (result?.id) {
        setSelectedKbId(result.id);
      }
      setStatusMessage("Knowledge Base를 저장했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function onSaveDetail() {
    if (!selectedKnowledgeBase) {
      return;
    }

    setStatusMessage("");
    setErrorMessage("");

    try {
      await updateKnowledgeBase({
        companyId,
        id: selectedKnowledgeBase.id,
        name: selectedKnowledgeBase.name,
        description: detailDescription,
        maxTokenBudget: Number(detailTokenBudget),
        staticContent: detailStaticContent,
      });

      await refreshOverview();
      setStatusMessage("KB 상세 정보를 업데이트했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function onDeleteSelected() {
    if (!selectedKnowledgeBase) {
      return;
    }

    setStatusMessage("");
    setErrorMessage("");

    try {
      await deleteKnowledgeBase({
        companyId,
        id: selectedKnowledgeBase.id,
      });

      await refreshOverview();
      setStatusMessage("Knowledge Base를 삭제했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function onCreateGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    try {
      await createGrant({
        companyId,
        agentName: grantAgentName,
        kbName: grantKbName,
        grantedBy: "knowledge-base-ui",
      });

      await refreshOverview();
      setStatusMessage("에이전트 권한을 추가했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function onDeleteGrant(grant: KnowledgeBaseGrant) {
    setStatusMessage("");
    setErrorMessage("");

    try {
      await deleteGrant({
        companyId,
        grantId: grant.id,
      });
      await refreshOverview();
      setStatusMessage("에이전트 권한을 해제했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (overview.loading) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
        <h1 style={titleStyle}>Knowledge Base</h1>
        <p style={mutedStyle}>Knowledge Base 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (overview.error) {
    return (
      <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
        <h1 style={titleStyle}>Knowledge Base</h1>
        <p style={mutedStyle}>데이터 로드 실패: {overview.error.message}</p>
      </div>
    );
  }

  return (
    <div data-plugin-id={PLUGIN_ID} style={pageStyle}>
      <h1 style={titleStyle}>Knowledge Base</h1>

      {statusMessage ? <p style={{ ...mutedStyle, color: "#065f46" }}>{statusMessage}</p> : null}
      {errorMessage ? <p style={{ ...mutedStyle, color: "#b91c1c" }}>{errorMessage}</p> : null}

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>KB 목록</h2>
        {knowledgeBases.length === 0 ? (
          <p style={mutedStyle}>등록된 Knowledge Base가 없습니다.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Token Budget</th>
                <th style={thStyle}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {knowledgeBases.map((kb) => (
                <tr key={kb.id}>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKbId(kb.id);
                        setGrantKbName(kb.name);
                      }}
                      style={{
                        ...buttonStyle,
                        padding: "4px 8px",
                        fontWeight: kb.id === selectedKbId ? 700 : 500,
                        borderColor: kb.id === selectedKbId ? "#2563eb" : "#d1d5db",
                      }}
                    >
                      {kb.name}
                    </button>
                  </td>
                  <td style={tdStyle}>{kb.type}</td>
                  <td style={tdStyle}>{kb.maxTokenBudget}</td>
                  <td style={tdStyle}>{formatDateTime(kb.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>KB 생성</h2>
        <form onSubmit={onCreateKnowledgeBase} style={{ display: "grid", gap: "10px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={mutedStyle}>이름</span>
            <input required value={createName} onChange={(event) => setCreateName(event.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={mutedStyle}>타입</span>
            <select
              value={createType}
              onChange={(event) => setCreateType(event.target.value as "static" | "rag" | "ontology")}
              style={inputStyle}
            >
              <option value={KB_TYPES.static}>static</option>
              <option value={KB_TYPES.rag}>rag</option>
              <option value={KB_TYPES.ontology}>ontology</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={mutedStyle}>설명</span>
            <input value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={mutedStyle}>Max Token Budget</span>
            <input
              type="number"
              min={1}
              value={createTokenBudget}
              onChange={(event) => setCreateTokenBudget(event.target.value)}
              style={inputStyle}
            />
          </label>

          {createType === KB_TYPES.static ? (
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedStyle}>Static Content</span>
              <textarea
                value={createStaticContent}
                onChange={(event) => setCreateStaticContent(event.target.value)}
                style={textareaStyle}
              />
            </label>
          ) : (
            <p style={mutedStyle}>`rag`, `ontology` 타입은 현재 이벤트 로그만 동작합니다.</p>
          )}

          <div>
            <button type="submit" style={buttonStyle}>KB 저장</button>
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>KB 상세</h2>
        {!selectedKnowledgeBase ? (
          <p style={mutedStyle}>목록에서 KB를 선택하세요.</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            <p style={mutedStyle}>
              선택된 KB: <strong>{selectedKnowledgeBase.name}</strong> ({selectedKnowledgeBase.type})
            </p>

            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedStyle}>설명</span>
              <input
                value={detailDescription}
                onChange={(event) => setDetailDescription(event.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: "6px" }}>
              <span style={mutedStyle}>Max Token Budget</span>
              <input
                type="number"
                min={1}
                value={detailTokenBudget}
                onChange={(event) => setDetailTokenBudget(event.target.value)}
                style={inputStyle}
              />
            </label>

            {selectedKnowledgeBase.type === KB_TYPES.static ? (
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={mutedStyle}>Static Content</span>
                <textarea
                  value={detailStaticContent}
                  onChange={(event) => setDetailStaticContent(event.target.value)}
                  style={textareaStyle}
                />
              </label>
            ) : (
              <p style={mutedStyle}>이 KB 타입은 현재 상세 편집 없이 매핑만 관리합니다.</p>
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" style={buttonStyle} onClick={() => void onSaveDetail()}>저장</button>
              <button
                type="button"
                style={{ ...buttonStyle, borderColor: "#fecaca", color: "#b91c1c" }}
                onClick={() => void onDeleteSelected()}
              >
                삭제
              </button>
            </div>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>에이전트-KB 연결</h2>

        <form onSubmit={onCreateGrant} style={{ display: "grid", gap: "10px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={mutedStyle}>Agent Name</span>
            <select
              required
              value={grantAgentName}
              onChange={(event) => setGrantAgentName(event.target.value)}
              style={inputStyle}
            >
              <option value="">선택하세요</option>
              {agents.map((agentName) => (
                <option key={agentName} value={agentName}>{agentName}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={mutedStyle}>KB Name</span>
            <select
              required
              value={grantKbName}
              onChange={(event) => setGrantKbName(event.target.value)}
              style={inputStyle}
            >
              <option value="">선택하세요</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.name}>{kb.name}</option>
              ))}
            </select>
          </label>

          <div>
            <button type="submit" style={buttonStyle}>권한 추가</button>
          </div>
        </form>

        {selectedKnowledgeBase ? (
          <div style={{ display: "grid", gap: "10px" }}>
            <p style={mutedStyle}>
              <strong>{selectedKnowledgeBase.name}</strong> 에 연결된 에이전트
            </p>

            {selectedKbGrants.length === 0 ? (
              <p style={mutedStyle}>연결된 에이전트가 없습니다.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Agent</th>
                    <th style={thStyle}>Granted By</th>
                    <th style={thStyle}>Granted At</th>
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedKbGrants.map((grant) => (
                    <tr key={grant.id}>
                      <td style={tdStyle}>{grant.agentName}</td>
                      <td style={tdStyle}>{grant.grantedBy}</td>
                      <td style={tdStyle}>{formatDateTime(grant.grantedAt)}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={{ ...buttonStyle, padding: "6px 10px" }}
                          onClick={() => {
                            void onDeleteGrant(grant);
                          }}
                        >
                          해제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function KnowledgeBaseSidebarLink({ context }: PluginSidebarProps): JSX.Element {
  const href = pluginPagePath(context.companyPrefix);
  const isActive = typeof window !== "undefined" && window.location.pathname === href;

  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={[
        "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
        isActive
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
      ].join(" ")}
    >
      <span aria-hidden="true">KB</span>
      <span className="truncate">Knowledge Base</span>
    </a>
  );
}
