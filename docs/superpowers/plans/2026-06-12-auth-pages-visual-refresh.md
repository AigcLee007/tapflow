# Auth Pages Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh login and register pages with a TapNow-style immersive product layout while preserving the existing v2 auth APIs.

**Architecture:** Keep auth behavior inside the existing React auth pages. Add a shared visual shell inside `LoginPage.tsx` to avoid new dependencies and reuse it from `RegisterPage.tsx`; update tests to protect fields, copy, and route switching.

**Tech Stack:** Vite, React, Tailwind CSS utilities, Vitest, Testing Library.

---

## Scope

- Modify `src/auth/LoginPage.tsx` and `src/auth/RegisterPage.tsx`.
- Create `src/auth/AuthPages.test.tsx`.
- Do not touch `src/flowCanvas/*` or any files from the canvas dock panels plan.
- Keep authentication calls, token handling, and route constants unchanged.

## Tasks

- [ ] Add rendering tests for login/register product copy, form fields, and page switch buttons.
- [ ] Run the auth page tests and confirm they fail on the current minimal/garbled pages.
- [ ] Implement the shared immersive auth layout and update login/register content.
- [ ] Run the auth page tests and confirm they pass.
- [ ] Run `npm run build`.
- [ ] Update `PROJECT_RECORD.md` with the auth page refresh.
