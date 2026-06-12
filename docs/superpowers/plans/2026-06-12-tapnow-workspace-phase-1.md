# TapNow Workspace Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the authenticated workspace entry into a TapNow-style creative workspace with a lighter top shell, creator-first home page, and visual project grid.

**Architecture:** Keep existing v2 auth, project APIs, and routes. Redesign only the React shell and workspace/project-list presentation layer; avoid backend, canvas, asset API, billing ledger, and AI Gateway changes in Phase 1.

**Tech Stack:** Vite, React, Tailwind CSS utilities, lucide-react icons, Vitest, Testing Library.

---

## Scope

Phase 1 modifies:

- `src/app/WorkspaceShell.tsx`
- `src/workspace/WorkspacePage.tsx`
- `src/workspace/WorkspaceHeader.tsx`
- `src/workspace/ProjectToolbar.tsx`
- `src/workspace/ProjectTabs.tsx`
- `src/workspace/ProjectGrid.tsx`
- `src/workspace/ProjectCard.tsx`
- `src/workspace/CreateProjectCard.tsx`
- focused tests under `src/app` and `src/workspace`
- `PROJECT_RECORD.md`

Phase 1 does not modify:

- `src/flowCanvas/*`
- `apps/api/*`
- `packages/db/*`
- provider/model/admin pages
- billing reserve/settle/refund logic

## Target Experience

- Global shell resembles TapNow: dark top bar, brand at left, centered pill navigation, account pill at right.
- Top nav exposes creator-facing entries: `主页`, `工作空间`, `素材库`, `价格方案`; account/admin entries move to the account menu.
- `/workspace` becomes a creator home surface:
  - large prompt heading `今天要做点什么？`
  - prompt-style box `开始一段灵感对话...`
  - recent projects row with `新建项目` first
  - `所有项目 ->` action to focus the full project area
- Workspace project area resembles TapNow's grid:
  - `个人 / 团队项目` tabs
  - search, display filter, view toggle, refresh, and `新建项目`
  - large visual cards with cover image first, title and update time below
- Existing project creation and project opening behavior stays unchanged.

## Tasks

- [ ] Add tests for `WorkspaceShell` navigation labels and account menu behavior.
- [ ] Add tests for `WorkspacePage` creator-home copy, project controls, and project card copy.
- [ ] Run focused tests and confirm they fail against the current backend-style UI.
- [ ] Implement the TapNow-style `WorkspaceShell` with account menu.
- [ ] Implement the creator home and compact project area in `WorkspacePage`.
- [ ] Refresh tabs, toolbar, grid, create card, and project cards with fixed Chinese copy.
- [ ] Run focused tests until green.
- [ ] Run `npm run build`; if blocked by unrelated dirty files, report exact blocker.
- [ ] Update `PROJECT_RECORD.md` with Phase 1 status and validation.
