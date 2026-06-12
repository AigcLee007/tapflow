# TapNow Canvas Entry Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `/projects/:projectId` canvas entry, empty state, and immediate canvas chrome copy into the same TapNow-style product language used in Phase 1 and Phase 2.

**Architecture:** Keep the existing React Flow canvas, remote draft autosave, asset insertion, dock drawer state, and backend APIs unchanged. Refresh only page-level presentation and user-facing copy in the project canvas entry path, with focused rendering tests for the new contracts.

**Tech Stack:** Vite, React, React Flow, Tailwind CSS utilities, inline canvas chrome styles, lucide-react icons, Vitest, Testing Library.

---

## Scope

Modify:

- `src/flowCanvas/FlowCanvasPage.tsx`
- `src/flowCanvas/FlowProjectPage.tsx`
- `src/flowCanvas/canvas/FlowLeftAddPanel.tsx`
- focused tests for the refreshed canvas entry experience
- `PROJECT_RECORD.md`

Do not modify:

- `src/flowCanvas/panels/**` canvas dock drawer feature work
- backend API, worker, database, billing, asset storage, or AI Gateway behavior
- draft persistence semantics, workflow execution, or node runtime behavior

## Target Experience

- Empty canvas reads like a creator start surface: “今天想创作什么？” with concise guidance and quick creation buttons.
- Left dock add-node flyout and user menu have readable Chinese labels instead of mojibake.
- Project canvas loading, failure, save status, and asset insertion feedback use clean product copy.
- The route remains a full-screen project canvas and does not reintroduce a separate shell.

## Tasks

- [ ] Add failing rendering tests for the Phase 3 canvas empty state and project loading/error copy.
- [ ] Add a focused text contract test for the left dock menu copy.
- [ ] Refresh `FlowCanvasPage` empty state copy and quick action labels while keeping node insertion behavior unchanged.
- [ ] Refresh `FlowProjectPage` loading/error/save/asset-insert copy while keeping remote project and autosave hooks unchanged.
- [ ] Refresh `FlowLeftAddPanel` add-node flyout and user menu labels without touching dock drawer behavior.
- [ ] Run focused tests until green.
- [ ] Run `npm run build`.
- [ ] Update `PROJECT_RECORD.md` with Phase 3 status and validation.
