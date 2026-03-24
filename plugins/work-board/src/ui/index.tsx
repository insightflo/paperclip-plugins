import { usePluginData, type PluginPageProps, type PluginSidebarProps, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { useState, type CSSProperties } from "react";
import { PAGE_ROUTE, WORKSTREAMS } from "../constants.js";
import type { BoardIssueCard, WorkBoardSnapshot, WorkstreamSnapshot } from "../worker.js";

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "24px",
  padding: "24px",
};

const heroStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  padding: "24px",
  borderRadius: "24px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 85%, transparent)",
  background: [
    "radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7dd3fc) 30%, transparent) 0%, transparent 42%)",
    "linear-gradient(145deg, color-mix(in srgb, var(--card, #ffffff) 96%, transparent), color-mix(in srgb, var(--background, #f8fafc) 92%, transparent))",
  ].join(", "),
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.06)",
};

const metricsGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
};

const metricCardStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  padding: "14px 16px",
  borderRadius: "18px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
  background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
};

const boardGridStyle: CSSProperties = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  alignItems: "start",
};

const columnStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 78%, transparent)",
  background: "color-mix(in srgb, var(--card, #ffffff) 96%, transparent)",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.05)",
};

const bucketStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const bucketHeaderButtonStyle: CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  color: "inherit",
};

const issueCardStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px 14px",
  borderRadius: "16px",
  border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
  background: "color-mix(in srgb, var(--background, #f8fafc) 78%, var(--card, #ffffff))",
};

const tinyMutedStyle: CSSProperties = {
  fontSize: "12px",
  color: "color-mix(in srgb, var(--foreground, #0f172a) 62%, transparent)",
  lineHeight: 1.45,
};

const anchorResetStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

function hostPath(companyPrefix: string | null | undefined, suffix: string): string {
  return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}

function pluginPagePath(companyPrefix: string | null | undefined): string {
  return hostPath(companyPrefix, `/${PAGE_ROUTE}`);
}

function issuePath(companyPrefix: string | null | undefined, issue: BoardIssueCard): string {
  const pathId = issue.identifier ?? issue.id;
  return hostPath(companyPrefix, `/issues/${pathId}`);
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function relativeAgeLabel(days: number): string {
  if (days <= 0) return "오늘 갱신";
  if (days === 1) return "1일 경과";
  return `${days}일 경과`;
}

function toneStyle(tone: WorkstreamSnapshot["healthTone"]): CSSProperties {
  if (tone === "complete") {
    return {
      background: "color-mix(in srgb, #22c55e 14%, transparent)",
      color: "#166534",
      border: "1px solid color-mix(in srgb, #22c55e 32%, transparent)",
    };
  }
  if (tone === "progress") {
    return {
      background: "color-mix(in srgb, #0ea5e9 12%, transparent)",
      color: "#075985",
      border: "1px solid color-mix(in srgb, #0ea5e9 28%, transparent)",
    };
  }
  if (tone === "attention") {
    return {
      background: "color-mix(in srgb, #f59e0b 16%, transparent)",
      color: "#92400e",
      border: "1px solid color-mix(in srgb, #f59e0b 34%, transparent)",
    };
  }
  return {
    background: "color-mix(in srgb, var(--muted, #e5e7eb) 45%, transparent)",
    color: "color-mix(in srgb, var(--foreground, #0f172a) 72%, transparent)",
    border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 82%, transparent)",
  };
}

function useWorkBoard(companyId: string | null | undefined) {
  return usePluginData<WorkBoardSnapshot>("work-board-overview", {
    companyId: companyId ?? "",
  });
}

function MetricCard({ label, value, helper, accent }: { label: string; value: string | number; helper: string; accent?: string }) {
  return (
    <div style={metricCardStyle}>
      <div style={tinyMutedStyle}>{label}</div>
      <strong style={{ fontSize: "24px", lineHeight: 1, color: accent || "inherit" }}>{value}</strong>
      <div style={tinyMutedStyle}>{helper}</div>
    </div>
  );
}

