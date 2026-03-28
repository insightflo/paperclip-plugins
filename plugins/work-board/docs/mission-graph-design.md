# Mission Graph Design

## Goal

The Mission Board plugin owns the mission graph view.
It must derive the graph on every refresh from live issue data, not from a hard-coded snapshot.

## Data Sources

- `issues.read`
- `issue.comments.read`
- `agents.read`

## Seed Rules

Seed issues are selected when any of the following is true:

- The title starts with one of:
  - `[유지보수]`
  - `[리벨런싱 경고]`
  - `[경고]`
  - `[지시]`
  - `[전략]`
  - `[긴급]`
- `executionRunId` exists
- `originRunId` exists
- `originKind` exists and is not `manual`

## Expansion Rules

Starting from each seed issue, expand outward up to two hops.

Traverse these relation types:

- `parent`
- `reissue`
- `related`
- `spawned_followup`
- `assignee`

Related issues are discovered through:

- issue title / description references
- issue comments containing issue identifiers
- `(... 재이슈)` markers in the title

## Rendering Rules

- Show the graph only in the Mission Board plugin.
- Keep the graph separate from the kanban board.
- Show only mission-board relevant issues and connected nodes.
- Provide node detail with the inbound / outbound relation list.

## Non-Goals

- Do not hard-code a weekly snapshot.
- Do not move the agent/code dependency graph out of System Garden.
- Do not show every issue in the company.