function IssueTile({
  companyPrefix,
  issue,
}: {
  companyPrefix: string | null | undefined;
  issue: BoardIssueCard;
}) {
  return (
    <a href={issuePath(companyPrefix, issue)} style={anchorResetStyle}>
      <article style={issueCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
          <strong style={{ fontSize: "13px" }}>{issue.identifier ?? issue.id.slice(0, 8)}</strong>
          <span style={{ ...tinyMutedStyle, whiteSpace: "nowrap" }}>{issue.statusLabel}</span>
        </div>
        <div style={{ fontSize: "14px", lineHeight: 1.45 }}>{issue.title}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          <span style={{ ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 58%, transparent)" }}>
            {issue.priority}
          </span>
          {issue.failedThisWeek ? (
            <span style={{ ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, #ef4444 16%, transparent)", color: "#991b1b" }}>
              실패
            </span>
          ) : null}
          {issue.stale ? (
            <span style={{ ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, #ef4444 14%, transparent)", color: "#991b1b" }}>
              stale
            </span>
          ) : null}
          <span style={{ ...tinyMutedStyle, padding: "2px 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--accent, #7dd3fc) 22%, transparent)" }}>
            {issue.matchedBy}
          </span>
        </div>
        <div style={tinyMutedStyle}>
          {issue.status === "done"
            ? `완료 ${formatDateTime(issue.completedAt)}`
            : issue.failedThisWeek
              ? `실패 ${formatDateTime(issue.cancelledAt)} · ${relativeAgeLabel(issue.ageDays)}`
              : `${relativeAgeLabel(issue.ageDays)} · 업데이트 ${formatDateTime(issue.updatedAt)}`}
        </div>
      </article>
    </a>
  );
}

function bucketAccent(bucketKey: WorkstreamSnapshot["buckets"][number]["key"]) {
  if (bucketKey === "overdueLastWeek") {
    return { color: "#ef4444", background: "color-mix(in srgb, #ef4444 10%, transparent)" };
  }
  if (bucketKey === "todo") {
    return { color: "#f59e0b", background: "color-mix(in srgb, #f59e0b 10%, transparent)" };
  }
  if (bucketKey === "inProgress") {
    return { color: "#3b82f6", background: "color-mix(in srgb, #3b82f6 10%, transparent)" };
  }
  return { color: "#22c55e", background: "color-mix(in srgb, #22c55e 10%, transparent)" };
}

function BucketSection({
  bucketKey,
  label,
  count,
  items,
  companyPrefix,
}: {
  bucketKey: WorkstreamSnapshot["buckets"][number]["key"];
  label: string;
  count: number;
  items: BoardIssueCard[];
  companyPrefix: string | null | undefined;
}) {
  const [collapsed, setCollapsed] = useState(count === 0);
  const accent = bucketAccent(bucketKey);

  return (
    <section
      style={{
        ...bucketStyle,
        padding: "12px 14px 12px 12px",
        borderRadius: "16px",
        borderLeft: `3px solid ${accent.color}`,
        background: accent.background,
      }}
    >
      <button type="button" style={bucketHeaderButtonStyle} onClick={() => setCollapsed((value) => !value)}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            aria-hidden="true"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              background: accent.color,
              flexShrink: 0,
            }}
          />
          <strong style={{ fontSize: "14px" }}>{label}</strong>
        </span>
        <span style={{ ...tinyMutedStyle, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>{count}건</span>
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
        </span>
      </button>
      {!collapsed ? items.length > 0 ? items.map((item) => (
        <IssueTile key={item.id} companyPrefix={companyPrefix} issue={item} />
      )) : (
        <div style={{ ...tinyMutedStyle, padding: "12px 14px", borderRadius: "14px", background: "color-mix(in srgb, var(--muted, #e5e7eb) 38%, transparent)" }}>
          비어 있음
        </div>
      ) : null}
    </section>
  );
}

function WorkstreamColumn({
  stream,
  companyPrefix,
}: {
  stream: WorkstreamSnapshot;
  companyPrefix: string | null | undefined;
}) {
  return (
    <section style={columnStyle}>
      <div style={{ display: "grid", gap: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <strong style={{ fontSize: "18px" }}>{stream.name}</strong>
            <div style={tinyMutedStyle}>{stream.description}</div>
          </div>
          <span style={{ ...tinyMutedStyle, ...toneStyle(stream.healthTone), padding: "6px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>
            {stream.healthLabel}
          </span>
        </div>
        <div style={tinyMutedStyle}>{stream.summary}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span style={{ ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #ef4444 12%, transparent)" }}>
            지난주 미완료 {stream.buckets.find((b: {key: string}) => b.key === "overdueLastWeek")?.count ?? 0}
          </span>
          <span style={{ ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #f59e0b 12%, transparent)" }}>
            해야 할 {stream.buckets.find((b: {key: string}) => b.key === "todo")?.count ?? 0}
          </span>
          <span style={{ ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #3b82f6 12%, transparent)" }}>
            진행 중 {stream.buckets.find((b: {key: string}) => b.key === "inProgress")?.count ?? 0}
          </span>
          <span style={{ ...tinyMutedStyle, padding: "4px 8px", borderRadius: "999px", background: "color-mix(in srgb, #22c55e 12%, transparent)" }}>
            완료 {stream.doneThisWeekCount}
          </span>
        </div>
      </div>
      {stream.buckets.map((bucket) => (
        <BucketSection
          key={bucket.key}
          bucketKey={bucket.key}
          label={bucket.label}
          count={bucket.count}
          items={bucket.items}
          companyPrefix={companyPrefix}
        />
      ))}
    </section>
  );
}

function BoardContent({ context, data, onRefresh, loading }: { context: PluginPageProps["context"]; data: WorkBoardSnapshot; onRefresh: () => void; loading: boolean }) {
  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ ...tinyMutedStyle, textTransform: "uppercase", letterSpacing: "0.08em" }}>weekly work board</div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02 }}>
              금주 업무 영역 보드
            </h1>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 72%, transparent)",
                background: "color-mix(in srgb, var(--card, #ffffff) 92%, transparent)",
                cursor: loading ? "wait" : "pointer",
                fontSize: "13px",
                color: "inherit",
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? "갱신 중..." : "↻ 새로고침"}
            </button>
          </div>
          <div style={{ fontSize: "15px", lineHeight: 1.6, maxWidth: "760px" }}>
            이슈에 달린 라벨로 업무 영역을 분류합니다. 라벨이 없으면 키워드로 자동 매칭됩니다.
          </div>
        </div>
        <div style={metricsGridStyle}>
          <MetricCard label="지난주 미완료" value={data.totals.overdueLastWeek} helper="지난주에 끝냈어야 하는 항목" accent="#ef4444" />
          <MetricCard label="이번주 해야 할" value={data.totals.todo} helper="이번 주 처리 대상" accent="#f59e0b" />
          <MetricCard label="진행 중" value={data.totals.inProgress} helper="현재 작업 중인 항목" accent="#3b82f6" />
          <MetricCard label="이번주 완료" value={data.totals.doneThisWeek} helper={data.weekRange.label} accent="#22c55e" />
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={tinyMutedStyle}>{data.weekRange.label}</div>
        <a href={pluginPagePath(context.companyPrefix)} style={{ ...anchorResetStyle, ...tinyMutedStyle }}>
          route: {pluginPagePath(context.companyPrefix)}
        </a>
      </div>

      <section style={boardGridStyle}>
        {data.workstreams.map((stream) => (
          <WorkstreamColumn key={stream.name} stream={stream} companyPrefix={context.companyPrefix} />
        ))}
      </section>

      {data.unmatched.length > 0 ? (
        <section style={{ ...columnStyle, gap: "12px" }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ fontSize: "18px" }}>미분류 이슈</strong>
            <div style={tinyMutedStyle}>
              현재 규칙으로 어느 영역에도 배정되지 않은 열린 이슈다. 필요하면 키워드 규칙이나 `projectId`/`goalId` 매핑을 늘리면 된다.
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {data.unmatched.map((issue) => (
              <IssueTile key={issue.id} companyPrefix={context.companyPrefix} issue={issue} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function WorkBoardPage({ context }: PluginPageProps) {
  const board = useWorkBoard(context.companyId);

  if (board.loading) {
    return <div style={pageStyle}>업무 보드를 불러오는 중...</div>;
  }
  if (board.error) {
    return <div style={pageStyle}>업무 보드를 불러오지 못했다: {board.error.message}</div>;
  }
  if (!board.data) {
    return <div style={pageStyle}>표시할 데이터가 없다.</div>;
  }

  return <BoardContent context={context} data={board.data} onRefresh={board.refresh} loading={board.loading} />;
}

export function WorkBoardSidebarLink({ context }: PluginSidebarProps) {
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
      <span aria-hidden="true">▦</span>
      <span className="truncate">업무 보드</span>
    </a>
  );
}

export function WorkBoardDashboardWidget({ context }: PluginWidgetProps) {
  const board = useWorkBoard(context.companyId);

  if (board.loading) return <div>업무 보드 요약을 불러오는 중...</div>;
  if (board.error) return <div>업무 보드 오류: {board.error.message}</div>;
  if (!board.data) return <div>요약 데이터가 없다.</div>;

  return (
    <section style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }}>
        <strong>Weekly Work Board</strong>
        <a href={pluginPagePath(context.companyPrefix)} style={tinyMutedStyle}>Open board</a>
      </div>
      <div style={tinyMutedStyle}>{board.data.weekRange.label}</div>
      <div style={{ display: "grid", gap: "8px" }}>
        {board.data.workstreams.map((stream) => (
          <div
            key={stream.name}
            style={{
              display: "grid",
              gap: "6px",
              padding: "10px 12px",
              borderRadius: "14px",
              border: "1px solid color-mix(in srgb, var(--border, #d4d4d8) 75%, transparent)",
              background: "color-mix(in srgb, var(--card, #ffffff) 95%, transparent)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
              <strong style={{ fontSize: "14px" }}>{stream.name}</strong>
              <span style={{ ...tinyMutedStyle, ...toneStyle(stream.healthTone), padding: "4px 8px", borderRadius: "999px" }}>
                {stream.healthLabel}
              </span>
            </div>
            <div style={tinyMutedStyle}>
              미완료 {stream.buckets.find((b: {key: string}) => b.key === "overdueLastWeek")?.count ?? 0} · 해야 할 {stream.buckets.find((b: {key: string}) => b.key === "todo")?.count ?? 0} · 진행 {stream.buckets.find((b: {key: string}) => b.key === "inProgress")?.count ?? 0} · 완료 {stream.doneThisWeekCount}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
