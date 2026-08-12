# Project Record

Last updated: 2026-08-12
Maintainers: project team + Codex sessions

## 2026-08-12 - Text Node Multimodal Image Input Design

- confirmed the current v2 Text Node bug: canvas connections and thumbnails recognize upstream images, but the authoritative Worker/Gateway text path serializes only string messages, so visual content never reaches the selected model.
- approved a provider-neutral `TextGenerationRequest` image-asset contract for explicitly visual-capable GPT, Gemini, Claude, and OpenAI-compatible text routes. The design preserves creator `inputOrder`, supports at most three upstream images, and never silently truncates inputs.
- defined API preflight before billing reserve/enqueue plus authoritative Worker validation, tenant-scoped asset hydration, protocol-specific image mapping, fail-closed structured errors, safe catalog capabilities, UI incompatibility states, and redaction requirements.
- limited this phase to upstream Image Node inputs. Video/audio understanding, frame extraction, and direct Text Node asset-picker inputs remain outside scope.
- recorded the approved design in `docs/superpowers/specs/2026-08-12-text-node-multimodal-image-input-design.md`; runtime implementation and deployment have not started.

## 2026-08-12 - Workbench Personal-Wallet Ledger Foreign-Key Repair

- reproduced the reported `/workbench` image-generation `INTERNAL_ERROR` against the production database inside a rolled-back transaction; no generation, queue job, wallet charge, or provider request was created.
- confirmed the root cause was the personal-wallet cutover writing `billing_wallet_ledger` IDs into `workbench_generations` columns whose foreign keys still referenced legacy `billing_ledger`.
- added `packages/db/migrations/000067_workbench_personal_wallet_ledger_fks.sql`, which repoints `reserve_ledger_id`, `settle_ledger_id`, and `refund_ledger_id` to `billing_wallet_ledger(id)` with `ON DELETE SET NULL NOT VALID`. New writes are enforced while historical legacy rows remain readable without rewriting accounting history.
- added `packages/db/test/workbench-wallet-ledger-fks.test.ts` to lock all three constraint names, target table, delete behavior, and historical `NOT VALID` compatibility.
- validation passed: focused migration test; full database workspace tests (`52` passed, `38` environment-dependent skips); workbench API tests (`7` passed); workbench worker tests (`12` passed); database build; API build; root frontend build. The root build retained existing CSS, chunk-size, module-splitting, and Browserslist warnings only.
- root `npm test` could not start repository tests because Vitest scanned the existing `.worktrees` tree and Windows returned `EMFILE` while opening `.worktrees/unified-input-groups-mentions/apps/api/test/prompts.service.test.ts`; it reported zero tests and one collection error, so it is not counted as passing.
- production deployment and smoke verification remain pending explicit operational execution. Use the Docker Compose v2 runbook, stop the worker before migration, run `node packages/db/dist/cli.js`, then restart Redis/API/worker/frontend; afterward perform a rolled-back insert probe and one authenticated workbench generation.

## 2026-08-11 - H3video-2k Resolution Capability Alignment

- added `2K` to the canonical video-resolution type, capability parser, and legacy parameter normalization so route-declared `2K` values no longer fall back to the generic resolution list.
- video resolution menus now consistently display all five canonical choices (`480P`, `720P`, `1080P`, `2K`, `4K`), while confirmed route capabilities control which choices are enabled. H3video-2k enables only `2K`; stale H3 drafts using `480P`, `720P`, `1080P`, or `4K` are automatically corrected to `2K` by the existing route-capability correction flow.
- focused parameter, capability, normalization, and Video Node Composer regressions passed with H3-specific `2K` coverage.
- added platform migration `000065_pixellelabs_h3video_2k_resolution.sql` to repair already-installed H3 routes whose persisted capability JSON still advertises generic resolutions; it changes only the H3 route capabilities/default and preserves pricing, credentials, and connections.
- added a frontend catalog-boundary constraint for the product model key `H3video-2k`. This keeps the H3 effective capability at `2K` even before a stale server capability record has been migrated, preventing any fallback path from accepting other resolutions.
- unsupported visible resolution choices are greyed out, cannot be selected, and show their model-support explanation on hover or keyboard focus.

## 2026-08-10 - PixelleLabs H3video-2k Provider

- added the independent `pixellelabs.h3video` AI Gateway plugin and `video.pixellelabs.h3video-2k` route for `H3video-2k` at `https://api.pixellelabs.com`.
- added a dedicated `pixellelabs-h3video` async adapter with fixed `2K`/`15` second payloads, ordered image mapping, singular/plural video and audio reference fields, and sanitized polling results.
- H3 exposes text-to-video, image-to-video, image-reference, and all-reference modes; first/last-frame is intentionally unsupported. Its API key is a separate CredentialVault binding and is not an environment variable.

## 2026-08-10 - Video Mode Input Availability Implementation

- implemented the approved input-driven video-mode matrix across the Flow canvas: no media enables only text-to-video; one image enables image-to-video, first/last frame, image reference, and all reference; two images default to image reference; three or more images disable image-to-video and first/last frame; video or audio requires all reference. Text inputs do not affect the matrix.
- video mode rows always remain visible. Unavailable rows provide keyboard and hover Tooltip explanations, automatic topology corrections persist only the selected semantic mode and reference roles, and transient switch notices remain React state rather than draft data.
- first/last frame now accepts one first frame or an ordered first/last pair. Input reorder persists both order and frame roles. PixelHub Veo capability data and the platform route migration support an optional last frame without modifying tenant routes.
- API structured video request validation now fails closed before billing reserve or queue enqueue for malformed reference arrays and invalid media/mode combinations. Worker tests preserve first-frame and ordered frame metadata.
- hardened the real browser smoke harness for Windows/Vite cold starts by navigating through a file-backed Playwright action with an explicit 120-second navigation timeout. The harness now recognizes Lexical's disabled editor state, uses tolerant rendered-pixel comparisons, and restores the portrait ratio after testing a limited 16:9-only route.
- first/last-frame reconciliation now derives durable frame roles from the creator-visible `inputOrder`, even when a saved draft retains an opposite connection/reference order. The first image persists as `first_frame` and the second as `last_frame`; the existing input tray exposes their `首帧` and `尾帧` badges visibly and through accessible labels.
- renamed the creator-facing `all_reference` mode to `全能参考视频`. Gemini Omni Flash now permits one or more reference images without a source video; a source video remains optional and constrained to one item. Frontend validation, the gateway contract, plugin manifest, and platform-route migration use the same rule.
- Sora V3 Pro now follows the same image-only all-reference availability: its obsolete `requiresVideoOrAudio` capability is removed from the built-in plugin and platform route migration. Disabled-mode explanations now render through a fixed body portal above the node upload toolbar.
- validation: focused mode, Composer, input, API, worker, gateway, and smoke-contract suites passed. The real browser smoke returned `status: ok` across desktop, narrow, tablet, and mobile viewports, including availability, tooltip, frame-role, unsupported-model, empty-node, and generation-control-lock checks. Root `npm test` could not begin because Vitest scanned the repository's existing `.worktrees` and hit Windows `EMFILE`; a `.worktrees`-excluded run exceeded the five-minute local command limit and is not counted as passing.

## 2026-08-10 - Video Mode Input Availability Implementation Plan

- completed the implementation plan for the approved LibTV-style video generation mode availability behavior in `docs/superpowers/plans/2026-08-10-video-mode-input-availability.md`;
- the plan covers unified upstream/asset/upload input projection, the no-media/one-image/two-image/three-plus-image/video-or-audio availability matrix, two-image default fallback to image reference, one-or-two-image first/last-frame roles, disabled-mode tooltips, one-time auto-switch notices, model capability intersection, server-side fail-closed validation, browser smoke coverage, and build/test verification;
- product implementation has not started yet; no production behavior, API, worker, or database changes were made in this planning task.

## 2026-08-10 - Video Mode Input Availability Design

- approved a LibTV-style video mode availability contract driven by unified upstream, asset, and upload inputs: no media permits only text-to-video; one image permits image-to-video, first/last frame, image reference, and all reference; two images default to image reference while first/last frame remains manually selectable; three or more images permit image reference and all reference; any video or audio input requires all reference;
- defined first/last frame role normalization for one or two ordered images, disabled-mode hover explanations, one-time auto-switch notices, model-capability intersection, and no automatic model replacement;
- recorded the design and acceptance matrix in `docs/superpowers/specs/2026-08-10-video-mode-input-availability-design.md`; implementation remains pending design-to-plan transition.

## 2026-08-09 - Media Prompt Controlled Value Feedback Loop

- fixed the media prompt editor feedback loop triggered by ordinary text input. A local Lexical value could be replaced by a stale controlled prop before its node update returned, causing the previous and next prompt values to alternate indefinitely and freezing the canvas renderer.
- added explicit tracking for the last parent value and a pending local value. A stale parent re-render now leaves local input intact; a genuine external value change still rebuilds the editor. No-op Lexical synchronization updates no longer write unchanged prompt/binding data back to the node.
- added a deterministic delayed-controlled-value regression that reproduces the production ordering without a browser timing dependency.
- deleting a referenced image, video, or audio input now removes its matching `@` capsule from the prompt and prunes the stale media-mention binding in the same controlled update; the former invalid-warning capsule behavior is intentionally replaced.
- validation: focused media editor, mention menu, video composer, and image-input suites passed (64 tests). Real Chromium regression at the production canvas zoom confirmed ordinary input produces one node update and remains responsive; `@` rendered one menu and one candidate without errors or a write loop. Existing React/Lexical test-harness warnings remain non-blocking.

## 2026-08-09 - Media Mention Freeze Guard

- removed the repeated Lexical selection rewrite that ran while opening an `@` menu; the rewrite fired `OnChange`, updated the React Flow node, and could keep the canvas main thread busy during F2 editing.
- made mention-anchor measurement idempotent and limited the canvas viewport observer to changed `style` values, preventing duplicate React state updates from viewport mutation noise while preserving repositioning for real canvas transforms.
- added focused regressions for no repeated Lexical updates and duplicate/changed viewport style mutations. Asset variant 404s and flow-draft `409` responses remain separate operational issues and are not treated as the freeze root cause.
- validation: the focused mention/input suite passed 63/63 and `npm run build` exited `0`; existing Lexical/React test warnings and Vite/Browserslist warnings remain. Browser smoke against a deployed canvas remains a follow-up.

## 2026-08-08 - Media Mention Caret And Numbering Follow-up

- replaced editor-box menu positioning with a stable Lexical query anchor and range/character fallback; `@` restores its text selection after element-selection recovery, and the menu remeasures on editor resize, viewport resize, scroll, visual viewport changes, and canvas transforms.
- video mention candidates now preserve connected media and show capability-restricted canvas/library media as disabled choices with a visible reason; text remains excluded.
- mention activation now carries runtime-only previews so image/video capsule thumbnails render on the first insertion frame; preview URLs remain excluded from serialized draft JSON.
- validation: focused mention/video suite passed `66/66`; `npm run build` exited `0` with the known Vite/Browserslist warnings. Browser smoke remains to be run against the deployed canvas.

- media inputs now use a unified `inputKey` projection with independent `图片N`、`视频N`、`音频N` labels; text inputs remain outside media mention candidates.
- image reference chips, media candidates, and mention pills reuse projected labels; mention pills can render runtime-only 16px thumbnails without persisting preview URLs.
- Lexical first-`@` caret and element-selection handling is covered by focused tests; Backspace/Delete isolation and invalid binding recovery remain covered by the existing mention suite.
- focused validation passed: frontend build; 84 media/input tests plus the updated FlowNodes image-input suite; canonical graph, NodeInputTray, and smoke contract unit tests passed.
- browser smoke was attempted with real keyboard `press("@")` and three viewport checks, but the harness timed out waiting for the first runtime listbox. This remains unresolved and must not be reported as an end-to-end pass.

## 2026-08-07 - Unified Canvas Node Inputs (Scheme B)

- image and video nodes now project connected upstream text, image, video, and audio inputs through one ordered `inputOrder` model; local prompts are merged with upstream text in the worker without persisting preview URLs or media payloads in the canvas draft;
- successful image and video generation records a privacy-safe input signature. When the local prompt, ordered input, text revision, asset, or reference role changes, the composer shows `输入已更新` until the next generation;
- added a focused node-input-tray browser smoke command and captured desktop, tablet, and mobile artifacts locally. The smoke exercises the real XYFlow video node across `1440x900`, `1024x768`, and `390x844`, including viewport-boundary, generation-lock, and reference-input behavior;
- verification: unified frontend regression suite `121/121` passed; Worker suite `77` passed with `17` existing infrastructure-dependent skips; frontend and Worker builds exited `0`; `npm run smoke:node-input-tray` returned `status: ok`. The complete root `npm test` exceeded the 240-second command limit and ended with the existing Three.js/React warnings and reporter `EPIPE`, so it is not counted as passing. Local Redis was unavailable, so Worker tests emitted non-fatal ioredis connection stderr.

## 2026-08-05 - Video Composer Default And Generation Feedback

- unconfigured video nodes now prefer usable `gemini-omni-flash` and otherwise fall back to the first sorted fully usable model without overwriting saved selections;
- input mode, camera movement, and palette share the upper tool row, reference inputs have a conditional row, and execution controls stay in one row on desktop/tablet with two deliberate groups on mobile;
- video previews show submitting, provider-generation, failure, and retry states without fake percentages, while request-changing controls lock during generation and feedback remains visible when the node is unselected;
- validation evidence: focused frontend regression `121/121` passed; `npm run test:smoke-video-node` passed (`4/4`); `npm run smoke:video-node` returned `status: ok` with all new layout, default-model, feedback, lock, and reduced-motion booleans true; `npm run build` exited `0` with existing Vite warnings; the full `npm test` was attempted and timed out after `184` seconds without attributable failure output, so it is not counted as passing.

## 2026-08-05 - Video Composer Default And Feedback Implementation Plan

- approved and planned a catalog-driven default for unconfigured video nodes: prefer usable Gemini Omni Flash, fall back to the first sorted fully usable video model, and never overwrite a saved or user-selected model;
- planned the composer layout as an upper input-mode/camera/palette row, a conditional reference row, and a stable execution row with an explicit two-group mobile layout;
- planned preview-area submitting, generating, failure, and retry feedback with request-control locking, no fake percentage, reduced-motion handling, focused tests, and four-viewport browser acceptance;
- recorded the task-by-task TDD and verification sequence in `docs/superpowers/plans/2026-08-05-video-composer-layout-default-and-feedback.md`; no production code, route, price, credential, database, or deployment state changed in this planning step.

## 2026-08-04 - PixelHub Route-Scoped Credential Bindings

- added manifest-declared bindings for Gemini Omni Flash, Sora V3 Pro, and Veo 3.1 Fast; PixelHub installs now fail closed unless all three bindings provide distinct credentials;
- the plugin installer now creates or reuses one encrypted CredentialVault credential and one provider connection per stable PixelHub route inside its existing transaction, while legacy single-credential plugin installs retain their path;
- added service and database-backed API coverage for incomplete binding rejection, route-specific connection/credential IDs, secret-response isolation, and legacy install compatibility. Database-backed cases require `DATABASE_URL`.

## 2026-08-04 - PixelHub Video Node and Credential Isolation Design

- approved the detailed design for ratio-driven video node sizing, asset-backed upload, a unified uploaded/generated ready state without upload or replace controls, and download/full-screen actions;
- approved curated creator labels `Gemini Omni Flash`, `Sora V3 Pro`, and `Veo 3.1 Fast`, plus one PixelHub provider with three model-specific CredentialVault credentials and provider connections bound to the existing stable route keys;
- recorded the design, migration sequence, staging verification, rollback, and acceptance criteria in `docs/superpowers/specs/2026-08-04-pixelhub-video-node-and-credentials-design.md`; implementation and staging credential rebind remain pending.

## 2026-08-04 - PixelHub Video Node and Credential Isolation Implementation Plan

- wrote the task-by-task implementation plan in `docs/superpowers/plans/2026-08-04-pixelhub-video-node-and-credentials.md`, covering ratio sizing, asset-backed upload, unified ready state, creator labels, route-scoped credentials, tests, rollout, and rollback;
- no runtime code, database migration, credential, route binding, or staging deployment has been changed in this planning step.

## 2026-08-03 - PixelHub Video Role-Boundary Fix

- enforced model-specific reference roles in the gateway contract: Veo image-to-video accepts exactly one `first_frame`, while Gemini all-reference requires exactly one `source_video` and rejects other video roles;
- added creator-facing labels for canonical image/video/audio reference roles and all new model-capability blockers, so the node can explain unsupported duration, fixed audio, reference limits, and missing required inputs;
- focused gateway contract validation passed 20 tests; frontend capability, reference-rule, and UI-copy validation passed 19 tests; `npm run build` passed. Existing Browserslist, mixed dynamic-import, and chunk-size warnings remain unchanged;
- the broader PixelHub three-model plan remains in progress. No provider credential was added and no staging deployment or live provider call was performed.

## 2026-08-03 - Canvas Thumbnail Loading Performance Rollout

- added tenant-scoped bulk signed-URL resolution with ordered, per-item `thumb -> preview -> original` fallback and compatibility-preserved `variantKey` responses; request metrics omit signed URLs.
- canvas image nodes now resolve lightweight thumbs first, use a bounded tenant/user session cache, request preview only for fullscreen, retry one transient signing failure, and refresh the exact failed thumbnail instead of upgrading it to a larger resource.
- introduced anonymous canvas performance marks for draft readiness, signing, first/90-percent thumbnail visibility, and preview upgrade; signed URLs remain UI-only and are never persisted into graph drafts.
- replaced direct S3/Sharp historical repair with audit-first queue enqueueing, and isolated `ASSET_IMAGE_VARIANT_CONCURRENCY` at `2` so repair jobs do not consume general Worker capacity.
- focused source validation passed for signed-URL schema/bulk resolution, resolver/cache/auth boundaries, layered canvas loading/performance marks, Worker image variants, and queue-based backfill; the complete root test command still has unrelated historical failures.
- deployment and mainland-China/Ningbo live metrics have not been collected: this workspace has no `DATABASE_URL` or `REDIS_URL`, and the local Docker Desktop Linux engine is unavailable. Do not treat the rollout as accepted until the documented browser and queue checks pass in staging.

## 2026-08-03 - Canvas Signed-URL Preview Recovery

- fixed expired generated-image previews by carrying `assetId` on generated result metadata and resolving fresh preview URLs before stale persisted `generatedResults[].url` values;
- added a shared runtime asset-preview resolver with expiry-aware cache reads, same-asset in-flight coalescing, batches of up to 100 signed-url requests, preview-to-original fallback, and one controlled refresh per failed URL after an image load error;
- kept signed URLs out of authoritative graph persistence and removed per-node graph updates during URL refresh, reducing autosave churn and duplicate signing traffic while preserving visible-node lazy loading;
- added resolver, URL-precedence, runtime asset metadata, and React image-node regression coverage. Focused validation passed: 5 files, 66 tests; `npm run build` passed with the existing Browserslist, CSS-property, dynamic-import, and chunk-size warnings;
- the full root test run excluding generated directories remains red with 24 unrelated historical failures (AI Gateway multipart, Three.js/ResizeObserver canvas fixtures, legacy migration/asset fixtures, and Canvas Agent expectations). The unfiltered root run timed out while scanning repository worktrees. No staging deployment or live object-storage smoke test was performed.

## 2026-08-02 - Post-Merge Migration Version Collision Fix

- resolved the parallel-branch migration collision between `000060_password_reset_challenges.sql` and the personal-wallet administrator adjustment migration by renumbering the unapplied wallet migration to `000061_wallet_admin_debit.sql`;
- updated the wallet migration contract test and implementation plan references, preserving the already-published password-reset migration filename and checksum;
- the global migration-version uniqueness regression now passes, together with the focused personal-wallet and administrator-adjustment database tests (8 passed, 2 database-dependent tests skipped without local PostgreSQL).

## 2026-08-02 - Personal Wallet Display Consistency

- unified workspace, workbench desktop/mobile, canvas toolbar, billing center, and workflow preflight reads on the flat personal-wallet billing summary fields; creator-facing surfaces no longer fall back to the disconnected legacy account or credit-grant balances;
- added a shared authenticated billing-summary snapshot with stale-response protection and refreshes after auth changes, wallet invalidation events, cross-tab storage changes, and returning to a visible tab;
- successful redeem, payment settlement, and existing admin wallet mutations now invalidate the same billing summary so all mounted balance displays converge on the authoritative personal wallet; unavailable or failed summary requests render `--` instead of a misleading numeric zero;
- replaced the account-menu membership guess with an accurate personal-wallet source label because the flat wallet summary does not own membership-tier data;
- focused frontend validation passed with 104 tests across billing, redeem, workspace, workbench, canvas toolbar, and workflow preflight; `npm run build` passed with the existing Browserslist, mixed-import, and chunk-size warnings. A root `tsc --noEmit` check still reports broad pre-existing type errors outside this change;
- historical legacy credits, including the previously observed 2100-credit admin adjustment, are intentionally not migrated per the product decision. The fix applies to future wallet writes and all updated display paths.

## 2026-08-01 - Database-Driven Text Model Picker

- replaced the canvas text-node model dropdown's five hardcoded placeholder choices with the authenticated v2 AI model catalog and per-model route APIs;
- creator options now include only active text catalog entries with active routes and positive effective pricing, while persisting the database `modelKey`, `routeId`, and `routeKey` selected by the user;
- added explicit loading, retry, empty, and unconfigured states. An empty catalog now shows `暂无可用文本模型`, and generation is blocked locally with `NO_TEXT_GENERATION_ROUTE` instead of launching a job against a nonexistent fallback route;
- new text nodes no longer persist the old static `gpt-5.5` / `text.gpt-5-5` defaults. Existing saved identifiers remain readable but are treated as unavailable unless the current database catalog returns the matching active priced line;
- focused mapper, authenticated cache/retry, text-node selection/empty-state/Escape-dismissal, and node-factory tests pass. The frontend production build passes with the existing Browserslist, CSS-property, dynamic-import, and chunk-size warnings.

## 2026-08-01 - Wallet Completion Reserve-Ledger Lock Recovery

- production Worker diagnostics reproduced `42501 permission denied for table billing_wallet_ledger` in `app.wallet_settle_or_refund` at the reserve-ledger `SELECT ... FOR UPDATE` statement; the function owner, `SECURITY DEFINER`, callback `SELECT/INSERT`, and forced RLS configuration were otherwise verified;
- added `000059_wallet_completion_ledger_lock_acl.sql`, granting only the dedicated no-login `tapflow_wallet_callback` role the `UPDATE` permission and constrained UPDATE RLS policy required by PostgreSQL to acquire the existing reserve-ledger row lock. The Worker/API runtime role retains no direct ledger-table privileges;
- added a focused migration contract test asserting the callback-only policy/grant and rejecting grants to `CURRENT_USER` or `postgres`. Deployment and post-migration Worker recovery verification remain pending.

## 2026-07-31 - Resend Auth Email Transport

- replaced the active Brevo authentication-email transport with Resend without changing registration verification, email challenge storage, trusted-device rules, or frontend verification screens;
- production delivery now calls `https://api.resend.com/emails` through Node's built-in `fetch`, with a ten-second timeout, `Authorization: Bearer` server-side authentication, `Art-Aittco <art@art.aittco.com>` sender formatting, and the existing fail-closed sanitized delivery error behavior;
- active server configuration is now `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_FROM_NAME`, injected through `docker-compose.staging.yml` into the shared API/Worker environment. The Compose regression test verifies that the shared environment contains the three Resend values and that both API and Worker inherit it;
- no database migration or frontend source change is required for this provider-only replacement. Historical Brevo design and rollout records remain unchanged as historical facts;
- local validation passed: focused API auth/environment tests reported 30 passed and 12 database-backed auth tests skipped because local PostgreSQL is not configured; the Compose regression test passed 1/1; `docker compose -f docker-compose.staging.yml config --quiet` passed with expected warnings for unset local placeholder variables; database, API, and frontend production builds passed. Existing Browserslist, mixed dynamic-import, and large-chunk warnings remain;
- live sending remains pending: verify `art.aittco.com` in Resend Domains using Alibaba Cloud DNS records, store the Resend sending key only in `/opt/aittco/env/tapflow.staging.env`, deploy the branch, run a direct Resend smoke email, then test registration, unverified-account login recovery, same-device login, new-device verification, resend cooldown, and secret-free logs.

## 2026-07-31 - Billing Recharge Page Chinese Localization

- completed the creator-facing `/billing` localization in the existing billing components: personal-wallet title and description, balance cards, recharge plans, payment statuses, QR-code alternative text, redeem-code copy, activity labels, and recoverable error messages are now in simplified Chinese;
- kept payment checkout, polling, QR display conditions, balance refresh, API fields, status enums, pricing, and layout unchanged; English server errors are no longer rendered directly in the redeem flow;
- validation passed: `npx vitest run src/billing/BillingCenterPage.test.tsx src/billing/PaymentStatusPanel.test.tsx src/billing/RedeemCodeBox.test.tsx src/billing/billingActivity.test.ts` and `npm run build`.

## 2026-07-30 - Legacy Reservation Reconciliation Guard

- added a guarded, idempotent `personal-wallet-reconciliation-cli` for the legacy cutover gate;
- terminal failed/canceled reservations are released through the existing billing refund ledger path, while positive orphan grant counters receive a zero-amount reconciliation ledger record and deterministic counter repair;
- fixed the legacy refund path so future refunds also release linked credit reservations;
- server diagnostics confirmed 32 terminal failed reservations totaling 101.2 credits and one orphan grant counter totaling 200 credits; the guarded write remains to be run on the server after this release is deployed.
- the deployed reconciliation dry run later identified 28 terminal reservations (92 credits) and 4 non-terminal reservations (9.2 credits); force-cancel mode now requires the explicit `--cancel-non-terminal` flag and records `workflow.run.canceled` events before refunding all reservations.

## 2026-07-30 - Supabase Personal-Wallet Schema Acceptance

- applied and verified `000044_wallet_payment_checkout_functions.sql` in Supabase SQL Editor with checksum `3afb70679f0431512eca2a63948bdc26d443516dd9442e9cf435b3a56ba7369a`; `app.create_wallet_payment(uuid,text,text,text)` is present.
- applied and verified `000045_personal_wallet_accounting_hardening.sql` with checksum `c433a9ef27dee1b70ec9ab9a20daa0dc2221f68952bc43cc9a546e6f53aec3ee`; `app.wallet_redeem_code(uuid,uuid,text,text,jsonb)` is present.
- post-migration role verification reported zero current-user temporary callback memberships and one safe `supabase_admin` managed membership (`ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE`). Migrations `000044` and `000045` are now immutable and accepted on staging.
- the personal-wallet data cutover remains blocked until the known 301.2 legacy reserved credits are reconciled and a dry run reports zero active reservations, no owner exceptions, and matched source/target totals. `PAYMENTS_ENABLED` remains false and the Worker remains stopped during this gate.

## 2026-07-29 - XunhuPay Personal Wallet Verification

- completed verification for the personal-wallet payment implementation: DB, API, Worker, and frontend builds passed; focused DB/API/Worker and billing/admin frontend tests passed.
- the full root test suite still reports unrelated legacy asset, storage, AI Gateway multipart, and Three.js/ResizeObserver environment failures; no payment or wallet migration failures were observed.
- server-side payment secrets remain confined to the API payment module. Migrations `000044` and `000045` have not yet been applied to Supabase; live payment acceptance remains pending merchant callback configuration and SQL Editor execution.
- live Supabase diagnostics identified the remaining managed-role incompatibility: PostgreSQL 17.6 records the automatic `tapflow_wallet_callback -> postgres` membership with grantor `supabase_admin`, `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`. Rewriting that managed membership terminated Transaction Pooler, Session Pooler, and SQL Editor connections.
- a rolled-back SQL Editor probe confirmed that a separate current-grantor `SET TRUE` membership can switch to the callback role successfully. Migrations `000044` and `000045` now add that narrowly scoped grant and revoke it with `GRANTED BY CURRENT_USER`, preserving the Supabase-managed membership unchanged.
- Supabase SQL Editor successfully applied and verified `000044` with checksum `3afb70679f0431512eca2a63948bdc26d443516dd9442e9cf435b3a56ba7369a`; `app.create_wallet_payment(uuid,text,text,text)` is present. This applied migration is now immutable.
- the first `000045` execution rolled back on `permission denied for function wallet_reserve` because function ACL changes ran after `RESET ROLE`. A rolled-back live probe confirmed that the callback owner can revoke `PUBLIC` execution and grant execution to `SESSION_USER`. The still-unapplied `000045` now performs all callback-owned function ACL changes before resetting the role; live re-execution remains pending.

## 2026-07-28 - Supabase Wallet Migration 44/45 Compatibility

- staging recorded migrations `000042` and `000043`, but the original `000044` role/ownership handoff terminated through the runtime Supabase Transaction Pooler on port 6543, the Session Pooler on port 5432, and the Supabase SQL Editor. The Direct database hostname resolved IPv6-only from the deployment server, which has no IPv6 route and returned `ENETUNREACH`.
- revised only the still-unapplied `000044` and `000045` migrations for PostgreSQL 17 managed-role compatibility. Each migration creates a separate current-grantor `SET TRUE` callback membership inside its transaction, uses `SET LOCAL ROLE tapflow_wallet_callback` to define callback-owned `SECURITY DEFINER` functions, then revokes only that current-grantor membership after resetting the role and removing callback schema-create access.
- retained `PUBLIC` execution revokes and explicit migration/API-role execution grants. The no-login callback owner continues to execute financial operations under forced RLS, including the internal per-user expiry call made by wallet reserve.
- added a focused SQL regression for role-switch ordering, callback ownership by creation, function execution ACLs, and final safe membership restoration. Live acceptance remains pending: deploy the committed source first, then apply checksum-matched SQL Editor bundles separately in `000044` then `000045` order if server database paths remain unavailable.
- personal-wallet write mode remains blocked by 301.2 legacy reserved credits until reconciliation and a clean dry run report matched totals with no active reservations.

## 2026-07-28 - Supabase Migration Connection Implementation

- implemented the tools-profile `tapflow-migrator` boundary so Supabase Direct/Session credentials are available only to one-shot database CLIs; API and Worker remain on Transaction Pooler port 6543.
- added a static Compose regression that verifies `MIGRATION_DATABASE_URL` never enters shared, API, or Worker configuration, plus placeholder-only Compose rendering inputs.
- updated staging and production deployment references with the port 5432 migration connection, compiled schema/wallet commands, Worker shutdown gate, and credential-handling rules.
- local verification passed: focused Compose tests (2), DB tests (20 passed and 33 database-dependent skips without local `DATABASE_URL`), Compose rendering, DB/API/Worker package builds, and the root production build. Existing Browserslist, dynamic-import, and chunk-size warnings remain unchanged.
- live acceptance of migrations `000044` and `000045` remains pending server configuration of `MIGRATION_DATABASE_URL`. Personal-wallet write mode remains blocked until the 301.2 legacy reserved credits are reconciled and the wallet dry run reports zero active reservations with matched totals.

## 2026-07-28 - Supabase Migration Connection Design

- staging diagnostics confirmed `DATABASE_URL` uses the Supabase transaction pooler on port 6543, which terminates the role and function-ownership DDL in migration `000044`; migrations `000042` and `000043` are recorded, while `000044` and `000045` remain unapplied.
- approved a separate `MIGRATION_DATABASE_URL` backed by Supabase Direct or Session Pooler port 5432 and a one-shot Compose `tapflow-migrator` tools-profile service. The direct credential will not enter long-running API or Worker containers, while local development continues to use the existing `DATABASE_URL` flow.
- recorded the design in `docs/superpowers/specs/2026-07-28-supabase-migration-connection-design.md`. Legacy reservation reconciliation remains a separate gate: staging currently has 301.2 credits marked reserved in grants, including 101.2 credits tied to 32 terminal failed reservations and 200 credits without matching active reservation rows.

## 2026-07-27 - XunhuPay Personal Wallet Implementation In Progress

- implemented schema/RLS, personal-wallet accounting, immutable billed-user workflow ownership, balance migration tooling, signed checkout/callback, expiry sweep, and the initial personal billing UI on branch `codex/xunhupay-personal-wallet`.
- repaired PostgreSQL 17 `CREATEROLE` handling in `000042_xunhupay_personal_wallet.sql`: staging diagnostics showed that the non-superuser migration account receives PostgreSQL's non-removable bootstrap-superuser membership when it creates `tapflow_wallet_callback`. The final guard now permits only that exact `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE` automatic grant and still rejects every inheritable, settable, foreign, or differently granted membership. A failed staging attempt rolled back cleanly (`MEMBERSHIPS=[]`, wallet tables absent, migration unrecorded); a server rerun is still required.
- hardened both idle and checked-out PostgreSQL connection handling after Supabase terminated migration sessions between committed migrations. Staging confirmed migrations `000042` and `000043` were safely recorded before the first disconnect; a second run proved the disconnect can occur while `pg-pool` has removed its idle listener from a borrowed Client. `runMigrations` now owns a checked-out Client listener, logs only sanitized error fields, and destroys the failed connection on release so later migrations can acquire a replacement connection.
- repaired the mobile XunhuPay return path: each new checkout now adds its opaque `paymentId` to the configured billing return URL, allowing `/billing` to resume bounded, server-authoritative status polling after the provider redirect; an invalid configured return URL becomes a safe server configuration error.
- completed creator-facing activity labels for the new wallet ledger entries: historical migration credit is positive, while expiry and payment refund have explicit labels.
- completed the remaining local admin/payment UX safeguards:
  - administrators can now edit and persist recharge-plan display ordering;
  - the admin payment list exposes a server-derived `eligible` flag only when the corresponding paid grant remains entirely unused and unreserved; the UI requires that flag and a non-empty reason before enabling a refund;
  - checkout QR codes render on desktop only, while mobile remains redirect-based; the panel also safely handles environments without `matchMedia`;
  - bounded payment polling is covered by a regression test that stops after 20 attempts.
- current work also includes XunhuPay query/refund transport, platform payment routes, reconciler scheduling, and payment observability. These changes remain un-deployed and real merchant payment/refund acceptance has not been performed.
- corrected the remaining redeem path so redeemed credits now enter the personal wallet ledger rather than the legacy tenant billing ledger; focused API regression coverage verifies the cutover.
- staging cutover remains gated by database backup, a clean migration dry run, worker shutdown, and explicit merchant credentials configured only in `/opt/aittco/env/tapflow.staging.env`.
- local compiled migration dry-run was attempted on 2026-07-27 and stopped safely before any database access because `DATABASE_URL` is not configured in this workspace. Staging evidence is still required for migration totals and payment acceptance.
- focused local regressions for the return and activity repairs passed: `npm run test --workspace @aigc-flow/api -- xunhu-client.test.ts` (5 tests) and `npm test -- src/billing/billingActivity.test.ts` (3 tests).
- current local validation also passed package builds for DB, Redis, API, Worker, and frontend; full DB/API/Worker test suites; and focused payment UI tests. DB-backed acceptance remains skipped locally without `DATABASE_URL`.
## 2026-07-27 - Brevo Email And Device Verification

- changed v2 registration so a user, tenant, and membership may be prepared, but no auth session or access/refresh tokens are issued until the emailed six-digit code is verified;
- made historical accounts with `email_verified_at IS NULL` complete the same email verification on their next valid password login;
- added password-login device verification for missing, unknown, expired, revoked, or anomalous trusted devices. Trust lasts 30 days. An existing trusted device is treated as anomalous only when both its normalized browser/OS fingerprint and IP network change;
- added migration `000054_auth_email_device_verification.sql` with hashed, expiring email challenges and hashed trusted-device tokens. `auth_trusted_devices` is intentionally account-scoped without `tenant_id`; both tables are server-only pre-auth records and are not exposed as tenant resources;
- added Brevo transactional delivery with a ten-second timeout and sanitized delivery errors. `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, and `BREVO_FROM_NAME` are server-only variables injected through `docker-compose.staging.yml`; no real credentials are stored in the repository;
- added shared login/register verification UI with six-digit input, invalid-code reset/focus behavior, 60-second resend cooldown, resend error recovery, and navigation only after successful verification;
- stores the opaque trusted-device token in browser `localStorage` under `v2-trusted-device-token`, an explicitly accepted XSS exposure risk. The token is random, stored hashed on the server, and cannot authenticate without the account password;
- validation completed on 2026-07-27:
  - focused frontend auth tests passed: 5 files, 21 tests. Existing `AuthProvider` React `act(...)` warnings remain;
  - focused API auth/env tests passed: 30 tests; 12 database-backed auth tests skipped because local Postgres was unavailable;
  - focused DB migration/IAM/migrator suite discovered 6 tests and skipped all 6 because no local database environment was available. No database integration pass is claimed;
  - full API suite passed 255 tests and skipped 126 infrastructure-dependent tests;
  - root `npm test` completed with 1,409 passed, 175 skipped, 24 failed, and 4 unhandled errors. Failures were outside this auth change in legacy migration/path assertions, S3 presigning, AI Gateway multipart tests, missing ResizeObserver test support, and existing Workbench/Canvas Agent expectations; no full-root-suite pass is claimed;
  - `npm run build --workspace @aigc-flow/db`, `npm run build --workspace @aigc-flow/api`, and `npm run build` passed. The root build retained existing Browserslist, mixed dynamic-import, and large-chunk warnings;
  - Compose rendering validation passed with non-secret Brevo test values via `docker compose -f docker-compose.staging.yml config --quiet`; warnings only identified unrelated unset local staging variables;
  - repository audit found only server environment parsing, Brevo request construction, hashed database fields, centralized frontend request/storage types, documentation markers, and test placeholders. No real Brevo key or auth-token logging was found.
- pending operational validation: deploy migration `000054` in the documented worker-stop order, then complete the staging real-mail registration, same-device login, new-device login, resend cooldown, and secret-free log smoke checklist. No staging deployment or real Brevo message was performed in this local task.
## 2026-07-27 - XunhuPay Personal Wallet Approved Design

- completed and approved the product and technical design for real XunhuPay recharge payments backed by a global personal AI-credit wallet:
  - one wallet per `user_id`, shared across every workspace the user accesses;
  - workspace/project/workflow attribution remains on usage records, while reserve, settle, refund, and expiration charge the initiating user's wallet;
  - fixed launch plans are CNY 9.90 / 100 credits, CNY 50 / 700 credits, CNY 100 / 1,500 credits, and CNY 200 / 3,300 credits;
  - platform system administrators control plan price, credit quantity, active status, ordering, and validity; launch validity is 365 days and each payment stores a non-retroactive commercial snapshot;
  - XunhuPay checkout, signed asynchronous callback, order query/reconciliation, exactly-once crediting, immutable ledger entries, earliest-expiry-first allocation, expiration, and admin-only full refunds are defined end to end;
  - existing workspace balance migrates idempotently to the workspace owner's personal wallet, preserving source-grant expiry and retaining old tenant billing records as read-only audit history;
  - the existing workspace membership discount model remains outside this redesign and continues to price a run before the discounted amount is charged to the personal wallet.
- selected a new personal-wallet ledger and controlled cutover instead of rewriting historical tenant billing rows or retaining permanent dual wallets.
- recorded required RLS, callback privilege boundaries, API surfaces, frontend behavior, environment variables, tests, migration verification, Docker Compose v2 deployment order, and post-cutover rollback posture.
- design specification:
  - `docs/superpowers/specs/2026-07-27-xunhupay-personal-wallet-design.md`
- implementation plan completed after specification approval:
  - `docs/superpowers/plans/2026-07-27-xunhupay-personal-wallet.md`
  - the plan defines 13 TDD tasks covering schema/RLS, personal-wallet accounting, immutable workflow billing ownership, tenant-balance migration, XunhuPay signing and callbacks, reconciliation/refunds, expiry sweeping, user/admin UI, deployment cutover, full verification, and real-payment staging acceptance;
  - implementation and staging execution remain pending selection of the execution mode.

## 2026-07-22 - Prompt Library Lifecycle, Bilingual Prompts, And Media Variants

- completed prompt lifecycle management: drafts can be published, archived, or permanently deleted; published records save in place and can be taken down/archived; archived records can be restored or permanently deleted. Published deletion is rejected server-side until a state transition occurs.
- added fixed category management including `video`, read-only auto-generated external keys under advanced settings, status filtering, drag/keyboard ordering, dirty-state feedback, and status-specific actions. Raw numeric sort weights are no longer exposed.
- added independent Chinese and English prompt fields with at-least-one validation, bilingual search, active-language copy/reference behavior, and legacy `prompt_text` compatibility/backfill.
- kept prompt media in the dedicated server folder and added 640px WebP thumbnails plus 1600px WebP previews. New uploads create variants immediately; an idempotent migration covers historical originals.
- changed plaza cards to intersection-driven thumbnail loading through a four-request cache with in-flight deduplication. Detail images use previews and load originals only for zoom; authenticated responses now use immutable private caching, ETags, and 304 responses.
- added staging dry-run/write instructions for media backfill and original-file fallback behavior.
- validation before handoff:
  - focused prompt schema, service, route, migration, client, admin, cache, card, plaza, detail, and canvas-reference coverage passed on 2026-07-22: 17 test files, 82 tests, with no React `act(...)` warnings.
  - `npm run build --workspace @aigc-flow/db`, `npm run build --workspace @aigc-flow/api`, and `npm run build` passed. The frontend build retained the existing CSS-property, mixed dynamic-import, and large-chunk warnings.
  - `npx tsc -p tsconfig.json --noEmit` was executed but remains red because the root config includes extensive pre-existing full-repository test and legacy-module type failures across Agent, StoryAI, video, workspace, and other unrelated areas. The affected DB/API package builds and root production build are green.
  - `npm run prompts:backfill-variants -- --dry-run --concurrency 4` was executed locally and stopped before scanning because no local `DATABASE_URL` is configured. Migration logic is covered by four focused tests, including non-overwrite and missing-original behavior; live processed/generated/skipped/failed counts remain a server deployment check.
  - a Chromium acceptance fixture using the production prompt components passed at 1440x900 and 390x844. It verified four-column intrinsic-ratio masonry, thumb-only plaza requests, preview detail requests, original-only zoom, bilingual search/copy/reference, draft archive, published in-place save, ordering, mobile restore/delete actions, fixed mobile footer geometry, zero horizontal overflow, and zero console errors.
  - browser artifacts are under `output/playwright/prompt-acceptance/` and remain untracked.
- final audit follow-up added the missing draft-to-archive action, preserved complete ordering when a status filter is active, restored negative-prompt editing, aligned the copy menu with shared menu behavior, and made new thumbnail/preview writes exclusive so derived files are never overwritten.
- commit `57170485` was initially pushed without rerunning local checks at the user's request; the subsequent audit recorded above completed the focused tests, affected builds, and browser acceptance before this final handoff.

## 2026-07-22 - Prompt Detail Modal Upgrade

- replaced the standalone prompt detail page with a portal modal over the still-mounted prompt plaza while retaining shareable `/prompts/:promptId` URLs.
- grouped plaza and prompt-detail URLs under one route transition key; in-plaza opens add a history marker so Browser Back closes the modal, while direct detail URLs close to `/prompts` with current filters preserved.
- replaced the fixed four-cell square gallery with one intrinsic-ratio main image and an exact-count thumbnail rail only when multiple real media items exist; single-image prompts no longer show empty synthetic slots.
- added image-only zoom, body scroll lock, focus trapping/restoration, backdrop and Escape dismissal, and layer-aware project-picker dismissal.
- kept reference as the primary action, copy as the secondary action, and favorite as a compact icon action. Mobile uses a full-screen scrolling detail with a viewport-fixed bottom action bar; desktop keeps the approximate 62% media / 38% information split.
- validation:
  - focused route, history, prompt card, plaza, and modal regressions passed: 5 test files, 15 tests.
  - `npm run build` passed with the existing Browserslist data-age, CSS utility, dynamic-import, and chunk-size warnings.
  - real-browser fixture smoke confirmed one intrinsic-ratio image with no thumbnails, two real thumbnails for a two-image prompt, a 61.8% / 38.2% desktop split, preserved plaza DOM behind the modal, mobile fixed footer geometry, no horizontal overflow, and no browser console warnings or errors.

## 2026-07-22 - Prompt Plaza Masonry Layout

- replaced the standalone prompt plaza's fixed-row grid with responsive CSS multi-column masonry at one, two, three, four, and five columns across the existing breakpoints.
- changed full plaza cards to display each loaded effect image at its complete intrinsic aspect ratio, including unusually tall poster images, without `4:3` cropping or a maximum-height cap.
- retained fixed `4:3` covers for compact canvas prompt cards and missing-image placeholders so narrow panels and empty states remain stable.
- kept prompt search, filters, detail navigation, favorites, copy, reference, authenticated media loading, APIs, and storage behavior unchanged.
- validation:
  - focused prompt plaza and card regressions passed: 2 test files, 4 tests.
  - `npm run build` passed with the existing Browserslist, CSS utility, dynamic-import, and chunk-size warnings.
  - browser smoke with the production `PromptCard` confirmed five desktop columns and one narrow-screen column across eight portrait, landscape, square, and extra-tall images; every rendered ratio matched its intrinsic ratio, with no card overlap, horizontal overflow, or console errors.

## 2026-07-21 - Prompt Catalog Local Media

- moved prompt-catalog effect media away from the asset/S3 relationship to a dedicated, API-mounted server directory. Prompt media records now use generated local storage keys and metadata; frontends read bytes through authenticated prompt-media endpoints rather than public/static URLs.
- added prompt-library controls for saving a draft before upload, attaching up to four JPG/PNG/WebP effect images, changing display order, and deleting media. Publishing requires at least one local effect image.
- made desktop primary navigation labels non-wrapping and compact at normal desktop widths so `提示词广场` remains one line at 100% browser zoom.
- deployment requires a persistent host directory mounted into `tapflow-api` and included in server backups; it does not use object storage.
- corrected the local-media migration order after staging PostgreSQL rejected `asset_id DROP NOT NULL` while the legacy `(prompt_id, asset_id)` primary key still existed. The migration now removes the legacy primary key first, then makes `asset_id` nullable, and finally installs the new media-ID primary key.

## 2026-07-21 - Admin Prompt Library FileUp Black-screen Fix

- restored the missing `FileUp` icon import in `AdminPage`, preventing the statically loaded admin route module from throwing `ReferenceError: FileUp is not defined` and blanking the application during startup.
- added a focused module-load regression test so future admin-tab icon registration cannot reintroduce the same startup failure unnoticed.
- validation:
  - focused admin and prompt-library tests passed: 2 test files, 2 tests.
  - `npm run build` passed with the existing Browserslist, CSS utility, dynamic-import, and chunk-size warnings.

## 2026-07-20 - Official Prompt Plaza

- added the authenticated `/prompts` catalog and `/prompts/:promptId` detail experience with search, category filters, effect-gallery media, copy, favorites, and project-picker reference actions.
- added official prompt entries, prompt media, tenant-scoped favorites, interaction events, permissions, indexes, and RLS policies through migration `000039_prompt_plaza.sql`.
- reference now creates a new image node carrying only prompt text and source metadata; it deliberately preserves the canvas's current model, route, and generation parameters. Standalone references use a request ID to ensure a navigation is inserted at most once.
- added a compact prompt panel to the canvas dock and a protected admin prompt-library tab for draft creation, editing, publishing, archiving, and JSON draft import.
- prompt effect images use a dedicated short-lived signing endpoint that only signs media linked to a published prompt visible to the requesting tenant; generic asset access remains tenant-scoped.
- validation:
  - focused prompt client, plaza card, canvas reference, project insert, canvas panel, and admin-library tests passed: 29 tests.
  - API prompt schema tests passed: 4 tests.
  - API dependency packages and API build passed; root production build passed with the existing Browserslist, CSS utility, dynamic-import, and chunk-size warnings.

## 2026-07-20 - Restore Panorama Generation Without Source Text Prompt

- removed the incorrect `sourcePromptAvailable` submission gate from the 360 panorama popover. Panorama generation uses the connected reference image and builds its own panorama prompt when creating the target node, so an uploaded or image-only source no longer shows `缺少生成提示词` or disables `生成全景`.
- retained model, route, size, aspect-ratio, billing, workflow, and target-node prompt construction behavior.
- validation:
  - panorama popover regression passed: 4 tests.
  - image-node panorama, store, and related interaction regression passed: 32 tests.

## 2026-07-20 - Chinese Nine-grid Template Prompts

- translated the natural-language instructions for all nine image-template tools into production-oriented Chinese while preserving grid notation, keyframe labels, timing, shot abbreviations, template identities, and aspect-ratio behavior.
- changed the appended prompt heading to `用户补充要求：` so the prepared confirmation node is fully readable and editable in Chinese.
- kept model selection, route selection, parameter inheritance, idle node preparation, workflow submission, billing, and backend contracts unchanged.
- validation:
  - focused template, graph preparation, and image-node interaction regression passed: 3 test files, 26 tests.
  - `npm run build` passed with the existing Browserslist age, CSS utility, dynamic-import, and chunk-size warnings.

## 2026-07-19 - Nine-grid Toolbar Confirmation Flow

- moved the nine-grid image template tools out of the selected-image More menu into a standalone `Grid3X3` toolbar action immediately before More; Quick Split remains in More as a separate local image operation.
- extracted the template list into a shared-density, body-level menu that retains the existing 38px rows, 12px labels, high image-menu z-index, outside-click dismissal, Escape dismissal, and mutually exclusive toolbar-layer behavior.
- changed template selection to prepare and select an idle downstream image node with the source connection, resolved template prompt, template ratio policy, and inherited model, route, size, quality, and compatible parameters.
- removed immediate workflow submission from template selection. Billing and generation begin only after the user reviews the existing image prompt/model/parameter panel and clicks its generate button.
- validation:
  - focused main-workspace menu, template helper, graph preparation, and image-node integration regression passed: 5 test files, 29 tests.
  - `npm run build` passed with the existing Browserslist age, CSS utility, dynamic-import, and chunk-size warnings.
  - the complete main-workspace `npm test -- --exclude ".worktrees/**"` run did not finish within 300 seconds and returned no actionable failure output; no full-suite pass is claimed.
  - local Vite loaded successfully at `http://127.0.0.1:5188`; the real-browser canvas smoke was not run because the local API/database were not running and the app correctly redirected the unauthenticated browser to `/login`.

## 2026-07-19 - LibTV-Style Video Mode Menu

- moved the video generation-mode control from the reference strip into the bottom video toolbar, between model selection and the inline parameter capsule.
- rebuilt its popup as an upward-opening compact LibTV-style menu with a Chinese title, icon-only five-mode rows, selected-row highlight, disabled-state tooltip, and no visible explanatory copy.
- preserved the five existing generation modes, route capability restrictions, selection contract, and Escape/outside-click dismissal without touching the generation API, workflow, billing, or persisted node data.
- validation:
  - focused mode/composer regression passed: 19 tests.
  - broader video/node regression passed: 25 test files, 148 tests.
  - `npm.cmd run build` passed with the existing Browserslist, dynamic-import, and chunk-size warnings.

## 2026-07-19 - Compact Video Parameter Surface

- reduced the video parameter popover to a 350px maximum width, approximately 73% of the prior 480px surface, while preserving mobile viewport clamping and fixed Portal placement.
- compressed ratio cards from 94px to 70px, segmented controls from 40px to 36px, section gaps from 16px to 12px, and adjacent duration controls without using CSS scale transforms.
- retained all capability constraints, keyboard behavior, disabled explanations, current parameter values, and generation data contracts.
- validation:
  - compact parameter regressions passed: 9 tests.
  - broader video/node regression passed: 25 test files, 148 tests.
  - `npm.cmd run build` passed with the existing Browserslist, dynamic-import, and chunk-size warnings.

## 2026-07-18 - Inline Video Parameter Capsule

- replaced the standalone `参数` button and the full-width second-row summary with one LibTV-style parameter capsule in the bottom video toolbar.
- the capsule shows ratio, resolution, duration, and quantity from the normalized current params; audio state uses an accessible speaker icon (`Volume2` when enabled and `VolumeX` when disabled) instead of visible text.
- retained model-menu mutual exclusion, model capability correction, Escape/outside-click dismissal, focus restoration, and responsive toolbar wrapping without touching workflow, billing, APIs, or persisted video data.
- validation:
  - focused composer regression passed: 15 tests.
  - broader video/node regression passed: 25 test files, 147 tests.
  - `npm.cmd run build` passed with the existing Browserslist, dynamic-import, and chunk-size warnings.
  - real-browser smoke screenshots confirmed the inline closed and opened capsule states under `output/playwright/video-node-inline/` (untracked).

## 2026-07-18 - Video Parameter Summary And Visible Duration Rail

- added a LibTV-style bottom parameter summary that stays synchronized with the current ratio, resolution, duration, quantity, and audio state; clicking it reopens the same parameter surface.
- added an explicit duration progress percentage and a visible blue/gray range rail for WebKit and Firefox, so the 4-15 second slider no longer renders as a floating thumb.
- validation:
  - focused video regression passed: 6 test files, 55 tests.
  - direct browser smoke page showed the synchronized summary and a visible duration rail in the opened parameter dialog; screenshot saved under `output/playwright/video-node-visual/parameters-current.png` (untracked).
  - full visual smoke script timed out in the local Windows browser harness before producing its six-shot result; this remains an environment limitation, not a passing claim.

## 2026-07-17 - Video Duration Slider And Parameter Layering Fix

- changed the unconfigured/unconfirmed video capability fallback from `2-8` seconds to `4-15` seconds with a one-second step; route-confirmed model minimum, maximum, and step values remain authoritative.
- rebuilt the duration section as a compact LibTV-style single row with a flexible range slider and a small numeric seconds field, removing the redundant minimum/maximum text row and nested panel surface.
- moved the video parameter panel into a body Portal with fixed positioning, 16px viewport clamping, above/below placement, resize/scroll repositioning, and z-index `10020`, so canvas nodes, handles, toolbars, and tooltips cannot cover it.
- preserved model/parameter mutual exclusion, outside-click and Escape dismissal, focus restoration, capability correction, and generation preflight boundaries.
- validation:
  - focused video regression passed: 25 test files, 145 tests.
  - `npm.cmd run smoke:video-node` passed with `durationRangeIsDefault: true`, `parameterDialogIsTopLayer: true`, and `status: ok`.
  - `npm.cmd run build` passed with the existing Browserslist, dynamic-import, and chunk-size warnings.
  - `npm.cmd run smoke:video-node-visual` timed out after 180 seconds in the local browser environment and produced no new visual artifacts; the functional smoke completed in a real browser and directly verified both reported regressions.

## 2026-07-17 - Video Node Visual Fidelity Rebaseline

- migrated the worktree video camera manifest to version 2 and copied 23 commercially authorized DramaClaw MP4 previews into `public/video-camera-library/v2/`; stable motion IDs remain unchanged and runtime validation requires local H.264 paths with the authorization source marker.
- removed the active local camera-media generation commands and generator sources. Reduced-motion cards use the same source MP4 without autoplay instead of generated posters.
- added `scripts/smoke-video-node-visual.ts` and its contract test. The script defines six independent viewport states and validates Chinese UI copy, mojibake absence, composer bounds, seven ratios, four resolutions including `4K`, 23 camera cards/four columns, two palette groups/five tones, and narrow/mobile overflow.
- updated the existing smoke selectors to the Chinese UI and segmented controls, and corrected stale catalog/panorama test expectations (`视频模型 1`, canonical `1K`).
- validation:
  - `npm.cmd test -- scripts/smoke-video-node-visual.test.ts` passed: 2 tests.
  - focused video and workflow regression passed after the stale expectations were corrected.
  - `npm.cmd run build` passed with existing Browserslist, dynamic-import, and chunk-size warnings.
  - `npm.cmd run smoke:video-node` passed after aligning the smoke fixture with the Chinese catalog fallback (`视频模型 1`), the current duration labels, and the `1 个/2 个/4 个` quantity labels. It reported `status: ok`, 23 camera cards, four desktop columns, `4K`, reduced-motion pause, and zero blocked workflow requests.
  - `npm.cmd test -- src/flowCanvas/video scripts/smoke-video-node.test.ts scripts/smoke-video-node-visual.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/utils/canonicalGraph.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx src/services/v2AiModelCatalogApi.test.ts` passed: 27 test files, 160 tests.
  - `git diff --check` passed; a production-source scan found no provider secrets, signed media URLs, or third-party remote video references.
  - real screenshot execution is currently blocked by the environment: npm cannot download `@playwright/cli`, and installed Chrome/Edge exit without exposing a DevTools port. No screenshot artifacts are claimed until a browser runtime is available.

## 2026-07-17 - LibTV-Style Video Node UI And Interaction Release Verification

- completed the frontend-only LibTV-style video-node experience: v2 catalog-filtered product-model selection, five video modes, capability-corrected ratio/resolution/duration/audio/count parameters (including `4K`), role-based references, context/visual-tone palettes, human-review state, and fail-closed generation preflight.
- added 23 TapFlow-original camera-motion previews with stable IDs, local WebP/WebM media, a four-column desktop library, and reduced-motion poster rendering. The model list intentionally has no search field and reveals descriptions only for hovered, focused, or selected choices.
- kept the Phase 1 boundary intact: no real Seedance/Kling/Veo adapter, worker/API/database migration, provider credential, billing-quantity, or pricing mutation was introduced. Missing active `video_generation` capability or pricing remains blocked before `runBackendWorkflow`.
- completed the real-browser smoke harness using `VideoNodeComponent`, `@xyflow/react`, and the flow store. Each desktop (`1440x900`), narrow (`1024x768`), and mobile (`390x844`) assertion now uses an isolated browser context so canvas transforms cannot leak across viewports. It verifies the composer framing, model list/hover description, parameter controls and `4K`, 23 camera cards in four desktop columns, reduced-motion posters, and the blocked-generation no-request boundary. Artifacts are written under `output/playwright/video-node/` and are intentionally untracked.
- fixed a real mobile layout regression found by the smoke: the composer was changed to `position: relative` at narrow widths, which made it a second `nodeWrapper` flex-row child and placed it after the 380px video card. It remains absolutely positioned on mobile and anchors at the node left edge, preserving the viewport-bounded composer width without changing node dimensions.
- validation:
  - `npm run test:video-camera-assets` passed: 2 tests.
  - `npm test -- src/flowCanvas/video/VideoNodeComposer.test.tsx scripts/smoke-video-node.test.ts` passed: 11 tests.
  - `npm run smoke:video-node` passed: all desktop/narrow/mobile checks, 23 cards, four columns, `4K`, reduced-motion posters, and zero blocked workflow requests.
  - the Task 10 focused aggregate had 116 passing tests and one pre-existing unrelated panorama assertion failure in `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`: it expects `params.size: "1k"`, while current behavior produces canonical `"1K"`. This video-node change does not touch panorama generation.

## 2026-07-12 - Source-Level Mojibake Remediation

- restored the canvas toolbar's source-level UTF-8/GBK mojibake, including project-menu, save-status, notification, and deletion-confirmation copy shown in the main canvas experience.
- updated the toolbar and workspace regression tests to assert readable Chinese labels, and added a focused toolbar regression that opens the project menu through the intended accessible name.
- repaired confirmed historical mojibake in this project record, including user-facing label references and malformed smart quotes; runtime data, API payloads, database records, and provider configuration were not changed.
- ran a repository-wide read-only GBK-to-UTF-8 reversibility scan across product source, tests, scripts, documentation, and this record; it reported `candidates=0` after the repair.
- validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx` passed: 8 tests.
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/agent/useAgentConversationHistory.test.tsx src/workspace/WorkspacePage.test.tsx` passed for the toolbar, workspace, and agent-history suites; one pre-existing panorama assertion still expects `size: "1k"` while the current node data returns `size: "1K"`.
  - `npm run build` passed with existing Browserslist, dynamic-import, and chunk-size warnings.
  - the full `npm test` baseline also retains unrelated existing failures, including missing `ResizeObserver` support in production-studio tests and the same panorama size assertion.

## 2026-07-12 - GPT-Image-2 Secure Route Import And Draft Testing

- added a production-image-compatible one-time importer for the MouxiHub async and PixelleLabs sync GPT-Image-2 lines. It reads the two server-only environment variables only during `--apply`, encrypts each API key into a distinct CredentialVault credential, creates a separate platform connection for each route, and leaves both routes and prices inactive until tested.
- added an explicit `--publish <default-route-key>` command that activates the imported lines only when both current route revisions have passed health tests, then activates matching pricing and selects the requested default line.
- added an explicit `--test` command for inactive imported routes because canvas route menus correctly exclude unpublished lines. It tests both provider connections server-side and records the same tested-revision guard used by publication.
- updated the importer-only GPT-Image-2 test budget to five minutes per line. General Model Center route tests remain capped at 30 seconds, while the importer now matches the production timeout needed by the two selected image providers.
- aligned canvas display pricing with the imported GPT-Image-2 routes: MouxiHub official is fixed at 12 credits and PixelleLabs stable is fixed at 3 credits for every supported size, matching server-side route pricing.
- fixed administrator draft route testing so a server-side test can resolve its exact inactive platform route by ID. Normal runtime selection remains restricted to active routes.
- documented one-time importer variables and the server dry-run/apply/test/publish sequence without committing secrets or injecting those API keys into long-running API/Worker containers.
- validation:
  - `node --test scripts/import-gpt-image-2-routes.test.mjs` passed: 2 tests.
  - `node --check scripts/import-gpt-image-2-routes.mjs` passed.
  - `npm run test --workspace @aigc-flow/api -- ai-route-tests.service.test.ts` passed: 4 tests.
  - `npm run test --workspace @aigc-flow/ai-gateway-core` passed: 97 tests.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed.
  - `npm run build` passed with the existing Browserslist, dynamic-import, and chunk-size warnings.
  - API build in the isolated worktree remains blocked by pre-existing missing workspace links for `@aigc-flow/redis`, `@aigc-flow/storage`, and `@aigc-flow/workflow-core`; the new AI route test type error is not present.

## 2026-07-10 - Panorama Generator Configuration Panel

- kept the image-node floating toolbar as the 360 panorama generation entry and removed the misleading bottom generation-mode selector from the image prompt bar.
- upgraded the 360 panorama popover into a full generation panel with model, route, size (`1K`, `2K`, `4K`), and panorama ratio (`2:1`, `21:9`) controls.
- changed panorama target-node creation to use the explicit popover selections for `modelId`, `routeKey`, `size`, and `aspectRatio` instead of inheriting those settings silently from the source image node.
- appended panorama debug context to launch/provider failure messages, including `routeKey`, `modelId`, `size`, and `aspectRatio`.
- validation:
  - `npm test -- src/flowCanvas/panorama/PanoramaGeneratePopover.test.tsx src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run build`

## 2026-07-10 - Panorama Prompt, Ratio, And Failure Diagnostics Fix

- changed panorama target-node creation so the new node visibly carries a panorama-specific generation prompt instead of silently reusing the source prompt text.
- made newly created panorama target image nodes adopt the selected canvas ratio immediately, including `aspectRatio`, `width`, `height`, `naturalWidth`, and `naturalHeight` for `2:1` and `21:9`.
- upgraded failed panorama node messaging for both snapshot recovery and live stream events to include sanitized `providerDetails` plus `routeKey`, `modelId`, `size`, and `aspectRatio`, making upstream connection failures diagnosable from the node itself.
- refined the panorama prompt again so the target node no longer copies the source node text prompt; it now tells the model to use the connected reference image as the only scene source.
- enriched OpenAI-compatible provider pre-response failures with structured fetch cause details such as `code`, `hostname`, `port`, and `syscall`, so server-side network or endpoint failures are easier to diagnose from the node error.
- validation:
  - `npm test -- src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/panorama/PanoramaGeneratePopover.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build`

## 2026-07-10 - GPT-Image-2 Panorama Capability Backfill

- added GPT-Image-2 `panorama_360`, `wraparound_270`, and `subject_orbit_270` production-mode capabilities to the model-level plugin manifests for the primary GPT-Image-2 package plus Mouxihub lines three and four, so model-scoped route catalogs do not depend only on per-route request config.
- added database migration `000037_backfill_gpt_image_2_panorama_modes.sql` to backfill existing GPT-Image-2 `ai_models`, `ai_model_catalog`, and `ai_routes.request_config.capabilities.supportedGenerationModes` rows.
- strengthened the panorama production prompt with DramaClaw-style constraints for 2:1 equirectangular output, seamless left/right continuity, fixed-camera full-scene interpretation, and avoiding flat wide-angle stills.
- validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts`
  - `npm run build --workspace @aigc-flow/db`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm test -- apps/api/test/ai-plugins.service.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core`
  - `npm run test --workspace @aigc-flow/db`
  - `npm run build`

## 2026-07-10 - Panorama Generator Select Interaction Fix

- fixed the 360 panorama generator popover so nested model, route, and size menus no longer close the parent generator panel when clicked.
- normalized panorama target node size params to uppercase `1K`/`2K`/`4K`, matching GPT-Image-2 plugin sizing and pricing tiers while preserving the existing UI selection values.
- refreshed the panorama generator regression test to avoid corrupted label text and added coverage for nested select interaction.
- validation:
  - `npm test -- src/components/menu/useDismissibleLayer.test.tsx`
  - `npm test -- src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm test -- src/flowCanvas/panorama/PanoramaGeneratePopover.test.tsx`

## 2026-07-10 - Panorama 360 Image-Node Toolbar Fix

- moved the panorama generation entry out of the canvas top chrome and back into the selected image node floating toolbar, matching the current product UX.
- kept the 360 generate popover wired to the existing `2:1` and `21:9` target-node workflow path and billing preflight, with the selected node switching into `panorama_360` mode when the route supports it.
- tightened the regression test to use a 360-capable image route so the panorama mode does not get auto-reset during the test harness.
- validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
  - `npm run build`

## 2026-07-09 - Panorama 360 Toolbar Relocation And Viewer Polish

- moved the panorama generate entry fully into the canvas top toolbar for the currently selected image node, with the same `2:1` and `21:9` popover flow and the existing v2 target-node workflow/billing path.
- removed the duplicate panorama generate entry from the image-node floating toolbar so the UI now has a single, clear entry point.
- localized the panorama viewer node controls to Chinese labels and kept the zoom controls from flashing a loading state when the FOV changes.
- validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/PanoramaViewerNode.test.tsx src/flowCanvas/panorama/PanoramaViewer.test.tsx`
  - `npm run build`

## 2026-07-09 - Panorama 360 Topbar Entry And Viewer Size Fix

- restored the primary panorama generation entry to the canvas top toolbar, scoped to the currently selected image node, and removed the duplicate image-node floating-toolbar generate button.
- kept the existing v2 target-node workflow and billing path intact while continuing to offer `2:1` and `21:9` output selection from the topbar popover.
- hardened the panorama viewer node so old undersized nodes auto-upgrade to the large 900x540 working surface and cannot be resized below the viewer layout minimum.
- validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/PanoramaViewerNode.test.tsx`
  - `npm test -- src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
  - `npm run build` failed in this environment with JavaScript heap / memory allocation errors during Vite bundling

## 2026-07-09 - Panorama 360 Toolbar Entry And DramaClaw-Style Viewer Upgrade

- moved the primary 360 generation entry into the canvas top toolbar with `2:1` and `21:9` selection, keeping the existing v2 target-node workflow path and billing preflight intact.
- upgraded the panorama viewer node into a DramaClaw-style working surface with live FOV, sphere correction, front direction, fullscreen, and status controls while preserving the asset preview panorama shell.
- added current-view, 4-view, and 12-view panorama capture actions that upload standard asset-backed image nodes and auto-group multi-capture outputs on the canvas.
- validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/panorama/PanoramaGeneratePopover.test.tsx src/flowCanvas/panorama/panoramaViewerState.test.ts src/flowCanvas/panorama/panoramaCapture.test.ts src/flowCanvas/nodes/PanoramaViewerNode.test.tsx src/assets/AssetPreviewModal.test.tsx`
  - `npm run build`

## 2026-07-09 - DramaClaw Nine-Grid Toolbar Migration Phase 85

- migrated the DramaClaw-style `九宫格工具栏` feature set into the v2 TapFlow image-node path without introducing a separate legacy API or local-only canvas persistence:
  - image-node `更多` menu now includes a dedicated `九宫格工具` secondary panel instead of mixing the nine actions into the main row list.
  - the panel exposes all nine source-equivalent actions: `多机位九宫格`, `剧情推演四宫格`, `角色脸部三视图`, `产品三视图`, `25宫格连贯分镜`, `电影级光影校正`, `角色三视图生成`, `画面推演 - 3秒后`, and `画面推演 - 5秒前`.
  - each action preserves the source prompt semantics and aspect-ratio policy from DramaClaw, including `original`, `3:2`, and `16:9` handling.
- kept the runtime native to the current v2 architecture:
  - template actions now create a downstream image node through the existing canvas runtime instead of calling a new backend template-edit endpoint.
  - downstream nodes carry prompt/template metadata, reset generation mode to `standard`, preserve the active route/model selection, and launch through the existing `target_node` workflow run path.
  - billing remains on the current reserve/settle/refund workflow-run system; no frontend-side credit mutation was introduced.
- validation:
  - red tests observed on 2026-07-09:
    `npm test -- src/flowCanvas/utils/imageTemplateEditActions.test.ts src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/runtime/graphExecutor.test.ts`
    first failed because the template action registry did not exist, the image more-menu had no `九宫格工具` panel, and `runImageTemplateEdit` was not implemented.
  - `npm test -- src/flowCanvas/utils/imageTemplateEditActions.test.ts src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/runtime/graphExecutor.test.ts` passed on 2026-07-09: 3 files, 7 tests.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-09: 1 file, 33 tests.
  - `npm run build` passed on 2026-07-09 with existing Browserslist, css-minify `task` warnings, dynamic-import note, and chunk-size warnings only.

## 2026-07-09 - Panorama 360 Generation And Viewer Migration

- migrated the v2 TapFlow panorama path from a decorative placeholder into a working product flow without changing unrelated image/video/node behavior:
  - image nodes in `panorama_360` mode now use panorama-safe aspect ratios only: `2:1` and `21:9`.
  - successful panorama image runs now preserve panorama metadata on runtime asset refs and image nodes, and auto-create or reuse a linked `panorama_viewer` node on the canvas.
  - asset-library preview now detects panorama metadata and renders a real 360 viewer instead of a flat `<img>`.
  - image-node more menu now exposes a direct `360 全景查看` action for panorama-capable images, and the connection menu/canvas node registry now support `panorama_viewer`.
- wired the worker and AI gateway layers to match the frontend/runtime behavior:
  - worker asset persistence now accepts panorama asset metadata, stores it in `assets.metadata`, and returns it in persisted asset refs.
  - Nano Banana / Gemini image adapters and related plugin manifests now preserve and publish `2:1` aspect ratio support instead of coercing panorama requests back to `1:1`.
  - added `@photo-sphere-viewer/core` for the frontend 360 viewer wrapper.
- validation:
  - `npx vitest --run src/flowCanvas/rules/connectionRules.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/assets/AssetPreviewModal.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx` passed on 2026-07-09: 5 files, 54 tests.
  - `npm run test --workspace @aigc-flow/worker -- media-asset-store.test.ts` passed on 2026-07-09: 1 file, 6 tests.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts runtime.test.ts` passed on 2026-07-09: 2 files, 74 tests.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-09.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-09.
  - `npm run build` passed on 2026-07-09 with existing Browserslist, css-minify `task` warnings, dynamic-import note, and chunk-size warnings only.

## 2026-07-08 - StoryAI Director Project State Fidelity Phase 84

- fixed the project-level StoryAI 3D director desk state-loss regression that made source-project controls appear broken after TapFlow autosave/echo:
  - `normalizeDirector3dData` now preserves a sanitized `director3d.storyAiProject` snapshot instead of dropping it.
  - safe StoryAI scene/object/camera fields now survive the TapFlow project-level director desk path, including character color, sky/background color, labels, grid snap, ground toggle, ground opacity/height, panorama settings, camera-object visibility, active camera id, and panorama asset id.
  - transient browser media references such as `blob:`, `data:`, and signed/http URLs are still stripped before the canvas draft can persist, keeping the v2 asset/draft safety rule intact.
- strengthened regression coverage:
  - added direct normalizer coverage for preserving safe StoryAI project state while stripping live media URLs.
  - extended the project-level 3D director desk canvas test so updates from the StoryAI wrapper persist into `projectStudios.director3d` without creating a canvas node.
- validation:
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.project-director.test.tsx src/flowCanvas/utils/director3dNodeData.test.ts` passed on 2026-07-08: 2 files, 4 tests.
  - `npm test -- src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx src/flowCanvas/studios/storyAiDirectorAdapter.test.ts src/flowCanvas/utils/director3dNodeData.test.ts src/flowCanvas/canvas/AiFlowCanvas.project-director.test.tsx` passed on 2026-07-08: 4 files, 12 tests.
  - `npm test -- scripts/smoke-director-three-viewport.test.ts` passed on 2026-07-08: 1 file, 4 tests.
  - `npm run smoke:director3d` passed on 2026-07-08 with desktop/mobile reporting nonblank WebGL pixels, live panorama previews, live camera captures, sent captures, safe patches, and `status: ok`.
  - `npm run build` passed on 2026-07-08 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-08 - StoryAI Director Pose Recovery Phase 83

- fixed the StoryAI 3D director desk character pose system so pose presets and adjustments are no longer decorative:
  - the embedded UE mannequin pose application now canonicalizes GLB bone names before applying neutral rig rotations, body offsets, and pose controls.
  - this restores actual pose deformation for the current `ue-mannequin-retopology.glb`, whose bones use space-delimited names like `Bip001 Pelvis_03` instead of the underscore-delimited keys used by the pose rig maps.
- preserved pose state through TapFlow canvas draft snapshots:
  - `FlowDirector3dData.actors[*]` now carries a safe `poseControls` snapshot alongside the existing `pose` preset id.
  - the StoryAI adapter writes character rig control values back into `director3d` actor snapshots and rebuilds character rigs from those controls when reopening the director desk.
  - director draft normalization now keeps only finite numeric pose-control entries and strips malformed values.
- validation:
  - red test observed on 2026-07-08: `npm test -- src/flowCanvas/studios/storyai/editor/runtime/ue4Mannequin/ue4MannequinPoseApplication.test.ts` first failed because mannequin bones with space-delimited names never received pose rotations or pelvis offsets.
  - red test observed on 2026-07-08: `npm test -- src/flowCanvas/studios/storyAiDirectorAdapter.test.ts` first failed because director actor snapshots dropped pose-control values during the StoryAI <-> TapFlow adapter round-trip.
  - `npm test -- src/flowCanvas/studios/storyai/editor/runtime/ue4Mannequin/ue4MannequinPoseApplication.test.ts` passed on 2026-07-08: 1 test.
  - `npm test -- src/flowCanvas/studios/storyAiDirectorAdapter.test.ts` passed on 2026-07-08: 1 test.
  - `npm test -- src/flowCanvas/utils/director3dNodeData.test.ts` passed on 2026-07-08: 2 tests.
  - `npm test -- src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx` passed on 2026-07-08: 7 tests.
  - `npm run build` passed on 2026-07-08 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-08 - Project-Level 3D Director Desk Entry Phase 82

- changed the new 3D director desk entry from a canvas node creator into a project-level tool opener:
  - left add flyout keeps the same visible entry but moves `3D导演台` into the `工具` section.
  - clicking `3D导演台` from the left flyout or pane context menu now opens the default project director desk directly.
  - the action no longer inserts a visible `director3d` node into the canvas graph.
- added project-level director desk draft persistence:
  - canvas store now tracks `projectStudios.director3d` separately from `nodes`.
  - autosave, local draft recovery, frontend draft sanitization, API draft schema validation, and backend draft normalization preserve `projectStudios.director3d`.
  - legacy `director3d` nodes remain supported by the existing node-scoped open event for old saved projects.
- validation:
  - red tests first failed because the 3D director entry still created a `director3d` node, backend `normalizeDraftGraph` dropped `projectStudios`, and the store had no `updateProjectDirector3d` action.
  - `npm test -- src/flowCanvas/canvas/FlowLeftAddPanel.test.tsx src/flowCanvas/canvas/FlowContextMenu.test.tsx src/flowCanvas/canvas/AiFlowCanvas.project-director.test.tsx src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx apps/api/test/flows-draft-graph.test.ts` passed on 2026-07-08: 5 files, 24 tests.
  - `npm run build` passed on 2026-07-08 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `npm run test --workspace @aigc-flow/api` passed on 2026-07-08: 27 files passed, 152 tests passed, 16 files skipped by existing config.

## 2026-07-07 - StoryAI Director Desk Capture Send-To-Canvas Phase 81

- fixed the StoryAI 3D director desk camera capture send-to-canvas path:
  - embedded StoryAI now registers an in-process capture host handler instead of relying only on iframe-style `window.parent.postMessage`.
  - single camera capture send and all-captures send now reach the TapFlow production-studio shell.
  - sent captures are converted from live `data:` URLs into `File` objects, uploaded through the existing `/assets` upload path, and inserted onto the canvas as image node requests backed by durable `assetId` references.
  - created image node requests use `source: director-capture` plus safe `params.directorCapture` metadata and do not carry `data:`, `blob:`, base64, or signed/http preview URLs in the request payload.
- tightened capture card interaction coverage:
  - camera capture send buttons now expose stable test ids for smoke coverage.
  - capture thumbnail media no longer intercepts pointer events over the action layer, and the action layer has an explicit z-index.
  - `smoke:director3d` now verifies both single-capture send and all-captures send on desktop/mobile in addition to screenshots, panorama import, safe patches, and nonblank WebGL.
- validation:
  - red test observed on 2026-07-07: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "uploads StoryAI camera captures"` first failed because StoryAI capture sends never called `uploadAssetFile` or canvas node creation.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx src/flowCanvas/studios/storyai/editor/io/hostBridge.test.ts scripts/smoke-director-three-viewport.test.ts scripts/smoke-production-studios.test.ts` passed on 2026-07-07: 5 files, 45 tests.
  - `npm run smoke:director3d` passed on 2026-07-07 with desktop/mobile reporting `hasSentCaptures: true`, safe patches, live camera captures, live panorama previews, and nonblank WebGL pixels.
  - `npm run smoke:production-studios` passed on 2026-07-07 with director, 360/270 image mode, storyboard, and video-editor smoke checks intact.
  - `npm run build` passed on 2026-07-07 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-07 - StoryAI Director Desk Capture And Panorama Stabilization Phase 80

- fixed three real StoryAI 3D director desk usability regressions reported from the canvas:
  - screenshot actions now keep live camera captures after TapFlow echoes the sanitized `director3d` patch back into the node.
  - the right capture/export panel's `当前视角截图`, `四方位截图`, and `十二方位截图` actions now save captured images into the active camera's capture list instead of only downloading them.
  - imported panorama previews now remain live in the editor session after parent draft autosave echoes a safe patch, so the 3D viewport background can actually update.
- fixed the camera inspector routing that hid capture cards:
  - `机位视角` now routes the right panel to the camera inspector even when a character was selected before switching view modes.
  - this prevents captured screenshots from landing in camera state while the UI still shows the character inspector.
- preserved v2 draft safety:
  - live `data:` screenshots and `blob:` panorama previews remain browser-session-only.
  - echoed canvas draft patches still strip `blob:`, `data:`, and `http(s)://` media references from `director3d.storyAiProject`.
  - durable capture/panorama upload to `/assets` remains a separate follow-up.
- strengthened regression coverage:
  - added StoryAI wrapper tests for self-originated safe patch echo, live camera captures, live panorama preview URLs, and capture-panel persistence.
  - added right-panel routing coverage for camera view with stale character selection.
  - extended `smoke:director3d` so the Playwright smoke page behaves like the real parent canvas by echoing every `director3d` patch back into the component, then verifies camera capture cards, live panorama preview URLs, safe patches, and nonblank WebGL pixels on desktop and mobile.
- validation:
  - red test observed on 2026-07-07: `npm test -- src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx` first failed because echoed safe patches cleared live captures/panorama URLs and the capture panel did not save screenshots to cameras.
  - red test observed on 2026-07-07: `npm test -- scripts/smoke-director-three-viewport.test.ts` first failed because the browser smoke did not cover camera capture cards or panorama import.
  - red test observed on 2026-07-07: `npm test -- src/flowCanvas/studios/storyai/editor/store/directorSelectors.test.ts` first failed because camera view could still show the character panel.
  - `npm test -- src/flowCanvas/studios/storyai/editor/store/directorSelectors.test.ts src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx scripts/smoke-director-three-viewport.test.ts` passed on 2026-07-07: 3 files, 11 tests.
  - `npm run smoke:director3d` passed on 2026-07-07 with desktop and mobile reporting camera capture cards, live panorama previews, safe `director3d` patches, and nonblank WebGL pixels.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx scripts/smoke-production-studios.test.ts scripts/smoke-director-three-viewport.test.ts src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx src/flowCanvas/studios/storyai/editor/store/directorSelectors.test.ts` passed on 2026-07-07: 5 files, 43 tests.
  - `npm run smoke:production-studios` passed on 2026-07-07 with director, 360/270 image mode, storyboard, and video-editor smoke checks intact.
  - `npm run build` passed on 2026-07-07 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-07 - StoryAI 3D Director Desk Replacement Phase 79

- replaced the production-studio `director3d` branch with the StoryAI director desk UI from `AigcLee007/storyai-3d-director-desk`:
  - added the StoryAI shell, full-bleed 3D canvas, object tree, inspector panels, viewport toolbar, camera/capture panels, character controls, panorama/model import utilities, and scoped StoryAI CSS under `src/flowCanvas/studios/storyai/`.
  - copied the UE mannequin GLB model and license into `public/models/`.
  - `ProductionStudioShell` now lets `StoryAiDirectorDesk` own the visible chrome for `director3d` instead of wrapping the old simplified TapFlow director header/viewport.
  - embedded StoryAI now initializes and clears its host bridge like the reference app shell, preserving theme/session/panorama/capture message handling hooks.
- added a TapFlow adapter layer for v2 draft safety:
  - StoryAI project state hydrates from existing `FlowDirector3dData` and writes edits back through `director3d.storyAiProject`.
  - persisted draft patches keep structured actors, cameras, shots, and a sanitized StoryAI project snapshot.
  - unsafe `blob:`, `data:`, base64-like media URLs, and signed/http URL-shaped references are stripped before writing to canvas draft JSON.
  - StoryAI localStorage scene persistence is disabled in the embedded TapFlow path; server-side flow draft data remains the authoritative canvas state.
- known boundary for this phase:
  - StoryAI camera captures and local imports can still use browser `data:`/`blob:` URLs inside the live editor session, but they are cleared from persisted TapFlow draft data.
  - uploading those captures/imported files into the asset library as durable `/assets` records is a separate follow-up, not part of this replacement pass.
- validation:
  - red test observed on 2026-07-07: `npm test -- src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx -t "initializes and clears"` first failed because embedded StoryAI did not initialize the reference host bridge.
  - `npm test -- src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx -t "initializes and clears"` passed on 2026-07-07: 1 selected test.
  - `npm test -- src/flowCanvas/studios/StoryAiDirectorDesk.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx scripts/smoke-director-three-viewport.test.ts scripts/smoke-production-studios.test.ts` passed on 2026-07-07: 4 files, 39 tests.
  - `npm test -- src/flowCanvas/nodes/ProductionNodes.test.tsx src/flowCanvas/utils/director3dNodeData.test.ts src/flowCanvas/utils/directorVideoSync.test.ts src/flowCanvas/utils/storyboardDirectorSync.test.ts src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/utils/videoEditorNodeData.test.ts` passed on 2026-07-07: 6 files, 16 tests.
  - `npm run smoke:director3d` passed on 2026-07-07 with desktop and mobile StoryAI landmarks, nonblank WebGL pixels, safe director patches, and screenshots at `output/playwright/director-viewport-desktop.png` and `output/playwright/director-viewport-mobile.png`.
  - `npm run smoke:production-studios` passed on 2026-07-07 with `directorStoryAiPatch: true`, `directorPatchSafe: true`, storyboard/video/image production-studio smoke checks intact, and screenshot at `output/playwright/production-studios-smoke.png`.
  - `npm run build` passed on 2026-07-07 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-07 - Production Studio Draft Backfill Sanitization Phase 78

- closed the remaining C-scheme production-suite draft backfill safety gap:
  - frontend director-shot image completion now normalizes the whole `director3d` document before writing `generatedAssetId` and `generatedSourceNodeId` back to the source shot.
  - worker draft output patching now sanitizes source `videoEditor`, `storyboard`, and `director3d` documents before setting exported/composed/generated asset ids.
  - stale old-draft values such as `blob:`, `data:`, base64 markers, signed/http URLs, URL-shaped preview fields, and file/blob-like payload keys are stripped during output backfill.
- kept v2 architecture, asset, and billing boundaries unchanged:
  - no API route, database migration, AI route, model pricing, reserve/settle/refund behavior, or object-storage write path changed.
  - generated outputs still persist as `/assets` records and production studio draft documents keep asset-id references only.
- validation:
  - red test observed on 2026-07-07: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "successful director shot image generation writes the result asset back to the director shot|successful storyboard image generation writes the result asset back to the storyboard cell|successful storyboard sheet generation writes the composed asset back to the storyboard node|video editor export syncs the generated asset id back to the source editor node"` first failed because stale director background/actor URL references survived output backfill.
  - red test observed on 2026-07-07: `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "draft patch"` first failed because stale video editor, director, storyboard-cell, and storyboard-sheet source documents preserved unsafe media references.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "successful director shot image generation writes the result asset back to the director shot|successful storyboard image generation writes the result asset back to the storyboard cell|successful storyboard sheet generation writes the composed asset back to the storyboard node|video editor export syncs the generated asset id back to the source editor node"` passed on 2026-07-07: 4 tests.
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "draft patch"` passed on 2026-07-07: 4 tests.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/director3dNodeData.test.ts src/flowCanvas/utils/storyboardNodeData.test.ts src/flowCanvas/utils/videoEditorNodeData.test.ts` passed on 2026-07-07: 41 tests.
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts` passed on 2026-07-07: 15 tests passed, 16 skipped; local Redis emitted a non-fatal ioredis connection warning on stderr.
  - `npm run smoke:production-studios` passed on 2026-07-07 with `status: ok`.
  - `npm run smoke:director3d` passed on 2026-07-07 with desktop and mobile reporting `renderer: "three"` and `ok: true`.
  - `npm run build` passed on 2026-07-07 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Production Studio Reference Id Sanitization Phase 77

- tightened production studio draft normalization for unsafe reference ids:
  - storyboard cell ids plus `sourceNodeId`, `directorCameraId`, and `directorShotId` now reject `blob:`, `data:`, and signed/http URL-shaped values.
  - director actor/camera/shot ids plus shot `cameraId`, `generatedSourceNodeId`, and `targetStoryboardCellId` now use the same safe reference-id filtering.
  - user-authored titles/prompts remain plain text fields; asset references still persist only as asset ids.
- kept v2 architecture and billing boundaries unchanged:
  - no API route, database migration, provider route, pricing value, worker behavior, workflow execution path, asset write path, or billing mutation changed.
  - this closes an old-draft / imported-graph safety gap without adding browser-local persistence or storing preview/signed URLs in canvas draft JSON.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/storyboardNodeData.test.ts src/flowCanvas/utils/director3dNodeData.test.ts` first failed because unsafe URL-shaped reference ids were preserved.
  - `npm test -- src/flowCanvas/utils/storyboardNodeData.test.ts src/flowCanvas/utils/director3dNodeData.test.ts` passed on 2026-07-06: 5 tests.
  - `npm test -- src/flowCanvas/utils/director3dNodeData.test.ts src/flowCanvas/utils/storyboardNodeData.test.ts src/flowCanvas/utils/storyboardDirectorSync.test.ts src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/utils/directorVideoSync.test.ts src/flowCanvas/utils/videoEditorNodeData.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-06: 121 tests.
  - `npm run smoke:production-studios` passed on 2026-07-06 with `status: ok`.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Director Desk Asset Drop Binding Phase 76

- added direct asset-library drop binding for 3D Director Desk scene objects:
  - actor rows now accept `application/x-tapflow-asset-id` drops, patch the target actor `assetId`, and promote the actor to `image_plane`.
  - the scene background row accepts the same asset-id drop payload and patches `scene.backgroundAssetId`.
  - dropping onto a target also selects that target so the inspector follows the user's action.
- kept v2 persistence, generation, and billing boundaries unchanged:
  - director state stores only asset ids; preview URLs, signed URLs, `blob:`, and `data:` payloads are ignored by the drop path and remain filtered by director data normalization.
  - no API route, database migration, provider route, pricing value, worker behavior, image generation route, or billing state changed.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` first failed because dropping an asset on a director actor did not call `onUpdateNodeData`.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` first failed because dropping an asset on the director scene background did not call `onUpdateNodeData`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` passed on 2026-07-06: 45 tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx scripts/smoke-production-studios.test.ts` passed on 2026-07-06: 74 tests.
  - `npm run smoke:production-studios` passed on 2026-07-06 with `status: ok`.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Timeline Drop Binding Phase 75

- added direct asset-library drop binding for video editor timeline items:
  - video/image clips now accept `application/x-tapflow-asset-id` drops and patch the target clip asset id.
  - audio tracks now accept the same asset-id drop payload and patch the target audio asset id.
  - dropping onto a timeline item selects that item and clears the other timeline selections.
- kept v2 persistence, export, and billing boundaries unchanged:
  - timeline data stores only asset ids; preview URLs, signed URLs, `blob:`, and `data:` values are ignored by the drop path.
  - no API route, database migration, provider route, pricing value, worker behavior, export route, or billing state changed.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` first failed because dropping an asset on a video clip did not call `onUpdateNodeData`.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` first failed because dropping an asset on an audio track did not call `onUpdateNodeData`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` passed on 2026-07-06: 43 tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx scripts/smoke-production-studios.test.ts` passed on 2026-07-06: 72 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Asset Library Drag Payload Phase 74

- completed the asset-library side of storyboard/canvas drag binding:
  - asset cards now expose a native drag payload using the existing `application/x-tapflow-asset-id` type.
  - the payload carries only the persisted asset id, with `text/plain` also set to the same id for safe fallback/debug behavior.
  - media thumbnails themselves remain `draggable={false}` so the existing asset-library marquee selection behavior is preserved.
- kept v2 persistence and billing boundaries unchanged:
  - no preview URL, signed URL, `blob:`, `data:`, generated media, API route, database migration, provider route, pricing value, worker behavior, or billing state changed.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/assets/AssetLibraryPage.test.tsx` first failed because asset cards had no native drag payload.
  - `npm test -- src/assets/AssetLibraryPage.test.tsx` passed on 2026-07-06: 16 tests.
  - `npm test -- src/assets/AssetLibraryPage.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx scripts/smoke-production-studios.test.ts` passed on 2026-07-06: 86 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Storyboard Asset Drop Binding Phase 73

- added direct storyboard-cell drop binding for asset-library image references:
  - storyboard cells now accept the existing `application/x-tapflow-asset-id` drag type.
  - dropping an asset onto a specific cell patches that target cell and selects it, instead of relying on the current inspector selection.
  - the studio still ignores preview/text URL payloads and persists only the cleaned `assetId` through the existing storyboard normalizer.
- kept v2 persistence and billing boundaries unchanged:
  - no generated media, preview URL, `blob:`, `data:`, or signed URL is stored in draft JSON.
  - no API route, database migration, provider route, pricing value, billing mutation, or worker behavior changed.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` first failed because dropping an asset on a storyboard cell did not call `onUpdateNodeData`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` passed on 2026-07-06: 41 tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx scripts/smoke-production-studios.test.ts` passed on 2026-07-06: 70 tests.
  - `npm run smoke:production-studios` passed on 2026-07-06 with `status: ok`.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Production Studios Image Mode Browser Smoke Phase 72

- extended the real-browser production studios smoke to cover the 360°/270° image production mode UI:
  - the smoke page now mounts the real `ImagePromptActionRow` and shared `MenuSelect` mode control alongside the studio shell checks.
  - Chromium clicks `360°全景`, verifies the structured `panorama_360` patch, then clicks `主体三面展开` and verifies the `subject_orbit_270` wraparound patch.
  - the check confirms stale mode params are absent from the opposite mode (`wraparound` absent for panorama, `panorama` absent for subject 270).
  - the same smoke still verifies `3D导演台`, storyboard sheet creation, video editor export, square output, and placeholder export blocking.
- kept product behavior unchanged:
  - this is browser-level QA coverage only; no route, pricing, provider, database, billing, draft persistence, or asset storage behavior changed.
- validation:
  - red test observed on 2026-07-06: `npm test -- scripts/smoke-production-studios.test.ts` first failed because the smoke page/check did not include the image production mode UI.
  - `npm test -- scripts/smoke-production-studios.test.ts` passed on 2026-07-06: 3 tests.
  - `npm run smoke:production-studios` passed on 2026-07-06 with `imagePanoramaPatch`, `imageSubject270Patch`, and `imageGenerateClick` all true.
  - `npm test -- scripts/smoke-production-studios.test.ts src/flowCanvas/utils/imageGenerationModes.test.ts src/flowCanvas/nodes/ImagePromptActionRow.test.tsx` passed on 2026-07-06: 10 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Square Output Alignment Phase 71

- aligned the video editor output UI, draft normalization, and FFmpeg render plan with the installed `video.editor.ffmpeg` route capabilities:
  - `FlowVideoEditorData.resolution` and `normalizeVideoEditorData` now preserve `1080x1080`.
  - the worker video editor render plan maps `1080x1080` to square 1080p output dimensions.
  - the video editor studio now exposes compact output preset buttons for `16:9 1080p`, `16:9 720p`, `9:16 1080p`, `9:16 720p`, and `1:1 1080p`.
- kept billing and asset behavior unchanged:
  - no API route, database migration, provider route, pricing value, browser persistence, secret exposure, or balance mutation changed.
  - video editor exports still run through `video.editor.ffmpeg`, `video_generation` pricing, server-side reserve/run/settle/refund, and persisted video assets.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/videoEditorNodeData.test.ts apps/worker/test/video-editor-render-plan.test.ts` first failed because `1080x1080` was normalized/rendered as 1920x1080.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` first failed because there was no `选择输出规格 1:1 1080p` control.
  - `npm test -- src/flowCanvas/utils/videoEditorNodeData.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts apps/worker/test/video-editor-render-plan.test.ts apps/worker/test/video-editor-local-render-service.test.ts apps/worker/test/video-editor-ffmpeg-executor.test.ts` passed on 2026-07-06: 117 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.

## 2026-07-06 - Video Editor Placeholder Export Guard Phase 70

- tightened the video editor export path so unbound placeholder timeline assets cannot enter the paid export flow:
  - the video editor studio now disables `导出到画布` and shows `请先绑定素材库资产` while any clip/audio still uses a generated `placeholder-image-*`, `placeholder-video-*`, or `placeholder-audio-*` id.
  - the worker FFmpeg render-plan builder now rejects the same placeholder asset ids as invalid media references, so old drafts or bypassed UI requests fail before local render asset lookup.
- kept billing and asset persistence boundaries aligned with v2:
  - no new API route, database migration, provider route, pricing value, local browser persistence, secret exposure, or balance mutation was added.
  - valid video editor exports still create normal `video.generate` workflow nodes with `video.editor.ffmpeg`, then use the existing server-side reserve/run/settle/refund and persisted asset flow.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` first failed because placeholder timeline assets still allowed the export button.
  - red test observed on 2026-07-06: `npm test -- apps/worker/test/video-editor-render-plan.test.ts` first failed because `placeholder-video-1` was accepted as a render asset id.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts apps/worker/test/video-editor-render-plan.test.ts apps/worker/test/video-editor-local-render-service.test.ts apps/worker/test/video-editor-ffmpeg-executor.test.ts` passed on 2026-07-06: 112 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.
  - browser smoke passed on 2026-07-06 against `http://127.0.0.1:64043/output/playwright/video-editor-placeholder-smoke.html`: a placeholder-backed video editor rendered `导出到画布` disabled and showed `请先绑定素材库资产`.

## 2026-07-06 - Director 3D Viewport Browser Smoke Phase 69

- added a repeatable real-browser smoke command for the 3D Director Desk viewport:
  - `npm run smoke:director3d` writes an HTTP-served smoke page under `output/playwright/`, starts a temporary local Vite server, opens it through `@playwright/cli`, and checks the actual WebGL canvas.
  - the smoke covers desktop `1280x720` and mobile `390x844` viewports.
  - each run verifies `data-renderer="three"`, actor/camera/shot metadata, WebGL availability, and nonblank pixel samples from the rendered canvas.
  - screenshots are saved to `output/playwright/director-viewport-desktop.png` and `output/playwright/director-viewport-mobile.png`.
- kept product behavior unchanged:
  - this adds a verification script and npm smoke command only; no canvas UX, billing, workflow, asset persistence, provider route, pricing, database schema, or auth behavior changed.
- validation:
  - red test observed on 2026-07-06: `npm test -- scripts/smoke-director-three-viewport.test.ts` first failed because the smoke script module did not exist.
  - debugging note: the first real smoke run failed with `spawn EINVAL`; root cause was Node 24 on Windows failing to spawn `.cmd` files directly, so the smoke script now invokes Windows commands through `cmd.exe` while keeping the Playwright code in `--filename` files.
  - `npm test -- scripts/smoke-director-three-viewport.test.ts` passed on 2026-07-06: 3 tests.
  - `npm run smoke:director3d` passed on 2026-07-06, with desktop and mobile both reporting `renderer: "three"` and `ok: true`.

## 2026-07-06 - GPT-Image-2 Four-Line Catalog Verification Phase 68

- added DB-backed model catalog acceptance coverage for the GPT-Image-2 production route set:
  - the test installs `openai-compatible.gpt-image-2`, `mouxihub.gpt-image-2-line3`, and `mouxihub.gpt-image-2-line4` through the authenticated v2 admin plugin API.
  - it then verifies `/api/v2/ai/model-catalog/gpt-image-2/routes` returns lines one through four with safe public capabilities for `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270`.
  - the same assertion confirms raw route internals such as `requestConfig` remain absent from the creator-facing model catalog response.
- kept product behavior unchanged:
  - this was test coverage only; no provider route, pricing value, database migration, workflow behavior, billing mutation, asset persistence behavior, or frontend model-selection code was changed.
- validation:
  - `npm run test --workspace @aigc-flow/api -- ai-model-catalog.test.ts` ran on 2026-07-06 and skipped 4 DB-backed tests because local database test environment was unavailable.
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts ai-model-catalog.service.test.ts` passed on 2026-07-06: 9 tests.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts` passed on 2026-07-06: 11 tests.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Subject 270 Prompt Semantics Phase 67

- tightened the provider-facing prompt helper for `subject_orbit_270`:
  - the AI Gateway prompt now explicitly asks for a `270-degree three-panel subject orbit sheet`.
  - it keeps the existing front / three-quarter / side-back view requirements, while explicitly saying this is a wraparound/unfolded view sheet rather than a single 270-degree camera angle.
  - this aligns the subject/character 270 mode with the product wording: `270°环绕展开图` / `主体三面展开`, not a camera-angle preset.
- kept route, billing, and storage behavior unchanged:
  - no provider route, pricing value, API route, workflow queue behavior, billing mutation, database migration, or asset persistence behavior was changed.
  - the selected generation mode still flows through the existing route capability, pricing, reserve/run/settle/refund, and asset-persistence paths.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts` first failed because `subject_orbit_270` did not mention 270-degree subject orbit semantics.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts runtime.test.ts` passed on 2026-07-06: 64 tests.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Image Production Mode Param Cleanup Phase 66

- tightened image generation mode parameter patches for the 360/270 production modes:
  - switching back to `standard` now clears stale `panorama` and `wraparound` params from the merged image-node params.
  - switching between `panorama_360`, `wraparound_270`, and `subject_orbit_270` now keeps those mode-specific params mutually exclusive before draft JSON or workflow metadata serialization.
  - this keeps UI-selected mode, runtime effect, and billing/preflight semantics aligned: a standard image request no longer carries stale 360/270-shaped metadata from an earlier selection.
- kept v2 billing and asset boundaries unchanged:
  - no API route, provider route, pricing value, billing mutation, storage behavior, database migration, or secret exposure was added.
  - the existing reserve/run/settle/refund workflow remains the only billable path for generated outputs.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/imageGenerationModes.test.ts` first failed because standard mode patches left stale `panorama` and `wraparound` params after object merge.
  - `npm test -- src/flowCanvas/utils/imageGenerationModes.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 66 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - Storyboard Sheet Asset Visibility Phase 65

- surfaced composed storyboard sheet results in the storyboard studio:
  - when `storyboard.composedAssetId` is present, the storyboard inspector now shows a `合成资产` row with the persisted asset id.
  - this mirrors the existing director shot `生成资产` and video editor `导出资产` status rows, closing the visible result loop for storyboard sheet composition.
- kept the v2 asset and billing model unchanged:
  - no preview URL, signed URL, `blob:`, `data:`, base64 media, API route, worker path, provider route, pricing value, or billing mutation was added.
  - storyboard sheet generation still creates a normal image workflow node and relies on the existing reserve/run/settle/refund path; the source storyboard stores only the persisted asset id.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "composed storyboard asset"` first failed because the storyboard inspector did not render the composed asset id.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/storyboardNodeData.test.ts` passed on 2026-07-06: 98 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - Storyboard Draft Asset Normalization Phase 64

- tightened storyboard draft normalization for asset-backed cells and composed storyboard sheets:
  - `normalizeStoryboardData` now rejects transient media references in `assetId`, `sourceAssetId`, and `composedAssetId`.
  - text fields such as title/prompt remain normal trimmed strings, while asset-reference fields must stay recoverable asset identifiers.
  - patching a storyboard cell continues to preserve safe asset ids but no longer re-persist old `blob:`, `data:`, or signed/http URL values from malformed drafts.
- kept workflow, billing, and asset persistence unchanged:
  - storyboard editing remains a free structured-draft operation.
  - shot generation and storyboard sheet composition still create normal image workflow nodes and use the existing reserve/run/settle/refund path.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/storyboardNodeData.test.ts` first failed because `composedAssetId` and cell asset fields accepted transient URL-like values.
  - `npm test -- src/flowCanvas/utils/storyboardNodeData.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 71 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - Director Desk Draft Normalization Phase 63

- centralized safe normalization for `director3d` draft data:
  - added `normalizeDirector3dData` to sanitize scene, actor, camera, shot, camera snapshot, generated asset, and source-node metadata.
  - strips transient media references such as `blob:`, `data:`, and signed/http URLs from director scene backgrounds, actor assets, and generated shot asset fields.
  - clamps malformed numeric camera/actor/shot values back to safe finite defaults before they can be written back into the flow draft.
- connected the production studio shell to the shared normalizer:
  - director desk reads normalized data when rendering.
  - every director desk `onUpdateNodeData` patch now normalizes the outgoing `director3d` document, so editing an old malformed draft does not re-persist unsafe media references.
- kept billing and asset boundaries unchanged:
  - no API route, database migration, provider route, pricing value, workflow execution, or billing mutation was added.
  - director editing remains free local/studio draft editing; paid image/video output still uses the existing workflow and asset pipeline.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/director3dNodeData.test.ts` first failed because the shared normalizer module did not exist.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "malformed director drafts"` first failed because old `https:`, `blob:`, and `data:` director fields were written back during an actor edit.
  - `npm test -- src/flowCanvas/utils/director3dNodeData.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 68 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - MouxiHub GPT-Image Production Mode Capabilities Phase 62

- published production image generation capabilities for the MouxiHub GPT-Image-2 async lines:
  - `image.gpt-image-2.line3` now declares `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270` in `requestConfig.capabilities.supportedGenerationModes`.
  - `image.gpt-image-2.line4` now declares the same generation mode capabilities.
  - this lets the existing model catalog, canvas mode selector, frontend preflight, and backend workflow guard treat lines three/four consistently with existing GPT-Image-2 lines when pricing is installed.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no new billing unit, pricing value, provider credential, frontend hardcoding, draft media storage, API route, database migration, worker behavior, or provider-secret exposure was added.
  - generation modes remain route capabilities and are still gated by existing route pricing and workflow reserve/settle/refund paths.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts` first failed because MouxiHub GPT-Image-2 line three/four manifests did not declare `supportedGenerationModes`.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts` passed on 2026-07-06: 11 tests.
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts ai-model-catalog.service.test.ts` passed on 2026-07-06: 9 tests.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-06.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Worker Storyboard Draft Patch Phase 61

- made storyboard image results durable from the worker draft patch path:
  - `params.storyboard.sourceStoryboardNodeId` plus `params.storyboard.cellId` now patches the matching source storyboard cell with `assetId`, `sourceAssetId`, and `sourceNodeId`.
  - `params.storyboardSheet.sourceStoryboardNodeId` now patches the source storyboard with `composedAssetId`.
  - this mirrors the active frontend runtime sync so storyboard shot images and composed storyboard sheets survive even when the browser is not connected to receive workflow events.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no signed URL, preview URL, local file path, `blob:`, `data:`, base64, direct asset write, billing mutation, API route, database migration, provider route, pricing change, or provider-secret exposure was added.
  - the worker patch stores only persisted asset identifiers in the canvas draft.
- validation:
  - red tests observed on 2026-07-06: `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "storyboard .* draft patch"` first failed because source storyboard cells and sheet metadata were not patched from successful image outputs.
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "draft patch|video editor|director shot"` passed on 2026-07-06: 8 tests.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Worker Director Shot Draft Patch Phase 60

- made director shot generated assets durable from the worker draft patch path:
  - `applyDraftOutputPatchToNodes` now reads `params.director3d.sourceDirectorNodeId` and `params.director3d.shotId` from successful image generation nodes.
  - when the target image node output is patched into `flow_drafts.graph_json`, the matching source `director3d.shots[]` entry also receives `generatedAssetId` and `generatedSourceNodeId`.
  - this mirrors the active frontend runtime sync so director shot results survive even when the browser is not connected to receive workflow events.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no signed URL, preview URL, local file path, render temp path, `blob:`, `data:`, base64, direct asset write, billing mutation, API route, database migration, provider route, pricing change, or provider-secret exposure was added.
  - the worker patch stores only persisted asset identifiers in the canvas draft.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "director shot image draft patch"` first failed because the source director shot did not receive `generatedAssetId`.
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "draft patch|video editor"` passed on 2026-07-06: 6 tests.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Director Shot Asset Sync Phase 59

- closed the 3D Director Desk shot synthesis result loop in the frontend runtime:
  - successful `image.generate` nodes carrying `params.director3d.sourceDirectorNodeId` and `params.director3d.shotId` now write the returned primary asset id back to the matching director shot as `generatedAssetId`.
  - the source shot also records `generatedSourceNodeId` so the canvas can trace which downstream image node produced the latest shot result.
  - the director inspector now shows the generated shot asset id when a shot segment is selected.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no browser-local generation, direct asset write, signed URL persistence, preview URL persistence, `blob:`, `data:`, base64, API route, database migration, worker behavior, provider route, pricing change, or provider-secret exposure was added.
  - the shot image is still produced by the existing workflow/worker asset pipeline and billing path; the director node stores only persisted asset identifiers.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "successful director shot"` first failed because successful director shot generation did not write `generatedAssetId` to the source shot.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "generated asset id"` first failed because the director shot inspector did not render the generated asset id.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 98 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Storyboard Sheet Asset Sync Phase 58

- closed the storyboard sheet composition result loop in the frontend runtime:
  - successful `image.generate` nodes carrying `params.storyboardSheet.sourceStoryboardNodeId` now write the returned primary asset id back to the source storyboard as `storyboard.composedAssetId`.
  - the existing per-cell storyboard asset sync remains unchanged for `params.storyboard` generation nodes.
  - the source storyboard update uses the shared storyboard normalizer and stores only the persisted asset id.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no browser-local generation, direct asset write, signed URL persistence, preview URL persistence, `blob:`, `data:`, base64, API route, database migration, worker behavior, provider route, pricing change, or provider-secret exposure was added.
  - the composed sheet image is still produced by the existing workflow/worker asset pipeline and billing path.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "storyboard sheet generation"` first failed because successful sheet generation did not write `composedAssetId` to the source storyboard.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "storyboard"` passed on 2026-07-06: 2 selected tests.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/storyboardNodeData.test.ts src/flowCanvas/utils/storyboardVideoSync.test.ts` passed on 2026-07-06: 36 tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 65 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Production Image Mode Backend Capability Guard Phase 57

- added a server-side workflow run guard for production image generation modes:
  - `image.generate` nodes now read `generationMode` from top-level config or `params.generationMode`.
  - `panorama_360`, `wraparound_270`, and `subject_orbit_270` are allowed only when the selected route/model capabilities explicitly include the requested mode.
  - unsupported production image modes fail closed with `UNSUPPORTED_GENERATION_MODE` before workflow run enqueue/reserve execution continues.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no frontend-only trust, browser-local generation, direct asset write, pricing fallback bypass, provider route mutation, database migration, worker behavior, or provider-secret exposure was added.
  - standard image generation remains allowed by default; production modes still require route capability plus existing pricing checks before billable execution.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts` first failed because unsupported `panorama_360` image requests were not rejected by `assertNodeRouteSupportsRuntimeRequest`.
  - `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts` passed on 2026-07-06: 13 tests.
  - `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts workflow-runs.test.ts ai-model-catalog.service.test.ts ai-gateway.service.test.ts` passed on 2026-07-06: 15 tests, with DB-backed `workflow-runs.test.ts` skipped because local `DATABASE_URL` was unavailable.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts plugin-registry.test.ts` passed on 2026-07-06: 15 tests.
  - `npm test -- src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-06: 34 tests.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Storyboard Image Generation Auto Run Phase 56

- connected storyboard image-producing actions to the existing v2 workflow execution path:
  - `生成选中镜头`, `生成全部镜头`, and `合成故事板图` now mark their generated image nodes with `runAfterCreate`.
  - `AiFlowCanvas` creates each storyboard image node and immediately calls `runBackendWorkflow({ runMode: 'target_node', targetNodeId })` for the new node.
  - storyboard image nodes still carry structured `params.storyboard` or `params.storyboardSheet` metadata with source storyboard ids, cell ids, shot numbers, aspect, and asset-id references.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no browser-local generation, direct asset write, free execution path, API route, database migration, worker behavior, provider route, or provider-secret exposure was added.
  - generated media is still produced by the existing workflow/worker asset pipeline and billing reserve/settle/refund path, not by canvas draft JSON.
- validation:
  - red tests observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "storyboard"` and `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "storyboard"` first failed because storyboard image requests did not include `runAfterCreate` and did not call `runBackendWorkflow`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "storyboard"` passed on 2026-07-06: 8 selected tests.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "storyboard"` passed on 2026-07-06: 9 selected tests.

## 2026-07-06 - Director Desk Image Synthesis Auto Run Phase 55

- connected `3D导演台` shot synthesis to the existing v2 workflow execution path:
  - director desk `合成到画布` requests now mark their generated image node with `runAfterCreate`.
  - `AiFlowCanvas` creates the shot image node and immediately calls `runBackendWorkflow({ runMode: 'target_node', targetNodeId })` for that new node.
  - the shot image node still carries structured `params.director3d` scene, camera, lens, lighting, actor, and source-shot metadata, so image generation remains asset-backed and workflow-driven.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no browser-local generation, direct asset write, free execution path, API route, database migration, worker behavior, provider route, or provider-secret exposure was added.
  - generated media is still produced by the existing workflow/worker asset pipeline and billing reserve/settle/refund path, not by canvas draft JSON.
- validation:
  - red tests observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "downstream image node from the selected director shot"` and `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "downstream image node from a director shot"` first failed because director shot image requests did not include `runAfterCreate` and did not call `runBackendWorkflow`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 65 tests.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/videoEditorNodeData.test.ts src/flowCanvas/utils/storyboardVideoSync.test.ts` passed on 2026-07-06: 35 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Export Inspector Status Phase 54

- surfaced completed video editor exports in the studio UI:
  - the video editor inspector now shows a `导出资产` row when `videoEditor.exportedAssetId` is available.
  - the row displays only the persisted asset id, matching the asset-backed draft contract.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no generated media, signed URL, preview URL, `blob:`, `data:`, base64, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, provider route, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "latest exported video asset"` first failed because the inspector did not render the exported asset row.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "latest exported video asset"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/videoEditorNodeData.test.ts` passed on 2026-07-06: 68 tests.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "export"` passed on 2026-07-06: 1 selected test.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Frontend Export Sync Phase 53

- made completed video editor exports visible immediately in the active canvas session:
  - when a `video.generate` export node succeeds, the runtime still applies the generated asset patch to the export video node.
  - if the export node carries `params.videoEditor.sourceVideoEditorNodeId`, the source `video_editor` node now receives `videoEditor.exportedAssetId` without waiting for a page refresh.
  - the update reuses the shared video editor normalizer so the source editor draft keeps asset-id based structured data only.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no browser-local export, direct asset write, free execution path, API route, database migration, worker route, provider route, or provider-secret exposure was added.
  - runtime preview/poster signed URLs remain in runtime output or the generated video node; the source `video_editor` document only stores `exportedAssetId`.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "video editor export syncs"` first failed because the source `video_editor` node did not receive `exportedAssetId`.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "video editor export syncs"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/videoEditorNodeData.test.ts` passed on 2026-07-06: 32 tests.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "export"` passed on 2026-07-06: 1 selected test.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Export Asset Backfill Phase 52

- closed the video editor export result loop in the worker draft patch path:
  - successful `video.generate` export nodes still receive the normal generated asset patch.
  - when the export request carries `params.videoEditor.sourceVideoEditorNodeId`, the source `video_editor` node now receives `videoEditor.exportedAssetId`.
  - the shared draft-node patch helper writes only asset ids and structured status fields back into canvas draft data.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no browser-local export, direct asset write, free execution path, API route, database migration, provider route, or provider-secret exposure was added.
  - exported media still comes from the existing worker asset pipeline and billing usage path.
  - source video editor draft data does not receive `blob:`, `data:`, http URLs, base64, local file paths, or render temp paths.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "video editor export draft patch"` first failed because the draft patch helper did not exist.
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "video editor export draft patch"` passed on 2026-07-06: 1 selected test.
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "video editor"` passed on 2026-07-06: 5 selected tests.
  - `npm run test --workspace @aigc-flow/worker -- video-editor-render-plan.test.ts video-editor-local-render-service.test.ts video-editor-ffmpeg-executor.test.ts` passed on 2026-07-06: 14 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - the database-backed worker export test was extended with a `flow_drafts` assertion, but local DB integration tests are skipped when `DATABASE_URL` is unavailable.

## 2026-07-06 - Video Editor Export Auto Run Phase 51

- connected video editor export to the existing v2 workflow execution path:
  - video editor `导出到画布` requests now mark their generated video node with `runAfterCreate`.
  - `AiFlowCanvas` creates the export video node and immediately calls `runBackendWorkflow({ runMode: 'target_node', targetNodeId })` for that new node.
  - the export node still carries `routeKey: video.editor.ffmpeg` plus structured `params.videoEditor` timeline data, so reserve/run/settle/refund and route capability checks remain on the existing backend path.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no browser-local export, direct asset write, free execution path, API route, database migration, worker behavior, provider route, or provider-secret exposure was added.
  - exported media is still produced by the existing workflow/worker asset pipeline, not by canvas draft JSON.
- validation:
  - red tests observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "export"` first failed because export requests did not include `runAfterCreate` and did not call `runBackendWorkflow`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "export"` passed on 2026-07-06: 2 selected tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/videoEditorNodeData.test.ts src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-06: 95 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Draft Data Normalization Phase 50

- added a shared video editor draft normalization utility for the production suite:
  - normalizes clips, audio, subtitles, transitions, transforms, storyboard source metadata, aspect, resolution, and exported asset references into a safe `FlowVideoEditorData` document.
  - strips transient preview/download/media fields such as `blob:`, `data:`, and signed/http URLs from video editor draft data.
  - centralizes timeline duration helpers so the studio and storyboard-to-video sync use the same clip/audio/subtitle timing semantics.
  - keeps explicit draft `durationMs` when reading old documents, while editor mutations recalculate duration from current timeline content.
- kept v2 safety, billing, and asset boundaries unchanged:
  - this only normalizes existing structured canvas draft data and preserves asset-id based media references.
  - no generated media, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, provider route, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/videoEditorNodeData.test.ts` first failed because the shared video editor normalization utility did not exist.
  - `npm test -- src/flowCanvas/utils/videoEditorNodeData.test.ts` passed on 2026-07-06: 2 tests.
  - `npm test -- src/flowCanvas/utils/videoEditorNodeData.test.ts src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 66 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Storyboard To Video Editor Subtitle Sync Phase 49

- extended the storyboard-to-video editor sync so storyboard cells now also produce aligned subtitles:
  - subtitles are derived from storyboard cell title first, then prompt text if title is missing.
  - each generated subtitle carries structured storyboard source metadata (`sourceStoryboardNodeId`, `storyboardCellId`, `storyboardShotNo`).
  - resyncing the same storyboard source replaces old same-source subtitles instead of duplicating them.
  - the video editor timeline duration now reflects the synced subtitle end time as well as the clips.
- kept v2 safety, billing, and asset boundaries unchanged:
  - this only reshapes existing structured canvas draft data.
  - no signed URL, preview URL, `blob:`, `data:`, base64, generated media, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/storyboardVideoSync.test.ts` first failed because storyboard sync did not generate aligned subtitles or replace stale same-source subtitles.
  - `npm test -- src/flowCanvas/utils/storyboardVideoSync.test.ts` passed on 2026-07-06: 3 tests.
  - `npm test -- src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 64 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Director Desk Asset Viewport Metadata Phase 48

- made asset-backed `3D导演台` state visible in the director viewport layer:
  - `DirectorDeskThreeViewport` now receives the director scene metadata.
  - the viewport exposes data attributes for asset-backed visible actors and bound scene background asset ids.
  - a compact non-interactive viewport HUD shows the bound background asset id and asset-backed actor count, so asset binding is visible beyond the inspector fields.
- kept v2 safety, billing, and asset boundaries unchanged:
  - this is a read-only visualization of existing structured `director3d` draft metadata.
  - no signed URL, preview URL, `blob:`, `data:`, base64, generated media, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx -t "asset-backed actor"` first failed because the viewport exposed no asset actor/background metadata.
  - `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx -t "asset-backed actor"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "asset-backed director scene metadata"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 3 files, 65 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Director Desk Scene Background Asset Binding Phase 47

- connected the `3D导演台` scene background to the v2 asset library:
  - the director object list now includes a selectable `场景背景` row.
  - selecting the scene background loads image asset candidates from `listAssets`.
  - binding a candidate updates only `director3d.scene.backgroundAssetId`.
  - the Three.js viewport selection type now accepts the scene-background selection metadata used by the studio shell.
- kept v2 safety, billing, and asset boundaries unchanged:
  - the picker requests candidates with `includePreviewUrls: false`.
  - no signed URL, preview URL, `blob:`, `data:`, base64, generated media, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "director scene background"` first failed because there was no selectable scene background entry.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "director scene background"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "scene background asset"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 60 tests.
  - `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 3 files, 63 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Director Desk Actor Asset Binding Phase 46

- connected selected `3D导演台` actors to the v2 asset library:
  - selecting an actor now loads image asset candidates from `listAssets`.
  - binding a candidate updates only that actor's `assetId` and switches the actor kind to `image_plane`.
  - the canvas store path now preserves the same asset-backed actor metadata when the studio is opened from the real canvas event.
- kept v2 safety, billing, and asset boundaries unchanged:
  - the picker requests candidates with `includePreviewUrls: false`.
  - no signed URL, preview URL, `blob:`, `data:`, base64, generated media, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "binds selected director actors"` first failed because director actor selection did not call `listAssets`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "binds selected director actors"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "director actor asset"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 58 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Storyboard Generation Result Sync Phase 45

- closed the storyboard generation loop:
  - image nodes created from storyboard cells already carry `params.storyboard.sourceStoryboardNodeId` and `cellId`.
  - when a matching image generation run succeeds, the runner now writes the returned primary asset id back to that storyboard cell.
  - the cell also records `sourceNodeId` and `sourceAssetId` so downstream storyboard sheet composition and storyboard-to-video-editor sync stay asset-backed.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no generated media, signed URL, preview URL, `blob:`, `data:`, base64, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
  - the billable generation path remains the existing server-side reserve/run/settle workflow.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "storyboard image generation"` first failed because the generated image asset did not update the storyboard cell.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "storyboard image generation"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-06: 29 tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 56 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Storyboard Asset Binding Phase 44

- connected selected `故事板` cells to the v2 asset library:
  - selected storyboard cells now load image asset candidates from `listAssets`.
  - binding a candidate writes only the selected cell `assetId`.
  - existing storyboard sheet composition and storyboard-to-video-editor sync can now be driven from asset-backed cells created inside the storyboard studio.
- kept v2 safety, billing, and asset boundaries unchanged:
  - the picker requests candidates with `includePreviewUrls: false`.
  - no signed URL, preview URL, `blob:`, `data:`, base64, generated media, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "storyboard cell to a library"` first failed because storyboard did not call `listAssets`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "storyboard cell to a library"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "storyboard cell asset binding"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 56 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Asset Binding Phase 43

- connected selected `剪辑工程` video clips and audio tracks to the v2 asset library:
  - selected image/video clips now load same-kind asset candidates from `listAssets`.
  - selected audio tracks now load audio asset candidates from `listAssets`.
  - candidate binding updates only `videoEditor.timeline.clips[].assetId` or `videoEditor.timeline.audio[].assetId`.
- kept v2 safety, billing, and asset boundaries unchanged:
  - the picker requests candidates with `includePreviewUrls: false`.
  - no signed URL, preview URL, `blob:`, `data:`, base64, generated media, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "binds a selected"` first failed because the video editor did not call `listAssets`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "binds a selected"` passed on 2026-07-06: 2 selected tests.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "asset binding"` passed on 2026-07-06: 2 selected tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 54 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Clip Audio Controls Phase 42

- exposed video-clip source audio controls in the `剪辑工程` studio:
  - selected video clips now show a `片段静音` checkbox.
  - selected video clips now show a bounded `片段音量` control matching the worker export volume range.
  - image clips remain unchanged and do not show video-only audio controls.
- connected the controls to safe structured `videoEditor.timeline.clips[]` draft patches so Phase 41 FFmpeg clip-audio mixing can be driven from the studio UI.
- kept v2 safety, billing, and asset boundaries unchanged:
  - no generated media, `blob:`, `data:`, base64, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "video clip audio settings"` first failed because `片段静音` was not available.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "video clip audio settings"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "video clip audio settings"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 50 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor FFmpeg Clip Audio Mix Phase 41

- improved `剪辑工程` FFmpeg export so unmuted video clips with explicit clip volume now contribute their source audio to the final mix.
- standalone audio tracks and video clip audio are delayed by their timeline `startMs`, gain-adjusted by their structured `volume`, and mixed into the same `[aout]` stream.
- kept v2 safety, billing, and asset boundaries unchanged:
  - this only changes worker-local FFmpeg argument construction for the existing `video.editor.ffmpeg` route.
  - no new route, pricing shortcut, direct asset write, browser-local export, database migration, API surface, or provider credential exposure was added.
  - legacy video clips without explicit `volume` keep the previous behavior to avoid referencing missing source audio streams.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/worker -- video-editor-ffmpeg-executor.test.ts -t "mixes unmuted"` first failed because the FFmpeg filter only mixed standalone audio tracks.
  - `npm run test --workspace @aigc-flow/worker -- video-editor-ffmpeg-executor.test.ts video-editor-render-plan.test.ts` passed on 2026-07-06: 2 files, 11 tests.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Audio Track Editing Phase 40

- added selected-audio editing to the `剪辑工程` studio:
  - users can add an audio track from the studio toolbar.
  - audio timeline rows are selectable and expose start time, duration, and volume controls in the inspector.
  - selected audio can be deleted while timeline duration is recalculated across clips, audio, and subtitles.
- kept v2 safety, billing, and asset boundaries unchanged:
  - edits persist only as structured `videoEditor.timeline.audio[]` draft data.
  - no generated media, `blob:`, `data:`, base64, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "audio track"` first failed because there was no accessible `添加音频` action.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "audio track"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "audio track"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 48 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Subtitle Store Coverage Phase 39

- added canvas-store regression coverage for selected subtitle editing in `剪辑工程`:
  - the test opens the video editor studio from the real canvas event path.
  - it verifies subtitle text edits, start-time edits, and subtitle deletion persist back into the canvas node data.
  - it keeps the existing safe-data assertion that `videoEditor` patches do not introduce `blob:` or `data:` URLs.
- kept product/runtime boundaries unchanged:
  - no production behavior, asset write path, billing path, API route, database migration, worker behavior, or provider-secret surface changed in this slice.
  - this Phase documents that the Phase 38 subtitle UI also works through the canvas store persistence path.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "selected video subtitle"` first failed because the fixture had no subtitle row to select.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "selected video subtitle"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 46 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Subtitle Editing Phase 38

- added selected-subtitle editing to the `剪辑工程` studio:
  - subtitle timeline items are now selectable controls instead of read-only labels.
  - the right inspector can edit the selected subtitle text, start time, and end time.
  - selected subtitles can be deleted while preserving the existing timeline duration calculation across clips and subtitles.
- kept v2 safety, billing, and asset boundaries unchanged:
  - edits persist only as structured `videoEditor.timeline.subtitles[]` draft data.
  - no generated media, `blob:`, `data:`, base64, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "selected subtitle"` failed because subtitle rows had no accessible selection control.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "selected subtitle"` passed on 2026-07-06: 1 selected test.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 45 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - 3D Director Desk Shot Viewport Phase 37

- connected the `3D导演台` Three.js viewport to the existing shot timeline data:
  - `DirectorDeskThreeViewport` now receives `director3d.shots` alongside actors and cameras.
  - captured `cameraSnapshot` poses are visualized as shot markers and target lines, with selected shots highlighted separately from static camera markers.
  - the viewport exposes selected-shot metadata for regression coverage and shows the captured snapshot/camera label in the viewport overlay.
- kept v2 storage, billing, and asset boundaries unchanged:
  - this is a read-only studio visualization of already persisted structured `director3d` draft data.
  - no generated media, `blob:`, `data:`, base64, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx` failed because the viewport exposed no `data-shot-count` or selected-shot metadata.
  - `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx` passed on 2026-07-06: 2 files, 28 tests.
  - browser smoke against a temporary shot-aware director viewport page passed on 2026-07-06: renderer `three`, shot count `2`, selected shot `shot-2`, selected snapshot position `1.5,2.25,4.75`, screenshot pixel sampling nonblank at `1580x889`.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.
  - `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 4 files, 49 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor FFmpeg Transition Filters Phase 36

- moved `剪辑工程` transition support from metadata into local FFmpeg render arguments:
  - single-clip `fade` transitions now emit `fade=t=out` video filters with safe computed start/duration values.
  - adjacent `crossfade` transitions now emit chained `xfade=transition=fade` filters and avoid plain `concat` for transitioned pairs.
  - no-transition timelines keep the existing deterministic concat/export behavior.
- kept v2 billing and asset boundaries unchanged:
  - this only changes worker-local render filter construction for the existing `video.editor.ffmpeg` route.
  - no new route, pricing shortcut, direct asset write, browser-local export, database migration, provider credential surface, or frontend-visible secret was added.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/worker -- video-editor-ffmpeg-executor.test.ts` failed because generated filters still used plain `concat` and had no `fade` / `xfade`.
  - `npm run test --workspace @aigc-flow/worker -- video-editor-ffmpeg-executor.test.ts` passed on 2026-07-06: 1 file, 6 tests.
  - `npm run test --workspace @aigc-flow/worker -- video-editor-ffmpeg-executor.test.ts video-editor-render-plan.test.ts worker.test.ts` passed on 2026-07-06: 3 files, 21 tests run with existing filtered/skipped tests.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Clip Transition Metadata Phase 35

- added the first canvas-native transition controls to `剪辑工程`:
  - selected clips can now set `无转场`, `淡入淡出`, or `叠化`, with editable transition duration in seconds.
  - transition edits persist as safe structured `timeline.clips[].transitionOut` metadata and are preserved when exporting the video editor timeline to a runnable video node.
  - the worker video-editor render plan and video request metadata now preserve `fade` / `crossfade` transition metadata for the existing `video.editor.ffmpeg` export route.
- kept v2 safety and billing boundaries unchanged:
  - this commit defines and carries transition metadata only; it does not add a new route, pricing shortcut, direct asset write, browser-local export, database migration, or provider credential surface.
  - actual video export still uses the existing video workflow node, pricing preflight/reserve/settle/refund path, worker execution, and asset persistence.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "transition"` failed because the `淡入淡出` control did not exist.
  - red tests observed on 2026-07-06: `npm run test --workspace @aigc-flow/worker -- video-editor-render-plan.test.ts worker.test.ts -t "video.generate request uses exported video editor prompt|normalizes asset-backed"` failed because `transitionOut` was stripped from render plans and request metadata.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 43 tests.
  - `npm run test --workspace @aigc-flow/worker -- video-editor-render-plan.test.ts worker.test.ts` passed on 2026-07-06: 2 files, 15 tests run with existing filtered/skipped tests.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-06.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 4 files, 47 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - 3D Director Desk Shot Timeline Controls Phase 34

- made `3D导演台` shot timelines editable as an ordered shot list:
  - selected shots can now move earlier/later in the rail and can be deleted after explicit selection.
  - shot `startMs` values are recalculated after reordering, deletion, and duration edits so downstream canvas synthesis and storyboard sync keep coherent timing.
  - canvas integration now covers persisting shot timeline reorder/delete through the real flow store.
- kept v2 safety and billing boundaries unchanged:
  - this remains a local/studio draft edit of structured `director3d` data only.
  - no generated media, `blob:`, `data:`, preview URL, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` failed because the `镜头前移` control did not exist.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "reorders|recalculates"` failed because duration edits left following shot `startMs` values stale.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` passed on 2026-07-06: 1 file, 24 tests.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 1 file, 17 tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 4 files, 45 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - 3D Director Desk Shot Camera Snapshots Phase 33

- made `3D导演台` shot capture preserve the selected camera pose at capture time:
  - captured shots now store a safe structured `cameraSnapshot` with camera name, position, target, focal length, and fov when available.
  - `合成到画布` now prefers the captured snapshot for downstream image-node `params.director3d.camera`, so later camera moves do not silently change already captured shot semantics.
  - director-to-storyboard sync now prefers the captured camera name for storyboard cell titles.
- kept v2 safety and billing boundaries unchanged:
  - snapshots store only structured numbers and ids/names; no generated media, `blob:`, `data:`, preview URL, file object, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
  - generated outputs still flow through existing image workflow nodes, route pricing, reserve/settle/refund, worker execution, and asset persistence.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` failed because captured shots did not store a `cameraSnapshot`.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/storyboardDirectorSync.test.ts` failed because storyboard cell titles still used the current camera name.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 2 files, 25 tests.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardDirectorSync.test.ts` passed on 2026-07-06: 4 files, 42 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Storyboard Sheet Canvas Output Phase 32

- added a canvas-native `合成故事板图` action in the `故事板` studio:
  - asset-backed storyboard cells can now create a downstream `image` node for a storyboard sheet/composition output.
  - the generated node stores structured `params.storyboardSheet` metadata with `sourceStoryboardNodeId`, grid/aspect, shot numbers, cell ids, prompts, titles, and asset ids.
  - the request prompt asks for a storyboard layout that preserves shot order, numbering, and titles.
- kept v2 safety and billing boundaries unchanged:
  - the action only creates a normal image workflow node; actual generation still uses existing image-node execution, route pricing, reserve/settle/refund, worker, and asset persistence.
  - no generated media, `blob:`, `data:`, preview URL, browser-local export, direct asset write, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` failed because the `合成故事板图` action did not exist.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 3 files, 38 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - 3D Director Desk Selected Camera Capture Phase 31

- made `3D导演台` shot capture use the selected camera instead of always falling back to the first camera:
  - `捕获镜头段` now binds the new shot to the currently selected camera when one is selected.
  - captured shots inherit safe camera-level duration and prompt metadata, giving downstream canvas synthesis/storyboard sync a better shot seed.
  - the studio switches selection to the newly captured shot so the shot inspector is immediately ready for timing, motion, and prompt edits.
- kept v2 safety boundaries unchanged:
  - this remains a free local/studio draft edit of structured `director3d` data only.
  - no media URL, browser-local export, billing mutation, API route, database migration, worker behavior, or provider-secret exposure was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` failed because capture still created `shot-2` from `camera-1` and dropped selected-camera duration/prompt metadata.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 3 files, 36 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - 3D Director Desk Transform Inspector Phase 30

- expanded the canvas-native `3D导演台` inspector into a usable staging control surface:
  - selected actors can now edit position, rotation, and scale as finite three-axis numeric tuples.
  - selected cameras can now edit camera position, target, and focal length.
  - selected shots can now edit duration and motion type through compact buttons rather than a native select.
  - malformed legacy director drafts fall back to safe numeric defaults instead of crashing the studio.
- kept v2 safety boundaries unchanged:
  - all edits remain free local/studio draft edits and persist only as structured `director3d` node data.
  - no generated media, `blob:`, `data:`, file objects, provider credentials, API route internals, billing shortcut, database migration, or worker behavior was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` failed because actor/camera/shot transform controls did not exist.
  - red test observed on 2026-07-06: malformed actor transform data crashed `DirectorVectorInputGroup` before safe defaults were applied.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 3 files, 35 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - GPT-Image Fallback Production Modes Phase 29

- aligned frontend GPT-Image-2 official fallback routes with the backend production-mode capabilities:
  - `getOfficialFallbackImageRuntimeRoutes("gpt-image-2")` now exposes `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270` for both line one and line two.
  - fallback route tests now protect the line-one / line-two-only behavior while also checking the production-mode capability list.
  - preflight coverage now proves fallback capability support still requires active route pricing, so production modes do not become free or bypass billing.
- kept runtime/catalog source-of-truth behavior unchanged:
  - when API route/catalog data exists, it still drives supported modes and pricing.
  - no API, worker, database, storage, provider credential, or canvas draft shape change was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts` failed because GPT-Image-2 fallback routes had no `supportedGenerationModes`.
  - `npm test -- src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-06: 3 files, 35 tests.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - Production Image Mode Prompt Augmentation Phase 28

- moved 360/270 image modes one step closer to visible output quality:
  - added a shared AI Gateway prompt helper for `panorama_360`, `wraparound_270`, and `subject_orbit_270`.
  - OpenAI-compatible image routes now append deterministic 360 panorama / 270 wraparound instructions to both Images API and Responses API image prompts.
  - PixelleLabs Gemini image routes and Visionary Nano Banana routes now apply the same production-mode prompt augmentation before provider calls.
  - `standard` and unknown modes keep the original user prompt unchanged.
- kept v2 boundaries unchanged:
  - no database migration, new pricing unit, worker billing change, canvas draft media storage, browser-local persistence, or provider-secret exposure was added.
  - structured `generationMode`, `panorama`, and `wraparound` metadata remains intact; this phase only improves provider-facing instructions.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts` failed because the prompt helper did not exist.
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts production-image-prompt.test.ts` failed because OpenAI-compatible, PixelleLabs, and Visionary image adapters still sent raw prompts for production modes.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- production-image-prompt.test.ts runtime.test.ts plugin-registry.test.ts` passed on 2026-07-06: 3 files, 75 tests.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - Production Image Mode Route Capabilities Phase 27

- published real GPT-Image-2 image-generation route capabilities for the canvas production modes:
  - `image.gpt-image-2` and `image.gpt-image-2.line2` now declare `supportedGenerationModes: ["standard", "panorama_360", "wraparound_270", "subject_orbit_270"]` in server-side route `request_config.capabilities`.
  - plugin install payload coverage now proves those capabilities are persisted into `ai_routes.request_config` instead of relying on frontend-only assumptions.
  - model catalog regression coverage now expects installed GPT-Image-2 routes to expose the four public modes while still hiding raw `requestConfig`.
- kept v2 boundaries unchanged:
  - no database migration, new pricing unit, worker execution path, canvas draft media storage, browser-local persistence, or provider-secret exposure was added.
  - runtime catalog safety still flows through the existing whitelist for public `supportedGenerationModes`.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts` failed because GPT-Image-2 routes did not declare production image mode capabilities.
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/api -- test/ai-plugins.service.test.ts test/ai-model-catalog.test.ts test/ai-model-catalog.service.test.ts` failed because installed GPT-Image-2 route request config had no `capabilities.supportedGenerationModes`.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts` passed on 2026-07-06: 1 file, 11 tests.
  - `npm run test --workspace @aigc-flow/api -- test/ai-plugins.service.test.ts test/ai-model-catalog.test.ts test/ai-model-catalog.service.test.ts` passed on 2026-07-06: 9 non-DB tests passed; 3 DB-backed model-catalog tests skipped by the existing local DB guard.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-06.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-06.

## 2026-07-06 - Video Editor FFmpeg Discoverability Phase 26

- made the internal `tapflow.video-editor-ffmpeg` template easier to publish and use from admin/runtime surfaces:
  - AI plugin admin summaries now expose safe credential metadata (`credentials.required`, field descriptors, and type) without leaking secrets.
  - Template Library hides credential-name/API-key inputs for credential-free templates and installs `tapflow.video-editor-ffmpeg` without sending an empty `credential` payload.
  - runtime video model catalog coverage now proves a published `video.editor.ffmpeg` route appears with `supportedVideoWorkflows: ["video_editor_export"]`, `video_generation` pricing, and no internal render-engine fields in the normal frontend response.
- kept v2 boundaries unchanged:
  - no database migration, pricing unit, provider secret exposure, browser-local export path, or canvas draft storage change was added.
  - internal `videoEditorRenderEngine` remains stored server-side in route `request_config` and is not exposed by `/api/v2/ai/model-catalog/:modelKey/routes`.
- validation:
  - `npm test -- src/services/v2AiPluginAdminApi.test.ts src/account/TemplateLibraryPage.test.tsx` passed on 2026-07-06: 2 files, 3 tests.
  - `npm run test --workspace @aigc-flow/api -- test/ai-plugins.service.test.ts test/ai-model-catalog.test.ts test/ai-plugins.test.ts` passed on 2026-07-06: 7 non-DB service tests passed; 4 DB-backed API tests skipped by the existing local DB guard.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-06 - Video Editor Export Default Route Phase 25

- connected the canvas-native `剪辑工程` export action to the Phase 24 FFmpeg route template:
  - `导出到画布` now creates the downstream `video` node with `routeKey: "video.editor.ffmpeg"`.
  - the exported node still uses the existing v2 target-node run path, so billing reserve/settle/refund, pricing lookup, draft flush, workflow execution, worker rendering, and asset persistence remain server-side.
  - execution still fails closed unless the `tapflow.video-editor-ffmpeg` template has been installed/published and pricing exists for the route.
- kept storage and billing boundaries unchanged:
  - no browser-local export, new database table, new pricing unit, asset-write shortcut, provider secret exposure, base64 draft storage, or local authoritative persistence was added.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` failed because exported video nodes still used `video.default`.
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-06: 2 files, 30 tests.

## 2026-07-06 - Video Editor FFmpeg Route Template Phase 24

- added an installable AI Gateway plugin template for the canvas-native `剪辑工程` server-side FFmpeg export route:
  - built-in package key: `tapflow.video-editor-ffmpeg`.
  - product model key: `video-editor-ffmpeg`.
  - route key: `video.editor.ffmpeg`.
  - the route persists `request_config.capabilities.supportedVideoWorkflows: ["video_editor_export"]` and `videoEditorRenderEngine: "ffmpeg"`, matching the Phase 23 worker-local render gate.
  - installing and publishing the template creates the normal provider/model/route/catalog/pricing records through the existing plugin install service.
- kept billing and runtime behavior aligned with the v2 architecture:
  - pricing uses the existing `video_generation` unit at 50 credits.
  - no new pricing unit, database migration, environment variable, browser-local export path, provider secret exposure, or canvas draft storage change was added.
  - the template requires no credential; local FFmpeg execution remains selected by server-side route capability before any external provider adapter call.
- validation:
  - red test observed on 2026-07-06: `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts` failed because `tapflow.video-editor-ffmpeg` was not registered.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts` passed on 2026-07-06: 1 file, 11 tests.
  - `npm run test --workspace @aigc-flow/api -- test/ai-plugins.test.ts` ran on 2026-07-06 with 2 DB-backed tests skipped by the existing local DB guard.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-06.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-06.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Video Editor Local Render Workflow Phase 23

- wired `剪辑工程` exported `video.generate` nodes into the worker-local FFmpeg render path:
  - worker reads the selected video route's server-side `request_config.capabilities`.
  - local rendering is enabled only when the route declares both `supportedVideoWorkflows: ["video_editor_export"]` and `videoEditorRenderEngine: "ffmpeg"`.
  - routes without the internal render engine continue through the existing provider runtime path and existing `UNSUPPORTED_VIDEO_EDITOR_EXPORT` guard behavior.
  - local render outputs are persisted through the existing `MediaAssetStore` object-storage + `assets` pipeline and settle through the existing `ai.video.generate` usage path.
  - rendered output temp directories are deleted after asset persistence; cleanup is limited to `tapflow-video-render-output-*` temp directories.
- kept v2 safety boundaries intact:
  - no browser-local export, new pricing unit, database schema change, frontend billing mutation, provider secret exposure, base64 canvas persistence, or signed-URL draft persistence was added.
  - render plans are rebuilt from structured `params.videoEditor` data in the worker rather than trusting client-supplied metadata as the source of truth.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts` failed because `readVideoEditorRenderEngine` was not implemented/exported.
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts` failed because local render cleanup did not yet expose/guard the cleanup directory helper.
  - `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts test/video-editor-local-render-service.test.ts test/video-editor-ffmpeg-executor.test.ts test/video-editor-render-plan.test.ts test/media-asset-store.test.ts` passed on 2026-07-05: 5 files, 27 tests passed, 16 DB-backed worker tests skipped by the existing local DB guard.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-05.

## 2026-07-05 - Video Editor Local Render Service Phase 22

- added a standalone worker-local render service for future `剪辑工程` export execution:
  - `VideoEditorLocalRenderService` hydrates render-plan `assetIds` from object storage through `StorageProvider.getObject`.
  - input assets are written into a temporary render directory, then Phase 20 FFmpeg args/runner are invoked.
  - the service returns a Phase 21-compatible local-file `MediaOutput` with duration, dimensions, mime type, and `localFilePath`.
  - input temp files are cleaned up in `finally`; output files remain available for the caller to persist through `MediaAssetStore`.
- kept the implementation as a safe service boundary:
  - no workflow wiring, billing mutation, API route, frontend export, provider route behavior, database schema change, or canvas draft change was added.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/video-editor-local-render-service.test.ts` failed because `video-editor-local-render-service.ts` did not exist.
  - `npm run test --workspace @aigc-flow/worker -- test/video-editor-local-render-service.test.ts test/video-editor-ffmpeg-executor.test.ts test/video-editor-render-plan.test.ts` passed on 2026-07-05: 3 files, 11 tests.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-05.

## 2026-07-05 - Video Editor Local Render Output Phase 21

- added the asset-pipeline foundation for worker-local rendered media:
  - `MediaOutput` now supports a worker-internal `localFilePath` field.
  - `MediaAssetStore` can read local rendered media files, infer safe filenames/mime types, upload them through the existing object-storage path, insert normal `assets` rows, and return standard asset refs.
  - worker media-output normalization preserves `localFilePath` internally while avoiding null `base64` fields in serialized output.
- kept the path aligned with v2 asset rules:
  - local FFmpeg output files can now be persisted without converting large videos to base64.
  - no workflow wiring, browser-local export, new pricing unit, database schema change, provider route behavior, or frontend draft persistence change was added.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/media-asset-store.test.ts` failed because local file outputs still required URL/base64.
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts` failed because media-output normalization did not expose/preserve `localFilePath`.
  - `npm run test --workspace @aigc-flow/worker -- test/media-asset-store.test.ts test/worker.test.ts` passed on 2026-07-05: 2 files, 14 tests passed, 14 database-backed tests skipped by the existing local-DB guard.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-05.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-05 after rebuilding `ai-gateway-core` declarations first.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-05.

## 2026-07-05 - Video Editor FFmpeg Executor Phase 20

- added a worker-side FFmpeg execution boundary for `剪辑工程` render plans:
  - `buildVideoEditorFfmpegArgs` turns Phase 19 render plans plus local asset file paths into deterministic FFmpeg arguments.
  - the command builder rejects missing local asset files, scales/pads clips to the target output size, concatenates video clips, escapes subtitle text for `drawtext`, and creates a mixed audio output label.
  - `runVideoEditorFfmpeg` wraps child-process execution with hidden Windows windows, bounded stderr capture, success resolution, spawn failure errors, and non-zero exit errors.
- prepared the deployed worker runtime for the eventual renderer:
  - the production Docker image now installs the `ffmpeg` Alpine package.
- kept the boundary conservative:
  - no workflow wiring, asset download, asset persistence, pricing unit, provider route behavior, browser-local export, frontend billing mutation, or database schema change was added.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/video-editor-ffmpeg-executor.test.ts` failed because `video-editor-ffmpeg-executor.ts` did not exist.
  - `npm run test --workspace @aigc-flow/worker -- test/video-editor-ffmpeg-executor.test.ts test/video-editor-render-plan.test.ts test/worker.test.ts` passed on 2026-07-05: 3 files, 16 tests passed, 14 database-backed tests skipped by the existing local-DB guard.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-05; Git reports the pre-existing Dockerfile CRLF normalization warning.

## 2026-07-05 - Video Editor Render Plan Phase 19

- added the first server-side render planning boundary for `剪辑工程` exports in the worker:
  - `buildVideoEditorRenderPlan` now normalizes asset-backed clips, audio, subtitles, output resolution, duration, and ordered asset ids into an FFmpeg-oriented plan.
  - empty timelines and transient references such as `blob:`, `data:`, `http://`, or `https://` fail before provider/runtime execution.
  - `video.generate` export requests now include `metadata.videoEditorExport.renderPlan` for future internal renderer routes.
- kept billing/admin metadata intentionally small:
  - usage-event metadata still carries only the video-editor export summary and does not include the full render plan.
  - no browser-local export, new pricing unit, asset-write shortcut, provider secret exposure, Docker image change, FFmpeg execution, or billing mutation was added.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/video-editor-render-plan.test.ts` failed because `video-editor-render-plan.ts` did not exist.
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts` failed because video-editor export metadata did not include `renderPlan`.
  - `npm run test --workspace @aigc-flow/worker -- test/video-editor-render-plan.test.ts test/worker.test.ts` passed on 2026-07-05: 2 files, 12 tests passed, 14 database-backed tests skipped by the existing local-DB guard.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-05.

## 2026-07-05 - Video Editor Export Runtime Guard Phase 18

- added a second fail-closed guard inside `packages/ai-gateway-core`:
  - `DatabaseMediaRuntime.generateVideo` now detects `metadata.videoEditorExport.source: video_editor_export`.
  - if the resolved route request config does not include `capabilities.supportedVideoWorkflows: ["video_editor_export"]`, the runtime throws `UNSUPPORTED_VIDEO_EDITOR_EXPORT` before calling the provider adapter.
  - request-config overrides are checked after merge, so diagnostic/runtime calls use the effective route configuration.
- kept the runtime boundary conservative:
  - no FFmpeg renderer, new export queue, new pricing unit, database table, provider secret path, browser-local export, or asset-write shortcut was added.
  - unsupported editor-export jobs use the existing worker failure path and reservation refund behavior.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/ai-gateway-core -- test/runtime.test.ts` failed because editor-export video requests still reached the provider adapter.
  - build failure observed on 2026-07-05: `npm run build --workspace @aigc-flow/ai-gateway-core` failed until `UNSUPPORTED_VIDEO_EDITOR_EXPORT` was added to `AiGatewayErrorCode`.
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- test/runtime.test.ts` passed on 2026-07-05: 1 file, 57 tests.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Video Editor Export Capability Preflight Phase 17

- added fail-closed route capability checks for `剪辑工程` exported video nodes:
  - `video.generate` nodes carrying `params.videoEditor` now require the selected runtime route to declare `supportedVideoWorkflows: ["video_editor_export"]`.
  - unsupported editor-export routes fail with `UNSUPPORTED_VIDEO_EDITOR_EXPORT` before `workflow_runs`, `node_runs`, billing reservations, or queue jobs are created.
  - frontend target-node runs perform the same local preflight before remote draft flush / workflow creation, so users get an immediate node-level failure state.
- extended safe AI route capability exposure:
  - `/api/v2/ai/routes` and model-scoped route lists now expose allowlisted `capabilities.supportedVideoWorkflows`.
  - only `video_editor_export` is surfaced; internal provider/request-config workflow names are filtered out.
- kept billing and runtime boundaries unchanged:
  - no new `media_export` pricing unit, database table, provider secret path, browser-local export, asset-write shortcut, or frontend billing mutation was added.
  - existing `video_generation` pricing remains the billing unit for runnable video nodes.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/api -- test/workflow-pricing-resolver.test.ts` failed because `assertNodeRouteSupportsRuntimeRequest` did not exist.
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/api -- test/ai-gateway.service.test.ts test/ai-model-catalog.service.test.ts` failed because route capability output did not include `supportedVideoWorkflows`.
  - red test observed on 2026-07-05: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts` failed because unsupported video-editor exports still reached workflow creation.
  - `npm run test --workspace @aigc-flow/api -- test/workflow-pricing-resolver.test.ts test/ai-gateway.service.test.ts test/ai-model-catalog.service.test.ts` passed on 2026-07-05: 3 files, 13 tests.
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-05: 1 file, 28 tests.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Video Editor Export Intent Phase 16

- added sanitized `videoEditorExport` metadata for exported `video` nodes:
  - provider `video.generate` requests now identify the run as `source: video_editor_export`.
  - usage-event metadata now carries the same export context for billing/admin interpretation.
  - metadata includes source video editor node id, aspect, resolution, duration, `video_generation` billing unit, and clip/audio asset counts.
- kept the implementation on the existing v2 video generation path; no new routes, tables, pricing enum values, provider secrets, asset-write shortcuts, or frontend billing mutations were added.
- kept metadata draft/runtime-safe by copying only structured fields and asserting no `blob:`, `data:`, base64, `File`, `Blob`, or long-lived signed URL values in focused worker tests.
- validation:
  - red test observed on 2026-07-05: `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts` failed because `metadata.videoEditorExport` and `buildMediaUsageMetadata` were not present.
  - `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts` passed on 2026-07-05: 1 test file, 8 tests passed, 14 database-backed tests skipped because local DB env was unavailable.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - `git diff --check` passed on 2026-07-05.

## 2026-07-05 - Video Editor Runtime Request Phase 15

- adapted the worker video request builder for video editor exports:
  - `video.generate` requests now use `generationPrompt` as the static prompt fallback when there is no upstream text output.
  - `params.videoEditor.timeline.clips` and `params.videoEditor.timeline.audio` are converted into `VideoGenerationRequest.inputAssets` with `assetId`, timing, kind, and timeline metadata.
  - `metadata.videoEditor` now carries a whitelisted timeline snapshot with source node id, aspect, resolution, clip/audio timing, and subtitles for future provider/runtime adapters.
- kept this on the existing v2 video generation path; it does not add new billing behavior, routes, tables, provider secrets, asset writes, or frontend-visible credentials.
- kept request metadata draft/runtime-safe by copying only structured fields needed for editing and asserting no `blob:`, `data:`, base64, `File`, `Blob`, or long-lived signed URL values in the worker request test.
- validation:
  - `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts` passed on 2026-07-05: 1 test file, 7 tests passed, 14 database-backed tests skipped because local DB env was unavailable.
  - `npm run build --workspace @aigc-flow/worker` passed on 2026-07-05.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Video Editor Export Node Phase 14

- added a canvas export action inside the canvas-native `剪辑工程` studio:
  - `导出到画布` creates a downstream selected `video` node beside the video editor node.
  - the created node keeps the existing `video.default` route from the node factory, so later execution uses the normal v2 target-node workflow path.
  - the video node receives a concise prompt, project duration, and structured `params.videoEditor` metadata with source video editor node id, aspect, resolution, and timeline snapshot.
- kept the action non-billable preparation work only; it does not create assets, enqueue workflow runs, reserve credits, settle usage, refund credits, or bypass the existing video generation billing flow.
- kept exported timeline data draft-safe and asset-reference based; the export tests assert no `blob:`, `data:`, base64, `File`, `Blob`, or long-lived signed URL values are written by this action.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 2 test files, 30 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Video Editor Clip Editing Phase 13

- added selectable timeline clips inside the canvas-native `剪辑工程` studio:
  - timeline clips are now buttons with a selected state.
  - selecting a clip exposes its source asset, start time, and duration in the right inspector.
  - `片段开始（秒）` updates `clip.startMs`.
  - `片段时长（秒）` updates `clip.outMs` while preserving `clip.inMs`.
  - `删除片段` removes the selected clip and recalculates timeline duration from remaining clips/subtitles.
- kept these actions inside the existing `ProductionStudioShell` -> `updateNodeData` canvas-store path; no new canvas shell, backend workflow, asset creation, or billing operation was added.
- kept timeline edits draft-safe and asset-reference based; patches stay in structured `videoEditor.timeline` JSON and do not persist `blob:`, `data:`, base64, `File`, `Blob`, or long-lived signed URL values.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 2 test files, 28 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Storyboard Asset Sync To Video Editor Phase 12

- added storyboard-to-video-editor sync for the canvas-native `故事板` studio:
  - `同步到剪辑工程` is enabled when storyboard cells already reference saved `assetId` values.
  - if a `剪辑工程` node already exists, its timeline receives image clips for the current storyboard asset cells.
  - if no `剪辑工程` node exists, the canvas creates a selected `故事板剪辑工程` node beside the storyboard and seeds its timeline.
- added `storyboardVideoSync` utility coverage:
  - converts asset-backed storyboard cells into timeline image clips.
  - preserves existing non-storyboard clips, audio, subtitles, aspect, resolution, and exported asset id.
  - replaces previous clips synced from the same storyboard so repeated syncs do not duplicate timeline entries.
- kept the action non-billable preparation work only; it does not create assets, enqueue workflow runs, reserve credits, settle usage, refund credits, or bypass the later server-side video export path.
- kept synced timeline data draft-safe: clips store `assetId`, storyboard node id, cell id, shot number, and optional prompt/title metadata, with no `blob:`, `data:`, base64, `File`, `Blob`, or long-lived signed URL values.
- validation:
  - `npm test -- src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 3 test files, 27 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Storyboard Image Node Creation Phase 11

- added image-node creation actions inside the canvas-native `故事板` studio:
  - `生成选中镜头` creates a downstream image node from the selected storyboard cell prompt.
  - `生成全部镜头` creates downstream image nodes for all storyboard cells that already have prompts, with stable vertical spacing beside the storyboard node.
  - created image nodes keep `generationMode: standard`, copy the storyboard prompt, and store draft-safe `params.storyboard` metadata with source storyboard node id, cell id, shot number, aspect, and optional director/source ids.
- kept this action non-billable preparation work only; it does not create assets, enqueue workflow runs, reserve credits, or bypass the existing image-node generation/billing path.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` passed on 2026-07-05: 1 test file, 12 tests.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 1 test file, 10 tests.

## 2026-07-05 - Director Desk Storyboard Sync Phase 10

- added a director-shot-to-storyboard sync path for the canvas-native `3D导演台` studio:
  - `同步到故事板` sends the selected director shot and camera metadata to the canvas layer.
  - if a storyboard node already exists, its first matching/empty cell is patched with the shot title, prompt, director camera id, director shot id, and source director node id.
  - if no storyboard node exists, the canvas creates a `导演分镜板` node beside the director node and writes the first synced shot into its first cell.
- added `storyboardDirectorSync` utility coverage for target-cell selection and first-empty-cell fallback.
- kept the sync action non-billable and draft-safe; it does not create assets, start workflow runs, reserve credits, or write `blob:`, `data:`, base64, `File`, `Blob`, or long-lived signed URL values.
- validation:
  - `npm test -- src/flowCanvas/utils/storyboardDirectorSync.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 3 test files, 20 tests.

## 2026-07-05 - Director Desk Synthesize To Canvas Phase 9

- added the first canvas synthesis action inside the `3D导演台` studio:
  - `合成到画布` turns the selected director shot, or the first available shot, into a downstream image node beside the director node.
  - the created image node inherits the shot prompt first, then camera prompt, then a safe fallback prompt.
  - the image node stores structured `params.director3d` metadata with source director node id, camera id, shot id, camera position/target/focal data, motion, start time, and duration.
- kept this action as non-billable preparation work only; it does not create assets, start workflow runs, reserve credits, or bypass the existing server-side generation and billing path.
- kept generated canvas data draft-safe: no `blob:`, `data:`, base64, `File`, `Blob`, or long-lived signed URL values are written by the synthesis action.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx` passed on 2026-07-05: 1 test file, 9 tests.
  - `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 1 test file, 6 tests.

## 2026-07-05 - Production Image Mode Capability And Pricing Phase 8

- added AI Gateway runtime route capabilities for production image generation modes:
  - `/api/v2/ai/routes` now exposes safe `capabilities.supportedGenerationModes` merged from `ai_models.capabilities` and `ai_routes.request_config.capabilities`.
  - `/api/v2/ai/model-catalog/:modelKey/routes` exposes the same safe mode capability shape for the model-scoped route list used by image nodes.
  - capability output is restricted to known image modes: `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270`; provider/request-config internals stay server-side.
- added frontend route-option mapping for supported image generation modes, defaulting routes without explicit capabilities to `standard` only.
- added image-node UI guarding so unsupported 360°/270° modes are not offered for the active route, and stale unsupported production mode selections reset to `standard` after route metadata loads.
- added workflow-run preflight for production image modes:
  - unsupported production modes fail locally with `UNSUPPORTED_GENERATION_MODE` before draft flush / workflow creation.
  - production modes without resolvable active pricing fail locally with `PRICING_NOT_FOUND` before workflow creation.
  - standard image generation keeps the existing pricing/billing behavior.
- validation:
  - `npm test --workspace @aigc-flow/api -- test/ai-gateway.service.test.ts test/ai-model-catalog.service.test.ts` passed on 2026-07-05: 2 test files, 2 tests.
  - `npm run build --workspace @aigc-flow/api` passed on 2026-07-05.
  - `npm test -- src/services/v2AiRoutesApi.test.ts src/services/v2AiModelCatalogApi.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/nodes/ImagePromptActionRow.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 8 test files, 62 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Director Desk Three Viewport Phase 7

- replaced the CSS-only `3D导演台` central viewport placeholder with a real Three.js viewport component.
- added `DirectorDeskThreeViewport` under `src/flowCanvas/studios/` to render a live WebGL scene with:
  - grid floor
  - axis helper
  - placeholder humanoid actors from `director3d.actors`
  - camera markers/frustums from `director3d.cameras`
  - selected actor/camera highlight metadata
- kept the viewport visual/staging-only and non-billable; no AI rendering, export, asset creation, draft mutation, or billing workflow was added by the Three.js canvas itself.
- added jsdom fallback behavior so unit tests and constrained environments keep a mounted viewport host instead of crashing on missing WebGL.
- validation:
  - `npm test -- src/flowCanvas/studios/DirectorDeskThreeViewport.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 3 test files, 14 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - Playwright smoke against `output/playwright/director-viewport-smoke.html` passed on 2026-07-05:
    - desktop viewport: renderer `three`, canvas `980x620`, nonblank sampled pixels, screenshot `output/playwright/director-viewport-desktop.png`.
    - mobile viewport: renderer `three`, canvas `390x844`, nonblank sampled pixels, screenshot `output/playwright/director-viewport-mobile.png`.

## 2026-07-05 - Director Desk Inspector Editing Phase 6

- added selectable actor, camera, and shot rows inside the canvas-native `3D导演台` studio.
- added a compact inspector that persists basic director staging metadata:
  - actor rename through `对象名称`
  - actor visibility through `对象可见`
  - actor lock state through `对象锁定`
  - camera prompt through `镜头提示词`
  - shot prompt through `镜头段提示词`
- kept inspector selection as local UI state while all real scene edits persist through the existing `ProductionStudioShell` -> `updateNodeData` path into structured `director3d` node data.
- kept this slice staging-only and non-billable; no Three.js transform runtime, AI rendering, export, asset creation, or billing workflow was added.
- ensured director patches remain structured JSON and do not persist transient `blob:`, `data:`, base64, `File`, or `Blob` media.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 2 test files, 13 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Video Editor Studio Editing Phase 5

- added first real timeline editing actions inside the canvas-native `剪辑工程` studio:
  - `添加图片片段` appends a structured image clip placeholder backed by an `assetId` field.
  - `添加视频片段` appends a structured video clip placeholder backed by an `assetId` field.
  - `添加字幕` appends a structured subtitle item.
  - `工程时长（秒）` updates timeline duration in milliseconds.
- wired these actions through the existing `ProductionStudioShell` -> `updateNodeData` path so timeline edits persist in `videoEditor` node data.
- kept this slice editing-only and non-billable; no server export, asset creation, AI generation, or billing workflow was added.
- ensured video editor patches remain structured JSON and do not persist transient `blob:`, `data:`, base64, `File`, or `Blob` media.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 2 test files, 10 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Director Desk Scene Editing Phase 4

- added first real 3D Director Desk editing actions inside the canvas-native `3D导演台` studio:
  - `添加角色` appends a structured placeholder humanoid actor.
  - `添加镜头` appends a structured camera with position/target/focal metadata.
  - `捕获镜头段` appends a structured shot linked to the current camera.
- wired these actions through the existing `ProductionStudioShell` -> `updateNodeData` path so director scene edits persist in `director3d` node data.
- kept this slice staging-only and non-billable; no Three.js transform runtime, AI rendering, export, asset creation, or billing workflow was added.
- ensured director patches remain structured JSON and do not persist transient `blob:`, `data:`, base64, `File`, or `Blob` media.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` passed on 2026-07-05: 2 test files, 8 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Storyboard Studio Editing Phase 3

- added real editing controls to the canvas-native `故事板` studio: storyboard cells can now be selected and the selected cell title/prompt can be edited.
- wired the storyboard studio back to the existing canvas store through `updateNodeData`, so edits persist as structured `storyboard` node data in the project flow draft path.
- kept the slice editing-only and non-billable; no generation, asset creation, storyboard sheet composition, or billing reserve/settle path was added.
- reused `normalizeStoryboardData` and `patchStoryboardCell` so storyboard patches remain asset-reference/metadata based and do not persist transient `blob:`, `data:`, base64, `File`, or `Blob` values.
- validation:
  - `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardNodeData.test.ts` passed on 2026-07-05: 3 test files, 8 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Canvas Production Studio Shells Phase 2

- added canvas-native studio open events for `storyboard`, `director3d`, and `video_editor` nodes, so production nodes can open their workspace without becoming separate product shells.
- added a full-screen `ProductionStudioShell` overlay scoped to the current project canvas:
  - `3D导演台` shows scene objects, a director viewport grid, object properties, and a shot rail.
  - `故事板` shows storyboard cells plus selected-shot context.
  - `剪辑工程` shows an asset bin, preview monitor, timeline, and export/settings inspector shell.
- kept this slice editing-only and non-billable; no export, generation, billing reserve, or asset-write workflow was added.
- kept studio state local to the overlay and only read structured node data, avoiding transient `blob:`, `data:`, base64, `File`, or `Blob` persistence.
- added regression coverage for production-node open actions, studio layouts, Escape/close behavior, canvas event integration, and production node default labels.
- validation:
  - `npm test -- src/flowCanvas/nodes/ProductionNodes.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/nodeFactory.test.ts` passed on 2026-07-05: 4 test files, 13 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.
  - local in-app browser smoke could not be completed because Browser Use blocked reloading `http://localhost:64043/` under its URL policy.

## 2026-07-05 - Canvas Production Suite Phase 1

- added v2 canvas contracts and safe default draft data for `storyboard`, `director3d`, and `video_editor` nodes.
- exposed `故事板`, `3D导演台`, and `剪辑工程` in the left add panel, right-click pane menu, React Flow node registry, and canvas agent add-node policy.
- added image generation modes for `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270`, with UI labels for `360°全景`, `270°环绕`, and `主体三面展开`.
- wired image-node mode selection into structured `params.panorama` / `params.wraparound`, and preserved production-mode metadata in generated image snapshots and worker provider metadata.
- added storyboard normalization so cells are asset-reference based and unsafe transient media fields such as `blob:` or `data:` URLs are not persisted in storyboard data.
- validation:
  - `npm test -- src/flowCanvas/utils/nodeFactory.test.ts src/flowCanvas/utils/imageGenerationModes.test.ts src/flowCanvas/utils/storyboardNodeData.test.ts src/flowCanvas/nodes/ProductionNodes.test.tsx src/flowCanvas/nodes/ImagePromptActionRow.test.tsx src/flowCanvas/canvas/FlowLeftAddPanel.test.tsx src/flowCanvas/canvas/FlowContextMenu.test.tsx src/flowCanvas/agent/canvasAgentPolicy.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-05: 9 test files, 52 tests.
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts` passed on 2026-07-05: 1 test file, 13 tests.
  - `npm run build` passed on 2026-07-05 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-05 - Canvas Production Suite Design

- analyzed the current v2 canvas/workflow/assets/billing foundation for adding 360° panorama generation, 270° wraparound generation, 3D Director Desk, storyboard, and video editing.
- compared the requested references (`MagicalCanvas`, `TapCanvas`, `infinite-canvas`, and `zerocut-director-desk`) and selected a v2-compatible canvas-native production-suite direction rather than a separate forked app or preset-only patch.
- wrote the approved design spec at `docs/superpowers/specs/2026-07-05-canvas-production-suite-design.md`, covering UI, node model, studio surfaces, asset persistence, AI Gateway/workflow integration, billing, phased implementation, validation, and non-goals.
- no product code was changed in this step; implementation planning is the next step.

## 2026-07-05 - Canvas Image Generation Animation

- upgraded image-node generation feedback from a static gray skeleton to an animated in-node preview surface with flowing cyan/blue light, scan motion, breathing border, and a progress/status pill.
- kept the animation scoped inside the node so canvas size, handles, prompt controls, and final image replacement behavior are unchanged.
- added regression coverage for the animated generating preview surface and progress label.
- validation:
  - `npm test -- src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx` passed on 2026-07-05: 1 test file, 9 tests.

## 2026-07-04 - Canvas Reference Source Picker

- hardened the reference picker mode split so the `+` add-reference menu never inserts `@Image ...` into the prompt, while the `@` mention menu can still insert references explicitly.
- added regression coverage for both recent-asset picks and canvas-image picks from the `+` add-reference picker leaving `generationPrompt` unchanged.
- validation:
  - `npm test -- src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx` passed on 2026-07-04: 1 test file, 8 tests.

- changed reference insertion behavior so adding references through upload, recent assets, or canvas-source picker no longer auto-writes `@Image ...` tokens into the prompt editor.
- kept explicit mention insertion available when the user clicks an existing reference chip or confirms a candidate while actively typing an `@` mention.
- added regression coverage for local reference upload completion leaving `generationPrompt` unchanged while still attaching the uploaded asset reference.
- validation:
  - `npm test -- src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx` passed on 2026-07-04: 1 test file, 6 tests.

- fixed the prompt-bar local reference upload path so selected files create visible pending reference chips immediately from local `blob:` URLs, even when browser image decoding is slow or stalled.
- restored the missing `uploadAssetFile` import used by local reference uploads and surfaced upload failures through the image node error bar instead of failing silently.
- added a regression test covering the file-selection path with a stalled `createImageBitmap` preview decode.
- validation:
  - `npm test -- src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx` passed on 2026-07-04: 1 test file, 5 tests.

- fixed local canvas reference uploads so selecting a file immediately shows a local preview reference chip while the asset upload runs, instead of appearing to do nothing until the network round trip finishes.
- added image-file extension fallback for reference uploads so browser-provided empty or generic MIME types on `.png`, `.jpg`, `.webp`, `.gif`, and `.avif` files no longer get silently ignored.
- updated worker image request assembly so image-node `referenceAssetItemIds` are merged into provider `inputAssets` using `referenceOrder`, making uploaded/local asset references affect real generation just like upstream canvas references.
- validation:
  - `npm test -- src/flowCanvas/utils/localImageUpload.test.ts`
  - `npm test -- src/flowCanvas/utils/referenceSourceResolver.test.ts`
  - `npm test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build` passed with existing Browserslist, chunk-size, and dynamic-import warnings only.

- hardened agent-side reference uploads so a successful image upload is still returned even when the follow-up metadata enrichment call cannot run because of permission or transient API failure.
- this prevents the `上传参考图` action from failing after storage upload completion, which keeps the Agent reference chip flow usable in creator workspaces that only have asset create access.
- validation:
  - `npm test -- src/assets/assetApi.test.ts src/flowCanvas/agent/CanvasAgentReferenceUploadButton.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx` passed on 2026-07-04.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, chunk-size, and dynamic-import warnings only.

- fixed canvas reference selection so choosing a canvas image from the picker now resolves the node directly and creates the expected upstream reference even before it has already been wired into the graph.
- added a local preview fallback path for reference uploads so newly uploaded image references remain visible even when the immediate asset response has no `previewUrl` yet.
- updated reference chip resolution to prefer the locally cached preview for asset references, which keeps the image reference strip visible during the upload-to-library handoff.
- validation:
  - `npm test -- src/flowCanvas/utils/referenceSourceResolver.test.ts src/flowCanvas/nodes/ReferenceSourcePicker.test.tsx src/flowCanvas/utils/localImageUpload.test.ts` passed on 2026-07-04: 3 test files, 11 tests.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, chunk-size, and dynamic-import warnings only.

- replaced the image-node placeholder reference menu with a real `ReferenceSourcePicker` surface that can add references from current canvas image nodes, recent asset-library images, or direct upload, while keeping the picker mounted only when opened.
- wired the prompt-bar `+` affordance to the source picker and changed the left prompt icon into a true reference-upload entry point that uploads image files and appends them as references on the active image node.
- centralized reference-chip resolution through `referenceSourceResolver` so canvas references and asset-backed references share the same ordering and labeling logic.
- added focused regression coverage for the new reference source resolution helper and the picker UI.
- validation:
  - `npm test -- src/flowCanvas/utils/referenceSourceResolver.test.ts src/flowCanvas/nodes/ReferenceSourcePicker.test.tsx` passed on 2026-07-04: 2 test files, 4 tests.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-07-04 - Image Parameter Popover And Batch Mode Refinement

- compacted the Nano Banana and GPT-image-2 parameter popovers by reducing the fixed menu width, panel padding, control heights, ratio tile heights, gaps, and radius sizes so the size/ratio controls read as a coordinated canvas menu instead of a large panel.
- changed the image quantity menu so selecting a batch count greater than one defaults to `多节点显示`, keeps the menu open, and closes only after the user explicitly chooses `合并显示` or `多节点显示`.
- added focused regression coverage for compact parameter density and the batch-count display-mode confirmation flow.
- validation:
  - `npm test -- src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx` passed on 2026-07-04: 3 test files, 14 tests.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-04 - Canvas Batch Image Node Display Fix

- moved multi-image display mode selection into the image quantity menu for batch counts greater than one, so the bottom prompt action row no longer gains an extra wide control that can overflow the editor.
- added an action-row fallback layout that moves any future batch display-mode control into a secondary row instead of forcing it into the primary model/settings/quantity/generate row.
- changed main canvas image previews to `object-fit: contain` so thumbnails are shown completely instead of cropped, while keeping small result/reference chips unchanged.
- updated generated asset hydration to write `width`, `height`, and `aspectRatio` from the asset's real dimensions, aligning generated 1:1 nodes to the same canvas display size.
- validation:
  - `npm test -- src/flowCanvas/nodes/ImagePromptActionRow.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts` passed on 2026-07-04: 3 test files, 30 tests.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-04 - Image Viewer Comparison Bounds Fix

- fixed fullscreen original-comparison edge behavior by calculating the generated image's actual `object-fit: contain` display rectangle and constraining the comparison stage to that visible image area.
- changed comparison rendering so the original reference fills the generated-image rectangle with `cover`, while the generated result is clipped inside the same stage from 0% to 100%.
- validation:
  - `npm run test -- src/flowCanvas/utils/imageViewerComparison.test.ts src/flowCanvas/utils/imageViewerFileSize.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx` passed on 2026-07-04: 4 test files, 12 tests.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-07-04 - Image Viewer Original Comparison

- added first-reference original comparison metadata for image-to-image generations so the fullscreen viewer can show an `原图对比` control only when a generated image has reference inputs.
- added a draggable split-view comparison in the fullscreen viewer, using the first reference image as the original side and keeping text-to-image results without the comparison button.
- changed fullscreen image metadata timestamps from date-only to minute-level date/time display.
- validation:
  - `npm run test -- src/flowCanvas/utils/imageViewerComparison.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/utils/imageViewerFileSize.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx` passed on 2026-07-04: 6 test files, 45 tests.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-07-04 - Image Viewer Original File Size Fix

- fixed the fullscreen image viewer information panel so file size is based on the original asset `sizeBytes` when an `assetId` is available, matching the file that the download button retrieves.
- kept a safe fallback to the displayed image URL blob size for local/transient images or when asset metadata is unavailable.
- validation:
  - `npm run test -- src/flowCanvas/utils/imageViewerFileSize.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx` passed on 2026-07-04: 3 test files, 5 tests.

## 2026-07-04 - Canvas Toolbar And Prompt Bar Density Tightening

- tightened the selected image floating toolbar so canvas edit actions use smaller shared tokens: 36px buttons, 18px icons, lower padding, tighter gaps, and smaller tooltips.
- compacted the bottom floating prompt editor density across text/image/video variants, with the image prompt bar reduced to `clamp(560px, 44vw, 820px)`, 128px minimum height, 14px editor text, 28px controls, and smaller reference chips.
- reduced image prompt reference thumbnails, mention pills, prompt action row spacing, and credit/send controls so the editor reads as a compact canvas control instead of a large modal panel.
- tightened the second-pass toolbar spacing by reducing floating-toolbar gaps and moving top toolbars closer to selected nodes, with the text-node toolbar specifically using slimmer button padding.
- validation:
  - `npm run test -- src/flowCanvas/utils/promptBarDensity.test.ts src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/imageMenuStyles.test.ts src/flowCanvas/nodes/ImagePromptActionRow.test.tsx` passed on 2026-07-04: 4 test files, 9 tests.
  - `npm run build` passed on 2026-07-04 with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-07-03 - Agent Panel New Chat And Frontend API Proxy Fix

- fixed the Agent panel new-chat action so it clears the active session, replayed history, tool timeline, continuation context, and composer state without immediately reopening the latest saved session.
- added history-state cleanup when the active Agent session becomes empty, preventing stale replay messages from remaining visible after starting a new conversation.
- added a production static frontend `/api` proxy in `scripts/serve-dist.cjs` so direct access through the frontend service can reach `/api/v2/*` instead of falling through to the SPA/static server.
- wired `tapflow-frontend` to proxy to `http://tapflow-api:3366` in `docker-compose.staging.yml`.
- validation:
  - `npm test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx` passed on 2026-07-03: 1 test file, 12 tests.
  - `npm test -- scripts/serve-dist.test.ts` passed on 2026-07-03: 1 test file, 3 tests.
  - `npm test -- src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/useAgentConversationHistory.test.tsx` passed on 2026-07-03: 2 test files, 20 tests.
  - `npm run build` passed on 2026-07-03 with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-07-03 - Agent Executor Tool Call SQL Bind Fix

- fixed a production Agent executor failure in the durable `agent_tool_calls` insert path where the SQL placeholder count no longer matched the bound parameter array during approved tool execution.
- restored correct persistence of `permission_level`, `status`, `arguments_json`, `input_json`, `cost_estimate_json`, and `created_by` for executor-created tool calls, which unblocks `approveToolCall` from failing with Postgres `08P01` bind errors.
- added a repository-level regression test that validates SQL placeholder counts against the bound parameter array so future changes to the durable Agent tool-call insert cannot silently reintroduce this mismatch.
- validation:
  - `npm run test --workspace @aigc-flow/api -- agent-tool-runner.test.ts` passed on 2026-07-03: 1 test file, 18 tests.
  - `npm run test --workspace @aigc-flow/api` passed on 2026-07-03: 25 test files passed, 139 tests passed, 16 files skipped by existing suite guards.
  - `npm run build` passed on 2026-07-03 with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-07-02 - Agent Panel Handdrawn V1

- rebuilt the creator Agent panel around the approved hand-drawn right-side workspace direction: ordered icon toolbar, central chat stream, bottom composer, upload references, and inline result cards.
- added and hardened structured Agent reference context from composer/panel state through the v2 Agent turn payloads, with current-turn uploads, selected canvas image refs, and continuation refs represented by safe `assetId` + `refId` values.
- kept reference and generated media on the v2 asset path; request/reference context payloads do not carry `previewUrl`, signed URLs, `blob:`, `data:`, base64 media, `File`, or `Blob` values.
- polished the Phase 1 creator-facing Agent UI copy: Chinese state labels, compact empty chat state, ordered toolbar labels, result thumbnails/dimensions/status, and follow-up actions.
- validation:
  - `npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentReferenceUploadButton.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/canvasAgentApi.test.ts` passed on 2026-07-02: 9 test files, 65 tests.
  - `npm run test --workspace @aigc-flow/api -- agent-schemas.test.ts agent-reference-context.test.ts agent-executor.test.ts agent-tool-runner.test.ts agent-tool-schemas.test.ts` passed on 2026-07-02: 5 test files, 68 tests.
  - `npm run build` passed on 2026-07-02 with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-07-01 - Infinite Canvas Style Agent Copilot UI Rewrite

- rewired the default Agent panel toward the infinite-canvas-style Canvas Copilot interaction model instead of the previous tab-heavy right-side workspace.
- removed the first-viewport `对话 / 历史 / 连接配置 / 日志` primary tab strip from the default Agent surface and replaced it with compact utility actions for history, connections, and logs.
- changed the Agent shell header to a compact `TapFlow Agent / Canvas Copilot` presentation with state copy and docked canvas behavior.
- made the conversation stream the primary surface and moved the composer into a prompt-first bottom dock with selected/reference chips directly above the prompt.
- collapsed model, route, and size controls behind the secondary `Model` affordance so generation settings no longer dominate the Agent entry state.
- simplified the empty state and action previews so the panel reads like a canvas copilot that can create, connect, and run nodes rather than a generic debug console.
- repaired the Agent result card user-facing copy from mojibake to clean UTF-8 Chinese labels.
- tightened replay continuation tests to wait for rendered Agent results before invoking continuation actions, removing parallel test flakiness.
- validation:
  - `npm test -- src/flowCanvas/agent` passed: 31 test files, 104 tests.
  - `npm run build` passed with existing Browserslist, chunk-size, and dynamic-import warnings only.

## 2026-06-30 - TapFlow Agent Canvas Tooling And Graph Context Upgrade

- completed the backend half of the infinite-canvas-style Agent upgrade so the executor can now understand and apply first-class canvas operations through the v2 server-authoritative path.
- extended the Agent tool contract to include canvas structure actions:
  - `create_canvas_nodes`
  - `update_canvas_node`
  - `connect_canvas_nodes`
  - `select_canvas_nodes`
  - `run_canvas_node`
- promoted those canvas tools into the model-facing registry and executor prompt so the model can propose graph edits explicitly instead of hiding them inside generic generation turns.
- updated agent policy to treat pure canvas layout actions as `safe_write`, canvas node updates as `confirmed_write`, and node execution as `credit_required`.
- replaced the old planner context dump with a graph-aware summary that includes selected, upstream, and downstream node summaries instead of only mirroring the raw snapshot.
- wired canvas tool execution through `AgentCanvasService`, so approved canvas ops now persist to the authoritative flow draft and emit replayable session events.
- unified the agent bootstrap so the API shares a single session repository and canvas service instance across executor, canvas ops, and session replay paths.
- added and updated tests covering:
  - canvas tool schema parsing
  - canvas tool policy classification
  - graph context summarization
  - canvas tool execution
  - executor prompt/tool registry visibility
- validation:
  - `npm run test --workspace @aigc-flow/api -- agent-tool-schemas.test.ts agent-tool-policy.canvas.test.ts agent-context-builder.canvas.test.ts agent-tool-runner.test.ts agent-executor.test.ts agent-canvas-ops.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`
  - `npm run test --workspace @aigc-flow/api`

## 2026-06-30 - Agent Workspace State Machine And Canvas Confirmation Alignment

- aligned the TapFlow Agent workspace interaction model with the approved infinite-canvas-style copilot direction without changing the existing v2 backend contract.
- introduced an explicit frontend workspace state machine for the Agent panel:
  - `idle`
  - `reading_context`
  - `thinking`
  - `plan_ready`
  - `awaiting_canvas_confirm`
  - `applying_canvas_ops`
  - `awaiting_credit_confirm`
  - `running_workflow`
  - `asset_ready`
  - `failed`
  - `replay`
- refactored the Agent session hook to derive legacy coarse status from the new workspace state while preserving existing session, replay, tool approval, and streaming behavior.
- updated the Agent UI surfaces to use the richer state model:
  - workspace shell header now reflects compact state labels
  - composer enable/disable behavior now follows workspace state instead of loose busy flags
  - composer shows a compact state-specific hint while preserving the current draft
  - conversation view supports state-specific busy copy
  - plan execution now distinguishes `创建流程` from `创建并执行`
- added a dedicated pending canvas operation card that summarizes node creation, node updates, connections, run count, and credit-impact warning before agent-driven canvas writes.
- timeline generation now includes pending canvas operations when the agent is waiting for canvas confirmation, which makes the panel read like a canvas operator instead of a generic chat box.
- replay hydration now restores a richer workspace state so reopened sessions land in a more faithful UI mode.
- validation:
  - `npm test -- src/flowCanvas/agent/canvasAgentStateMachine.test.ts src/flowCanvas/agent/CanvasAgentCanvasOpsCard.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentPlanCard.test.tsx src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx`
    - all targeted tests passed except one panel test selector ambiguity during the last focused run before the final test fix
  - `npm run build` passed with the existing chunk-size and dynamic-import warnings only

## 2026-06-26 - Agent Workspace V2 Redesign

- rebuilt the Agent frontend into a right-side production workspace modeled on the approved V2 redesign while preserving the existing TapFlow v2 server-side executor, session, task, asset, billing, and workflow architecture.
- replaced the old split debug-style panel with a unified creator-facing workspace shell:
  - `对话 / 历史 / 连接配置 / 日志` tabs
  - docked workspace header and shell state
  - production composer with reference chips, friendly model/线路 selection, and visible credits context
  - one unified conversation timeline for messages, progress, parameter confirmation, tool execution, results, and errors
- added dedicated workspace view components for conversation, history, connections, logs, model-route picking, result cards, and timeline rendering.
- normalized replay/session hydration so refresh and history reopening rebuild the same user-facing workspace state instead of exposing fragmented internal runtime sections.
- kept creator UI clean by hiding provider/vendor internals such as route keys, provider keys, upstream model names, adapter labels, and base URLs from the normal Agent workspace surfaces.
- aligned continuation/reference behavior with the product rules:
  - selected canvas nodes surface as reference chips
  - previous Agent outputs surface as continuation chips/actions
  - old upstream image-node prompt text is not reused as hidden prompt input
- validation:
  - `npm test -- src/flowCanvas/agent/agentWorkspaceTimeline.test.ts src/flowCanvas/agent/CanvasAgentTabs.test.tsx src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentModelRoutePicker.test.tsx src/flowCanvas/agent/CanvasAgentTimeline.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentIntegration.test.tsx` passed
  - `npm test -- src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/agentReplayState.test.ts` passed
  - `npm run build` passed with existing Vite chunk-size and dynamic-import warnings only

## 2026-06-26 - Director Agent Tool-Call Tolerance And Session History Cleanup

- hardened the Director Agent executor path against a common real-model failure mode where a single-image request is returned in `generate_image_batch` shape with only one image item.
- backend tool-call parsing now normalizes that one-item batch shape into `generate_image` instead of failing the whole turn immediately on schema mismatch.
- improved Agent session usability in the canvas UI:
  - new Agent sessions now use a short title derived from the user's prompt instead of repetitive defaults like `Canvas Agent`
  - conversation history loading in the Director panel is now scoped to the current `projectId` and `flowId`, reducing unrelated session noise
- this directly addresses the staging symptoms where:
  - the real model returned slightly off-spec tool payloads and the panel surfaced raw schema errors
  - the session history list filled with many indistinguishable `Canvas Agent` items
- validation:
  - `npm run test -- apps/api/test/agent-tool-schemas.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npm run build` passed with existing Vite chunk-size/dynamic-import warnings

## 2026-06-26 - Agent Workspace V2 Redesign Documents

- documented the next Agent rebuild direction as `Agent Workspace V2`, using `basketikun/infinite-canvas` as the UX reference while preserving TapFlow v2 server-side sessions, assets, billing, workflow execution, and AI Gateway routing.
- added a formal design spec covering:
  - right-side docked Agent workspace
  - conversation/history/config/log tabs
  - production composer with references, model/line selection, parameters, and credits
  - unified user-facing timeline for progress, parameters, tool execution, results, and errors
  - strict requirement that provider internals, base URLs, route keys, upstream models, and credentials stay out of normal creator UI
- added an implementation plan that breaks the redesign into testable tasks from timeline adapter and shell components through composer, history, integration tests, local UI verification, build, and push.
- no production code behavior was changed in this documentation-only step.

## 2026-06-26 - Director Frontend Build Flag And Classic Runtime Copy Fix

- fixed the staging deployment gap where `VITE_AGENT_DIRECTOR_ENABLED` was only present as a runtime container env and therefore did not affect the already-built frontend bundle.
- Docker frontend build wiring now passes `VITE_AGENT_DIRECTOR_ENABLED` into the image build stage so `tapflow-frontend` can actually ship the Director UI when staging enables it.
- `docker-compose.staging.yml` now forwards the Director flag through `build.args` for the frontend service instead of relying only on runtime env injection.
- tightened the Agent panel runtime copy so `Classic Agent` no longer shows Director-specific "real model planning" language when the classic runtime is still active.
- added regression coverage for:
  - Dockerfile build-time Director env injection
  - Classic runtime status copy not impersonating Director mode
- validation:
  - `npm run test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx scripts/dockerfile-env.test.ts`
  - `npm run build` passed with existing Vite chunk-size/dynamic-import warnings

## 2026-06-26 - Canvas Director Agent Phase 6 Multi-Turn Artifact Refs

- completed the Phase 6 continuity slice so Agent follow-up production now reuses stable artifact refs instead of leaking old prompt text or depending on transient URL-like inputs.
- backend executor/tool context hardening:
  - executor model context now injects only safe previous-result ref data: `assetId`, `kind`, `label`, `refId`
  - active continuation context is now reduced to stable asset/ref identity fields only
  - continuation/tool-result payloads no longer include historical `promptSummary` in the model loop
  - image continuation execution keeps using asset ids / ref ids, not raw URLs, base64 payloads, or provider internals
- frontend continuation UX improvements:
  - Agent composer now supports clickable artifact ref chips for replayed continuation results
  - continuation prompt copy is now built from selected result labels only, without carrying forward stale prompt text from earlier image nodes
  - when a continuation references multiple historical outputs, the composer now surfaces the full selected ref set instead of only the primary result
- replay/director stability:
  - event-stream replay remains session-scoped and no longer rehydrates with prompt-summary leakage into continuation requests
  - refresh/re-entry continues to restore prior result refs so users can keep iterating without re-uploading references
- this keeps the product aligned with the rule that reference-image history may provide reference assets only; old upstream prompt text must not be reused as hidden generation input.
- validation:
  - `npm run test -- src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/agentArtifactRefs.test.ts src/flowCanvas/agent/useAgentEventStream.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx apps/api/test/agent-executor.test.ts`
  - `npm run build` passed with existing Vite chunk-size/dynamic-import warnings

## 2026-06-25 - Canvas Director Agent Phase 3 Parameter Execution Closure

- completed the remaining Phase 3 image-parameter confirmation closure for the current Director Agent path.
- frontend parameter confirmation now supports quantity selection (`1/2/3`) and updates the displayed estimated credits in real time based on selected model, route, size, and quantity.
- backend Agent run settings now advertises quantity options so production users can actually choose multi-image output before approving paid execution.
- cost estimation now multiplies single-image requests by `n` and estimates batch image items by each item's own route, size, and quantity.
- confirmed Agent settings now pass through the whole execution chain:
  - Agent approval selection
  - tool runner
  - workflow run input `agentTool`
  - worker image request construction
  - provider-facing metadata/params, including `size`, `aspectRatio`, `quality`, `output_format`, `moderation`, and `n`
- Agent workflow input and approval events keep provider internals out of the user-facing payload; visible summaries use product model names, route labels, size/aspect/quantity, estimated credits, and reference counts.
- worker image requests now convert Agent reference asset IDs into provider input assets and merge them with upstream canvas assets without duplicating the same asset ID.
- task cards and replayed Agent events now preserve draft/confirmed parameter summaries so users can audit what will be used or what was used after refresh.
- validation:
  - `npm run test --workspace @aigc-flow/api -- agent-cost-estimator.test.ts agent-tool-runner.test.ts agent-run-settings.test.ts agent-executor.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm test -- src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx`

## 2026-06-25 - Canvas Director Agent Phase 4 Durable Image Task Engine

- completed the Phase 4 image-task MVP for the Director Agent path.
- Agent image production now creates durable `agent_tasks` rows before workflow execution instead of relying only on legacy `agent_tool_calls`.
- single image and image-edit tool calls now:
  - create a queued task first
  - emit `task_created` before provider/workflow launch
  - mark the task running, succeeded, or failed
  - persist safe output links including workflow run id, node run id, asset refs, and normalized error details
- batch image generation now creates all child task rows/cards before launching the first workflow run, then runs child workflow launches concurrently within a bounded runner limit.
- Agent executor now delegates task lifecycle events to the tool runner so the UI can show task cards before the model/provider result returns.
- durable Agent event replay now understands `task_completed` and `task_failed`, allowing refresh/re-entry to restore successful and failed child tasks.
- frontend Agent task state now updates immediately for task completion/failure events while preserving provider/baseUrl/upstream model secrecy.
- video and compare tools remain intentionally out of this MVP until their real workflow/runtime paths are implemented safely.
- validation:
  - `npm run test --workspace @aigc-flow/api -- agent-cost-estimator.test.ts agent-tool-runner.test.ts agent-run-settings.test.ts agent-executor.test.ts agent-event-service.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm test -- src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/canvasAgentToolEvents.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build` passed with existing Vite chunk-size/dynamic-import warnings

## 2026-06-24 - Canvas Director Agent Phase 0-1 Skeleton

- started the approved Canvas Director Phase 0-1 implementation behind safe feature flags instead of replacing the current Agent path outright.
- added backend Director dark-launch plumbing:
  - `AGENT_DIRECTOR_ENABLED` env parsing in the API config
  - new `agent_tasks` and `agent_task_events` tables with tenant-scoped indexes and RLS in migration `000036_agent_tasks_events.sql`
  - new Agent session/history/event APIs for:
    - listing sessions
    - reading durable session history
    - replaying session events
    - streaming replay events
    - appending user messages
- added a minimal session repository plus event replay service so the new Director shell can reload prior conversation state after refresh instead of relying only on local panel state.
- added frontend Director preview plumbing:
  - `VITE_AGENT_DIRECTOR_ENABLED` env flag
  - runtime badge in the Agent header showing `Classic Agent` vs `Director Runtime (preview)`
  - minimal conversation list/thread shell
  - `useAgentConversationHistory` and `useAgentEventStream` hooks for replay-first history/event loading
- preserved the existing classic Agent path as the rollback/default behavior when the Director flag is off.
- validation:
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/useAgentConversationHistory.test.tsx src/flowCanvas/agent/useAgentEventStream.test.tsx`
  - `npx vitest --run apps/api/test/agent.test.ts` currently skips in this workspace because the repo's DB-backed guard did not detect database env for local execution

## 2026-06-24 - Canvas Director Agent Phase 2 Visible Activity Timeline

- continued the approved Director rollout with the Phase 2 runtime-visibility slice so Agent turns no longer appear static while execution is happening.
- backend executor now emits explicit user-visible status events during real tool execution:
  - `thinking_status`
  - `workflow_run_linked`
  - existing `tool_started`, `approval_required`, `tool_result`, `turn_completed`, `turn_failed`
- executor status flow now includes:
  - immediate "Understanding request" signal at turn start
  - "Creating task card" before tool execution
  - workflow run linkage after launch so the UI can show that the model job is in flight
- tool-runner results now return workflow linkage metadata alongside asset refs so frontend runtime cards can stay connected to the underlying workflow run.
- frontend Agent session state now keeps a dedicated activity timeline in addition to the existing tool timeline.
- added a new `CanvasAgentActivityTimeline` component and rendered it in the Agent panel so users can see ordered execution progress such as:
  - understanding request
  - submitting generation task
  - waiting for parameter confirmation
  - waiting for model result
  - saving result
  - completed / failed
- validation:
  - `npx vitest --run apps/api/test/agent-executor.test.ts src/flowCanvas/agent/canvasAgentToolEvents.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/CanvasAgentActivityTimeline.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Canvas Director Agent Phase 3 Parameter Confirmation Slice

- started the approved Phase 3 work for Director Agent image execution, focused on the first usable parameter-confirmation slice instead of jumping ahead into the full durable task engine.
- added backend Agent image run-settings support:
  - new `AgentRunSettingsService`
  - `GET /api/v2/agent/run-settings/image`
  - `GET /api/v2/agent/run-settings/image/estimate`
- the new Agent run-settings response is intentionally user-facing only:
  - exposes product model display names, route labels, size tiers, aspect-ratio options, and estimated credits
  - does not expose provider/baseUrl/api key/upstream model/authorization internals
- reused the existing AI model catalog and route pricing path so image routes stay aligned with the v2 AI Gateway catalog instead of introducing a second configuration source.
- added the first Director parameter confirmation UI building block:
  - `CanvasAgentParameterCard`
  - route / size / aspect-ratio selection
  - live credit updates from official route size tiers
- connected approval-required Agent tool cards to lazily load image run settings and render the new parameter card shell instead of only showing a generic approval message.
- completed the first end-to-end approval propagation path for image execution:
  - frontend approval now submits confirmed `routeKey`, `routeLabel`, `size`, `aspectRatio`, and display-name settings
  - backend approval resume flow now reapplies those user-confirmed values onto the pending `generate_image` tool call before re-estimating cost, rechecking policy, and launching generation
- expanded the parameter confirmation card from single-model route switching into a multi-model selection surface:
  - users can now switch between available image models inside the same Agent approval card
  - selecting a different model resets to that model's default line and size context
  - route choices and live credit totals now follow the currently selected model instead of staying locked to the first catalog model
- split the Agent approval parameter surface by model family instead of forcing every model through one generic control layout:
  - Nano Banana approval now uses the dedicated Nano Banana size/ratio panel
  - GPT-Image-2 approval now uses the dedicated GPT-Image-2 panel with quality, output format, and moderation controls
  - GPT-specific confirmation values are now preserved in frontend selection state and accepted by backend approval validation/executor override logic
- extended approval override propagation to batch image execution:
  - `generate_image_batch` tool arguments now accept the same user-facing route/model/size/aspect/quality fields as single-image execution
  - when a batch task is resumed from approval, the confirmed settings are now applied uniformly to every batch image item before cost revalidation and execution
- this remains an incremental Phase 3 slice rather than the full phase:
  - image confirmation is now real and executable
  - batch/image-edit/video-specific parameter confirmation still remains as later Phase 3 follow-up
- validation:
  - `npx vitest --run apps/api/test/agent-run-settings.test.ts apps/api/test/agent-executor.test.ts src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentActivityTimeline.test.tsx src/flowCanvas/agent/canvasAgentToolEvents.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Canvas Director Agent Phase 3 Edit Image Approval Alignment

- finished the next Phase 3 follow-up slice by wiring `edit_image` into the same approval override path as image generation instead of leaving it as a partial backend-only change.
- backend executor, schema, registry, and runner support now treat `edit_image` as a first-class approval-resumable production tool:
  - approved route/model/size/aspect/quality settings are reapplied before re-estimation and execution
  - the tool still stays on the existing workflow/billing/asset pipeline instead of introducing a separate image-edit execution path
- frontend session state now labels `edit_image` tool cards as explicit image-edit work instead of showing them as generic image-generation tasks, keeping the visible Agent activity closer to the real production action.
- added regression coverage so edit-image approval tasks remain stable as later Phase 3 work continues.
- validation:
  - `npx vitest --run src/flowCanvas/agent/useCanvasAgentSession.test.tsx apps/api/test/agent-executor.test.ts apps/api/test/agent-run-settings.test.ts src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Canvas Director Agent Edit Image Reference-Aware Approval

- extended the Phase 3 approval UX so `edit_image` tasks no longer hide their reference context during confirmation.
- backend approval-required events now include a safe `referenceRefs` summary for image-edit and other reference-aware production tasks:
  - only friendly reference IDs are exposed
  - no provider internals, signed URLs, base64 payloads, or secret fields are returned
- frontend Agent approval cards now render those reference refs directly inside the parameter confirmation card, making image-edit confirmations visibly tied to the source images the Agent is about to use.
- this keeps the Agent panel closer to the expected production-director experience: users can now see both the paid parameters and the editing references before confirming credit spend.
- validation:
  - `npx vitest --run apps/api/test/agent-executor.test.ts src/flowCanvas/agent/canvasAgentToolEvents.test.ts src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Canvas Director Agent Task Summary Recall

- extended the Agent task cards so confirmed production settings remain visible after approval and after the task completes.

## 2026-06-26 - Canvas Director Agent Phase 5 Canvas Operations And Provenance

- completed the Phase 5 canvas-director slice that makes the Agent operate the canvas through the server-backed draft path instead of only creating local nodes.
- backend canvas ops now apply approved Agent operations to `flow_drafts`, retry once on revision conflict, and persist a replayable `canvas_op_applied` event in `agent_task_events`.
- Agent-created or Agent-updated nodes now carry `agentMetadata` provenance with session/turn linkage and a visible highlight timestamp so the canvas can distinguish Agent-authored changes from user edits.
- the canvas UI now shows a compact `Agent` badge on Agent-authored text/image nodes and a `查看 Agent 过程` action that opens the Agent panel focused on the originating session.
- the Agent panel and canvas shell now share a stable session-open event path so node clicks can jump back into the correct Agent conversation/thread.
- validation:
  - `npm run test --workspace @aigc-flow/api -- agent-canvas-ops.test.ts agent-event-service.test.ts`
  - `npm run test -- agentCanvasBinding.test.ts FlowNodes.agent-metadata.test.tsx CanvasAgentPanel.test.tsx CanvasAgentIntegration.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-25 - Agent Multi-Result Continuation Selection

- upgraded Agent continuation from single-result follow-up to multi-result selection so users can combine multiple historical outputs into the next turn instead of only switching one active result.
- frontend continuation/task-card improvements:
  - task cards now support selecting multiple generated results with clear `加入/已选` state
  - continuation actions now adapt to multi-result context, for example `基于已选 2 张结果继续编辑`
  - continuation payloads now carry:
    - primary asset id / ref id / label for compatibility
    - multi-result `assetIds`, `assetRefIds`, and `assetLabels`
  - Agent thread continuation chips and composer prompts now use normalized Chinese copy instead of corrupted mojibake text
- backend continuation/runtime improvements:
  - `createAgentTurn` schema now accepts multi-result continuation arrays while remaining backward compatible with the original single-result fields
  - executor approval pause/resume now persists and restores continuation context, preventing approved tool resumes from losing the selected history-result references
  - tool runner now injects all selected continuation asset ids into image generation when explicit reference refs are absent
- this slice keeps the current v2 Agent path stable while making multi-turn production work feel much closer to an actual director workflow: users can pick several prior results, continue from them, and preserve that context through execution/approval/resume.
- validation:
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx apps/api/test/agent-tool-runner.test.ts apps/api/test/agent-executor.test.ts src/flowCanvas/agent/CanvasAgentThread.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

## 2026-06-25 - Agent Continuation Carry-Forward And Next-Step Guidance

- deepened the new continuation workflow so a selected historical result set is no longer a one-shot action.
- frontend session/runtime changes:
  - added `lastContinuation` session state so the most recent selected continuation result set survives after the prompt is sent
  - users can now continue sending follow-up requests against the same chosen result set without reselecting assets every time
  - Agent panel now shows a lightweight `建议下一步` guidance banner whenever a continuation context is active, making it clearer that the next turn can keep using the selected historical outputs
- replay/director stability:
  - tightened the Director replay hydration guard so replay events are not re-applied in a loop while the same session remains active
- user-facing outcome:
  - the Agent now behaves less like a one-off prompt helper and more like a continuous production assistant that remembers which result group the user is currently iterating on
- validation:
  - `npx vitest --run src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx apps/api/test/agent-tool-runner.test.ts apps/api/test/agent-executor.test.ts src/flowCanvas/agent/CanvasAgentThread.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
- successful or pending task cards now show a friendly execution summary built only from user-facing values:
  - product model display name
  - route label
  - size and aspect ratio
  - reference image count when reference refs were used
- preserved the confirmed selection in `toolTimeline.estimate.currentSelection` through the post-approval execution flow, so users can still audit what settings were used after the card moves from approval into success/failure states.
- this improves the replay/review value of the Agent panel without exposing `route_key`, provider names, upstream model names, or other admin/runtime internals.
- validation:
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npm run build`

## 2026-06-24 - Canvas Director Agent Durable Task Identity In UI

- started the Phase 4 transition by carrying the durable backend tool-call/task identity into the frontend Agent task timeline instead of leaving completed cards keyed only by ephemeral `toolCallKey`.
- `tool_result` handling now preserves the persisted backend `toolCallId` as a visible `taskId` on the frontend timeline item.
- Agent task cards now render that durable identifier as a small user-visible `Task ID` line, which makes it easier to correlate:
  - frontend task cards
  - backend replay/debug records
  - later durable task/event restoration work
- this keeps the current UI compatible with the upcoming fuller Phase 4 task engine while still avoiding provider/runtime secret leakage.
- validation:
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npm run build`

## 2026-06-24 - Canvas Director Agent Task Created / Artifact Created Events

- continued the Phase 4 transition by upgrading the executor event stream from a tool-only view toward a real task/event model.
- backend executor streams now emit:
  - `task_created` immediately after a persistent backend tool-call/task record exists
  - `artifact_created` for each generated asset ref returned by the task
- frontend SSE parsing and session state now understand those new events while remaining backward-compatible with the older `tool_started` / `tool_result` events.
- the Agent task timeline now benefits from this in two ways:
  - durable task identity is attached earlier in the run, not only after result parsing
  - asset refs can appear as first-class task artifacts instead of being inferred only from the final result payload
- this is still an incremental Phase 4 step, but it moves the Agent much closer to an event-sourced durable task engine.
- validation:
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/canvasAgentToolEvents.test.ts apps/api/test/agent-executor.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Agent Production Tool Execution Alignment

- tightened the real LLM Agent executor so production image requests must produce executable `generate_image` or `generate_image_batch` tool calls instead of returning advice-only text.
- added a one-shot repair prompt modeled after the reference Agent workflow: if the text model forgets tool calls for an image production request, the executor asks for strict JSON tool output; if it still refuses, the turn fails closed instead of pretending to complete.
- changed Agent workflow launching to wait for the backend workflow run to reach a terminal state before extracting generated asset references, avoiding "submitted but no asset returned" races.
- made successful Agent tool results automatically place generated asset nodes on the canvas while preserving asset IDs as the source of truth and avoiding persisted URLs/base64.
- aligned the empty-canvas Agent flow with the reference app behavior: production image prompts now auto-create a selected runnable image target node, flush the remote draft before execution, and reuse that node for the first generated result instead of asking the user to create a node manually.
- validation:
  - `npm run test --workspace @aigc-flow/api -- agent-executor.test.ts agent-tool-runner.test.ts agent-tool-policy.test.ts agent-tool-schemas.test.ts agent-production-intent.test.ts`
  - `npm test -- src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/canvasAgentOps.test.ts src/flowCanvas/agent/canvasAgentToolEvents.test.ts src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx`

## 2026-06-22 - Canvas Temporary Reference Chip Preview Ownership

- fixed connected temporary reference chips so downstream image nodes receive the upstream `referenceUploadId` and create their own local IndexedDB object URL for chip thumbnails and hover previews instead of reusing an upstream node's revocable `blob:` URL.
- kept prompt/editor display recoverable after refresh while preserving provider submission safety: browser-local `blob:` URLs are still filtered out of generation `referenceImages`.
- added graph-index regression coverage that verifies temporary reference uploads propagate their stable reference-upload identity through connected upstream refs.
- validation:
  - `npm run test -- src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/services/flowProjectApi.test.ts src/flowCanvas/utils/referenceImageLocalCache.test.ts src/flowCanvas/utils/localImageUpload.test.ts`
  - `npm run build`

## 2026-06-22 - Canvas Temporary Reference Connection Preview Fix

- fixed canvas temporary reference-upload image nodes so restored local preview URLs are written back into node data, allowing the graph index to expose connected upstream references in the next image node's reference chips.
- kept provider submission safe by filtering browser-local `blob:` preview URLs out of `referenceImages`; backend workflow execution continues to use the durable `referenceUploadId` input asset path.
- added graph-index regression coverage for temporary reference uploads whose local preview URL is restored after the edge already exists.
- validation:
  - `npm run test -- src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/services/flowProjectApi.test.ts src/flowCanvas/utils/referenceImageLocalCache.test.ts src/flowCanvas/utils/localImageUpload.test.ts`
  - `npm run build`

## 2026-06-22 - GPT-Image-2 Workbench Reference Params Alignment

- aligned standalone workbench GPT-Image-2 line one reference-image requests with the canvas/provider edit payload shape by normalizing size tiers plus aspect ratios into explicit OpenAI-compatible pixel sizes before worker submission.
- reused the AI Gateway OpenAI image size normalization helper instead of duplicating size math in the worker, so combinations such as `4k + 3:2` resolve consistently to `3520x2352`.
- scoped the change to official `image.gpt-image-2` workbench generations with hydrated reference images; Nano Banana, text-to-image workbench requests, and GPT-Image-2 provider-side size-routing lines keep their existing parameter shape.
- validation:
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-21 - Temporary Reference Images for Canvas Uploads

- changed new canvas local image uploads to use the same temporary reference-upload path as the standalone image workbench instead of creating asset-library records.
- added local IndexedDB preview caching for canvas temporary reference uploads so the same browser can restore a preview when the draft only contains a `referenceUploadId`.
- updated workflow compilation/runtime handling so reference-upload image nodes compile as static image inputs and worker execution hydrates them from `workbench_reference_uploads` before provider calls.
- added a migration to make temporary reference uploads expire after 7 days by default and extend still-active 24-hour records to the new retention window.
- generation outputs continue to persist through the existing asset pipeline and remain visible in `/assets`.
- validation:
  - `npm run test -- src/flowCanvas/services/flowProjectApi.test.ts src/flowCanvas/utils/referenceImageLocalCache.test.ts src/flowCanvas/utils/localImageUpload.test.ts`
  - `npm run test --workspace @aigc-flow/workflow-core`
  - `npm run test --workspace @aigc-flow/worker`
  - `npm run test --workspace @aigc-flow/db`
  - `npm run build`
  - `npm run test --workspace @aigc-flow/api` currently has an unrelated existing failure in `test/ai-gateway.schemas.test.ts` (`Either modelId or modelFamily must be provided`).

## 2026-06-21 - Sharper Asset Thumbnails

- increased generated image thumbnail variants from 320px to 640px on the longest edge and raised WebP thumbnail quality from 72 to 80.
- applied the same thumbnail setting to both worker-generated output assets and direct asset-library image uploads.
- note: existing asset thumbnail variants remain at their previously generated resolution until a variant backfill/regeneration job is run.
- validation:
  - `npm run test --workspace @aigc-flow/worker -- media-variants.test.ts`
  - `npm run test --workspace @aigc-flow/api -- test/assets.test.ts -t "upload-bytes creates preview variants"` was skipped locally because the API database-backed test suite requires database env.

## 2026-06-21 - Original Download Cross-Origin Navigation Fix

- fixed a regression where original image downloads could open the Rainyun/OSS signed object URL as an image page instead of downloading the file.
- root cause: browsers can ignore the frontend `download` attribute for cross-origin image URLs when the object-storage response does not force `Content-Disposition: attachment`.
- the shared download helper now fetches signed object URLs into a blob URL before triggering the browser download, and disables direct URL fallback for signed object downloads so failed cross-origin fetches fall back to authenticated `/api/v2/assets/:assetId/bytes` instead of navigating away.
- validation:
  - `npm run test -- src/flowCanvas/utils/imageDownload.test.ts src/flowCanvas/utils/imageUtils.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-21 - Faster Original Image Download UX

- optimized the shared original-image download path used by both canvas and standalone workbench:
  - `downloadOriginalImage` now prefers the authenticated asset `download-url` API and triggers the returned signed object-storage URL directly, avoiding the previous full image byte fetch through `/api/v2/assets/:assetId/bytes` before the browser showed any download response.
  - the previous same-origin `/bytes` download remains as a fallback when a signed URL cannot be created, and visible preview/download URLs still work for non-asset cases.
  - repeated clicks for the same original image are deduplicated while the first download is preparing, preventing users from accidentally starting multiple identical downloads.
  - a short-lived page notice now appears immediately after clicking download so users see that the original image download is being prepared.
- validation:
  - `npm run test -- src/flowCanvas/utils/imageDownload.test.ts src/flowCanvas/utils/imageUtils.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## Purpose

This file is the root-level running project record for the current TapFlow v2 product path.

Use it to track:

- current product status
- latest validated environment status
- common deployment and rollback commands
- important operational notes
- dated progress records for each meaningful improvement

Rule for future updates:

- after each meaningful product, infrastructure, deployment, or staging-validation change, update this file in the same task or immediately after

## 2026-06-21 - Workbench MouxiHub T3 Reference Image Bytes Fix

- fixed the OpenAI-compatible image adapter so multiline / wrapped `data:image/...;base64,...` reference images are decoded as real image bytes before being sent as multipart edit inputs
- this targets the `/workbench` Nano Banana Pro line two MouxiHub T3 path, where temporary workbench reference uploads are hydrated as data URLs before the adapter submits `/v1/images/edits`
- added regression coverage that verifies a workbench-style data URL reference is sent to MouxiHub multipart edits with the original PNG header bytes, not a corrupted literal data URL payload
- validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## Current Product Status

Repository direction:

- v2 authenticated AI Flow workspace product
- one user-facing project maps to one primary Flow canvas
- canvas draft persistence is server-side
- assets are backed by cloud object storage
- billing uses reserve / settle / refund server-side flow
- AI provider/model routing uses the v2 AI Gateway path

Primary user-facing routes:

- `/login`
- `/register`
- `/workspace`
- `/projects/:projectId`
- `/assets`
- `/billing`
- `/account`

Current deployment baseline:

- branch: `main`
- server path: `/opt/aittco/tapflow`
- compose file: `docker-compose.staging.yml`
- env file: `/opt/aittco/env/tapflow.staging.env`

## Current Key Status Snapshot

As of 2026-06-21:

- Fixed standalone workbench reference-image compatibility for the MouxiHub `Nano Banana Pro` official T3 route (`image.mouxihub.nano-banana-pro.t3`) by removing `quality` and `moderation` from workbench-side request params for that route only:
  - root-cause evidence from upstream relay comparisons showed the same `2k` model and `image[]` payload produced normal reference-aware token usage on canvas, but workbench requests collapsed to near text-only token usage when `quality=auto` and `moderation=auto` were present.
  - `apps/worker/src/workbench/workbench-generation.service.ts` now strips those two params while keeping reference assets, mirrored `metadata.referenceImages`, aspect ratio, size, and output format intact for the T3 workbench path.
  - added a regression test proving the T3 workbench request still forwards reference images but omits `quality` and `moderation`, and updated the debug-summary test to match the new expected payload.
- Validation:
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts` passed.
  - `npm run build --workspace @aigc-flow/worker` passed.

- Added targeted debug instrumentation for the MouxiHub `Nano Banana Pro` official T3 route (`image.mouxihub.nano-banana-pro.t3`) to compare standalone workbench vs canvas reference-image requests end to end:
  - `apps/worker/src/workbench/workbench-generation.service.ts` now logs `workbench.generation.request_debug` with prompt, route, selected image params, reference image counts, and whether workbench references arrived as signed URLs or data URLs.
  - `apps/worker/src/workflow-runtime/service.ts` now logs `workflow.image.request_debug` for canvas/image-node executions on the same T3 route, using the same summary fields so workbench and canvas runs can be compared directly.
  - `packages/ai-gateway-core/src/database-media-runtime.ts` now logs `media.generate.request_debug` after the provider request is built, including provider model, whether the request actually used the edit endpoint, and the image-count summary that will reach the upstream relay.
  - This instrumentation is intentionally summary-only: no API keys and no full image payload bytes are written to logs.
- Validation:
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts` passed.
  - `npx vitest run packages/ai-gateway-core/test/runtime.test.ts -t "database media runtime emits T3 request debug summaries for image edits"` passed.
  - `npm run build --workspace @aigc-flow/worker` passed.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed.

- Fixed workbench image-to-image compatibility for the MouxiHub `Nano Banana Pro` official T3 route (`image.mouxihub.nano-banana-pro.t3`):
  - `apps/worker/src/workbench/workbench-generation.service.ts` now mirrors hydrated workbench reference assets into `metadata.referenceImages` in addition to `inputAssets` before calling the media runtime.
  - This aligns workbench provider requests more closely with the already-working canvas path, so async OpenAI-compatible edit routes can reliably detect reference images and stay on the image-edit path instead of degrading toward text-only generation behavior.
  - Added a worker regression test proving that persisted asset URLs and temporary upload data URLs both propagate into `metadata.referenceImages` for workbench provider requests.
- Validation:
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts` passed.
  - `npm run build --workspace @aigc-flow/ai-gateway-core` passed.
  - `npm run build --workspace @aigc-flow/worker` passed.

- Staging deployment config now forwards `WORKER_IMAGE_VARIANTS_MODE` into the container environment through `docker-compose.staging.yml`, so server env-file changes can switch image variant handling between `sync` and `async` without another code change.
- `docs/STAGING_ENV_TEMPLATE.md` now documents `WORKER_IMAGE_VARIANTS_MODE = async` as the recommended staging setting for faster first-result delivery when original asset persistence can complete before preview/thumb variants finish in the background.
- Operational note:
  - after pulling this change to `/opt/aittco/tapflow`, add `WORKER_IMAGE_VARIANTS_MODE=async` to `/opt/aittco/env/tapflow.staging.env` and restart `tapflow-worker`
- Fixed the async image-variant timing race in the worker path:
  - `MediaAssetStore` no longer enqueues `asset.image-variant` jobs from inside the same database transaction that inserts the `assets` row.
  - workbench generation and workflow runtime now defer variant queue pushes until after the surrounding transaction commits, which prevents transient `Asset not found for image variant processing` failures under async variant mode.
- Validation:
  - `npx vitest run apps/worker/test/media-asset-store.test.ts apps/worker/test/workbench-generation.service.test.ts apps/worker/test/worker.test.ts` passed.
  - `npm run build` passed.

As of 2026-06-20:

- Added the first formal performance instrumentation pass for workbench image generation:
  - `DatabaseMediaRuntime` now emits structured `media.generate.*` and `media.poll.*` logs with stable correlation fields such as `generationId`, `routeKey`, `tenantId`, `nodeRunId`, `workflowRunId`, and `traceId`.
  - `MediaAssetStore` now emits structured `asset.persist.*` and `asset.variant.*` stage logs for provider output download, original upload, asset row insert, variant generation, variant upload, variant row insert, and per-asset completion.
  - `WorkbenchGenerationService` now emits `workbench.generation.*` summary logs covering generation start, provider completion, asset persistence completion, final success, and failure.
  - frontend workbench generation flow now records browser performance marks/measures for submit, generation-created, preview-url-ready, and first-image-visible timing via shared workbench performance helpers.
- Validation:
  - `npx vitest run packages/ai-gateway-core/test/runtime.test.ts -t "database media runtime emits structured performance logs for generate and poll calls"` passed.
  - `npx vitest run apps/worker/test/media-asset-store.test.ts apps/worker/test/workbench-generation.service.test.ts` passed.
  - `npx vitest run src/performance/performanceMarks.test.ts src/workbench/useWorkbenchPerformance.test.tsx src/workbench/WorkbenchPage.test.tsx -t "marks submit and generation-created performance events when creating a workbench generation"` passed.
  - `npm run build` passed.

- implemented the screenshot-directed workbench/workspace/canvas UI refinement pass:
  - removed the workbench-only multi-image display toggle controls for quantity greater than 1 on desktop and mobile, without changing the canvas multi-image controls.
  - simplified workbench reference thumbnails to image-first tiles with a small numeric badge and click-to-insert mention behavior.
  - expanded the workbench fullscreen preview image area and moved the action panel lower.
  - project cover thumbnails now prefer the clearer `preview` variant and fall back to `thumb` for speed compatibility.
  - workspace project creation now auto-generates a default `新项目 MM-DD HH:mm` name and opens the canvas directly.
  - canvas media node success events now carry output assets so generated images can hydrate before the whole workflow run finishes.
  - double-clicking a canvas image node opens fullscreen preview.
  - removed the canvas top-right share button and restored clean Chinese toolbar labels.
  - restored the workbench desktop top-right credit balance and notification button.
- Validation:
  - `npx vitest run src/workbench/WorkbenchPage.test.tsx src/workspace/WorkspacePage.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/canvas/FlowTopToolbar.test.tsx` passed.
- desktop `/workbench` received the screenshot-directed Scheme 3 subtraction pass on desktop only:
  - removed the entire top-right desktop workbench header action rail, including `沉浸式创作空间`, the desktop credit pill, and the `历史 / 通知 / 分享` icon buttons.
  - removed the desktop right-column result panel header chrome, so the result feed now starts directly at the scrollable content without the `Results Workspace / 创作结果流 / count` strip.
  - kept the existing mobile workbench header and mobile balance pill behavior unchanged.
- Validation:
  - `npx vitest run src/workbench/WorkbenchPage.test.tsx src/workbench/WorkbenchDesktopResultFeed.test.tsx` passed.

- Brand logo and transition surfaces received the Scheme B cleanup:
  - all shared `BrandMark` renderings now treat `/logo-2.png` as a transparent PNG, removing the previous black/framed logo surface and heavy logo box shadows.
  - project/canvas transition loading now uses a floating transparent logo with a soft ambient glow instead of a rectangular loading card.
  - transition states now avoid overlaying the animated infinity particle layer on top of the provided logo asset.
- Validation:
  - `npx vitest run src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx src/flowCanvas/FlowProjectPage.test.tsx` passed.

- Operations Console B implementation is in progress on the v2 admin path:
  - `/admin` has been rebuilt as a production-oriented operations console with modules for overview, user management, admin account management, credits/redeem codes, announcements, usage audit, model routes, provider connections, and system monitoring.
  - admin identity is now explicit in the admin console and account dropdown: `system_admin` / `ADMIN_EMAILS` resolve to super admin, while `admin:system` resolves to admin.
  - admin user management now surfaces credit balance, used credits, expiring credit grants, usage audit summary, and last login time.
  - redeem codes now have admin list and redemption-record APIs so generated codes, usage count, user, and redemption time are visible.
  - announcement management now has a tenant-scoped database table and admin create/update/list APIs with title, body, link, image, status, and audience fields.
  - route reliability stats now aggregate recent `ai_call_logs` success rate and latency for the admin monitor and top-bar admin indicator.
- Validation:
  - `npm run build --workspace @aigc-flow/api` passed.
  - `npm run build` passed.
  - `npx vitest run apps/api/test/admin.test.ts -t "includes user credit expiry and usage audit fields"` skipped because local `DATABASE_URL` is not configured.

- Operations console redeem-code hotfix:
  - added migration `000032_billing_redeem_code_plaintext.sql` so `billing_redeem_codes.code` exists before the admin redeem-code history API selects it.
  - new admin-created redeem codes now persist the plaintext code alongside `code_hash` for admin history/copy actions; historical rows without plaintext stay visible with copy disabled.
  - staging/production must run the compiled DB migrator before restarting the worker/API path.
  - follow-up migration fix restored applied migration `000030_admin_announcements.sql` to its original checksum; announcement pinning remains in `000031_admin_announcements_interactions.sql` so production migrator can advance to the redeem-code migration.

- Operations console user and notification controls:
  - added server-side announcement read receipts so opening the bell marks notices read and clears the unread dot across refreshes.
  - redeem-code history now exposes user-facing `已兑换/未兑换` semantics and permits deleting only unredeemed codes.
  - super admins can disable/enable user accounts; disabling revokes active sessions and prevents login.
  - super admins can manually add or subtract credits through audited billing ledger entries; debits also reduce active credit grants to keep expiry totals aligned.
  - user detail now includes recent credit ledger changes, and the admin-account tab now lists only admin/super-admin accounts instead of all creators.

- Shared product logo usage was aligned to the latest screenshot request:
  - `BrandMark` now loads `/logo-2.png` explicitly, which is the 300x200 horizontal Aittco logo asset.
  - homepage header, standalone workbench header, mobile workbench header, and canvas top-left project logo now inherit the horizontal 300:200 logo proportions instead of the older square/circular mark.
- Validation:
  - `npx vitest run src/app/brand/BrandMark.test.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` is currently blocked by unrelated in-progress admin worktree state: Vite reports `Could not resolve "../admin/AdminPage" from "src/app/AppRouter.tsx"` even though `src/admin/AdminPage.tsx` exists in the working tree.

- Home/global top navigation received the latest screenshot-directed polish:
  - the header Aittco logo now uses a dedicated larger header mark size while keeping the requested high-resolution logo asset, avoiding blurry CSS-only scaling.
  - the creator navigation order now places `无限画布` before `生图工作台`.
  - the billing entry is now labeled `账单充值` instead of `价格方案`.
  - the mobile shell navigation grid now uses five columns to match the five creator entries.
- Validation:
  - `npx vitest run src/app/WorkspaceShell.test.tsx` passed.
  - `npm run build` passed.

- Home/global top navigation received the requested compact chrome pass:
  - the left brand trigger now shows only the round Aittco logo and no longer displays the `AI Flow` text or workspace subtitle in the header.
  - the account menu trigger now shows only the avatar initial and chevron while keeping the full account details inside the dropdown.
- Validation:
  - `npx vitest run src/app/WorkspaceShell.test.tsx` passed.
  - `npx vitest run src/app/WorkspaceShell.test.tsx src/workspace/HomePage.test.tsx` passed.
  - `npm run build` passed.

As of 2026-06-19:

- desktop `/workbench` fullscreen preview received a layout pass to match the latest review markup:
  - the desktop image stage now reserves a larger viewport-sized display box so previewed originals read bigger and clearer while still using full `contain` behavior.
  - the desktop bottom action strip (`下载原图 / 引用参考 / 重新生成`) now sits lower as a detached floating band, leaving a clearer black buffer area below the image like the approved reference.
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

- desktop `/workbench` fullscreen preview received another desktop-specific correction:
  - fullscreen batch navigation now tracks the explicitly selected result id instead of relying on a mutable local index, so left/right switching and thumbnail switching stay aligned with the clicked image.
  - the fullscreen preview stage now uses a fixed viewport-sized contain box, so desktop images render by longest-edge complete display instead of appearing like a cropped strip.
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

- desktop `/workbench` preview and result metadata received a follow-up polish:
  - desktop result-card metadata now uses plain creator-facing spacing between `模型 / 线路 / 比例 / 尺寸 / 时间`, removing the broken separator glyph from the right feed.
  - fullscreen preview now preserves more vertical room on desktop so wide images display more completely.
  - desktop fullscreen preview now keeps multi-image batches switchable from the selected thumbnail onward instead of behaving like a single-first-image preview.
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

- desktop `/workbench` result flow now follows the approved unified-feed structure instead of the old `当前任务 / 已完成结果` split:
  - the right side is now one chronological desktop creation feed that matches the mobile mental model more closely.
  - desktop feed first render shows the newest 4 records and loads 4 more when the user scrolls to the bottom.
  - desktop result cards now reuse the shared ratio-aware mosaic layout rules used by mobile for 1 / 2 / 3 / 4 image batches, including wide and ultra-wide arrangements.
  - desktop card actions moved into a compact top-right overflow menu (`下载原图 / 引用参考 / 重新生成 / 删除记录`) instead of the older always-open desktop action strip.
  - clicking a desktop thumbnail now opens the fullscreen preview directly, keeping the desktop and mobile review flows aligned.
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

- Creator-facing desktop UI labels and entry density were tightened based on screenshot review:
  - top navigation now names `/workbench` as `生图工作台` and `/workspace` as `无限画布`.
  - home quick-entry labels now mirror those product names.
  - `/workspace` no longer renders the large `我的工作空间` hero banner, so project filters and project cards start near the top of the page.
  - `/billing` no longer renders the large `选择你的套餐` hero banner or hero refresh button, so plan tabs and pricing cards start near the top of the page.
- Validation:
  - `npx vitest run src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/billing/BillingCenterPage.test.tsx src/workspace/HomePage.test.tsx` passed.
  - `npm run build` passed.

- mobile `/workbench` creation feed received a focused usability pass after screenshot review:
  - feed metadata now includes generated time beside model/route/aspect/size.
  - phone workbench opens at the newest task by scrolling the feed to the bottom.
  - mobile history rendering is windowed to the newest 8 records first, with older records revealed as users scroll upward.
  - result-card menus now include `重新生成`, which refills the mobile creation panel with the previous prompt, references, model, and parameters.
  - fullscreen result preview now uses the title `结果预览` and exposes only `下载原图`, `引用参考`, and `重新生成` actions.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` passed.

- mobile `/workbench` result area was rebuilt into the approved single chronological creation feed while preserving the existing top header, bottom creation bar, and mobile parameter sheet:
  - the old large current-stage card and separate `Current Tasks` / `Completed` mobile sections were removed.
  - generations now sort by `createdAt` ascending so newer work appears near the bottom input bar.
  - each feed card shows creator-facing model/route/aspect/size metadata, fixed output slots, immediate completed thumbnails, and pending/failed placeholders for unfinished batch outputs.
  - tapping a completed mobile feed image now opens the fullscreen original preview directly, while same-batch left/right navigation remains available there.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` passed.

- Runtime frontend version reminder is in place for long-lived browser tabs:
  - `npm run build` now writes `dist/version.json` with build version, commit, and timestamp metadata.
  - the built `index.html` receives `window.__TAPFLOW_BUILD_VERSION__` so the running page knows its boot version.
  - the React app checks `/version.json` with no-store cache semantics every 1 hour.
  - when the deployed server version differs from the running page version, users see a global `发现新版本` refresh prompt.
  - `scripts/serve-dist.cjs` now serves `version.json` with `no-store, no-cache, must-revalidate`.
- Validation:
  - `npx vitest run scripts/write-build-version.test.ts scripts/serve-dist.test.ts src/app/version/versionReminder.test.ts src/app/version/AppVersionReminder.test.tsx` passed.
  - `npm run build` was attempted but is currently blocked by unrelated billing worktree state: `src/billing/BillingCenterPage.tsx` imports `./BillingLedgerTable` while `src/billing/BillingLedgerTable.tsx` and `src/billing/BillingUsageTable.tsx` are deleted in the working tree.

As of 2026-06-18:

- mobile `/workbench` shell received a corrective follow-up for the approved phone skeleton: the bottom creation dock now reads as a much lighter JiMeng-style single-line input bar instead of a heavy summary card, mobile scroll containers now hide browser scrollbar artifacts more aggressively, and the mobile shell / result feed / parameter sheet files were normalized to clean creator-facing Chinese copy after recent encoding regressions.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` passed.

- mobile `/workbench` bottom creation dock received an additional corrective pass after device review: the dock is now one horizontal bar only, with reference button + single-line prompt entry + start button; model/route/aspect/size/quantity summary text was removed from the bottom dock so it no longer wraps into a heavy card.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` passed.

- mobile `/workbench` follow-up adjusted the reviewed phone chrome:
  - top-left back button was reduced from the oversized circle treatment.
  - top-right history icon button was removed.
  - bottom dock now keeps only the reference image's single pill input (`图片生成 > 请描述画面内容`) instead of a multi-control bottom bar.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` passed.

- mobile `/workbench` shell has been refit for the approved phone workflow: mobile now uses a single compact top navigation header, a dedicated middle scroll container for results, and a JiMeng-style bottom creation bar that opens the existing mobile creation panel instead of duplicating a heavy summary dock; the current mobile creation panel content itself was intentionally preserved.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` passed.

- mobile `/workbench` second-stage polish is now in place on top of the new mobile shell: fullscreen result preview supports same-batch left/right switching with a bottom thumbnail rail, the mobile reference strip has stronger thumbnail treatment with clearer `@图N` insertion affordances plus mobile-style swipe feedback, and mobile result cards now separate active vs completed sections with cleaner creator-facing parameter chips and a more product-like action menu.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx` passed.
  - `npm run build` passed.

- Single-creator SaaS user/billing direction implemented in the v2 path: normal login no longer asks creators for tenant ID, and the account page no longer exposes internal user IDs, tenant IDs, raw roles, or raw permissions to normal users.
- Billing now has membership-tier semantics for `standard`, `silver`, `gold`, and `platinum`, with generation reserve discounts of 100%, 95%, 90%, and 80% respectively.
- Billing schema now includes expiring credit grants and per-reserve grant allocations, so credits can be issued as 1-month, 3-month, 1-year, custom, or lifetime batches and spent from expiring grants before lifetime grants.
- Admin user management is being formalized for platform operations: system admins can search across users, update a user's membership tier for a selected workspace, and issue expiring credit grants.
- Workbench and workflow-run reservations now apply membership discounts before reserving credits, and worker settlement/refund metadata includes `reserveLedgerId` so reserved grant allocations can be settled or released.
- Validation:
  - `npx vitest run src/auth/AuthPages.test.tsx src/account/AccountPage.test.tsx src/billing/BillingCenterPage.test.tsx` passed.
  - `npm run test --workspace @aigc-flow/db -- billing.test.ts` passed available tests; DB-backed tests were skipped because no local `DATABASE_URL` is configured.
  - `npm run test --workspace @aigc-flow/api -- admin.test.ts workbench-service.test.ts` passed workbench tests; admin DB-backed tests were skipped because no local `DATABASE_URL` is configured.
  - `npm run build --workspace @aigc-flow/api`, `npm run build --workspace @aigc-flow/worker`, and `npm run build` passed.

As of 2026-06-13:

- TapNow-style visual alignment work has been iterated several rounds on canvas layout, add-node menus, user menus, and node title density
- project-scoped image workbench V1 is implemented on top of the same v2 flow draft/runtime path: desktop now has a left-parameter plus right-batch-feed workbench surface, mobile project entry defaults to workbench mode, workbench generations create normal image nodes with shared autosave plus target-node workflow execution, and completed assets continue to land in the same canvas/assets pipeline
- media asset preview optimization is implemented
- historical asset variant backfill script is implemented and validated on staging
- staging asset backfill has been executed successfully
- `/projects` and `/assets` loading experience improved and validated
- production/staging Docker image base Node version upgraded from 18 to 22
- staging runtime confirmed on Node `v22.22.3` for both API and worker
- local image upload smoothness root cause identified: upload entry points still wait for image decode/measurement before first canvas paint
- upload smooth preview execution plan added at `docs/superpowers/plans/2026-06-11-upload-smooth-preview-pipeline.md`
- image generation target-node input propagation fixed: upstream text nodes, image/upload asset nodes, and `batchCount` now reach the worker/provider request instead of remaining visual-only canvas state
- image crop/resize/split/annotation/generated-result derived nodes now render immediately with a local preview while cloud asset persistence continues in the background
- model-backed image node tools now use the v2 target-node workflow path, so logged-in v2 users no longer hit the legacy `auth-session-v1` billing login error from repaint/erase/outpaint/relight/multi-angle/enhance/remove-background actions
- v2 image edit result nodes now persist the resolved preview URL back into canvas node data, show a model/route run label while generating, and forward source asset URLs into Visionary/Gemini image adapters so edit models receive the actual input image
- target-node image edit tools now preserve the selected runtime `routeKey` from the canvas model line, avoiding wrong-line fallback that could yield completed white result images even when the workflow itself succeeded
- target-node image edit launches now wait for any in-flight remote draft save to finish and then save the latest canvas graph before creating the workflow run, so newly created edit target nodes are present in server-side `flow_drafts` before API/worker execution begins
- image edit tools now ignore stale generic `image.default` route keys on uploaded/asset-backed source nodes when a model-scoped runtime route is available, preventing edits from silently running through the mock/default image route instead of the configured provider relay
- target-node workflow launch now marks missing backend `node_run` snapshots as a visible node failure with diagnostic launch status instead of leaving a blank white result card
- target-node image edit launch no longer stalls at `workflowLaunchStatus: saving_draft` when a manual run-save barrier overlaps an existing autosave; `saveNow()` now performs a foreground latest-graph flush before allowing workflow run creation to continue
- same-origin asset bytes responses now normalize `content-length` from the actual response body and fall back from empty preview variants to original image bytes, addressing completed image-edit runs that rendered as 0-byte white previews
- image edit worker requests now recover route keys from nested edit metadata when the top-level node route key is missing, preventing model-backed edits from falling back to the mock `image.default` route
- canvas image previews now use browser-loadable signed preview URLs again, with automatic recovery from older saved authenticated `/bytes` URLs
- text target-node runs now correctly complete the node UI after a successful GPT-5.5 response, and worker-side text prompt assembly now honors `generationPrompt` for text nodes without upstream text input, fixing empty-prompt replies like `I got an empty prompt ([])`
- canvas top-left project menu now renders through a body-level fixed portal with TapNow-style width and anchored positioning, preventing overlap with the left dock and keeping project-menu dismissal behavior stable when other toolbar menus open
- canvas model pickers now align more closely with add-node menu density: image/text model menu labels use the shared compact menu rhythm and the image model picker/dropup width has been narrowed to better match the prompt-bar target width
- GPT-image-2 multi-image generation now follows the same one-image-per-request batching strategy already used by GPT-image-2 reference edits, preventing upstream `The provider rejected the request payload` failures when creators set image count above `1`
- MouxiHub GPT-Image-2 `线路三` / `线路四` upstream failure root cause was confirmed from production `ai_call_logs`: we were sending pixel `size` together with already size-suffixed upstream models, which made MouxiHub internally resolve invalid model names like `gpt-image-2-4k-4k`; runtime fallback now forces these two routes to use provider-side base models (`gpt-image-2` / `gpt-image-2-vip`) while still forwarding the existing GPT-image-2 pixel-size payload
- workbench completed-result cards now render every image returned by a multi-image generation inside the same finished task card instead of collapsing the UI to the first result only; backend asset persistence was already correct, this fix closes the desktop workbench presentation gap for quantity `> 1`
- Follow-up root cause for MouxiHub GPT-Image-2 `线路四` was also fixed: legacy `ai_routes.upstream_model` values were still being injected into `requestConfig.model` and could override the new line-four runtime fallback, so provider-side GPT-Image-2 base model routing now prefers dedicated `providerBaseModel`/route defaults over stale normalized route config
- desktop `/workbench` has now been restructured into a fixed three-pane docked workstation: the desktop shell reads as `3:5:2`, the left parameter dock keeps the existing composer UI with a pinned footer action area, the center pane is split into current-task stage plus recent-task window capped to the newest 8 operational tasks, and the right dock now shows completed-only history with no active generations mixed into that rail
- `/assets` drag multi-select now uses a floating contextual toolbar at the user's selection endpoint instead of a sticky top bulk bar, with cancel, select all, favorite, download original, and delete actions available next to the selection
- `/assets` drag multi-select has been further reworked against the smoother `D:\gpt-iamge-2` task-grid interaction pattern: selection now uses page coordinates, drag thresholding, hit slop, body-level text-selection suppression, auto-scroll near viewport edges, and a fixed screen-centered floating toolbar instead of edge-sensitive selection-bound positioning
- standalone `/workbench` follow-up fixes are in place: desktop left parameter dock now keeps the generate action visible at 100% browser zoom, fullscreen result preview constrains images by viewport longest-side fit, completed cards expose download/reference/delete actions, and active stuck tasks can be soft-deleted/canceled with reservation refund protection
- workbench multi-image generation now uses parent batch rows plus one-image child generation rows, allowing each image to appear as soon as its child task finishes while preserving grouped creator-facing batch cards, partial-progress polling, and single parent-level billing settlement/refund semantics
- v2 auth refresh now coalesces concurrent frontend refresh attempts, proactively refreshes near-expiring access tokens, avoids clearing login state on transient server errors, and honors configured token TTL values

## 2026-06-20 - Operations Admin Interaction Fixes

- completed the operations console interaction loop after the first B+ admin rollout:
  - route monitor top-bar pill now exposes a hover/focus reliability panel with per-line success rate, success/total count, and average latency
  - redeem-code history now returns and displays the actual historical code value and adds copy buttons for newly generated and historical codes
  - announcements now support pinned state, publish/archive/delete operations, a user-facing published announcement feed, and a top-bar bell panel with link/image support
- added a follow-up migration for already-deployed databases so `announcements.pinned` is added after the original announcements migration has run
- validation:
  - `npm run build`
  - `npm run build --workspace @aigc-flow/api`
  - `npx vitest run apps/api/test/admin.test.ts` skipped locally because no `DATABASE_URL` is configured

## 2026-06-18 - Auth Refresh Stability Upgrade

- Added frontend v2 auth refresh single-flight behavior so concurrent API calls share one `/api/v2/auth/refresh` request instead of racing the same rotating refresh token.
- Added proactive access-token refresh when a JWT is close to expiry, reducing user-visible 401 refresh cycles during normal usage.
- Changed refresh failure handling so only confirmed invalid/unauthorized refresh-token failures clear stored auth; transient server errors and rate-limit style failures no longer immediately kick users out.
- Changed AuthProvider session loading so temporary `/auth/me` failures preserve stored tokens and show an error instead of forcing logout.
- Fixed API environment parsing so `ACCESS_TOKEN_TTL_SECONDS` and `REFRESH_TOKEN_TTL_SECONDS` now control the actual access/refresh token lifetimes.
- Validation:
  - `npx vitest run src/services/v2HttpClient.test.ts`
  - `npx vitest run src/auth/AuthProvider.test.tsx`
  - `npm run test --workspace @aigc-flow/api -- env.test.ts`

## 2026-06-18 - B+ Single-Creator Operations Console Follow-up

- Added product-role helpers for the single-creator SaaS permission model:
  - `super_admin` has full platform privileges.
  - `admin` can access the operations console and user/usage management surfaces.
  - `creator` remains the normal end-user role.
- Updated the shared authenticated shell so creator accounts no longer see provider/model connection entries in the user menu, while admin-capable users see an operations-console entry.
- Synced the user dropdown billing summary with the v2 billing API so it shows available credits and membership tier instead of stale placeholder account data.
- Reworked the billing usage table around creator-facing billing fields:
  - time
  - event type
  - product model / route label
  - generation parameters
  - quantity
  - credits
  - settlement/refund status
- Removed technical billing details from the normal billing table presentation, including workflow task ids, idempotency keys, raw usage ids, and backend operation labels.
- Added route protection so creator accounts are redirected away from admin, provider connection, model settings, template-library, and inspection surfaces.
- Added the B+ operations-console information architecture to the admin page:
  - user management
  - membership management
  - credit grants
  - usage audit
  - model route management
  - provider connection management
  - administrator account management
- Implementation plan recorded at `docs/superpowers/plans/2026-06-18-b-plus-operations-console.md`.
- Validation:
  - `npx vitest run src/app/WorkspaceShell.test.tsx src/billing/BillingCenterPage.test.tsx`
  - `npm run build`

## 2026-06-19 - Billing Activity Feed Merge and Model-Line Label Cleanup

- Merged the creator billing history presentation into a single user-facing activity table instead of separate `用量记录` and `账单流水` sections.
- The new billing table now follows the approved single-creator format:
  - time
  - event
  - model line
  - parameters
  - quantity
  - credit delta
  - status
- Hidden technical fields from the creator-facing billing UI:
  - backend model keys such as `pixellelabs.nano-banana-pro`
  - raw model UUIDs
  - idempotency keys
  - reserve rows that would duplicate a later settlement row
- Added creator-facing route/model label resolution so billing rows prefer product labels like `Nano Banana Pro 线路一` instead of backend ids.
- Added frontend catalog-backed fallback mapping so historical billing rows can still resolve model and route labels even when usage metadata is incomplete.
- Added worker-side billing metadata snapshots for new usage records so future workbench/workflow billing events carry `routeKey` and `modelKey` context for safer creator-facing display.
- Validation:
  - attempted `cmd /c npx vitest run src/billing/billingActivity.test.ts src/billing/BillingCenterPage.test.tsx`
  - local test run is currently blocked in this session by filesystem write restrictions when Vitest tries to write `node_modules/.vite-temp/*`
  - `npm run build` should be re-run in a writable session before release confirmation

## 2026-06-18 - Workbench Follow-up: Fixed Composer, Preview Fit, and Deletion Actions

- Tightened the standalone `/workbench` desktop shell so the header consumes less vertical space and the two-column desktop layout gives the left parameter dock more usable height.
- Reduced the workbench composer vertical density while preserving the existing UI structure:
  - compact reference strip
  - shorter prompt field
  - tighter model/route/parameter rows
  - pinned cost card and generate button footer
- Verified at a 1920 x 900 desktop viewport that the left generate button remains fully visible without page scrolling.
- Changed fullscreen result preview so original images are rendered with `object-contain`, explicit `h-auto/w-auto`, and viewport-based max width/height constraints, preventing wide images from being clipped.
- Added completed-result actions:
  - download original
  - use result as next-round reference
  - delete record
- Added active-task deletion so stale queued/running/waiting tasks can be removed from the workbench UI.
- Added server-side soft deletion for `workbench_generations`:
  - `deleted_at`
  - `deleted_by`
  - visible-row indexes
- Deleting active workbench generations now marks them `canceled`, hides them from list/detail APIs, and releases open reservations when the generation has not been settled.
- Worker execution now re-checks that a workbench generation is still visible and not canceled before persisting outputs or settling billing, preventing deleted tasks from writing successful results later.
- Validation:
  - `npm run test --workspace @aigc-flow/api -- workbench-service.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npx vitest run src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchDesktopLayout.test.ts src/workbench/workbenchReferences.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`
  - Playwright visual check at 1920 x 900: left generate button visible; fullscreen preview fits stage and viewport

## 2026-06-18 - Workbench Three-Pane Docked Desktop Layout

- Rebuilt the desktop workbench layout into a deterministic docked shell instead of the earlier loosely balanced fullscreen studio layout.
- Locked the desktop pane proportions to the approved `3:5:2` visual structure:
  - left dock = parameter composer
  - center pane = current task stage + recent tasks
  - right dock = completed-only history
- Added explicit desktop task partition helpers under `src/workbench/workbenchDesktopLayout.ts` so the page now derives:
  - primary stage task
  - center recent operational tasks
  - right completed-only history
- The center pane now stays focused on the current task and the latest operational window, capped to at most 8 relevant tasks.
- The right dock now excludes queued/running tasks and only shows completed generations.
- The left workbench composer keeps its existing control UI, but its summary card and generate button now live in a separate pinned footer area so desktop users do not need to scroll down the full parameter column just to trigger generation.
- Added focused regression coverage for:
  - `src/workbench/workbenchDesktopLayout.test.ts`
  - `src/workbench/WorkbenchPage.test.tsx`
- Validation:
  - `npx vitest run src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Workbench Two-Column Results Rail Desktop Redesign

- Replaced the just-landed desktop three-pane workbench shell with the newly approved two-column workstation layout for `/workbench`.
- Desktop now uses a fixed `3:7` shell:
  - left column = existing parameter composer dock
  - right column = unified results workspace
- Removed the dedicated desktop center current-task pane so desktop width is no longer split across:
  - stage hero
  - recent-task list
  - narrow history dock
- Kept the left parameter area visually/functionally aligned with the current workbench composer implementation, including its pinned footer action area.
- Rebuilt the right side as a single internal-scrolling workspace with:
  - a compact active status band for `pending / queued / running / waiting_provider / succeeded-without-results`
  - a single-column horizontal completed-results rail for finished generations only
- Simplified the desktop derivation helpers in `src/workbench/workbenchDesktopLayout.ts` so desktop rendering now partitions history into:
  - `activeGenerations`
  - `completedGenerations`
- Added regression coverage to lock the new desktop shell and horizontal completed-card layout in place:
  - `src/workbench/workbenchDesktopLayout.test.ts`
  - `src/workbench/WorkbenchPage.test.tsx`
- Validation:
  - `npx vitest run src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Workbench Desktop Fixed Dock and Result Preview Follow-up

- Tightened the desktop `/workbench` shell so the page itself uses a fixed viewport height and the right results workspace owns vertical scrolling.
- Locked the left parameter dock to the desktop shell height so it stays in place while users browse active/completed results on the right.
- Updated active and completed result cards to show creator-facing generation parameters instead of backend route/model keys:
  - model label
  - friendly line label
  - aspect ratio
  - size
  - requested count
- Changed result detail preview from the small side sheet to a full-screen image viewer.
- Full-screen result preview now requests the original asset URL first instead of showing the lower-resolution preview thumbnail when an asset id is available.
- Added focused regression coverage for:
  - fixed desktop shell and right-side scroll ownership
  - friendly generation parameter display
  - full-screen original-image result preview
- Validation:
  - `npx vitest run src/workbench/workbenchDesktopLayout.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Workbench Left Dock Chrome Cleanup

- Removed the extra desktop left-dock header strip inside `/workbench`, so the parameter panel no longer shows the redundant `CREATE / 参数面板` block.
- Kept left-dock collapse behavior by moving the collapse action into a lighter floating button anchored at the top-right of the panel body.
- Removed the desktop composer footer `当前配置详情` summary card while preserving the pinned generate action area.
- Updated workbench UI regression coverage so the removed header chrome and removed summary card stay out of the desktop layout.
- Validation:
  - `npx vitest run src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchDesktopLayout.test.ts src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-18 - Workbench Temporary Reference Base64 Fix For Nano Banana Pro

- Fixed the standalone `/workbench` temporary reference-image path for PixelleLabs `Nano Banana Pro` / Gemini image routes.
- Root cause: workbench temporary uploads were hydrated as `data:image/...;base64,...` references, and the PixelleLabs Gemini adapter was forwarding those values as `fileData.fileUri` instead of Gemini `inlineData`.
- This caused upstream PixelleLabs / Gemini requests to fail with `status_code=400, invalid base64 image data` even though the workbench submission itself was otherwise valid.
- The Gemini adapter now detects `data:image/...;base64,...` image inputs, strips the data-URI wrapper, preserves the source mime type, and sends them as proper Gemini `inlineData`.
- Added a focused regression test that locks the workbench temporary-upload case so future changes cannot regress back to `fileData.fileUri` for base64 references.
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run build`

## 2026-06-18 - Asset Library Floating Selection Toolbar

- Replaced the `/assets` drag-selection sticky top bulk bar with a fixed floating toolbar that appears near the user's selection endpoint, matching the requested contextual action behavior.
- Added the requested toolbar actions in order:
  - cancel selection
  - select all visible assets
  - favorite selected assets
  - download original files for selected assets
  - delete selected assets with confirmation

## 2026-06-18 - Workbench Batch Card Interaction Polish

- Removed the desktop `/workbench` left-side collapse control so the parameter composer now stays fully present without a secondary chrome button.
- Reworked multi-image completed cards and active batch cards to render generated images in a single horizontal strip instead of wrapping into a two-column tile grid.
- Added per-image floating icon actions for batch/multi-image cards: regenerate, reuse params, download original, and use as reference.
- Moved multi-image deletion into a compact top-right trash icon button so image-specific actions can stay attached to each thumbnail.
- Corrected active batch-card `引用参考` behavior so it now really appends that image into the workbench reference list, matching completed-card behavior.
- Validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`
- Stabilized drag selection from asset thumbnails by preventing the same pointer-down from also bubbling to the outer selection surface after the card starts marquee selection.
- Kept selected-asset cleanup tied to asset-list changes and identity changes so stale selections/toolbars disappear when the list changes.
- Extended asset-library regression coverage for the floating toolbar position, complete action set, select-all behavior, bulk favorite, bulk download, and existing bulk delete flow.
- Validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Asset Library Overlay Position Polish

- Anchored the `/assets` bulk-selection toolbar to the currently visible asset library viewport instead of the whole browser viewport, so it stays inside the current library window while scrolling.
- Restyled the bulk toolbar from a white pill to a dark translucent AI Flow control surface with project-consistent borders, shadows, dividers, and hover states.
- Anchored the asset preview overlay to the currently visible asset library viewport and expanded the preview dialog to fill that window, giving double-click image preview a much larger image stage.
- Added focused regressions for panel-relative toolbar positioning, dark toolbar styling, and viewport-filling asset preview overlay layout.
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx src/assets/AssetPreviewModal.test.tsx`
  - `npm run build`

## 2026-06-18 - Asset Library Viewport Follow-up

- Corrected the previous overlay approach after visual review showed the toolbar and preview could still miss the user's current window.
- Changed the `/assets` desktop grid to a fixed 6-column layout so the main asset library matches the requested first-screen density.
- Removed the fragile asset-panel measurement logic for the bulk toolbar; it now stays fixed at the current browser window bottom center with a higher overlay z-index.
- Changed double-click asset preview to cover the current page viewport below the global nav (`top-20` to bottom) and use a full-size preview dialog instead of a small centered panel.
- Added focused regression coverage for the 6-column asset grid, toolbar fixed-window positioning, and full-window preview modal.
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx src/assets/AssetPreviewModal.test.tsx src/assets/AssetVirtualGrid.test.tsx`
  - `npm run build`

## 2026-06-18 - Asset Library Drag Selection Deep Optimization

- Compared the `/assets` drag-select interaction against `D:\gpt-iamge-2\src\components\TaskGrid.tsx` and moved the current implementation toward the same smoother interaction model.
- Reworked marquee selection to use page-space coordinates so scrolling during a drag no longer shifts the selection math.
- Added drag thresholding so tiny pointer movement on an asset tile does not create a selection or suppress normal card behavior.
- Added selection hit slop so users do not need to drag perfectly across the interior of every tile to select it.
- Reduced drag-time re-render churn by only notifying the asset library when the selected id set actually changes.
- Added body-level `asset-drag-selecting` styling to suppress text selection during marquee drag.
- Added edge auto-scroll while dragging near the top/bottom of the viewport.
- Changed the floating selection toolbar to stay fixed around the screen center/bottom like the reference app's selected-record action bar, instead of following the raw mouse-up point or selected asset bounds.
- Marked asset action menus as non-selection targets so clicking tile management controls does not accidentally start marquee selection.
- Extended regression coverage for selected-bounds toolbar positioning and tiny pointer movement behavior.
- Validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-14 - MouxiHub Nano Banana Pro Official T3 Route

- Added a built-in AI Gateway plugin package for `Nano Banana Pro` route `线路二（官方 T3）`.
- The new route uses MouxiHub OpenAI-compatible async image APIs:
  - text-to-image: `/v1/images/generations?async=true`
  - image edit: `/v1/images/edits?async=true`
  - polling: `/v1/images/tasks/{task_id}`
- Runtime requests now support route-configured size-based upstream model selection for OpenAI-compatible image routes:
  - `1K` -> `gemini-3.1-flash-image-preview`
  - `2K` -> `gemini-3.1-flash-image-preview-2k`
  - `4K` -> `gemini-3.1-flash-image-preview-4k`
- Workflow reserve pricing now supports `model_pricing.metadata.sizeTiers`, so the T3 route can reserve `6 / 8 / 12` credits for `1K / 2K / 4K`.
- Creator-facing fallback labels now include `Nano Banana Pro 线路二（官方 T3）` so route keys and provider details are not shown while route data loads.
- Validation:
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts plugin-registry.test.ts`
  - `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts ai-plugins.test.ts`
  - `npx vitest run src/flowCanvas/utils/modelCatalogOptions.test.ts`
  - `npm run build`
  - `npm run build --workspace @aigc-flow/redis`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
- Follow-up fix: plugin initialization now builds an aligned `ai_routes` insert statement so `base_url_override`, `request_config`, `rate_limit`, `status`, `plugin_install_id`, and `request_path` are written to the intended columns. This addresses Template Library installs that could fail server-side and leave the UI showing `未安装`.

- Follow-up fix: template-created provider connections now keep `adapter_kind` aligned to the provider adapter (`openai-compatible`) while `api_mode` remains the route execution mode (`async`). Canvas model-route options now keep official Nano Banana Pro route ordering so line one remains the 24-credit PixelleLabs route and line two official T3 remains the MouxiHub route.

- Follow-up fix: OpenAI-compatible async polling now recognizes MouxiHub task states such as `SUBMITTED`, `QUEUED`, `PROCESSING`, `COMPLETED`, and top-level task detail responses. This keeps successful official T3 async tasks from failing early with `The provider poll response did not include a recognized task status`.
- Follow-up fix: MouxiHub async polling now also infers task state when the provider omits `status`: parsed image outputs are treated as success, while task/progress-only responses remain pending/running instead of failing early.
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "status is missing"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "MouxiHub"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts plugin-registry.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-14 - Brand Chrome and Transition System Tasks 1-4

- Added a shared creator-facing brand UI layer under `src/app/brand`:
  - `BrandMark` for consistent logo rendering in dark chrome
  - `BrandTransition` for branded animated loading states
- Upgraded auth loading from plain centered text to a branded full-screen transition so the first workspace entry feels intentional instead of placeholder-like.
- Upgraded project canvas loading from a text spinner card to the same branded transition, with clearer supporting copy for draft/node recovery.
- Unified touched project loading, save-status, retry, and asset-insert strings to readable Chinese in the updated surfaces.
- Replaced the canvas top-left inline logo image with the shared `BrandMark`, increasing logo clarity, contrast, and title hierarchy in the canvas chrome.
- Added focused regression coverage for:
  - `src/app/brand/BrandMark.test.tsx`
  - `src/app/brand/BrandTransition.test.tsx`
  - `src/auth/AuthGate.test.tsx`
  - `src/flowCanvas/FlowProjectPage.test.tsx`
  - `src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
- Validation:
  - `npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx src/auth/AuthGate.test.tsx src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - `npm run build`

## 2026-06-14 - Brand Chrome and Transition System Tasks 5-7

- Replaced `/workspace` project-list loading with an inline branded transition so the project surface keeps its layout while data refreshes.
- Added a lightweight route fade shell in `AppRouter` for non-canvas page switches to reduce plain text/blank-feeling transitions.
- Changed `/assets` loading to contextual skeleton tiles instead of a static text wait state.
- Changed the canvas asset drawer loading experience to compact skeleton thumbnails so reopening the drawer keeps canvas context visible.
- Normalized touched template/history/asset/workspace strings to readable Chinese in the updated loading and empty-state surfaces.
- Added reduced-motion-safe skeleton animation support in `src/index.css`.
- Validation:
  - `npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx src/auth/AuthGate.test.tsx src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workspace/WorkspacePage.test.tsx src/assets/AssetLibraryPage.test.tsx src/flowCanvas/panels/CanvasAssetPanel.test.tsx`
  - `npm run build`

## 2026-06-14 - Canvas Logo Menu and Home Logo Routing

- Changed the canvas top-left logo interaction so `/projects/:projectId` now opens a TapNow-style dark project menu instead of behaving like a static mark.
- Kept the canvas menu focused on project actions only:
  - `杩斿洖宸ヤ綔绌洪棿`
  - `閲嶅懡鍚嶉」鐩甡
  - `新建项目`
  - `删除项目`
- Wired the canvas menu actions to real product behavior:
  - return to `/workspace`
  - focus the title input for rename and persist the renamed project on blur
  - create a new workspace project and enter its canvas
  - delete the current project and return to `/workspace`
- Locked the non-canvas behavior so the shared header logo continues to navigate directly to `/home` without opening any project menu.
- Normalized touched toolbar and test copy to readable Chinese while keeping the change scoped to the current chrome interaction work.
- Validation:
  - `npm test -- src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - `npm run build`

## 2026-06-14 - Global Menu and Auth Layout Unification Task 6

- Continued the approved menu/UI unification plan on admin and model-management surfaces, keeping the shared dark menu language consistent with the canvas and workspace updates finished earlier in the day.
- Extended shared menu primitives in `src/components/menu/MenuSelect.tsx` so the same control can cover dense settings forms safely:
  - added compact sizing
  - added full-width layout support
  - added disabled-state support
- Replaced visible native dropdowns on the main provider/model admin surfaces with the shared menu trigger UI:
  - `src/account/ProviderSettingsPage.tsx`
  - `src/account/ai-settings/AiSettingsPage.tsx`
- Provider Connections page now uses shared menu selects for:
  - provider filter
  - model family filter
  - create credential provider
  - create connection provider
  - create connection credential
  - edit connection credential
  - edit connection status
- Model Center route management now uses shared menu selects for:
  - create route provider
  - create route connection
  - create route model
  - create route status
  - edit route connection
  - edit route status
- Added and aligned focused regression coverage for the shared menu select behavior and the two upgraded admin pages.
- Validation:
  - `npm test -- src/components/menu/MenuSelect.test.tsx`
  - `npm test -- src/account/ProviderSettingsPage.test.tsx src/account/ai-settings/AiSettingsPage.test.tsx`
  - `npm run build`

## 2026-06-14 - Global Menu and Auth Layout Unification Task 7

- Confirmed the login/register shell is now using the reduced first-screen layout scale from the approved unification plan instead of the earlier oversized composition.
- Locked the auth layout expectations in `src/auth/AuthPages.test.tsx`, including:
  - reduced outer shell width
  - tightened desktop grid split
  - smaller login heading scale
- Re-ran the cross-surface unification validation suite so the shared menu primitives, shell logo behavior, canvas menu behavior, workspace dropdown replacements, and auth layout all validate together.
- Validation:
  - `npm test -- src/auth/AuthPages.test.tsx`
  - `npm test -- src/components/menu/useDismissibleLayer.test.tsx src/components/menu/MenuSelect.test.tsx src/app/WorkspaceShell.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/workspace/WorkspacePage.test.tsx src/auth/AuthPages.test.tsx`
  - `npm run build`

## 2026-06-14 - Post-Plan Native Select Cleanup

- Continued the approved menu unification work beyond Tasks 1-7 by removing the remaining visible native `<select>` controls from the current frontend source tree.
- Replaced project selection in the asset preview modal with the shared compact `MenuSelect`.
- Replaced image-edit mask mode selectors in:
  - `src/flowCanvas/nodes/ImageOutpaintOverlay.tsx`
  - `src/flowCanvas/nodes/ImageRepaintOverlay.tsx`
- Replaced remaining node-level native selects inside `src/flowCanvas/nodes/FlowNodes.tsx`, including:
  - shared inline parameter selects
  - dynamic image parameter select fields
  - video node model selection
- Updated focused asset preview regression coverage to assert the new custom menu trigger instead of native input value lookup.
- Added focused image-edit overlay coverage so repaint and outpaint mask mode controls stay on the shared custom menu path.
- Validation:
  - `npm test -- src/assets/AssetPreviewModal.test.tsx src/components/menu/MenuSelect.test.tsx`
  - `npm test -- src/flowCanvas/nodes/ImageEditOverlayMenuSelect.test.tsx`
  - `rg -n '<select' src`
  - `npm run build`

## 2026-06-14 - Canvas Menu Density and Layering Follow-up

- Fixed the canvas logo project menu placement after staging screenshots showed it could open under the left floating dock and appear clipped.
- Moved the canvas project menu to a fixed, dock-safe position so it opens to the right of the left rail instead of behind it.
- Re-aligned shared menu typography, row height, radius, and spacing to the left add-node menu reference:
  - 38px menu row height
  - 12px primary labels
  - 9px secondary labels
  - compact 7px item gaps and 10px row radius
- Raised image model/settings/more menus above the floating image toolbar so menus no longer render behind the toolbar.
- Added focused style regression coverage for the project menu safe placement and image-menu z-index/density tokens.
- Validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/imageMenuStyles.test.ts src/components/menu/MenuSelect.test.tsx`
  - `rg -n "min-h-\\[54px\\]|h-16|text-\\[15px\\]|rounded-\\[26px\\]|z-\\[260\\]" src/components/menu src/flowCanvas/canvas src/flowCanvas/nodes`
  - `npm run build`

## 2026-06-14 - Menu UI Rules Added to Agent Instructions

- Added a project-wide menu/dropdown UI rule section to `AGENTS.md`.
- Documented the shared menu token entry points and the TapNow-style density baseline:
  - 38px menu rows
  - 12px primary labels
  - 9px secondary labels
  - 7px row gaps
  - 30px icon boxes
- Documented rules to avoid one-off native selects, oversized menu rows, and custom menu typography outside shared tokens.
- Validation:
  - `rg -n "Menu and Dropdown UI Rules|menu row height: 38px|primary label font size: 12px|Do not use native <select>" AGENTS.md`

## 2026-06-14 - Canvas Project Menu and Delete Confirmation Refresh

## 2026-06-16 - Canvas Agent Phase 1 Implementation

- Implemented the first usable Canvas Agent foundation under `src/flowCanvas/agent/*`.
- Added a typed Agent operation protocol covering:
  - add node
  - update node data
  - connect nodes
  - delete nodes / edges
  - select nodes
  - set viewport
  - approved `run_node`
- Added sanitized canvas snapshot building so Agent planning only receives creator-safe canvas evidence and does not expose provider internals.
- Added policy validation and op summaries so approval-gated writes and credit-consuming actions are separated from simple safe writes.
- Added deterministic local planning for:
  - basic text-to-image flow creation
  - selected-image to video flow creation
- Added creator-facing Agent UI:
  - bottom-right Agent entry button
  - right-side Agent panel
  - prompt composer
  - plan approval card
  - task/error status card
- Added confirmed canvas execution flow:
  - approved plans write into the existing Zustand canvas store
  - `run_node` continues to use the existing `runBackendWorkflow({ runMode: 'target_node' })` chain
  - create-only approval path now strips `run_node` ops and only writes nodes/edges
- Added server-backed Agent persistence and planning scaffolding:
  - `agent_sessions`
  - `agent_messages`
  - `agent_turns`
  - `agent_tool_calls`
  - tenant-scoped RLS migration `000024_agent_sessions.sql`
- Added authenticated API routes:
  - `POST /api/v2/agent/sessions`
  - `GET /api/v2/agent/sessions/:sessionId`
  - `POST /api/v2/agent/sessions/:sessionId/turns`
  - `POST /api/v2/agent/sessions/:sessionId/turns/stream`
- Added guarded planner env support:
  - `AGENT_PLANNER_ENABLED`
  - `AGENT_TEXT_ROUTE_KEY`
- Current behavior keeps deterministic planning as the safe default. Text-runtime planning is gated and rejects unsafe output containing internal provider fields.
- Validation:
  - `npm test -- src/flowCanvas/agent/canvasAgentTypes.test.ts src/flowCanvas/agent/canvasAgentSnapshot.test.ts src/flowCanvas/agent/canvasAgentPolicy.test.ts src/flowCanvas/agent/canvasAgentOps.test.ts src/flowCanvas/agent/offlineCanvasAgentPlanner.test.ts src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/canvasAgentApi.test.ts src/flowCanvas/agent/CanvasAgentPlanCard.test.tsx`
  - `npm test -- src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/agent/CanvasAgentIntegration.test.tsx`
- Validation note:
  - database-backed `packages/db` and `apps/api` Agent tests were skipped locally because the current environment did not provide a runnable `DATABASE_URL` test database, matching the repo’s existing conditional DB-test behavior.

- Refined the canvas top-left project menu toward the approved minimal TapNow-style direction:
  - narrowed the menu width from the earlier wide flyout
  - tightened non-primary rows to a 60px rhythm
  - removed mixed create/delete row icons so the menu reads as a cleaner text-led action list
- Replaced the canvas project delete `window.confirm(...)` flow with a custom dark action-sheet-style confirmation surface:
  - dark translucent panel
  - compact destructive copy
  - explicit `删除` / `取消` actions
  - backdrop-dismiss and `Escape` dismissal support
  - inline error retention on delete failure
- Normalized touched canvas toolbar copy back to readable Chinese for the refreshed project menu and the surrounding toolbar strings touched during the change.
- Added focused regression coverage for:
  - slimmer project menu width and row density
  - custom delete confirmation open/cancel/confirm behavior
- Validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - `npm run build`

## 2026-06-14 - Cinematic Brand Transition Animation

- Upgraded the shared brand loading animation from a dashed highlight into a cinematic infinity-path motion system.
- Enlarged the transition logo mark to roughly 2x the previous loading scale so fullscreen and inline loading states read as a real brand transition.
- Rebuilt the animated infinity layer around one canonical SVG path and added:
  - full-path aura glow
  - moving trail stroke
  - exact-path light particle
  - delayed tail particles
  - restrained center crossing pulse
- Kept the existing `BrandTransition` API intact so workspace, canvas, auth, and inline loaders inherit the upgraded animation without route-level behavior changes.
- Added reduced-motion fallback that removes particle travel and looped trail motion while preserving a calm premium branded state.
- Validation:
  - `npm test -- src/app/brand/BrandMark.test.tsx src/app/brand/BrandTransition.test.tsx`
  - `npm run build`
  - `git diff --check`

## 2026-06-14 - Media Generation Stability and Speed Optimization Phases 0-4

- Implemented the approved first four phases of the media generation optimization plan while keeping the existing OSS/S3 asset-first persistence path.
- Added worker-side timing metadata for provider-output download, original object upload, asset DB insert, image variant work, and total media persistence latency.
- Added canvas first-visible markers when generated image/video assets are applied to nodes.
- Split image original persistence from image preview/thumbnail generation:
  - default behavior remains synchronous via `WORKER_IMAGE_VARIANTS_MODE=sync`
  - async rollout is available via `WORKER_IMAGE_VARIANTS_MODE=async`
  - async variant jobs carry only `assetId` and `tenantId`; the worker reloads authoritative asset storage details from DB
- Added an idempotent image variant processor that reads persisted originals from object storage, creates image variants, uploads them, and upserts `asset_variants`.
- Added modality-specific node execution queues for `image.generate`, `video.generate`, and default node work while keeping the legacy `node.execute` queue active for rollback/compatibility.
- Added worker concurrency flags:
  - `WORKER_IMAGE_CONCURRENCY`
  - `WORKER_VIDEO_CONCURRENCY`
  - `WORKER_DEFAULT_CONCURRENCY`
- Improved video/image first-visible resilience by falling back from missing preview variants to original signed asset URLs.
- Reduced target-node generate-start latency by skipping a redundant remote draft flush only when a successful draft flush completed within the last 1.5 seconds; otherwise the previous safe flush behavior remains.
- Validation completed locally:
  - `npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/worker`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
- Notes:
  - API workflow-run queue-routing database tests are present but skipped locally without `DATABASE_URL`, following the existing test harness behavior.
  - Staging rollout and smoke validation have not been executed in this local implementation pass.

## 2026-06-14 - Canvas Menu Overlay Placement Follow-up

- Fixed remaining canvas menu overlap from staging screenshots:
  - Image node model, settings, dynamic-params, and "more" menus now render as fixed body-level overlays instead of inside the node/toolbar stacking context.
  - Image menu z-index was raised above image toolbars and overlay controls.
  - Canvas logo project menu was repositioned to a TapNow-style left-top drop-down that covers the left dock instead of opening offset into the canvas.
- Added `ImageMoreMenu` regression coverage for fixed high-layer placement.
- Validation:
  - `npm test -- src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/nodes/imageMenuStyles.test.ts`
  - `npm run build`

## Recent Important Commits

- pending: fix canvas asset preview display regression
- pending: fix image edit route key fallback
- pending: fix empty asset preview bytes fallback
- pending: fix image edit save barrier stall
- pending: fix image edit runtime route selection
- pending: fix image edit result previews
- pending: fix image edit tools v2 auth workflow
- pending: fix optimistic derived image save UX
- pending: fix image generation input propagation
- `b24b42f` chore: upgrade production image to node 22
- `767ba4a` fix: make asset variant backfill run in production
- `ebed8f2` feat: add preview-backed asset pipeline
- `4af5009` feat: speed up asset previews with variants
- `dc82771` fix: align tapnow menus and node title scale
- `0b17ff8` refine tapnow menu alignment and node labels
- `339452a` fix: restore upload node handle runtime style
- `58f9d0f` refine tapnow menu density and node labels

## 2026-06-13 - Image Node Tool Source Reliability Fix

- Fixed the image-node top toolbar and More-menu tool chain after asset preview optimization exposed stale/CORS-limited signed URL usage.
- Added an authenticated same-origin asset bytes endpoint:
  - `GET /api/v2/assets/:assetId/bytes`
  - optional `variantKey=preview`
  - tenant-scoped through the existing asset read permission path
  - falls back from missing preview variant to original asset bytes for older assets
- Added object-read support to the storage provider abstraction and S3 implementation so the API can privately read object storage and return browser-safe same-origin bytes.
- Frontend image editing tools now resolve asset-backed nodes through `assetId` first instead of treating `thumbnailUrl` signed URLs as editable source data.
- Canvas overlays create local blob URLs from authenticated asset bytes, so `裁剪`, `调整像素`, `标注`, `快速切割`, `重绘`, `擦除`, `扩图`, `打光`, `多角度`, `增强`, and `抠图` no longer depend on object-storage CORS for source-image loading.
- AI image edit requests now include `sourceAssetId` when available and use the same asset-backed source resolution before falling back to legacy URLs.
- Derived image persistence now retries remote provider result downloads through the existing image proxy when direct browser fetch is blocked, reducing downstream `Failed to fetch` result-node failures.
- Validation:
  - `npm test -- src/flowCanvas/utils/editableImageSource.test.ts`
  - `npm run build --workspace @aigc-flow/storage`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

Notes:

- Local API asset integration tests are still database-env gated in this workspace; the new bytes endpoint test was added to `apps/api/test/assets.test.ts` but is skipped locally without `DATABASE_URL`.

## 2026-06-14 - Empty Asset Preview Bytes Fallback

- Continued the image-edit blank-result investigation after browser evidence showed workflow runs and asset IDs were being created, but `/api/v2/assets/:assetId/bytes?variantKey=preview` returned `0 B image/webp`.
- Root cause narrowed to the asset bytes response layer rather than workflow launch or provider routing:
  - storage/provider metadata can report stale zero `contentLength`
  - preview variant objects can exist but contain an empty body
- Fixed the same-origin asset bytes service to:
  - always send `content-length` from the actual `Buffer.byteLength`
  - fall back to the original asset object when a requested variant body is empty
  - expose the fallback through `x-asset-variant-key: original`
- Added pure API tests for bytes normalization and database-gated route tests for stale zero content length and empty preview variant fallback.
- Validation:
  - `npm run test --workspace @aigc-flow/api -- assets-bytes-normalization.test.ts`
  - `npm run test --workspace @aigc-flow/api -- assets.test.ts` (skipped locally because DB env is not configured)
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-14 - Image Edit Route Key Fallback

- Investigated production logs for blank/placeholder image edit results.
- Server evidence showed the workflow runner and worker were not stuck:
  - API created the target-node workflow run and enqueued `node.execute`
  - worker processed the job, called the media runtime, persisted one asset, settled billing, patched the target node draft, and completed successfully
- Root cause in the log:
  - selected product model was PixelleLabs/Nano Banana, but worker runtime diagnostics showed `providerKey: "mock-local-dev"` and `routeKey: null`
  - the worker built image requests only from top-level `node.config.routeKey`; when the edit node lost that field but retained nested `imageEditRequest.routeKey`, the runtime fell back to `image.default`
- Fixed API workflow-run route context/pricing and worker image request construction to recover the route key from nested edit metadata before falling back to `image.default`.
- Fixed worker runtime diagnostics to report the same recovered route key, so production logs should no longer show `routeKey: null` for these nested image edit runs.
- Changed generated asset display URLs to same-origin `/api/v2/assets/:assetId/bytes?variantKey=preview` so canvas previews use the authenticated bytes endpoint with empty-variant fallback instead of signed preview URLs.
- Validation:
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts`
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm test -- src/services/v2AssetsApi.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-14 - Canvas Asset Preview Display Regression

- Investigated a production regression where reopened projects and newly generated image nodes showed `预览加载失败`.
- Root cause:
  - canvas display code had started writing `/api/v2/assets/:assetId/bytes?variantKey=preview` into image node preview fields
  - that endpoint requires v2 Authorization headers, but browser `<img src>` requests do not attach the Bearer token
  - existing nodes with persisted `/bytes` URLs skipped preview re-resolution because `thumbnailUrl` was already populated
- Fixed canvas runtime output display to use signed preview download URLs again, with original-asset signed URL fallback when preview URL resolution fails.
- Fixed image nodes to detect previously saved authenticated `/bytes` URLs and re-resolve a signed preview URL from `assetId`.
- Added image load-error fallback from preview signed URL to original signed URL.
- Restored mojibake text in the canvas asset drawer loading/empty states.
- Validation:
  - `npm test -- src/services/v2AssetsApi.test.ts src/flowCanvas/services/flowProjectApi.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm test -- src/flowCanvas/utils/editableImageSource.test.ts`
  - `npm run build`

## 2026-06-13 - Image Edit Tools v2 Auth Workflow Fix

- Fixed model-backed image tools that incorrectly showed `请先登录后再使用点数功能` even when the user was logged in through v2 auth.
- Root cause:
  - the top image tools for repaint/erase/outpaint/relight/multi-angle/enhance/remove-background still executed the legacy direct model API path
  - that path checked the old local `auth-session-v1` / `X-Auth-Session` billing identity instead of the current v2 access token and `/api/v2/*` workflow path
- Frontend fix:
  - image edit confirmations now create or reuse a downstream target image node with `imageEditRequest`, prompt, route/model, mask, outpaint direction, scale, and mapped provider params
  - after the tool closes, the canvas triggers `runBackendWorkflow({ runMode: 'target_node', targetNodeId })`, so v2 auth, billing preflight, draft save barrier, worker execution, and result asset persistence own the model call
  - removed the stale direct image-edit success path from `graphExecutor.ts`
- Worker fix:
  - target-node image requests now forward `imageEditRequest` into provider-facing metadata while preserving upstream image asset inputs and mask params
- Legacy compatibility:
- remaining legacy API helper calls no longer throw the old frontend-only billing login error when a v2 access token exists
- ordinary GPT-image-2 reference-image generation still has a legacy compatibility edge and should be migrated to the v2 workflow path in a later cleanup

## 2026-06-13 - Image Edit Runtime Route Preservation Fix

- Fixed a follow-up root cause for blank/white completed results from model-backed image tools such as `重绘`, `擦除`, `扩图`, `打光`, `多角度`, `增强`, and `抠图`.
- Root cause:
  - downstream edit nodes were writing the local catalog `routeId` into `node.data.routeKey`
  - worker/API runtime route resolution matches exact runtime `routeKey`, so these edit runs could fall back to the wrong default line instead of the user-selected model line
  - when the fallback line accepted the request but did not behave as intended for the selected edit workflow, the canvas showed a completed white image result
- Frontend fix:
  - `runImageEdit()` now accepts and persists an explicit runtime `routeKey`
  - image node tool actions now pass the current selected runtime route key into downstream target-node edit runs
  - downstream `imageEditRequest` metadata now carries that runtime key too, keeping the workflow run aligned with the visible canvas line selection
- Regression coverage:
  - added a failing-then-passing test to ensure explicit runtime `routeKey` values survive downstream image edit node creation
- Validation:
  - `npm test -- src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build`

## 2026-06-13 - Image Edit Launch Save Barrier Fix

- Fixed the root cause for model-backed image edit tools creating blank target cards while the relay/provider receives no request.
- Root cause:
  - users can trigger `多角度`, `打光`, `重绘`, `擦除`, `扩图`, `增强`, or `抠图` while the canvas is already showing `正在保存`
  - the remote draft save barrier returned immediately when an autosave was already in flight
  - the workflow run was then created against the previous server-side draft, where the newly added edit target node was not yet available
  - API/worker execution therefore had no valid target node to enqueue, so the provider relay saw no outbound request while the canvas still showed a blank generated card
- Frontend/runtime fix:
  - `saveNow()` now refreshes the graph directly from `useFlowCanvasStore` before saving
  - if an autosave is in flight, `saveNow()` waits for it to complete and then flushes the latest graph again before workflow run creation continues
  - image edit run launch failures are no longer swallowed; target nodes are marked failed with the backend error code/message so route, pricing, queue, and target-node failures become visible on canvas
- Regression coverage:
  - added autosave timing coverage for launching a target-node run while a previous save is still in flight
  - added target-node launch error visibility coverage for API-style errors
  - added API integration coverage for an image edit child target node creating a runnable node run and enqueueing execution; this remains database-env gated locally
- Validation:
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run test --workspace @aigc-flow/api -- workflow-runs.test.ts` (skipped locally because database test env is not configured)
  - `npm run build`
- Follow-up fix:
  - v2 workflow image/video success patches now write the resolved preview URL into `thumbnailUrl`/`posterUrl` in addition to durable `assetId`, so generated target nodes render immediately and survive remount/recovery without relying only on runtime memory state
  - image edit target nodes now store `generationRunLabel`, and the image generating overlay displays the active model/route label while waiting for the result
  - Visionary Nano Banana and PixelleLabs Gemini image adapters now merge `request.inputAssets` signed/public URLs into their provider reference-image payloads, matching the OpenAI-compatible adapter behavior and ensuring model-backed edit tools receive the source image instead of running text-only
- Validation:
  - `npm test -- src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-13 - Image Edit Runtime Route Selection Fix

- Fixed the root cause for image edit tools producing blank white outputs while the external relay/proxy saw no requests.
- Root cause:
  - uploaded and asset-backed image nodes are created with the generic default `routeKey` value `image.default`
  - top image edit tools reused that source-node route key when creating target edit nodes
  - when the selected model had a real model-scoped route such as `image.pixellelabs.nano-banana-pro`, the stale `image.default` value could still be passed into the target-node workflow
  - worker/provider execution could therefore use the default/mock image route instead of the configured provider relay, yielding a tiny/blank generated asset and no request in the expected relay logs
- Frontend fix:
  - added `resolveActiveImageRuntimeRouteKey()` to prefer current model-scoped runtime routes and ignore stale generic `image.default` on image edit launch
  - wired image node route resolution to use that effective route before `runImageEdit()` persists target node `routeKey`
- Runtime diagnostic fix:
  - target-node launch writes `workflowLaunchStatus` on the target node through `saving_draft`, `creating_run`, `run_created`, `node_run_created`, and `worker_waiting`
  - if the backend run snapshot does not contain a `node_run` for the requested target node, the target node now fails visibly with `TARGET_NODE_RUN_MISSING` instead of staying as an idle blank white card
- Validation:
  - `npm test -- src/flowCanvas/utils/imageRuntimeRouteSelection.test.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm run build`

## 2026-06-13 - Image Edit Save Barrier Stall Fix

- Fixed the next observed blocker after route selection:
  - user-captured draft data showed the newest edit target node stuck at `workflowLaunchStatus: "saving_draft"`
  - browser Network showed `PUT /api/v2/flows/:flowId/draft` returning `200 OK`
  - no `POST /api/v2/flows/:flowId/runs` appeared, proving the provider relay/worker were not reached because frontend workflow launch never left the save barrier
- Root cause:
  - `saveNow()` shared the same recursive autosave path as background autosave
  - when an image edit run was launched while another autosave was in flight, foreground save and background follow-up flush could both observe `dirtyAgainRef` and race around the same pending graph
  - the target node could remain persisted with `workflowLaunchStatus: "saving_draft"` and no `latestWorkflowRunId`, so the canvas showed a blank target node while no workflow run request was sent
- Frontend fix:
  - added foreground flush options for `useRemoteFlowAutosave`
  - `saveNow()` now waits for any current save, then explicitly flushes the latest store graph without scheduling background follow-up recursion
  - `saveNow()` loops until the latest graph hash matches the cloud-synced hash before returning to `runBackendWorkflow()`
- Regression coverage:
  - strengthened the in-flight autosave + target-node save test to assert no extra background save is started after `saveNow()` resolves
  - added concurrent `saveNow()` coverage so multiple workflow launches waiting on the same in-flight autosave share the next foreground flush and settle together
- Validation:
  - `npm test -- src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/utils/imageRuntimeRouteSelection.test.ts src/flowCanvas/runtime/graphExecutor.test.ts`
  - `npm run build`

## 2026-06-13 - Image Derived Tool Optimistic Save Fix

- Fixed the crop confirmation UX where `确认裁剪` appeared idle while the browser waited for derived-image upload and metadata persistence.
- Image-derived canvas results now use an optimistic path:
  - create the result image node immediately with the local blob/URL preview
  - close the image tool immediately for crop, resize, split, and annotation flows
  - persist the derived asset in the background
  - patch the result node with durable `assetId`, asset-backed preview data, and success state when persistence completes
- Background persistence failures now mark the newly created result node as failed while keeping its local preview visible instead of blocking the source tool or marking the source node as failed.
- Added focused tests for optimistic derived image node data, persisted patches, and failure patches.
- Validation:
  - `npm test -- src/flowCanvas/utils/optimisticDerivedImageAsset.test.ts`
  - `npm run build`

## 2026-06-11 - Upload Smooth Preview Pipeline Plan

- Root cause identified: image node upload, upload node upload, canvas drag upload, and canvas paste upload still wait for local image decode/measurement before the first visible canvas update.
- Current implementation also repeats local image preparation in upload hydration, which can decode the same large file more than once.
- Execution plan added: `docs/superpowers/plans/2026-06-11-upload-smooth-preview-pipeline.md`.
- Target behavior: immediate local canvas preview, async local lightweight preview, background original upload, and uploaded asset `thumb`/`preview` variants for fast refresh and `/assets` thumbnails.

## 2026-06-11 - Upload Smooth Preview Pipeline Execution

- Frontend upload entry points now use a shared immediate-preview pipeline: image node upload, upload node upload, drag upload, and paste upload all render a local image node before measurement or network upload.
- Local upload helpers were split into synchronous immediate node hydration, async local preview generation, async size measurement, and upload-only asset hydration so the first paint no longer waits on image decode.
- API fallback upload path now persists uploaded image `thumb` and `preview` variants when valid image bytes are available, aligning refreshed canvas rendering with the fast preview path already used for generated assets.
- Fresh validation completed:
  - `npm run test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/assets/assetApi.test.ts`
  - `npm run build`
  - `npm run build --workspace @aigc-flow/api`
- Database-gated API asset tests are still environment-gated locally; `npm run test --workspace @aigc-flow/api -- test/assets.test.ts` returned skipped in the current environment rather than failing.

## 2026-06-12 - Image Generation Input Propagation Fix

- Root cause: target-node workflow runs were started before the latest remote draft was guaranteed to be saved, and the worker set target-node `upstreamOutputs` to an empty array. This meant connected text/image nodes could look correct on canvas but not reach the provider request.
- Frontend fix: added a remote draft save barrier before `runBackendWorkflow()` creates the backend run, so newly typed prompts, links, references, and batch count are flushed to the server draft first.
- Worker fix: target-node runs now resolve dependency outputs from existing node runs or from compiled upstream node config. Static text nodes contribute `text`; asset-backed image/upload nodes contribute `assets`.
- Provider input fix: upstream asset references are hydrated with signed object-storage URLs before media generation so image models can actually read the reference image.
- Batch fix: image node `batchCount` is normalized into provider-facing `metadata.n` and `metadata.params.n`, so selecting `2x` is sent as two requested outputs.
- Validation:
  - `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `npm run test --workspace @aigc-flow/worker`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`
- Full `npm test` still has unrelated existing failures in legacy migration, ProjectCard/UploadAssetButton text assertions, storage presigned URL expectations, AI Gateway schema examples, and one OpenAI-compatible multipart test. The new worker/runner tests for this fix pass.

## 2026-06-12 - Prompt Bar Density Alignment

- Text, image, and video node selected-state PromptBars now share one compact density token set.
- PromptBar widths/heights were reduced toward TapNow-like viewport proportions:
  - text: `clamp(720px, 56vw, 1040px)`
  - image: `clamp(760px, 58vw, 1080px)`
  - video: `clamp(780px, 60vw, 1120px)`
- Prompt editor font size, line height, padding, bottom-row controls, and send button density were unified so the edit boxes no longer dominate the canvas.
- Validation:
  - `npm run test -- src/flowCanvas/utils/promptBarDensity.test.ts`
  - `npm run build`

## 2026-06-12 - Canvas Dock Panels Plan

- Detailed implementation plan added for turning the left dock's empty `素材库`、`模板列表`、`评论`、`历史记录` entries into TapNow-style in-canvas drawers.
- Plan path: `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- The plan is split into 8 executable tasks:
  - shared drawer shell and dock state
  - asset library drawer data/search
  - asset insert, drag, and upload entry
  - creative template backend
  - template panel and graph insertion
  - comments API and panel
  - durable history API and panel
  - integration, badges, project record, and staging validation
- Planning self-check completed: no placeholder markers found, and all four requested dock functions have concrete frontend/backend execution tasks.

## 2026-06-12 - Canvas Dock Panels Task 1-2

- Executed Task 1 and Task 2 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Added a shared in-canvas drawer shell and dock panel layout helper for the left dock.
- The four dock buttons now switch a unified drawer state instead of being empty placeholders.
- Opening the new drawer now syncs `leftPanelOpen`, so existing minimap and image-tool left safe area logic can react to the drawer width.
- Added the first real drawer implementation for `素材库`, reusing `useAssetLibrary()` to show:
  - search
  - folder filters
  - compact asset thumbnails
  - loading / error / empty states
- Asset insertion is still intentionally stubbed with a placeholder callback in `AiFlowCanvas`; the real click/drag/upload-to-canvas behavior remains scheduled for Task 3.
- Validation:
  - `npm run test -- src/flowCanvas/panels/canvasDockDrawer.test.ts`
  - `npm run build`

## 2026-06-12 - Canvas Dock Panels Task 3

- Executed Task 3 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- The canvas asset drawer now supports real asset-backed image insertion:
  - clicking a drawer asset inserts a selected image node at the canvas center
  - dragging a drawer asset onto the canvas inserts the same asset-backed image node at the drop point
- Inserted asset nodes now hydrate from the real asset record plus preview/download URL resolution, so the canvas continues to use `assetId` as the source of truth instead of temporary local-only state.
- Added a compact `UploadAssetButton` variant for in-canvas drawer usage and mounted it in the asset drawer header and empty state.
- Successful upload from the asset drawer now refreshes the drawer library immediately, so newly uploaded assets can be inserted back onto the canvas without leaving the workspace.
- Also cleaned historical front-end text encoding issues in the asset drawer/upload path while keeping the current v2 asset API flow unchanged.
- Validation:
  - `npm run test -- src/assets/UploadAssetButton.test.tsx src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build`

## 2026-06-12 - Canvas Dock Panels Task 4

- Executed the first production-facing backend slice for `妯℃澘鍒楄〃`.
- Added migration `packages/db/migrations/000021_canvas_dock_panels.sql` with:
  - `flow_templates`
  - `flow_template_usage`
  - tenant/official visibility indexes
  - row-level security policies aligned with current v2 multi-tenant rules
- Added v2 API module `flow-templates` with three endpoints:
  - `GET /api/v2/flow-templates`
  - `GET /api/v2/flow-templates/:templateId`
  - `POST /api/v2/flow-templates/:templateId/usage`
- Visibility behavior now follows the planned rule:
  - all tenants can read `official` templates
  - a tenant can read its own tenant/private templates
  - cross-tenant private templates remain hidden
- Added usage recording so Task 5 template insertion can report server-backed template adoption without inventing a second analytics path later.
- Added focused API integration test file `apps/api/test/flow-templates.test.ts` covering auth requirement, visibility scope, detail fetch, and usage insert behavior.
- Validation:
  - `npm run build --workspace @aigc-flow/db`
  - `npm run test --workspace @aigc-flow/api -- test/flow-templates.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`
- Note:
  - the new API test is currently environment-gated the same way as the other DB integration tests; in this local session it was skipped instead of failing because the required database env was not present.

## 2026-06-12 - Canvas Dock Panels Task 5

- Executed Task 5 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Added front-end template client `src/services/v2FlowTemplatesApi.ts` and wired it to the new `flow-templates` backend endpoints.
- Added `CanvasTemplatePanel` so `妯℃澘鍒楄〃` drawer now has:
  - search
  - category chips
  - compact template cards
  - per-template `插入` action
- Added `offsetTemplateGraphForInsert()` to safely remap template node/edge ids and place the incoming graph around the current canvas center.
- Added store action `mergeTemplateGraph()` so template insertion can append a graph into the current canvas while:
  - clearing the previous selection
  - selecting the newly inserted template nodes
  - recomputing graph index
  - marking the canvas dirty
- `AiFlowCanvas` now wires `妯℃澘鍒楄〃` drawer to real insertion:
  - fetch template graph
  - offset and remap ids
  - merge into current canvas
  - record template usage against the current backend project when available
- Validation:
  - `npm run test -- src/flowCanvas/utils/templateGraph.test.ts src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build`

## 2026-06-12 - Canvas Dock Panels Task 6

- Executed Task 6 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Extended `000021_canvas_dock_panels.sql` with tenant-scoped `flow_comments` table, project/node indexes, and row-level security policies.
- Added backend comments module under `apps/api/src/modules/flow-comments` with:
  - `GET /api/v2/projects/:projectId/comments`
  - `POST /api/v2/projects/:projectId/comments`
  - `PATCH /api/v2/projects/:projectId/comments/:commentId`
- Comment backend behavior now covers:
  - project-level comments
  - node-level comments
  - optional `flowId`
  - resolve/open status updates
  - tenant/project/flow ownership checks
- Added front-end comments client `src/services/v2FlowCommentsApi.ts`.
- Added `CanvasCommentPanel` and wired the `评论` drawer in `AiFlowCanvas`:
  - open/resolved filter
  - selected-node chip
  - textarea + submit
  - comment list
  - `定位` action for node comments
  - `瑙ｅ喅` action for open comments
- Added canvas node focus helper so a node comment can jump the viewport to the referenced node.
- Validation:
  - `npm run build --workspace @aigc-flow/api`
  - `npm run test --workspace @aigc-flow/api -- test/flow-comments.test.ts`
- Validation notes:
  - the new API integration test is currently environment-gated and was skipped in this local session because the required DB env was not present
  - root `npm run build` is currently blocked by an unrelated workspace issue outside the comments task: `Could not resolve "./ProjectCard" from "src/workspace/WorkspacePage.tsx"`

## 2026-06-12 - Canvas Dock Panels Task 7

- Executed Task 7 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Extended `packages/db/migrations/000021_canvas_dock_panels.sql` with tenant-scoped `flow_activity_events`, project/flow indexes, and row-level security policies.
- Added backend history module under `apps/api/src/modules/flow-history` with:
  - `GET /api/v2/projects/:projectId/history`
  - `POST /api/v2/projects/:projectId/history/snapshot`
  - `POST /api/v2/projects/:projectId/history/:versionId/restore`
- History backend behavior now covers:
  - durable project history list from `flow_activity_events`
  - snapshotting the current primary flow draft into `flow_versions`
  - restore from a saved version back into `flow_drafts`
  - snapshot/restore event recording for later drawer display
  - tenant isolation and cross-tenant restore blocking
- Added front-end history client `src/services/v2FlowHistoryApi.ts`.
- Added `CanvasHistoryPanel` and wired the `历史记录` drawer in `AiFlowCanvas`:
  - history list
  - save snapshot action
  - restore confirmation
  - immediate canvas graph replacement through store-level `restoreGraphSnapshot()`
- Added focused store regression coverage for `restoreGraphSnapshot()` so restored history now clears transient UI state and rebuilds upstream refs.
- Validation:
  - `npm run test -- src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run test --workspace @aigc-flow/api -- test/flow-history.test.ts`
- Validation notes:
  - DB integration test is environment-gated and was skipped in this local session because the required DB env was not present
  - root `npm run build` still has the existing unrelated workspace blocker: `Could not resolve "./ProjectCard" from "src/workspace/WorkspacePage.tsx"`

## 2026-06-12 - Canvas Dock Panels Task 8

- Executed Task 8 from `docs/superpowers/plans/2026-06-12-canvas-dock-panels.md`.
- Completed left dock integration polish for the four in-canvas drawers:
  - `素材库` now shows a dot badge when the tenant asset library has assets
  - `评论` now shows unresolved comment count in the dock
  - `历史记录` now shows a dot badge once snapshot history exists
  - active drawer header count now mirrors the relevant drawer metric where useful
- Added drawer/menu interlock behavior:
  - opening a drawer closes add-node and user menus
  - opening add-node or user menu closes the active drawer
  - `Escape` closes the active drawer
  - pane click closes the active drawer alongside existing context/image transient UI
- Added badge refresh hooks so comment create/resolve and history snapshot/restore update dock state immediately instead of waiting for a later reload.
- Added focused badge helper test coverage in `src/flowCanvas/panels/canvasDockDrawer.test.ts`.
- Added local draft utility coverage for explicit draft clearing helper in `src/flowCanvas/services/localFlowDraft.test.ts`; helper is available for future restore-flow hardening work but is not yet wired into Task 8 restore behavior.
- Validation:
  - `npm run test -- src/flowCanvas/panels/canvasDockDrawer.test.ts src/flowCanvas/utils/templateGraph.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/services/localFlowDraft.test.ts`
  - `npm run test --workspace @aigc-flow/api -- test/flow-templates.test.ts test/flow-comments.test.ts test/flow-history.test.ts`
  - `npm run build --workspace @aigc-flow/db`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-23 - Agent Tool-Calling Executor Backend Tasks 5-9

- Continued Scheme B implementation on branch `codex/agent-tool-executor-foundation`.
- Completed the backend executor loop slice:
  - added a workflow launcher adapter that starts Agent image tools through the existing workflow run service instead of calling providers directly
  - added an Agent tool runner for `generate_image` and `generate_image_batch`, including persisted tool-call lifecycle transitions and partial-success batch handling
  - added executor prompt, provider-neutral tool registry metadata, continuation context, and SSE event formatting
  - added `AgentExecutorService` to call the configured text route, parse tool-call JSON, validate policy/cost, run tools, observe results, and continue the same turn until final text or round limit
  - added `/api/v2/agent/sessions/:sessionId/turns/execute/stream` while keeping the existing planner stream route intact
- Safety notes:
  - Agent generation still goes through workflow/billing/assets infrastructure; no browser/provider direct path was added
  - if no runnable canvas flow/target node is available, image tool execution fails closed with `AGENT_WORKFLOW_TARGET_REQUIRED`
  - executor prompts and returned results avoid exposing provider/base URL/API key/raw route/upstream model details
- Validation:
  - `npm run test --workspace @aigc-flow/api -- agent-tool-runner.test.ts agent-executor.test.ts agent.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`
- Validation notes:
  - all focused frontend tests passed locally
  - all three API integration suites were skipped locally because DB env is still not present in this session
  - root/frontend build now passes again after the workspace-level billing page import issue was no longer blocking the build in the current worktree

## 2026-06-12 - Staging Auth 502 Deployment Follow-up

- Investigated a staging login failure that surfaced in the browser as `Request failed with status 502` after the API security-baseline work landed.
- Root cause: `apps/api/src/app.ts` and `apps/api/src/config/env.ts` now require/pass through CORS, helmet, trust-proxy, and rate-limit configuration, but `docker-compose.staging.yml` was not forwarding those variables into the `tapflow-api` or `tapflow-worker` containers.
- In production mode that left `CORS_ALLOWED_ORIGINS` empty inside the API container, which can stop API startup and cause the reverse proxy to return `502` for login and other `/api/v2/auth/*` requests.
- Fixed the deployment wiring by adding these variables to `x-tapflow-env` in `docker-compose.staging.yml`:
  - `CORS_ALLOWED_ORIGINS`
  - `SECURITY_HEADERS_ENABLED`
  - `TRUST_PROXY`
  - `API_RATE_LIMIT_MAX`
  - `API_RATE_LIMIT_WINDOW_MS`
  - `AUTH_RATE_LIMIT_MAX`
  - `AUTH_RATE_LIMIT_WINDOW_MS`
- Updated staging deployment documentation to reflect the current API runtime contract.
- Local verification after the deploy-config fix:
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-12 - Asset Library Classification and Date Grouping

- Reworked the shared asset-library view model used by both the `/assets` page and the in-canvas `素材库` drawer.
- Added media-category tabs for:
  - `图片`
  - `视频`
  - `音频`
- Changed asset presentation to group items by `createdAt` date from newest to oldest, so both surfaces now render sections such as `2026-06-12`, `2026-06-11`, and `2026-06-10`.
- Fixed a major thumbnail reliability gap in the asset preview signing flow:
  - old behavior effectively assumed `thumb` was always available
  - new behavior now falls back in order: `thumb -> preview -> original`
  - this allows older assets and upload-only assets without a `thumb` variant to still render visible media cards instead of collapsing to placeholder icons
- Added a shared grouped asset section component so the drawer and `/assets` page use the same classification, grouping, and card-density rules while keeping drawer cards visually compact.
- Updated `/assets` rendering tests and added focused regression coverage for:
  - preview request fallback selection
  - date grouping order
  - categorized asset-library empty state
- Validation:
  - `npm run test -- src/assets/assetLibraryView.test.ts src/assets/useAssetLibrary.test.tsx src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## Common Staging Commands

Set reusable command variables:

```bash
cd /opt/aittco/tapflow

export ENV_FILE=/opt/aittco/env/tapflow.staging.env
export COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.staging.yml"
```

Update code to latest `main`:

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
```

Standard staging deploy:

```bash
cd /opt/aittco/tapflow

export ENV_FILE=/opt/aittco/env/tapflow.staging.env
export COMPOSE="docker compose --env-file $ENV_FILE -f docker-compose.staging.yml"

$COMPOSE build
$COMPOSE stop tapflow-worker
$COMPOSE run --rm tapflow-api node packages/db/dist/cli.js
$COMPOSE up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
$COMPOSE ps
$COMPOSE logs --tail=100 tapflow-api tapflow-worker tapflow-frontend
curl -sS http://127.0.0.1:3366/health
```

Force rebuild specific runtime images:

```bash
$COMPOSE build --no-cache tapflow-api tapflow-worker tapflow-frontend
$COMPOSE up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
```

Check service status:

```bash
$COMPOSE ps
$COMPOSE logs --tail=100 tapflow-api tapflow-worker tapflow-frontend
curl -sS http://127.0.0.1:3366/health
```

Restart runtime services:

```bash
$COMPOSE restart tapflow-api tapflow-worker tapflow-frontend
$COMPOSE ps
$COMPOSE logs --tail=100 tapflow-api tapflow-worker tapflow-frontend
```

Check runtime Node version in containers:

```bash
$COMPOSE run --rm tapflow-worker node -v
$COMPOSE run --rm tapflow-api node -v
```

## Media Asset Variant Commands

Dry-run historical asset backfill:

```bash
$COMPOSE run --rm tapflow-worker npm run assets:backfill-variants -- --dry-run --limit=20
```

Run historical asset backfill:

```bash
$COMPOSE run --rm tapflow-worker npm run assets:backfill-variants -- --limit=50
```

Repeat until the batch no longer prints meaningful new `[ok]` lines.

Backfill success indicators:

- dry-run prints `[dry-run] <asset-id>: thumb,preview`
- formal run prints `[ok] <asset-id>`
- no `ERR_MODULE_NOT_FOUND`
- no missing required env errors
- no sustained DB / S3 / image decode failures

## Staging Acceptance Checklist

Use after media-pipeline or runtime changes.

Projects page:

- page opens normally
- no black screen
- canvas nodes render normally
- historical images restore after refresh
- newly generated image shows in node
- newly generated image still exists after refresh
- browser console has no new errors
- first-screen image load is visibly faster than before

Assets page:

- first-screen asset thumbnails load faster
- historical images render correctly
- scroll loading continues correctly
- preview modal works
- original download works
- assets remain after refresh
- browser console has no new errors

Network spot-check:

- project canvas image preview requests should include `download-url?variantKey=preview`
- avoid first-screen dependence on original full-size image URLs

Health and logs:

- `tapflow-api`, `tapflow-worker`, `tapflow-frontend`, and `tapflow-redis` are up
- `/health` returns ok
- worker logs include `v2 worker runtime ready`
- API logs include `v2 api listening`

## Operational Notes

- `GET /` returning `404` from the API container is acceptable; it is not the main product route
- requests probing `/.git/config` are external scans, not application regressions
- migrations in runtime images must use `node packages/db/dist/cli.js`
- do not use root `docker-compose.yml` for the current v2 deployment path unless intentionally working on legacy deployment

## Known Non-Blocking Items

- Vite still emits chunk size warnings during frontend build
- some legacy migration tests remain known non-blocking failures outside the main v2 path
- Node 22 upgrade is now complete on staging, but production rollout still needs its own controlled deploy

## 2026-06-11 Work Log

### Goal

Improve real staging performance and alignment with TapNow-like behavior, especially around image preview loading and runtime smoothness.

### UI and Canvas Alignment Work

Completed across several commits:

- refined overall 100 percent scale presentation to better match TapNow feel
- adjusted add-node menu and user menu spacing/alignment behavior
- reduced menu density and node title size for closer TapNow visual balance
- fixed canvas/runtime black-screen issue caused by `plusHandle` reference error

Important commits in this area:

- `58f9d0f`
- `339452a`
- `0b17ff8`
- `dc82771`

### Upstream Image Auto-Reference Work

Completed in current working session:

- fixed the image-to-image chaining gap where runtime could use upstream images but the image node prompt bar still showed no active references
- image-to-image connect now auto-appends `upstream:<sourceNodeId>` into downstream `referenceOrder`
- graph upstream reference indexing now accepts image nodes backed by `thumbnailUrl`, `originalImageUrl`, generated result urls, or runtime image asset outputs
- asset-backed node data can now persist an optional preview url into referenceable image fields so imported asset nodes behave more like TapNow-style source images
- added focused regression tests for store auto-reference behavior and asset-backed image preview persistence

### Upstream Image Execution Wiring Fix

Completed in current working session:

- fixed the worker image-generation request builder so node-level `referenceImages` are forwarded into provider-facing request metadata
- this closes the gap where canvas UI showed an upstream image reference chip but the provider runtime still generated from prompt-only input
- added a focused worker unit test to lock the request-shaping behavior

Validation completed:

- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Media Preview Performance Work

Completed:

- canvas runtime now prefers preview variants instead of original image URLs
- image nodes use preview-backed asset loading with fallback path
- added preview load state handling on image nodes
- added historical asset variant backfill script
- added deployment/runbook notes for media asset pipeline

Important commits:

- `4af5009` feat: speed up asset previews with variants
- `ebed8f2` feat: add preview-backed asset pipeline

### Backfill Production Compatibility Fix

Problem found on staging:

- backfill script originally imported source-only paths like `apps/api/src/...`
- production worker image only contained built runtime artifacts
- staging dry-run failed with `ERR_MODULE_NOT_FOUND`

Fix completed:

- rewrote backfill script to use runtime-safe env parsing
- removed runtime dependency on app source-path imports
- made the script work in production containers
- added a regression test for safe import/direct execution behavior

Commit:

- `767ba4a` fix: make asset variant backfill run in production

### Staging Backfill Result

Validated on staging:

- dry-run succeeded and printed `thumb,preview`
- formal backfill succeeded and printed `[ok]` asset lines
- repeated runs indicated historical backlog was substantially processed

### Staging Functional Acceptance Result

Validated by manual staging checks:

- `/projects/:projectId` page passed
- `/assets` page passed
- historical image nodes restore correctly
- new image generation shows correctly in project and assets library
- refresh persistence passed
- first-screen image loading was noticeably improved
- no new browser console errors were observed in accepted flows

### Network Verification Result

Validated:

- project canvas requests included `download-url?variantKey=preview`

This confirms the preview variant path is active in the project canvas.

### Node Runtime Upgrade

Reason:

- staging logs showed AWS SDK warning about future support cutoff for Node 18

Completed:

- upgraded Docker builder and production stages from `node:18-alpine` to `node:22-alpine`
- rebuilt staging images
- confirmed actual runtime Node version inside API and worker containers

Commit:

- `b24b42f` chore: upgrade production image to node 22

Validated staging runtime:

- `tapflow-worker` -> `v22.22.3`
- `tapflow-api` -> `v22.22.3`

### Final Status for 2026-06-11

Result:

- staging acceptance passed
- media asset preview pipeline passed
- historical asset backfill passed
- Node 22 runtime upgrade passed on staging

Next recommended focus:

- prepare production release checklist using the now-validated staging path
- continue updating this file after each meaningful improvement or deploy-related change

### Latest UI Framing Update

Completed in current local iteration:

- added a desktop page-scale shell to the project canvas page so browser zoom `100%` visually matches the prior `80%` framing target more closely
- compensated shell width and height to preserve full-viewport coverage after scale
- relaxed the previous extra React Flow density shrink so page-level scale does not double-compress the canvas

Validation completed:

- `npm run test -- src/flowCanvas/FlowCanvasPage.test.tsx`
- `npm run test -- src/flowCanvas/utils/viewportDensity.test.ts`
- `npm run build`

### Latest UI Positioning Fix

Completed in current local iteration:

- removed the page-level desktop `scale()` shell from the project canvas page after it caused widespread overlay and toolbar position drift
- restored the project page to a normal viewport coordinate system so fixed-position menus, toolbars, and canvas interaction anchors line up again
- kept the denser default project-page visual framing by moving the adjustment back into React Flow fitView and viewport density settings instead of page transforms

Validation completed:

- `npm run test -- src/flowCanvas/utils/viewportDensity.test.ts`
- `npm run build`

### Latest Left Dock Scaling Update

Completed in current local iteration:

- scaled only the left vertical project dock to `70%` of its prior visual size
- kept the bottom viewport control bar unchanged
- applied the reduction through a dock-local wrapper so the adjustment stays scoped to the red-box area only

Validation completed:

- `npm run build`

### Latest Add Menu Alignment Update

Completed in current local iteration:

- moved the add-node flyout closer to the left dock after the dock was visually reduced
- kept the menu height unchanged
- aligned the add-node flyout bottom edge to a fixed lower reference line instead of the prior top-anchor behavior

Validation completed:

- `npm run build`

### Latest Menu Consistency Update

Completed in current local iteration:

- unified the add-node flyout, user menu, pane quick-add menu, and connection menu onto one shared menu token set
- aligned menu width, radius, padding, item height, icon box sizing, title font size, and description font size to the same baseline
- moved the user menu onto the same left/right and bottom-line anchoring model as the add-node menu so the whole menu system reads as one family

Validation completed:

- `npm run build`

### Latest Local Image Upload Repair

Completed in current local iteration:

- fixed the shared local-image upload path used by empty image nodes, upload nodes, canvas drag/drop, and paste upload
- kept direct `presigned-upload` browser upload as the first path
- added automatic fallback to same-origin API proxy upload when browser direct upload fails with fetch/CORS-style failure
- added new API route `POST /api/v2/assets/:assetId/upload-bytes` for binary proxy upload into object storage
- added a shared frontend helper to hydrate uploaded asset-backed image nodes with signed preview or original download urls
- implemented real click-upload and drag-upload behavior for `UploadNode`
- upload nodes now convert into image nodes after successful upload instead of staying as a static placeholder shell

Validation completed:

- `npm run test -- src/assets/assetApi.test.ts src/flowCanvas/utils/localImageUpload.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

Notes:

- `npm run test --workspace @aigc-flow/api -- assets.test.ts` was skipped locally because database test env was not configured in this machine session

### Latest Upload 413 Hotfix

Completed in current local iteration:

- traced the new upload regression to the same-origin fallback route `POST /api/v2/assets/:assetId/upload-bytes`
- confirmed the fallback route was receiving browser image uploads but Fastify rejected larger binary bodies with `413 FST_ERR_CTP_BODY_TOO_LARGE`
- raised the `application/octet-stream` parser body limit for the asset upload route to `25 MB`
- added a regression test case covering multi-megabyte proxied image upload behavior

Validation completed:

- `npm run build --workspace @aigc-flow/api`
- `npm run test --workspace @aigc-flow/api -- assets.test.ts` (skipped locally because DB env was not configured)
- `npm run build`

### Latest Canvas Upload Smoothness Upgrade

Completed in current local iteration:

- changed local image ingestion from a blocking "upload first, then render" flow to a two-phase "local preview first, background upload second" flow
- added immediate local `blob:` preview rendering for image-node upload, upload-node upload, drag-and-drop upload, and paste upload
- removed the drag/paste batch blocking behavior where `Promise.all(...)` delayed every node until the whole upload batch finished
- upload and paste interactions now insert image nodes immediately and backfill `assetId` plus cloud preview URL after upload completes
- upload nodes now convert into image nodes with visible local preview first, then upgrade to cloud-backed image nodes once upload settles
- failed uploads now keep the visible local image instead of looking like "nothing happened"

Validation completed:

- `npm run test -- src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/assets/assetApi.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build`

### Latest Text-to-Image Generation UI Alignment

Completed in current local iteration:

- fixed the v2 generated-image writeback so successful runs preserve `lastGenerationSnapshot`, generated result metadata, active result, cover result, and natural image size
- fullscreen image viewer now receives the real generation prompt/model/size metadata instead of falling back to empty prompt state
- rebuilt the fullscreen viewer right panel as fixed header, scrollable prompt/info content, and fixed download footer to avoid info/download overlap
- changed the in-node generation state from a loud central status pill to a quieter TapNow-style dark image skeleton
- kept generated image result controls driven by real node/runtime data instead of visual-only placeholders

Validation completed:

- `npm run test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

### Latest Fullscreen Viewer Scrollbar Alignment

Completed in current local iteration:

- added a TapNow-style hover scrollbar to the fullscreen image viewer right-side metadata panel
- scoped the scrollbar styling to the image viewer panel only so canvas and menu scrollbars are not affected
- kept the download button fixed at the bottom while the prompt and info content remain scrollable

Validation completed:

- `npm run build`

### Latest Local Upload Reference Preview Fix

Completed in current local iteration:

- fixed asset-backed local upload image nodes so resolved preview URLs are written back to node data, not only kept in component-local state
- restored downstream image reference chips for uploaded local images after connecting them into another image generation node
- added an always-visible-on-hover right-side viewer scroll indicator so the fullscreen metadata panel shows a TapNow-style scrollbar cue even when browser native scrollbars stay hidden

Validation completed:

- `npm run test -- src/flowCanvas/store/flowCanvasStore.test.ts`
- `npm run build`

### Latest Generated Image Original Download Fix

Completed in current local iteration:

- fixed generated image downloads to resolve the original asset download URL before downloading
- updated main image download, fullscreen viewer download, and generated result strip download to prefer original asset URLs over preview WebP URLs
- added a small tested download helper for asset-result id parsing, original URL resolution, and filename extension selection

Validation completed:

- `npm run test -- src/flowCanvas/utils/imageDownload.test.ts`
- `npm run build`

### Latest Image Batch Count Execution and Billing Fix

Completed in current local iteration:

- traced the remaining `2x` generation issue to the backend execution and billing layers, not the canvas UI
- added AI Gateway sync-image fallback execution so adapters that return one image per call repeat until the requested `n` image count is reached
- kept async provider-task routes from being repeated automatically, because task count semantics must stay provider-controlled while polling
- updated workflow pre-reserve pricing to read `unit_credits` and multiply image-generation cost by the requested batch count
- added `pricingQuantity` into node run cost metadata and billing reserve metadata for easier staging ledger inspection

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
- `npm test -- apps/api/test/workflow-pricing-resolver.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build`

### Latest GPT-Image-2 Reference Batch Payload Fix

Completed in current local iteration:

- traced the `gpt-image-2` 3x failure with a reference image to the OpenAI-compatible Images edit payload
- confirmed the adapter was sending a single `/images/edits` multipart request with `n=3`
- changed `gpt-image-2` reference-image edit requests to ask the provider for one image per call, letting the AI Gateway repeat calls until the requested batch count is reached
- removed `response_format=b64_json` from GPT Image requests while keeping `b64_json` response parsing intact
- kept legacy/non-GPT Image request behavior compatible for providers that still expect `response_format`

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Latest Canvas Multi-Selection Interaction Fix

Completed in current local iteration:

- changed canvas node selection behavior so multi-select is treated as its own batch operation mode instead of opening every selected node as an editor
- added a shared node selection mode helper that only allows single-node controls when exactly one node is selected
- suppressed text/image/video/upload/audio/image-editor/group node floating controls, resizers, prompt bars, result strips, and hover connection affordances during multi-selection
- made text nodes read-only for pointer interactions outside single-node edit mode to avoid accidental blue text selections while marquee-selecting or dragging batches
- closed context menus, image tools, and connection menus automatically when multi-selection starts

Validation completed:

- `npm run test -- src/flowCanvas/utils/nodeSelectionMode.test.ts`
- `npm run build`

### Latest Auth Page Visual Refresh

Completed in current local iteration:

- refreshed `/login` with a TapNow-style immersive product layout and glass login panel
- refreshed `/register` to reuse the same auth shell, spacing, controls, and visual language
- restored readable Chinese auth page copy and kept existing v2 auth API behavior unchanged
- added focused auth page rendering and submit tests for login/register

Validation completed:

- `npm run test -- src/auth/AuthPages.test.tsx`

Validation blocked:

- `npm run build` is currently blocked by unrelated in-progress workspace changes outside this auth task: `src/flowCanvas/panels/index.ts` exports missing canvas panel modules.
- Browser smoke for `/login` is currently blocked by unrelated Vite import analysis for `src/assets/AssetPreviewModal.tsx` resolving `./assetApi` while other local asset changes are dirty.

### Latest TapNow Workspace Phase 1 Refresh

Completed in current local iteration:

- added `docs/superpowers/plans/2026-06-12-tapnow-workspace-phase-1.md` for the authenticated workspace redesign
- refreshed the authenticated top shell into a TapNow-style dark creator nav with `首页`, `工作空间`, `素材库`, and `价格方案`
- moved account/admin actions into a right-side account menu with profile, credits, account management, model settings, help, and logout entries
- changed `/workspace` into a creator home with `今天要做点什么？`, a prompt-style input surface, recent projects, and an all-projects jump
- refreshed workspace project controls, tabs, create card, project cards, and project copy to match the denser TapNow-style project grid
- kept existing v2 auth, project listing, project creation, and project-opening behavior unchanged

Validation completed:

- `npm run test -- src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx`
- `npm run build`

### Latest Asset Library Thumbnail Tile Alignment

Completed in current local iteration:

- aligned `/assets` asset cards with the canvas asset drawer visual language: square rounded thumbnail tiles without bottom title/size metadata
- kept the `/assets` management affordance intact with the existing three-dot asset menu for preview, rename, favorite, move, download, and delete
- added a focused regression test to ensure the asset library renders canvas-style thumbnail tiles while preserving the management menu

Validation completed:

- `npm run test -- src\assets\AssetLibraryPage.test.tsx src\flowCanvas\panels\CanvasAssetPanel.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Plan

Completed in current local iteration:

- created the executable production performance plan for the canvas asset drawer, `/assets`, and `/workspace`
- selected the full production-grade path: backend inline preview URLs, asset summary endpoint, project cover URL inlining, frontend cache-first hooks, windowed thumbnail rendering, performance marks, and staging validation
- documented the work as 12 executable tasks with files, tests, commands, deployment order, and acceptance checks

Plan:

- `docs/superpowers/plans/2026-06-13-production-asset-workspace-performance.md`

### Latest Production Asset and Workspace Performance Tasks 1-4

Completed in current local iteration:

- added DB indexes for tenant-scoped asset browsing, favorite filtering, variant lookup, and workspace project ordering in `000022_asset_workspace_performance.sql`
- extended `GET /api/v2/assets` to support inline preview signing with `includePreviewUrls=true`, returning `previewUrl`, `previewUrlExpiresAt`, and `previewVariantKey`
- added `GET /api/v2/assets/summary` to return one-shot image/video/audio/all counts for the asset library
- extended `GET /api/v2/projects` to support `includeCoverUrl=true`, returning signed inline project cover URLs from thumb, preview, or original assets
- added API integration coverage for the new asset preview, asset summary, and project cover URL behaviors

Validation completed:

- `npm run build --workspace @aigc-flow/db`
- `npm run build --workspace @aigc-flow/api`
- `npm run test -- src\workspace\useWorkspaceProjects.test.tsx src\assets\useAssetLibrary.test.tsx`
- `npm run build`

Notes:

- local API integration tests under `apps/api/test/*.test.ts` are present but skipped in this environment because `DATABASE_URL` is not configured locally
- frontend hooks have not been switched to the new inline preview and cover URL APIs yet; that starts in Task 5-6

### Latest Production Asset and Workspace Performance Tasks 5-7

Completed in current local iteration:

- added frontend asset session cache primitives so the asset drawer and asset library can reuse warm data within the same authenticated session
- extended the frontend asset API types to consume backend inline preview URLs and the `/assets/summary` counts endpoint
- rewrote `useAssetLibrary` to be cache-first and stale-while-revalidate: first-page assets now request `includePreviewUrls=true`, counts come from `/assets/summary`, page size drops from 60 to 30, and reopen no longer blocks on a fresh loading state when cached data exists
- removed the canvas asset drawer header search box and upload button, and removed the empty-state upload CTA so the drawer now stays focused on fast asset picking
- updated asset hook tests and canvas drawer tests to lock the new cache-first and simplified drawer behavior

Validation completed:

- `npm run test -- src/assets/assetSessionCache.test.ts src/assets/useAssetLibrary.test.tsx`
- `npm run test -- src/flowCanvas/panels/CanvasAssetPanel.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Task 8

Completed in current local iteration:

- added a lightweight windowed asset thumbnail renderer for large `/assets` date groups
- `/assets` now renders the first 36 asset cards in a large group and exposes a load-more tile to expand the visible window
- kept the canvas asset drawer on the existing non-virtual compact rendering path so drawer behavior and accessibility remain unchanged
- added regression coverage that caps initial thumbnail buttons for a 120-asset group

Validation completed:

- `npm run test -- src/assets/AssetLibraryPage.test.tsx -t "limits initial thumbnail"`
- `npm run test -- src/assets/AssetLibraryPage.test.tsx src/flowCanvas/panels/CanvasAssetPanel.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Task 9

Completed in current local iteration:

- extended the workspace project API client to request backend inline cover URLs with `includeCoverUrl=true`
- added a session-scoped workspace project snapshot cache keyed by authenticated user, tenant, and session
- rewrote `useWorkspaceProjects` to show cached project lists immediately on remount and refresh silently in the background
- removed the workspace hook's frontend cover signing fanout, so `/workspace` now consumes cover URLs from `GET /api/v2/projects?includeCoverUrl=true`
- added regression coverage for cache-first workspace remounts and for avoiding `/assets/signed-urls` calls during project list loading

Validation completed:

- `npm run test -- src/workspace/useWorkspaceProjects.test.tsx`
- `npm run test -- src/workspace/useWorkspaceProjects.test.tsx src/workspace/WorkspacePage.test.tsx src/assets/AssetLibraryPage.test.tsx`
- `npm run build`

### Latest Production Asset and Workspace Performance Task 10

Completed in current local iteration:

- added a tiny frontend performance mark helper that safely no-ops when browser performance APIs are unavailable
- added diagnostic timing marks around asset library refreshes:
  - `asset-library-refresh-start`
  - `asset-library-refresh-end`
  - `asset-library-refresh`
- added diagnostic timing marks around workspace project refreshes:
  - `workspace-projects-refresh-start`
  - `workspace-projects-refresh-end`
  - `workspace-projects-refresh`
- kept performance marks diagnostic-only so missing marks or unsupported APIs cannot break user flows

Validation completed:

- `npm run test -- src/performance/performanceMarks.test.ts src/assets/useAssetLibrary.test.tsx src/workspace/useWorkspaceProjects.test.tsx`
- `npm run build`


### Latest Production Asset and Workspace Performance Task 11

Completed in current local iteration:

- added a performance-specific smoke test checklist to `docs/staging-runbook.md`
- performed full local validation of the performance plan across assets, workspace, and hook caching
- verified that API performance tests pass (skipped locally due to missing DATABASE_URL, which is expected)

Validation completed:

- `npm run test -- src/assets/useAssetLibrary.test.tsx src/assets/AssetLibraryPage.test.tsx src/flowCanvas/panels/CanvasAssetPanel.test.tsx src/workspace/useWorkspaceProjects.test.tsx src/workspace/WorkspacePage.test.tsx`
- `npm run test --workspace @aigc-flow/api -- test/assets.test.ts test/projects-flows.test.ts`
- `npm run build`

### Latest Asset and Workspace Performance Staging Validation

Validated on staging:

- `/workspace` returns with visible content immediately after page switching instead of showing a blocking loading surface
- canvas asset drawer reopens without a blocking loading state after the first warm cache pass
- `/assets` first-screen thumbnail loading feels faster than the pre-optimization path
- browser Network confirms `GET /api/v2/projects?includeCoverUrl=true`
- browser Network confirms `GET /api/v2/assets?includePreviewUrls=true`
- browser Network confirms `GET /api/v2/assets/summary`
- repeated `projects?includeCoverUrl=true` requests observed during manual navigation were tied to deliberate page switching, not to blocked cache rendering

Known follow-ups:

- continue observing real staging traffic for unexpectedly repeated background refreshes outside explicit user navigation
- if needed, capture a dedicated Performance panel trace for `asset-library-refresh` and `workspace-projects-refresh`

### Latest Project and Asset Management Menus

Completed in current local iteration:

- added shared `EntityActionMenu` primitives plus a `WorkspaceActionMenu` wrapper for TapNow-style entity management menus
- wired project grid cards to a three-dot management menu with open, rename, disabled future actions, and delete
- wired project list mode to an operation column with the same project management menu
- connected project rename to `updateWorkspaceProject` and project delete to `DELETE /projects/:id`, refreshing the workspace list after successful actions
- wired asset cards to a three-dot management menu with preview, rename, favorite/unfavorite, move to folder, download original, and delete
- connected asset rename, favorite, download, delete, and move-to-folder to the existing asset and folder APIs, refreshing the asset library after mutations
- tightened menu state handling so menu actions that open dialogs or run immediate operations close the menu cleanly, while the folder move submenu remains available until a folder is selected
- added regression coverage for project rename/delete and asset rename/favorite/download/move/delete menu flows

Validation completed:

- `npm run test -- src\workspace\WorkspacePage.test.tsx src\assets\AssetLibraryPage.test.tsx`

### Latest Management Menu Stability Fixes

Completed in current local iteration:

- changed shared entity menus to support fixed-position anchored rendering, viewport edge clamping, and compact density for canvas drawer usage
- adjusted asset cards so compact drawer menus only show actions that have real handlers, preventing oversized empty menu blocks in the left asset drawer
- changed project deletion to use optimistic local removal plus silent refresh, avoiding full-list loading flashes after confirm delete
- wired the asset library sidebar `收藏` category to real `favorite=true` asset queries instead of a static button
- changed asset favorite/delete actions to update the visible list optimistically, so the UI responds immediately while the API call completes
- added focused regression coverage for compact drawer menus, no-flash project deletion flow, favorite-category filtering, and asset menu management flows

Validation completed:

- `npm run test -- src\workspace\WorkspacePage.test.tsx src\assets\AssetLibraryPage.test.tsx src\assets\useAssetLibrary.test.tsx src\flowCanvas\panels\CanvasAssetPanel.test.tsx`

### Latest Project Management Interaction Stabilization

Completed in current local iteration:

- moved shared rename/delete dialogs into `document.body` portals so project card transforms no longer offset modal placement
- simplified project card hover behavior and kept project action menus card-local to reduce menu positioning jitter
- made the project menu `选择` action functional with a visible selected-count chip and selected card/list row styling
- removed asset management three-dot buttons from the canvas left asset drawer while keeping `/assets` page management menus available
- added regression coverage for body-level project rename dialogs, project selection, and hidden canvas drawer asset management buttons

Validation completed:

- `npm run test -- src\workspace\WorkspacePage.test.tsx src\assets\AssetLibraryPage.test.tsx src\assets\useAssetLibrary.test.tsx src\flowCanvas\panels\CanvasAssetPanel.test.tsx`

### Latest Workspace Cover and Asset Library Performance Fix

Completed in current local iteration:

- changed workspace project cover loading from per-card signed URL requests to a deduplicated batch signing pass in `useWorkspaceProjects`
- kept project cards render-only for cover URLs and added lazy/async image loading so the project grid does not create request storms
- added an in-memory asset library snapshot cache so reopening `/assets` can show the last loaded page immediately while fresh data reloads
- changed asset library media tab counts to use server totals instead of the current 60-item page length
- made image/video/audio count refresh run in the background after the first asset page renders, avoiding count queries blocking the library view

Validation completed:

- `npm run test -- src/workspace/useWorkspaceProjects.test.tsx src/workspace/ProjectCard.test.tsx src/assets/AssetLibraryPage.test.tsx src/assets/useAssetLibrary.test.tsx`
- `npm run test -- src/workspace/HomePage.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/useWorkspaceProjects.test.tsx src/workspace/ProjectCard.test.tsx src/assets/AssetLibraryPage.test.tsx src/assets/useAssetLibrary.test.tsx src/assets/assetLibraryView.test.ts`
- `npm run build`

### 2026-06-12 - Canvas Asset Drawer UI Refresh

- Restyled the left in-canvas `素材库` drawer toward the TapNow reference while keeping the existing grouped asset data flow unchanged.
- Simplified the drawer hierarchy:
  - removed the extra folder chip row from the main drawer surface
  - kept media tabs as the primary filter control
  - retained date-grouped sections as the main browsing structure
- Changed compact asset rendering from metadata-heavy cards to thumbnail-first tiles:
  - compact drawer items now render as pure image/video thumbnails
  - visible filename / kind / size text is removed from the drawer
  - accessibility is preserved via button `aria-label`
- Refined drawer density to better match the reference:
  - larger search field
  - larger compact upload button
  - stronger date heading hierarchy
  - more restrained card chrome and spacing
  - slightly cleaner drawer shell padding and header density
- Added focused regression coverage for the drawer presentation so future changes do not accidentally bring back verbose card metadata or the folder chip row.

Validation completed:

- `npm run test -- src/flowCanvas/panels/CanvasAssetPanel.test.tsx src/assets/AssetLibraryPage.test.tsx src/assets/assetLibraryView.test.ts src/assets/useAssetLibrary.test.tsx`
- `npm run build`

### 2026-06-12 - Asset Aspect Ratio Preservation Fix

- Fixed the asset-library-to-canvas aspect ratio regression where portrait uploads could appear as square `1:1` nodes after insertion.
- Frontend upload flow now reads the original image's natural `width` and `height` before upload and sends those dimensions through both:
  - `/api/v2/assets/presigned-upload`
  - `/api/v2/assets/:assetId/complete-upload`
- Canvas asset insertion now has a compatibility fallback for historical assets:
  - after inserting an asset-backed image node from the drawer, the canvas reads the preview image's real dimensions
  - if stored asset dimensions are missing or materially inconsistent with the preview, the node is rehydrated to the correct aspect ratio on canvas
- Backend asset upload-bytes flow now also extracts original image dimensions from binary uploads with `sharp().metadata()` and backfills `assets.width` / `assets.height` when they are still missing, so the system is more resilient even if a frontend path misses dimension metadata in the future
- Result:
  - new uploaded materials keep the correct portrait / landscape ratio on canvas
  - old materials with missing or wrong stored dimensions can still be inserted with corrected on-canvas proportions

Validation completed:

- `npm run test -- src/assets/assetApi.test.ts src/flowCanvas/utils/assetNodeData.test.ts src/flowCanvas/store/flowCanvasStore.test.ts`
- `npm run build`
- `npm run build --workspace @aigc-flow/api`

### 2026-06-12 - Asset Modal Insert Route Aspect Ratio Follow-up

- Fixed the remaining portrait asset insertion path that still rendered some asset-library images as square `1:1` nodes on canvas.
- Root cause:
  - the earlier aspect-ratio recovery work covered the in-canvas asset drawer insertion path
  - inserting from the `/assets` preview modal used the separate `insertAssetId` route flow in `FlowProjectPage`, which was still building nodes only from stored asset metadata
- Changes made:
  - extracted the shared natural-size reconciliation logic into `src/flowCanvas/utils/assetNodeData.ts`
  - reused that logic in both:
    - `src/flowCanvas/canvas/AiFlowCanvas.tsx`
    - `src/flowCanvas/FlowProjectPage.tsx`
  - added a regression test that locks the `?insertAssetId=` portrait-asset case so preview-modal insertion now rehydrates bad historical metadata back to the correct `9:16`-style canvas size

Validation completed:

- `npm run test -- src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/utils/assetNodeData.test.ts`
- `npm run build`

### Latest TapNow Billing Pixel Alignment Pass

Completed in current local iteration:

- pushed `/billing` closer to the TapNow reference pricing page with an open dark dotted canvas, oversized `选择你的套餐` headline, larger spacing, and a yearly billing segmented control
- enlarged Basic, Pro, and Ultimate pricing cards with uppercase plan labels, a `最受欢迎` Pro pill, card CTAs, and plan-specific monthly credit benefits
- kept the existing server-backed billing summary, usage, ledger, redeem, and recharge behavior unchanged below the pricing-first surface
- extended the focused billing page rendering test to lock the yearly switch, Pro highlight, card CTAs, and visible credit benefit copy

Validation completed:

- `npm run test -- src/billing/BillingCenterPage.test.tsx`

### Latest TapNow Workspace Pixel Alignment Pass 2

Completed in current local iteration:

- refined the `/workspace` home surface toward the TapNow reference with a more centered creator prompt, tighter first-screen spacing, and compact quick action chips for `AI 视频`, `图像生成`, `智能抠图`, and `批量工作流`
- refreshed the project management section from generic `项目` copy to `我的空间` with clearer supporting text and a lighter count pill
- reduced the visual weight of project tabs, search, sort, view toggle, refresh, and create controls so the project grid reads closer to TapNow's dense product UI
- tightened create/project card dimensions, thumbnail ratios, rounded corners, metadata sizing, and hover affordances while keeping project creation/opening behavior unchanged
- extended the workspace page test coverage for the new quick actions and project section copy

Validation completed:

- `npm run test -- src/workspace/WorkspacePage.test.tsx`

### Latest Home / Workspace Split and Project Cover Pass

Completed in current local iteration:

- split the TapNow-style creator home into a dedicated `/home` route and kept `/workspace` as a standalone project management page
- updated the authenticated shell so `涓婚〉` navigates to `/home` and `宸ヤ綔绌洪棿` navigates to `/workspace` without hash-based scrolling behavior
- changed root authenticated redirects to land on `/home`
- aligned the workspace page with the TapNow grid/list references: grid remains card-based, list mode now uses a table-like preview/name/type/created/updated layout
- added server-side project cover inference from the latest flow draft: generated image result assets take priority, uploaded canvas image assets are next, and projects with no durable image asset continue to fall back to the frontend gradient cover
- added focused tests for the split home/workspace behavior and draft-cover inference rules

Validation completed:

- `npm run test -- src/workspace/HomePage.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx src/app/WorkspaceShell.test.tsx apps/api/test/project-cover-inference.test.ts`

Notes:

- Phase 2 should apply the same TapNow shell language to `/assets`, `/billing`, and `/account` content pages.

### Latest TapNow Secondary Pages Phase 2 Refresh

Completed in current local iteration:

- refreshed `/assets` into a cleaner TapNow-style asset library with left-side category navigation, product copy, compact tool buttons, search, and a richer empty state for image/video/audio uploads
- refreshed `/billing` into a price-plan-first page with Basic, Pro, and Ultimate cards while keeping existing server-backed balance, usage, ledger, redeem, and recharge flows unchanged
- refreshed `/account` into a product settings-style page with readable identity, workspace, and model connection sections
- kept the Phase 2 scope presentation-only: no backend API, auth, billing ledger, or asset storage behavior was changed
- added focused rendering tests for the three refreshed pages

Validation completed:

- `npm run test -- src/assets/AssetLibraryPage.test.tsx src/billing/BillingCenterPage.test.tsx src/account/AccountPage.test.tsx`

### Latest TapNow Canvas Entry Phase 3 Refresh

Completed in current local iteration:

- added `docs/superpowers/plans/2026-06-12-tapnow-canvas-entry-phase-3.md` for the project canvas entry refresh
- refreshed the empty project canvas start surface with `今天想创作什么？`, concise guidance, and compact quick-start actions
- refreshed project canvas loading/error wording and retry action copy while keeping remote project loading and autosave behavior unchanged
- added focused tests for the canvas empty state, project loading/error/save status copy, and left dock add-node menu copy
- kept the Phase 3 scope presentation-only: no dock drawer, backend, billing, asset storage, workflow execution, or autosave semantics were changed

Validation completed:

- `npm run test -- src/flowCanvas/FlowCanvasPage.test.tsx src/flowCanvas/FlowProjectPage.test.tsx src/flowCanvas/canvas/FlowLeftAddPanel.test.tsx`

### Latest TapNow Workspace Pixel Alignment Pass

Completed in current local iteration:

- fixed the top `宸ヤ綔绌洪棿` navigation so clicking it on `/workspace` updates `#projects` and dispatches a reveal event that the workspace page can use to scroll to the project section
- separated `涓婚〉` and `宸ヤ綔绌洪棿` active states so `#projects` no longer visually behaves like the same nav target
- removed the oversized framed hero container from the workspace home and moved the first screen closer to TapNow's full-page dotted background layout
- narrowed the home content, increased the title/icon scale, tightened the prompt bar, and resized recent project cards toward the TapNow reference proportions
- restored readable Chinese copy in the workspace home loading/prompt/recent-project surfaces touched by this pass

Validation completed:

- `npm run test -- src/app/WorkspaceShell.test.tsx src/workspace/WorkspacePage.test.tsx src/workspace/ProjectCard.test.tsx`
- `npm run build`

### Latest AI Gateway Runtime Route Fix

Completed in current local iteration:

- fixed AI Gateway runtime adapter selection so provider connections use `connection.adapterKind` instead of falling back to `provider.kind`, preventing configured OpenAI-compatible image routes from silently executing the mock adapter
- kept route `api_mode`, `request_path`, and `upstream_model` as provider request configuration instead of treating them as adapter kinds
- added media output diagnostics (`aiRuntime`) to worker output JSON and generated canvas node patches so image tool results show the runtime model/provider/route actually used
- changed worker asset persistence to read image dimensions from the stored binary before writing asset refs, avoiding provider-reported `1x1` metadata from corrupting canvas node size
- strengthened worker test coverage for real generated image bytes, non-empty preview variants, measured dimensions, and runtime diagnostics

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts provider-adapter-registry.test.ts`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build --workspace @aigc-flow/worker`

### Latest Official Model Catalog Cleanup

Completed in current local iteration:

- kept the creator-facing image model catalog to the 3 official product models: Nano Banana Pro, Nano Banana 2, and GPT-Image-2
- kept only 4 official system image routes in the database: `image.gpt-image-2`, `image.gpt-image-2.line2`, `image.pixellelabs.nano-banana-2`, and `image.pixellelabs.nano-banana-pro`
- deleted non-official tenant/mock/legacy routes from `ai_routes`; removed related route health checks and cleared historical `ai_call_logs.route_id` references while preserving the call log rows
- changed creator-facing model route labels to product labels such as `Nano Banana Pro 线路一` and `GPT-Image-2 线路二`, without exposing provider names, upstream model names, or route keys
- changed image generation loading copy to neutral text so route/provider identifiers are not shown while a node is generating

Validation completed:

- `npx vitest run src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts`

### Latest Image Model Picker First-Frame Fix

Completed in current local iteration:

- removed first-frame exposure of internal model keys such as `pixellelabs.nano-banana-pro` in the image model/route picker by mapping fallback labels through product-facing names
- added cached, shared loading for image model catalog and model-scoped routes so reopening/selecting the picker does not clear visible route options while requests are in flight
- started model-scoped route loading as soon as the current model is known instead of waiting for the picker/editor open state
- added official 3-model / 4-route fallback route options so `Nano Banana Pro 线路一`, `Nano Banana 2 线路一`, and `GPT-Image-2 线路一/线路二` can render immediately before the API response returns
- changed the empty route section to show a loading state during route fetches instead of incorrectly saying the current model has no available routes

Validation completed:

- `npx vitest run src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts`
- `npm run build`

### Latest Nano Banana Parameter Panel Refresh

Completed in current local iteration:

- added a dedicated `NanoBananaParamPanel` popup body for `Nano Banana Pro` and `Nano Banana 2` instead of reusing the generic image settings layout
- locked Nano Banana quality options to `1K / 2K / 4K` and ratio options to the approved 10-item two-row set even when catalog metadata is incomplete
- routed Nano Banana image nodes to the dedicated panel ahead of the dynamic-schema branch so the new UI actually renders for current catalog-backed models
- preserved the existing parameter write-back contract for `size` and `aspect_ratio`
- kept `GPT-Image-2` on the existing settings path unchanged in this iteration
- added focused regression coverage for fixed ratio ordering, all 10 visible ratio items, legacy alias handling, and GPT-image-2 isolation

Validation completed:

- `npm test -- src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/utils/modelCatalogOptions.test.ts`

### Latest GPT-image-2 Parameter Panel Refresh

Completed in current local iteration:

- added a dedicated GPT-image-2 dual-zone parameter panel instead of relying on the generic dynamic image parameter popup
- aligned the popup shell and visual language with the Nano Banana panel family while preserving GPT-image-2-specific controls for size, quality, output format, and moderation
- kept GPT-image-2 on the `size` field contract and avoided regressing it into the Nano Banana `imageSize` / `image_size` flow
- added GPT-image-2-specific fallback options for `Auto / 1K / 2K / 4K` size and the approved ratio set so the popup remains complete even when catalog metadata is sparse
- kept Nano Banana routing and all other generic image-model popup paths unchanged

Validation completed:

- `npm test -- src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx src/flowCanvas/utils/modelCatalogOptions.test.ts`

### Latest MouxiHub Nano Banana Pro T3 Default Size Fix

Completed in current local iteration:

- traced the production MouxiHub T3 failure to the provider request body using the product model `gemini-3-pro-image-preview` instead of the route's size-specific upstream model
- changed the OpenAI-compatible image adapter so routes with `requestConfig.modelBySize` default a missing canvas size to `1K`
- ensured MouxiHub T3 async text-to-image requests now send `gemini-3.1-flash-image-preview` and provider size `1K` when the node does not explicitly provide a size
- added regression coverage for missing-size MouxiHub async generation to keep the product model from leaking into the upstream request path again

Validation completed:

- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "defaults MouxiHub"`
- `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts plugin-registry.test.ts`
- `npm run build --workspace @aigc-flow/ai-gateway-core`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Latest Image Reference Prompt Priority Fix

Completed in current local iteration:

- traced a MouxiHub image-edit prompt mismatch to worker request construction rather than the provider: upstream reference image output prompts could override the current image node prompt
- changed image request building so the current node `generationPrompt` is sent to providers when present, while preserving the older upstream-text fallback when the image node has no own prompt
- added regression coverage for the exact reference-image case where a prior prompt like `动物运动会，3D风格` must not replace the newly typed prompt

Validation completed:

- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts -t "keeps the current image node prompt"`
- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
- `npm run build --workspace @aigc-flow/worker`
- `npm run test --workspace @aigc-flow/worker`
- `npm run build`

### Latest Image Prompt Channel Separation Fix

Completed in current local iteration:

- tightened image request construction so upstream outputs containing media `assets` are treated as reference media only and never contribute `prompt` or `text` to the next provider request
- allowed text-only upstream outputs to remain valid prompt inputs for image nodes
- merged text-only upstream prompt fragments with the current image node `generationPrompt` when both are present, preserving explicit text-node workflows without leaking old reference-image prompts
- added regression coverage for a mixed upstream text plus reference image case to prove old reference prompt/text values are excluded

Validation completed:

- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts -t "combines upstream text"`
- `npm run test --workspace @aigc-flow/worker -- workflow-runtime-image-request.test.ts`
- `npm run test --workspace @aigc-flow/worker`
- `npm run build --workspace @aigc-flow/worker`
- `npm run build`

### Latest Official Image Pricing Refresh

Completed in current local iteration:

- updated official image model pricing by route and size: Nano Banana Pro line one `4/4.5/5`, Nano Banana 2 line one `2.5/3/3.5`, GPT-Image-2 line one `2.5/3/3.5`, GPT-Image-2 line two `3/3.5/4`
- kept MouxiHub Nano Banana Pro line two T3 pricing unchanged at `6/8/12`
- added decimal billing support for pricing, reservation, ledger, and usage amounts so half-credit prices are stored and settled accurately instead of being truncated
- added a production migration to update existing `model_pricing` rows and convert billing amount columns to `numeric(18,4)`
- changed the image prompt bar point display to calculate the current points from active route key plus selected `1K/2K/4K` size so the bottom-right value updates immediately when model, line, or quality changes

Validation completed:

- `npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts -t "preserves decimal"`
- `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts`
- `npx vitest run src/flowCanvas/utils/imageRoutePricing.test.ts`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/db`
- `npm run build --workspace @aigc-flow/ai-gateway-core`

## 2026-06-15 - Scheme C Home Workspace Auth Refresh

- refreshed `/home`, `/workspace`, `/login`, and `/register` toward the approved Scheme C premium product direction
- reduced the old oversized prompt dominance on `/home` and replaced it with a brand-led hero, lighter quick-start entry, capability preview, and recent-project continuation
- reorganized `/workspace` around a unified control bar and project-first layout while keeping existing project actions and creation behavior intact
- tightened the shared auth shell so login/register use a more compact desktop-first layout and keep primary actions within standard first-screen desktop view without relying on page scrolling
- normalized the touched auth/workspace/home test copy to readable Chinese in the refreshed surfaces
- Validation:
  - `npm test -- src/auth/AuthPages.test.tsx src/workspace/HomePage.test.tsx src/workspace/WorkspacePage.test.tsx`
  - `npm run build`

## 2026-06-15 - GPT-Image-2 Parameter Panel UI Consistency Pass

- cleaned the dedicated GPT-image-2 parameter panel so the visible section labels are readable Chinese and the summary strip uses the shared `路` separator instead of corrupted characters
- widened and rebalanced the dual-zone GPT panel layout to reduce right-column crowding for quality, output format, and moderation controls
- tightened GPT panel chip typography with nowrap behavior so compact English option labels stay aligned with the rest of the canvas parameter surfaces
- normalized image route user-facing Chinese labels in the catalog option helpers so model line menus no longer surface mojibake strings
- Validation:
  - `npm test -- src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx src/flowCanvas/utils/modelCatalogOptions.test.ts`
  - `npm run build`

## 2026-06-15 - Image Batch Credit Display Fix

- traced the image prompt-bar credit mismatch to a frontend-only display bug: the bottom-right credit pill was rendering the single-image route price and ignored the selected `batchCount`
- added a shared image credit display helper that multiplies the route unit price by the selected generation quantity for UI display
- updated the image node prompt bar so switching from `1x` to `2x`/`3x`/`4x` immediately updates the displayed required credits
- added a regression test covering quantity-aware display pricing for decimal and whole-credit routes
- Validation:
  - `npm test -- src/flowCanvas/utils/imageRoutePricing.test.ts src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx`
  - `npm run build`

## 2026-06-15 - MouxiHub T3 Async Quantity Aggregation

- changed the official MouxiHub Nano Banana Pro T3 async route so image quantity greater than `1` no longer relies on a single upstream async task carrying `n > 1`
- the AI Gateway now splits `image.mouxihub.nano-banana-pro.t3` requests into multiple async provider create calls with single-image payloads and returns an aggregated provider-task list
- the worker waiting-provider state now supports multiple provider tasks for a single node run while remaining backward-compatible with the older single-task shape
- provider polling now updates per-task progress, waits until all async provider tasks succeed, then aggregates all outputs into one final asset persistence + one billing settle
- this keeps official T3 behavior aligned with the other multi-image routes that already satisfy quantity by repeated provider requests instead of trusting one provider task to return multiple outputs
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- worker.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-15 - Image Multi-Result Display Mode

- added a new persisted image-node display mode so multi-image generation can be shown either as `combined` results on the parent node or as `split_nodes`
- image prompt bars now reveal an inline display-mode switch next to the existing `2x / 3x / 4x` quantity control when the selected batch count is greater than `1`
- kept the existing combined-result strip behavior as the default path for backward compatibility
- added split-mode fan-out behavior on successful multi-image runs:
  - keep the parent image node in place
  - create one generated child image node per output asset
  - connect each child from the parent node
  - suppress duplicate parent filmstrip rendering for that same split-delivered batch
- kept the implementation frontend-only in the canvas/store/workflow runner layer without changing the backend workflow contract
- Validation:
  - `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/store/flowCanvasStore.test.ts`
  - `npm run build`

## 2026-06-15 - MouxiHub T3 Aspect Ratio Forwarding Fix

- traced the official MouxiHub Nano Banana Pro T3 ratio mismatch to the OpenAI-compatible image adapter layer rather than the canvas or worker request builder
- confirmed frontend and worker metadata already preserved the selected image ratio, but the async MouxiHub generation payload dropped it before the upstream provider request was created
- updated the OpenAI-compatible adapter so the official MouxiHub T3 route forwards the selected ratio as `aspect_ratio` in the upstream generation payload
- added a focused regression test for the exact `2K + 3:4` official T3 request path to prevent future regressions where MouxiHub falls back to its provider default ratio
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "generateImage forwards MouxiHub async generation aspect ratio to upstream payload"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`

## 2026-06-15 - GPT-Image-2 MouxiHub Async Lines 3 and 4

- added a built-in AI Gateway plugin package for `GPT-Image-2` MouxiHub async routes `image.gpt-image-2.line3` and `image.gpt-image-2.line4`
- line 3 now maps size tiers to upstream models:
  - `1K -> gpt-image-2`
  - `2K -> gpt-image-2-2k`
  - `4K -> gpt-image-2-4k`
- line 4 now maps size tiers to upstream models:
  - `1K -> gpt-image-2-vip`
  - `2K -> gpt-image-2-vip-2k`
  - `4K -> gpt-image-2-vip-4k`
- kept all GPT-Image-2-specific size behavior aligned with the existing dedicated panel/runtime rules instead of reusing the Nano Banana size contract
- kept MouxiHub async generation/edit integration on:
  - `/v1/images/generations?async=true`
  - `/v1/images/edits?async=true`
  - `/v1/images/tasks/{task_id}`
- kept GPT-Image-2 quantity behavior aligned with the current multi-image safety path by preserving one-image-per-request upstream splitting when the requested image count is greater than `1`
- extended creator-facing route metadata so fallback labels, route ordering, and frontend pricing now include:
  - `GPT-Image-2 线路三`
  - `GPT-Image-2 线路四`
- cleaned the touched GPT-Image-2 MouxiHub plugin/catalog metadata to readable Chinese labels so the new lines do not surface mojibake in canvas or admin-adjacent views
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts runtime.test.ts`
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts`
  - `npx vitest run src/flowCanvas/utils/imageRoutePricing.test.ts src/flowCanvas/utils/modelCatalogOptions.test.ts`
  - `npm run build`

- follow-up template split:
  - split the original combined MouxiHub GPT-Image-2 template into two independent template-library entries:
    - `GPT-Image-2 线路三`
    - `GPT-Image-2 线路四`
  - each template now installs only its own route so the initializer can bind a different API key per line instead of forcing both lines through one shared template credential
  - provider connection names are now package-scoped during template install, preventing split templates from accidentally reusing the same generated connection/credential because of a shared display-name-based connection key
  - the split line templates are route-only install templates and do not republish duplicate `gpt-image-2` catalog entries, so the creator-facing GPT-Image-2 model directory remains stable while the extra lines stay independently installable
## 2026-06-15 - AI Route Test Admin Permission Alignment

- unified the AI route test endpoint `POST /api/v2/admin/ai/routes/:routeId/test` with the rest of the admin/model-management surfaces by requiring `admin:system`
- removed the old `provider:manage` mismatch that let users open the admin AI pages but blocked the route test action itself
- updated API regression coverage so:
  - the admin-email owner can install the mock plugin and run route tests
  - a non-admin tenant viewer is rejected with `403` and `Missing permission: admin:system`

## 2026-06-15 - Model Catalog Route ID Tenant Priority Fix

- traced the new `Route not found or is not active` admin/model-center error to the model-catalog route list query rather than the upstream providers
- confirmed the frontend route test action was receiving the wrong `routeId` when the same `route_key` existed in both a system route and a tenant-installed route
- fixed `ai-model-catalog` route ordering so the current tenant's route record is preferred over the system fallback for the same `route_key`
- added regression coverage for the exact duplicate-route-key case to ensure model-center route lists keep returning the tenant route id
- validation:
  - `npm run test --workspace @aigc-flow/api -- ai-model-catalog.test.ts` (skipped locally because database test env is unavailable)
  - `npm run build`

## 2026-06-15 - MouxiHub GPT-Image-2 Async Payload Compatibility Fix

- traced the remaining `The provider returned an internal error` failures for GPT-Image-2 lines 3 and 4 to request-shape mismatches against MouxiHub's async image docs rather than route selection
- confirmed MouxiHub async GPT-image generation docs only require the basic image payload and do not document the extra `aspect_ratio` parameter for these routes
- confirmed MouxiHub async image-edit docs use multipart field `image` for uploaded source images rather than the older `image[]` field used by other compatible routes
- updated the OpenAI-compatible image adapter so:
  - `image.gpt-image-2.line3` and `image.gpt-image-2.line4` never forward `aspect_ratio`
  - `image.gpt-image-2.line3` and `image.gpt-image-2.line4` always send edit uploads under multipart field `image`
  - the runtime override applies even for already-initialized routes whose saved `request_config` still contains older template values
- aligned the MouxiHub GPT-Image-2 manifests and runtime regression coverage with the corrected request shape
- validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "MouxiHub GPT-Image-2"`
  - `npm run build`

## 2026-06-15 - MouxiHub GPT-Image-2 Lines 3 and 4 Size-Tier Model Routing Alignment

- re-checked MouxiHub `GPT-Image-2` lines 3 and 4 against the working size-tier model selection pattern instead of continuing the earlier raw-tier payload attempt
- confirmed the desired provider contract for these MouxiHub async lines is:
  - choose the upstream model directly from the selected size tier
  - keep request `size` on GPT-image-compatible pixel dimensions instead of raw `1K / 2K / 4K`
  - forward the selected `aspect_ratio`
  - avoid the invalid `size: 1K / 2K / 4K` MouxiHub payload shape that caused upstream failures
- updated the OpenAI-compatible image adapter so:
  - `image.gpt-image-2.line3` maps `1K / 2K / 4K` to `gpt-image-2 / gpt-image-2-2k / gpt-image-2-4k`
  - `image.gpt-image-2.line4` maps `1K / 2K / 4K` to `gpt-image-2-vip / gpt-image-2-vip-2k / gpt-image-2-vip-4k`
  - both lines now keep GPT-image-style pixel-size normalization while still using size-tier upstream model selection
- updated the GPT-image edit mapping so creator-side edit payload metadata for GPT-image-2 also stays on pixel `size` plus `aspect_ratio`, matching the generation/runtime contract
- added regression coverage proving:
  - line 3 async generation sends `model: gpt-image-2-2k`, `size: 2512x1664`, `aspect_ratio: 3:2`
  - line 4 async edit uses `gpt-image-2-vip-4k`
  - stale legacy `requestConfig.model` values no longer override line 4 size-tier routing or revert to the wrong base model
- validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "size-mapped upstream model and pixel size payload|explicit vip size-mapped model with pixel size payload"`
  - `npm run test --workspace @aigc-flow/ai-gateway-core`
  - `npm run build`

## 2026-06-16 - Admin AI Model Center System Route Disable Fix

- traced the non-working "停用线路" action to frontend gating in the AI model center instead of an API or database failure
- confirmed `admin:system` users could already update system-route status through the admin route update API, but the page blocked the action in two places:
  - the disable button was hard-disabled for non-tenant routes
  - the click handler returned early for system routes before calling `updateAdminRoute`
- updated the model-center route management UI so non-default system routes can now be disabled or re-enabled directly from the page, while the existing protection for default routes remains in place
- added a focused regression test covering the exact scenario: a non-default system route is selectable and sends `status: inactive` through `updateAdminRoute`
- validation:
  - `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx`
  - `npm run build`
## 2026-06-16 - Canvas GPT-Image-2 Disabled Route Visibility Fix

- traced the still-visible `GPT-Image-2 线路三 / 线路四` canvas menu issue to frontend fallback data rather than the admin disable action or route-status persistence
- confirmed the canvas image model picker kept a hard-coded GPT-Image-2 fallback route list that still included lines 3 and 4, so those routes could reappear even after the backend route list no longer returned them
- moved the official image fallback route definitions into shared runtime-route helpers and limited the GPT-Image-2 fallback set to line one and line two only
- updated the canvas model-scoped route loader so cached route lists are shown immediately but still trigger a background refresh, preventing stale same-session route caches from keeping recently disabled lines visible
- added a focused regression test to lock the GPT-Image-2 fallback route set to:
  - `image.gpt-image-2`
  - `image.gpt-image-2.line2`
- validation:
  - `npm test -- src/flowCanvas/utils/runtimeRouteOptions.test.ts`
  - `npm run build`

## 2026-06-16 - Image Prompt Bar Final Single-Row Layout

- rebuilt the canvas image-node bottom generation controls toward the approved final single-row layout
- credits now render as a horizontal ?? N pill and the send button sits independently on the far right
- GPT-Image-2 and Nano Banana Pro states now share the same generation-toolbar structure instead of drifting into separate right-side layouts
- cleaned mojibake regressions in the multi-image toggle and the dedicated Nano Banana / GPT-Image-2 parameter panels
- added focused component coverage for the generation toolbar plus the refreshed Chinese labels in the prompt-bar control family
- validation:
  - npm test -- src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/MultiImageDisplayModeToggle.test.tsx src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx
  - npm run build

## 2026-06-16 - Canvas Agent Production Assistant Design

- Added the formal Canvas Agent design spec at `docs/superpowers/specs/2026-06-16-canvas-agent-design.md`.
- Defined the Agent as a canvas production coordinator rather than a plain chat assistant.
- Documented the recommended direction: TapNow-style entry and side panel, Infinite Canvas-style structured canvas ops, TapCanvas-style evidence-first production principles, and the existing TapFlow v2 workflow/billing/assets execution path.
- Covered user-facing capabilities, panel structure, `CanvasAgentOp` protocol, tool permissions, backend API/session tables, execution flow, billing and asset rules, security constraints, staged implementation plan, risks, and acceptance criteria.
- No product code was changed in this design-only step.

## 2026-06-16 - Canvas Agent Implementation Plan

- Added the executable implementation plan for the first Canvas Agent wave at `docs/superpowers/plans/2026-06-16-canvas-agent-implementation.md`.
- The plan breaks the Agent work into concrete tasks covering frontend protocol/snapshot/policy/executor, Agent panel UI, server session and streaming planning, confirmed canvas writes, and existing target-node workflow generation integration.
- The first wave intentionally excludes long-term memory, MCP, multi-agent collaboration, automatic model/plugin installation, and complex storyboard state machines.
- The plan keeps provider/baseUrl/API key/upstream route internals out of creator-facing Agent UI and preserves the v2 workflow/billing/assets execution chain.
- No product code was changed in this planning step.

## 2026-06-16 - Canvas Agent Final Stage Implementation Plan

- Added the second-stage final Agent implementation plan at `docs/superpowers/plans/2026-06-16-canvas-agent-final-stage-implementation.md`.
- The plan continues from the first-stage Agent MVP and expands it into project memory, production semantics, storyboard planning, batch orchestration, failure diagnosis, recipe reuse, safe model-line recommendation, controlled automation, optional external tools, role orchestration, evaluation, and admin observability.
- Updated the first-stage Agent implementation plan with an explicit final-stage handoff section so the work can move directly into stage two after the first 16 tasks pass acceptance.
- The plan keeps the existing v2 workflow/billing/assets path as the only generation execution path and continues hiding provider/baseUrl/API key/raw route/upstream model details from creator-facing UI.
- No product code was changed in this planning step.

## 2026-06-16 - Image Prompt Multi-Image Mode Compact Dropup

- Replaced the two-segment multi-image display mode control with a compact single-value dropup that matches the height and density of the quantity selector.
- Moved the multi-image mode trigger directly after the quantity control so model, parameters, quantity, and display mode stay on one continuous row.
- Kept the credits pill and send button pinned to the right side with a flexible spacer instead of letting the display-mode control crowd or clip them.
- Added focused regression coverage for the compact dropup trigger, menu selection behavior, and one-row action layout.
- validation:
  - `npm run test -- src/flowCanvas/nodes/ImagePromptActionRow.test.tsx src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/MultiImageDisplayModeToggle.test.tsx src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx`
  - `npm run build`

## 2026-06-16 - Image Prompt Bottom Control Pill Alignment

- Unified the image prompt bottom-row quantity, multi-image display mode, credits, and send controls onto the same 42px pill height.
- Changed the `2x` quantity trigger and multi-image display-mode trigger to use the same fully rounded pill shape as the model and parameter controls.
- Tightened the credits/send pill by reducing the credits minimum width so `点数 12` stays compact instead of stretching across the right side.
- Cleaned the related Chinese labels in the generate toolbar and multi-image display-mode control.
- validation:
  - `npm run test -- src/flowCanvas/nodes/ImagePromptActionRow.test.tsx src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/MultiImageDisplayModeToggle.test.tsx src/flowCanvas/nodes/NanoBananaParamPanel.test.tsx src/flowCanvas/nodes/GptImage2ParamPanel.test.tsx`
  - `npm run build`

## 2026-06-16 - Canvas Agent Build Blocker Recovery

- Restored the repo to a clean full-build state while keeping the Stage 1 Canvas Agent implementation in place.
- Fixed the image prompt generate toolbar files after they had fallen into a broken/garbled state that caused parser and module-resolution failures around `ImageGenerateToolbar`.
- Normalized the visible toolbar labels back to creator-facing Chinese copy (`点数`, `开始生成`, `生成中`) and kept the existing one-row layout and interaction model unchanged.
- Hardened the API workspace build path by adding an `@aigc-flow/api` `prebuild` step that compiles `@aigc-flow/db` and `@aigc-flow/ai-gateway-core` first, preventing stale workspace declaration output from breaking clean-environment API builds.
- validation:
  - `npm test -- src/flowCanvas/nodes/ImageGenerateToolbar.test.tsx src/flowCanvas/nodes/ImagePromptActionRow.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/db`
  - `npm run build`

## 2026-06-16 - GPT-5.5 Text Model Gateway Integration

- Added a built-in AI Gateway text plugin for `GPT-5.5` through SiphonLab.
- The template creates the `text.gpt-5-5` route for text nodes and Agent planner usage:
  - base URL: `https://sub.siphonlab.cn`
  - upstream model: `gpt-5.5`
  - chat endpoint: `/v1/chat/completions`
  - responses endpoint metadata: `/v1/responses`
  - pricing: `2` credits per text generation
- New text nodes now default to `modelId: gpt-5.5` and `routeKey: text.gpt-5-5`, while non-integrated legacy text model options keep `text.default` as a fallback route.
- Extended the OpenAI-compatible text adapter so text routes can opt into the Responses API via route request config while preserving the existing chat-completions default path.
- Added `AGENT_PLANNER_ENABLED` and `AGENT_TEXT_ROUTE_KEY` to the staging compose runtime env map so server env settings are visible inside API/worker containers.
- Updated staging environment docs with the new CredentialVault-backed `SIPHONLAB_GPT_5_5_API_KEY` placeholder and the recommended Agent route key `text.gpt-5-5`.
- Validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- plugin-registry.test.ts runtime.test.ts -t "GPT-5.5|responses API when configured|filters by modality"`
  - `npm run test --workspace @aigc-flow/api -- ai-plugins.service.test.ts`
  - `npm test -- src/flowCanvas/utils/nodeFactory.test.ts`

## 2026-06-16 - Real LLM Canvas Agent Design

- Added the real large-model Canvas Agent connection design at `docs/superpowers/specs/2026-06-16-real-llm-canvas-agent-design.md`.
- Compared the relevant Agent patterns from `CookSleep/gpt_image_playground`, `basketikun/infinite-canvas`, and `anymouschina/TapCanvas` against the current TapFlow v2 architecture.
- Documented the recommended Stage 1.5 direction: make the AI Gateway text route the primary Agent planner, keep deterministic planning only as explicit fallback, add strict JSON parsing, repair retry, output redaction, policy validation, planner observability, and staging rollout flags.
- The design preserves the existing `CanvasAgentOp` confirmation boundary and v2 workflow/billing/assets execution chain, and keeps provider/baseUrl/API key/raw route/upstream model internals out of creator-facing UI.
- No product runtime code was changed in this design-only step.

## 2026-06-17 - Independent Image Workbench Design

- Added the formal Scheme C independent image workbench design at `docs/superpowers/specs/2026-06-17-independent-image-workbench-design.md`.
- Clarified that the future workbench is a top-level `/workbench` product surface, not a project-scoped `/projects/:projectId/workbench` mode.
- Locked the approved UX direction:
  - desktop uses a professional left-parameters plus right-result-flow layout
  - mobile uses a result-feed-first layout with a bottom composer inspired by JiMeng mobile creation flows
  - workbench results are stored in independent server-side history first, with `发送到画布` as an explicit secondary action
- Documented the required backend shape for tenant-scoped workbench history, server-side billing, AI Gateway execution, cloud asset persistence, and safe send-to-project insertion.
- No product runtime code was changed in this design-only step.

## 2026-06-17 - Independent Image Workbench Implementation Plan

- Added the executable implementation plan at `docs/superpowers/plans/2026-06-17-independent-image-workbench.md`.
- The plan decomposes the approved workbench into database, queue, API, worker, frontend route/navigation, desktop composer, mobile composer, result actions, send-to-project, and old project-scoped workbench cleanup tasks.
- The plan explicitly keeps workbench history server-side, uses the existing AI Gateway and cloud asset pipeline, requires billing reserve/settle/refund, and handles async provider polling before marking workbench generations complete.
- No product runtime code was changed in this planning step.

## 2026-06-17 - Independent Image Workbench Runtime Landing

- added the first end-to-end independent `/workbench` creator surface as a standalone authenticated route instead of a project-scoped mode
- added tenant-scoped backend workbench persistence:
  - `workbench_sessions`
  - `workbench_generations`
  - `workbench_results`
- added `/api/v2/workbench/*` API routes for:
  - generation history listing
  - generation creation
  - generation detail lookup
  - retry generation
  - send result to project/canvas
- added the `workbench.generate` queue contract and worker execution path so workbench image generations now reuse the existing AI Gateway, billing reserve/settle/refund, cloud asset persistence, and async provider polling flow
- updated `MediaAssetStore` so workbench outputs can be persisted without workflow/node ids while still creating normal asset records and variants
- added the new frontend workbench feature area under `src/workbench/*` with:
  - desktop left-parameter plus right-result-feed layout
  - mobile bottom composer entry with result-first feed behavior
  - model-aware Nano Banana / GPT-Image-2 parameter panels
  - result actions for `再次生成`, `复用参数`, and `发送到画布`
- moved product navigation forward so the shared shell now includes a first-class `/workbench` entry
- removed the old mobile auto-redirect that previously forced `/projects/:projectId` into project-scoped workbench mode
- changed `/projects/:projectId/workbench` into a compatibility redirect to `/workbench` instead of keeping it as the promoted product path
- validation:
  - `npm run test --workspace @aigc-flow/api -- workbench.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run test -- src/app/WorkspaceShell.test.tsx src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx src/workbench/WorkbenchPage.test.tsx`
  - `npm run build --workspace @aigc-flow/redis`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-17 - Independent Workbench Model/Reference Hotfix

- fixed the standalone `/workbench` image model source so it now prefers the same v2 AI model catalog mapping used by canvas image flows instead of falling back to legacy local-only image model definitions
- this restores workbench model ordering and display alignment with the canvas picker, including the active Nano Banana / GPT-Image-2 product grouping and route family behavior
- upgraded the shared asset upload button with an optional per-asset completion callback while keeping the existing `onUploaded` behavior unchanged for current callers
- wired the workbench reference area to real asset upload flow so uploaded reference images immediately append their `assetId` into the current workbench draft
- cleaned the main standalone workbench surface copy around composer, result feed, mobile composer, result sheet, and send-to-project dialog so newly touched UI no longer shows the recent garbled text regression in these flows
- validation:
  - `npm run test -- src/hooks/useImageModelCatalog.test.tsx src/workbench/WorkbenchPage.test.tsx`
  - `npm run test -- src/app/WorkspaceShell.test.tsx src/workbench/WorkbenchPage.test.tsx src/hooks/useImageModelCatalog.test.tsx`
  - `npm run test -- src/assets/UploadAssetButton.test.tsx`
  - `npm run build`

## 2026-06-17 - Workbench Generation State and Reference UX Fix

- fixed the `/workbench` generation worker flow so external provider calls and polling no longer run inside one long database transaction, preventing provider success/failure state from being hidden by transaction rollback
- persisted `waiting_provider` plus `provider_task_id` for workbench async image tasks and reused existing provider task ids for stale retries instead of issuing duplicate upstream requests
- changed workbench async provider polling from a single immediate poll to bounded condition polling before failing the generation
- made frontend workbench polling resilient to temporary generation-detail errors and resumed polling for non-terminal history rows after page load
- rebuilt the desktop/mobile workbench composer reference image area so uploaded references show thumbnails, labels like `图1`, remove controls, and one-click `@图N` insertion
- added prompt reference filtering so `@图2` sends only the selected reference asset to the backend, while prompts without valid tags continue to send all selected references
- simplified workbench model parameters to one shared dropdown layout and removed duplicate Nano Banana / GPT-Image-2 parameter panels from the workbench composer
- prefetched and cached workbench route options by model route family to reduce the visible route-selector delay when switching models
- cleaned newly touched workbench, upload, and model-route UI copy to avoid the recent garbled text regression
- validation:
  - `npm run test -- src/workbench/workbenchReferences.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-17 - Workbench Preview and Result Display Hotfix

- fixed `/workbench` reference uploads so selected image files show a local `blob:` preview immediately instead of waiting for the server upload response
- changed uploaded reference handling to replace the temporary local preview with the real asset id and then fetch a signed preview URL even when the upload response does not include `previewUrl`
- added result-card and result-detail fallbacks that fetch signed preview URLs from `assetId` when workbench generation results do not include a direct preview URL
- made frontend workbench polling continue for the edge case where a generation is marked `succeeded` before its `workbench_results` rows are visible to the list/detail API
- cleaned the newly touched workbench upload/composer/result UI copy after the recent garbled-text regression
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Asset Library Drag Multi-select

- added desktop drag-box selection to the v2 `/assets` library so users can marquee-select visible asset tiles from either grid gaps or a thumbnail tile
- added selected thumbnail styling with a check indicator and a sticky bulk action bar showing the selected count
- added bulk delete confirmation that deletes the selected assets through the existing authenticated v2 asset delete path and clears stale selection as the asset list changes
- added regression coverage for drag-selecting multiple assets, suppressing preview opens after drag selection, and bulk deleting only the selected assets
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-17 - Asset Library Drag Selection Browser Fix

- fixed the drag multi-select interaction for real browsers by disabling native image/video dragging inside asset tiles
- changed marquee selection startup to call `preventDefault()` and attach window pointer listeners synchronously on pointer down, avoiding lost pointer move events during browser media drag
- extended regression coverage for disabled native thumbnail dragging and prevented default drag behavior
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx`
  - `npm run build`

## 2026-06-17 - Workbench Billing Model UUID Hotfix

- fixed a worker-side workbench failure where successful provider image generations could still be marked failed during settlement
- root cause: `/workbench` stores product model keys such as `pixellelabs.nano-banana-pro` in `workbench_generations.model_id`, but `usage_events.model_id` is an internal `ai_models.id` UUID field
- changed workbench settlement so usage events leave the UUID `modelId` field as `null` and preserve the product model key in usage metadata as `productModelId`
- this keeps billing records valid while retaining model auditability for standalone workbench generations
- validation:
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-17 - Workbench Composer Visual Refresh

- refreshed the standalone `/workbench` desktop composer to better match the approved reference-style creator panel
- rebuilt the left panel around:
  - compact dashed reference-image filmstrip with `0/10` capacity, thumbnail cards, remove controls, and a single visible upload entry
  - prompt header with optimize action and reference `@图N` usage hint
  - compact model, aspect ratio, size, route, and quantity dropdown controls
  - current configuration cost card and gradient primary creation button
- preserved the existing workbench backend flow, model catalog source, route prefetching, reference upload behavior, `@图N` filtering, and multi-image display mode behavior
- added focused regression coverage for the new compact composer controls
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Reference Upload UI Hotfix

- removed the shared `UploadAssetButton` from the standalone workbench reference strip because it still rendered its generic upload result panel after image upload
- replaced it with a workbench-specific hidden file input that keeps the approved compact reference strip UI only
- reference images now show local thumbnails immediately while upload continues, then swap to the persisted asset id and signed preview URL after completion
- reference thumbnails stay horizontal with compact `图N` badges; uploaded file names and the generic `上传结果` list are no longer rendered in the workbench composer
- added regression coverage to ensure reference upload does not surface `上传结果` or uploaded file names in the composer
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Reference Strip and Parameter Layout Follow-up

- updated the standalone `/workbench` reference strip to match the annotated review:
  - reference thumbnails can be reordered by mouse drag and drop
  - per-image remove buttons stay hidden until the card is hovered or focused
  - the reference strip uses a visible horizontal scrollbar instead of wrapping into vertical rows
- adjusted the composer parameter layout so:
  - model selection remains its own full-width row
  - route selection is now its own full-width row under the model selector
  - aspect ratio, size, and quantity stay together in one compact three-column row
- extended regression coverage for reference-strip scrollbar visibility, hover-only remove controls, drag reorder behavior, and the route/parameter row split
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Dropdown Direction and Aspect Icons

- changed the compact workbench select popovers to open upward so lower controls do not cover the cost card or generate button
- updated aspect-ratio option icons so each rectangle reflects its actual ratio, for example `9:16` renders tall and `16:9` renders wide
- kept the same compact menu styling and added regression coverage for upward menu placement and ratio-specific icon dimensions
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Temporary Reference Uploads

- added workbench-only temporary reference uploads so uploaded workbench references no longer create `assets` records or use browser direct OSS upload
- added `workbench_reference_uploads` plus `workbench_generations.reference_upload_ids`; worker hydrates temporary uploads as inline image data for provider requests
- switched the workbench composer to upload references through `/api/v2/workbench/reference-uploads` while keeping local preview and `@图N` filtering behavior
- validation:
  - `npm run test -- apps/api/test/workbench.test.ts`
  - `npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts`
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build --workspace @aigc-flow/db`

## 2026-06-17 - Workbench Reference Strip Scrollbar

- replaced the native reference-strip scrollbar with a stable in-app scrollbar track/thumb so the horizontal indicator is always visible below uploaded reference cards
- kept horizontal scrolling on the reference card row while hiding browser-specific scrollbars that were not rendering consistently in production
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-17 - Workbench Reference Scrollbar States

- refined the workbench reference strip scrollbar to match the compact TapNow-style state behavior: no scrollbar when the strip is empty or not overflowing, and a small gray scrollbar only when extra references require horizontal navigation
- added left/right scroll controls plus track jump and thumb drag handling so the visible scrollbar is an actual control instead of a static indicator
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts`
  - `npm run build`

## 2026-06-23 - Canvas And Workbench Reference Upload Regression Fixes

- fixed a canvas temporary-reference preview regression where freshly uploaded reference images could show `预览加载失败` until a full page refresh
- root cause and change:
  - the canvas upload flow was revoking blob-backed local preview URLs immediately after upload success
  - when the persisted node preview still pointed at that same blob URL, the node lost its first-render image source before any later recovery path could repopulate it
  - added guarded preview URL cleanup so only truly unused local blob URLs are revoked
- fixed a workbench reference-upload race where users could start generation before newly added temporary references had finished uploading
- root cause and change:
  - the workbench submit action only depended on prompt and route readiness, so a fast click during upload could send a request without the expected `referenceUploadIds`
  - this made `Nano Banana Pro 线路二（官方T3）` behave like the reference image was ignored even though the worker-side forwarding path was already correct
  - the workbench generate button is now disabled while temporary reference uploads are still pending
- added focused regression coverage for:
  - preserving blob previews that are still persisted on canvas image nodes
  - blocking workbench generation until pending reference uploads have resolved and been included in the request
- validation:
  - `npm test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm test -- src/flowCanvas/utils/localImageUpload.test.ts`
  - `npm run build`

## 2026-06-17 - Fullscreen Workbench Studio Shell

- changed `/workbench` so it now renders outside `WorkspaceShell` instead of inheriting the homepage/global navigation shell
- rebuilt the route as a fullscreen studio surface aligned to the approved Scheme C direction:
  - existing left-side workbench composer UI is preserved as-is
  - center stage now shows the current primary result in a dedicated large preview area
  - right column now keeps the generation history flow visible at the same time
- kept workbench result detail and `发送到画布` behavior available from the new fullscreen surface
- kept the mobile workbench bottom composer attached so mobile generation entry still works after the desktop shell rewrite
- updated workbench route tests to assert the new fullscreen-shell behavior and the intentional duplicated result presence between the center stage and right-side history
- validation:
  - `npm test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-18 - Asset Library Selection Overlay Alignment

- realigned the asset-library bulk selection toolbar with the reference project pattern: a fixed centered action container above the lower workspace controls, with pointer-safe wrapping and a compact dark pill UI
- changed the double-click asset preview back to a full-screen backdrop with a centered rounded detail modal, left media preview, right metadata/actions, and a z-index above the selection toolbar
- rendered the asset preview modal through a body-level portal so route transition transforms cannot clip or offset the fixed full-screen overlay
- added focused regression coverage for the toolbar anchor structure, centered preview modal, and preview layer stacking
- validation:
  - `npm test -- src/assets/AssetLibraryPage.test.tsx src/assets/AssetPreviewModal.test.tsx src/assets/AssetVirtualGrid.test.tsx`
  - `npm run build`

## 2026-06-19 - Workbench Result Card Scheme C Refinement

- refined the desktop `/workbench` completed-result card into the approved Scheme C layout
- rebuilt the finished-task card so:
  - the left side is now a large stage preview for the currently selected image
  - the bottom thumbnail strip only changes selection and no longer doubles as the fullscreen trigger
  - the right side carries prompt, status, creator-facing parameter metadata, credits, and a dedicated vertical action stack
- added explicit result actions for:
  - `全屏预览`
  - `引用参考`
  - `下载原图`
  - `删除记录`
- cleaned the remaining stale/garbled workbench UI regression assertions so the test suite now verifies the real current Chinese labels and the new action-panel structure
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-19 - AI Gateway Route Metadata Build Fix

- fixed the staging Docker build failure where `tapflow-worker` could not compile after billing activity usage records started reading `modelKey` and `routeKey` from AI Gateway results
- added `routeKey` to text/media gateway results and `modelKey` / `routeKey` to provider polling results so workflow billing usage records can use stable route metadata across text, image, video, and async polling paths
- added focused AI Gateway regression coverage for route metadata on `generateText`, `generateImage`, `generateVideo`, and `pollTask`
- validation:
  - `npm run test --workspace @aigc-flow/ai-gateway-core -- runtime.test.ts -t "ai gateway includes route metadata for billing usage records"`
  - `npm run build --workspace @aigc-flow/ai-gateway-core`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`

## 2026-06-19 - Mobile Workbench First-Pass Optimization

- rebuilt the phone-width `/workbench` experience away from the old single floating launcher into a mobile-first creation shell
- added a persistent mobile bottom creation dock with:
  - model and route summary
  - ratio / size / quantity summary
  - always-visible primary generate action
- added a dedicated mobile parameter sheet instead of relying on the old launcher-only interaction
- added a mobile result feed that groups completed work into touch-friendly cards and keeps the latest stage visible above the feed
- added mobile result-card overflow actions for download, use-as-reference, and delete
- kept the existing backend workbench flow unchanged:
  - generation submission
  - billing
  - temporary reference upload
  - result polling
  - asset delivery
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

- follow-up refinement:
  - mobile multi-image result cards now separate thumbnail selection from fullscreen preview
  - tapping a mobile thumbnail updates the selected preview inside the card without forcing the fullscreen result sheet
  - this improves phone-side multi-image review flow and reduces accidental fullscreen interruptions during result comparison
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`

## 2026-06-19 - Workbench Billing Balance Source Fix

- fixed `/workbench` desktop and mobile headers so the credit pill reads the authenticated tenant billing summary instead of a stale hardcoded demo balance
- aligned workbench balance formatting with the existing workspace account menu helper, so a zero-balance account now shows `0` consistently across `/home` and `/workbench`
- added regression coverage that mocks a zero credit balance and asserts both desktop and mobile workbench headers no longer render the old `19071` placeholder
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-19 - Direct Image Download Naming Fix

- changed canvas and workbench original-image downloads to prefer the authenticated same-origin asset bytes endpoint instead of opening transient OSS signed URLs in a new browser tab
- added fallback parsing for historical canvas result URLs so old OSS object paths can still resolve their asset id and download through `/api/v2/assets/:assetId/bytes`
- replaced the download fallback behavior so CORS failures use a hidden download anchor instead of `window.open`
- standardized downloaded image filenames as `AIttco_YYYYMMDD_提示词前12字_序号.扩展名`, with the no-prompt fallback `Aittco_YYYYMMDD_作品_01.png`
- validation:
  - `npm run test -- src/flowCanvas/utils/imageDownload.test.ts src/flowCanvas/utils/imageUtils.test.ts src/workbench/WorkbenchPage.test.tsx`
  - `npm run build`

## 2026-06-19 - Mobile Workbench Preview And Feed Refinement

- fixed the mobile result fullscreen preview so the action buttons sit above the bottom workbench dock safe area instead of overlapping the underlying creation bar
- added a short-lived in-memory workbench generation cache so reopening `/workbench` within a few seconds shows the latest feed immediately while still refreshing in the background
- reduced the mobile feed initial render window to the latest 4 records and loads 4 older records at a time when the user scrolls upward
- replaced the mobile feed thumbnail strip with ratio-aware mosaics:
  - single wide images keep their wide crop instead of being forced into a portrait tile
  - 3-image wide batches use the JiMeng-style two-up plus one-below arrangement
  - 4-image ultra-wide batches use a 2x2 JiMeng-style grid with matching pending placeholders
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`

- follow-up cache refinement:
  - added a 5-minute `sessionStorage` UI snapshot for workbench generations so closing and reopening `/workbench` in the same browser session restores the latest result feed immediately even after the in-memory cache is gone
  - kept the server list endpoint authoritative by refreshing in the background after restoring the snapshot
  - added regression coverage for session cache restoration and test cache isolation
- validation:
  - `npm run test -- src/workbench/WorkbenchPage.test.tsx`

## 2026-06-23 - Agent Tool-Calling Executor Upgrade Plan

- Added the detailed Scheme B Agent upgrade plan at `docs/superpowers/plans/2026-06-23-agent-tool-calling-executor-upgrade.md`.
- The plan upgrades the current Canvas Agent from a JSON planner into a server-side tool-calling production executor:
  - text model remains the Agent brain
  - generation tools map to existing workflow/billing/assets execution
  - generated assets are fed back to the Agent as safe references
  - frontend shows a streaming tool timeline and friendly model/line labels only
- The plan intentionally sits between the first-stage Agent implementation plan and the final-stage Agent plan, so the final memory/recipe/governance work can build on a real executor loop instead of a plan-only Agent.
- Follow-up update:
  - added the post-Scheme-B upgrade path to Scheme C at the end of the same plan
  - Scheme C is defined as the Canvas Production Director Agent, extending Scheme B with memory, canvas operation tools, storyboard planning, QA/repair, recipes, safe model/route recommendation, controlled automation, and admin observability

## 2026-06-23 - Agent Tool-Calling Executor Foundation Tasks 1-4

- Started Scheme B implementation on branch `codex/agent-tool-executor-foundation`.
- Completed the first foundation slice:
  - extended `agent_tool_calls` with executor-ready fields for session linkage, tool-call keys, normalized arguments/results, cost estimates, workflow/node run links, lifecycle timestamps, and workflow indexes
  - added Agent tool schemas for `generate_image`, `generate_image_batch`, and `continue_generation`
  - added Agent tool policy checks for approval, generated item limits, credit limits, round limits, disabled tools, and continuation safety
  - added safe Agent asset references that expose only `assetId`, friendly labels, dimensions, and prompt summaries
  - added Agent generation cost estimation using active route pricing and size-tier metadata, failing closed with `PRICING_NOT_FOUND`
- Validation:
  - `npm run test --workspace @aigc-flow/api -- agent-asset-references.test.ts agent-tool-schemas.test.ts agent-tool-policy.test.ts agent-cost-estimator.test.ts`
  - `npm run test --workspace @aigc-flow/db -- agent-tool-calls.test.ts` skipped locally because no database test env was configured
  - `npm run build --workspace @aigc-flow/db`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-23 - Agent Executor Rollout UI And Approval Tasks 10-16

- Continued Scheme B on branch `codex/agent-tool-executor-foundation`.
- Completed the rollout/configuration slice:
  - added executor feature flags, round/item/credit limits, timeout defaults, and allow-list switches for batch image/image edit/video tools
  - propagated executor env variables through `docker-compose.staging.yml`
  - documented safe staging defaults and rollback in `docs/STAGING_ENV_TEMPLATE.md`
  - kept `AGENT_EXECUTOR_ENABLED=false` as the fast rollback path to the older planner stream
- Completed the frontend execution slice:
  - added typed executor SSE events and API clients for execute and approve streams
  - upgraded the Agent session hook to prefer executor streaming and fall back to planner streaming when executor is disabled or unavailable
  - added a safe tool timeline with running/approval/success/failure states, estimated credit confirmation, and generated asset references
  - hid provider/baseUrl/API key/route key/upstream model internals from creator-facing Agent UI
- Completed the approval and canvas integration slice:
  - executor now pauses before credit tools when approval is required and emits `approval_required` with a server turn id
  - approval resumes through a backend stream using only `turnId + toolCallKey`; the backend reloads the persisted pending tool call, re-estimates cost, rechecks policy, and runs the existing workflow/billing/assets path
  - successful generated asset refs can be placed onto the canvas as image nodes
  - Agent-created image nodes store `assetId` plus Agent session/turn/tool metadata only, not signed URLs, blob URLs, data URLs, or base64
- Validation:
  - `npm run test --workspace @aigc-flow/api -- agent-executor.test.ts`
  - `npm test -- src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/canvasAgentApi.test.ts src/flowCanvas/agent/canvasAgentToolEvents.test.ts src/flowCanvas/agent/canvasAgentOps.test.ts`
- Final Task 16 validation:
  - `npm run test --workspace @aigc-flow/api -- agent.test.ts agent-executor.test.ts agent-tool-schemas.test.ts agent-tool-policy.test.ts agent-tool-runner.test.ts agent-asset-references.test.ts agent-cost-estimator.test.ts env.test.ts` passed with DB-backed `agent.test.ts` skipped by the repo's existing missing-DB-env guard
  - `npm run test --workspace @aigc-flow/db -- agent-tool-calls.test.ts` skipped by the repo's existing missing-DB-env guard
  - `npm test -- src/flowCanvas/agent/canvasAgentToolEvents.test.ts src/flowCanvas/agent/canvasAgentApi.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/canvasAgentOps.test.ts` passed
  - `npm run build --workspace @aigc-flow/db` passed
  - `npm run build --workspace @aigc-flow/api` passed
  - `npm run build` passed with existing Vite chunk-size/dynamic-import warnings
  - `git diff --check` passed
- Remaining rollout work:
  - staging smoke test still requires deployed text/image routes, pricing, billing balance, Redis/worker, and object storage

## 2026-06-24 - Canvas Flicker Auth Refresh Stabilization

- Investigated staging canvas flicker where the project repeatedly returned to the branded "opening canvas" loading screen and then re-entered the canvas.
- Server logs showed the core canvas APIs were returning 200, but `/api/v2/auth/me` appeared between repeated project/flow/draft load cycles, pointing to frontend remounting rather than backend draft failures.
- Fixed `AuthProvider` so an auth-change event while a user is already authenticated refreshes the current session silently instead of setting global `loading=true`.
- This keeps `AuthGate` from replacing the mounted canvas with the auth loading transition during token/session refreshes.
- Added regression coverage proving authenticated children stay mounted during a silent auth-change session refresh.
- Validation:
  - `npm test -- src/auth/AuthProvider.test.tsx`
  - `npm test -- src/auth/AuthGate.test.tsx src/flowCanvas/FlowProjectPage.test.tsx`

## 2026-06-24 - Agent Production Request Fallback Guard

- Fixed a misleading Agent behavior where production image requests could fall back to the basic planner and only create a prompt node plus an image node.
- Added production image intent detection for prompts involving generation, comparison, batch images,套图, Nano Banana, and GPT-Image.
- Frontend now refuses to downgrade production image tasks to planner/offline node creation when the executor stream is unavailable.
- Backend deterministic planner now rejects production image requests with `AGENT_EXECUTOR_REQUIRED` instead of returning the fixed "basic text-to-image production flow" node plan.
- This makes executor misconfiguration visible to the user instead of pretending that a real generation task was completed.
- Validation:
  - `npm test -- src/flowCanvas/agent/useCanvasAgentSession.test.tsx apps/api/test/agent-production-intent.test.ts apps/api/test/agent.service.production-intent.test.ts`

## 2026-06-24 - Agent Durable Task And Artifact Replay

- Extended the Canvas Director Agent replay chain so executor-created task cards and generated artifact cards survive refresh/re-entry instead of only appearing in the live SSE stream.
- Added `appendSessionEvent(...)` support in `AgentSessionRepository` for durable writes into `agent_task_events`.
- Added `AgentEventService.appendToolEvent(...)` to normalize executor events into replay-safe persisted records:
  - persist `tool_started`, `task_created`, `workflow_run_linked`, `artifact_created`, `tool_progress`, `tool_result`, `approval_required`, `turn_completed`, `turn_failed`
  - intentionally skip transient `thinking_status` and `message_delta` so replay stays focused on durable production state
- Wired executor and approval streaming in `AgentService` to persist each durable event before emitting it to the frontend stream.
- Added regression coverage for event persistence mapping, especially durable `taskId` and `assetRef` replay.
- Validation:
  - `npx vitest --run apps/api/test/agent-event-service.test.ts apps/api/test/agent-executor.test.ts src/flowCanvas/agent/canvasAgentToolEvents.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Agent Replay Restores Tool Cards

- Extended the frontend Director replay path so reopening the Agent panel can restore visible task cards from durable session events instead of only showing a raw replay event list.
- Added `src/flowCanvas/agent/agentReplayState.ts` to rebuild `CanvasAgentToolTimelineItem[]` from replay-safe session events such as `tool_started`, `task_created`, `artifact_created`, `approval_required`, and `tool_result`.
- Updated `useCanvasAgentSession` with a replay hydration path so replayed task state uses the same task-card data shape as live execution.
- Updated `CanvasAgentPanel` to auto-bind to the latest Agent session in Director mode when no in-memory session is active, then hydrate replayed task cards from the fetched session events.
- Added regression coverage proving replay can restore a completed tool card with durable task id and generated asset label after refresh-like re-entry.
- Validation:
  - `npx vitest --run src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/useAgentEventStream.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Agent Replay Restores Approval And Failure State

- Extended replay hydration so the Director panel now restores not only task cards, but also the latest session state derived from replay events.
- Added replay-state derivation for:
  - `awaiting_approval` when the latest durable step is `approval_required`
  - `executing_tool` while durable task execution events are the latest state
  - `error` plus replayed system message when the latest durable step is `turn_failed`
  - `idle` after durable completion/result events
- Updated `useCanvasAgentSession` replay hydration to restore `status`, `error`, and replayed system error messages alongside the rebuilt tool timeline.
- Added regression coverage proving replay can rebuild:
  - an approval card with stored estimate/reference info
  - a failed task card with visible error text after refresh-like re-entry
- Validation:
  - `npx vitest --run src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/useAgentEventStream.test.tsx`
  - `npm run build`

## 2026-06-24 - Multi-Turn Continuation Foundation

- Extended the backend executor context so each new Agent turn now includes prior successful session asset refs in the model-facing execution context.
- This gives the Agent brain durable, session-local knowledge of previous generated outputs such as `round-1-image-1`, enabling more natural continuation requests like "use the previous result" in later turns.
- Added executor regression coverage proving previous successful session asset refs are injected into the next turn context.
- Extended the frontend Agent panel/composer with a controlled draft path so follow-up prompts can be prefilled programmatically.
- Added a first user-facing continuation shortcut on successful result cards:
  - `Continue from result` now fills the composer with a continuation prompt containing the friendly result ref and prompt summary
  - this creates the first direct "historical result -> current turn" bridge in the UI
- Validation:
  - `npx vitest --run apps/api/test/agent-executor.test.ts`
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-24 - Multi-Turn Continuation Shortcuts And Composer Stabilization

- Upgraded the first continuation bridge from a single generic result button into a more production-like follow-up action row on successful Agent result cards.
- Successful result cards now expose four user-facing continuation shortcuts:
  - `继续编辑`
  - `做变体`
  - `做海报`
  - `做对比图`
- Each shortcut now prefills the Agent composer with a different structured follow-up prompt built only from safe user-facing result data:
  - result ref id
  - friendly result label
  - prompt summary when available
- Stabilized the Director panel replay path while doing this work:
  - cleaned the panel test suite structure
  - narrowed replay effect dependencies to avoid self-triggered render loops during session binding/hydration
  - normalized the composer placeholder and helper copy back to proper Chinese text
- Validation:
  - `npx vitest --run src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx`
  - `npm run build`

## 2026-06-24 - Structured Continuation Context Across Turns

- Extended the continuation flow from a UI-only prompt prefill into a real structured turn context shared by frontend and backend.
- Successful result follow-up actions now do two things together:
  - prefill the composer with a continuation prompt
  - store a structured continuation payload containing:
    - continuation action
    - source asset id
    - source asset ref id
    - friendly source label
    - prompt summary
- Frontend turn submission now sends that continuation payload with the next executor request instead of relying only on natural-language prompt text.
- Backend executor now:
  - stores the continuation payload on the persisted user message metadata
  - injects it into the first-round model context as `activeContinuation`
  - keeps the older `previousResults` session asset summary alongside this new active continuation layer
- Agent thread UI now shows a small user-facing continuation chip above the follow-up user message so multi-turn conversations visibly explain which prior result the current turn is based on.
- This brings the Agent closer to a production-director interaction model:
  - historical result selection is now explicit
  - turn-to-turn continuity is now auditable in both model context and UI
  - no provider/baseUrl/route_key/upstream_model internals are exposed
- Validation:
  - `npx vitest --run apps/api/test/agent-executor.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentThread.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx`
  - `npm run build`

## 2026-06-25 - Multi-Result Continuation Selection And Reference Injection

- Extended continuation from a single implicit result to explicit per-result selection when one Agent task produces multiple assets.
- Successful multi-result task cards now support:
  - showing which result is the current continuation target
  - switching the active result with `改用 <结果名>`
  - using that chosen result in follow-up actions such as `基于 <结果名> 继续编辑`
- Frontend session state now persists `activeAssetRefId` per tool card so the chosen continuation source survives card interactions instead of always falling back to the first asset.
- Backend execution now uses continuation context more concretely:
  - when a follow-up image execution does not include explicit `referenceRefs`, `AgentToolRunner` automatically injects the continuation asset id as the upstream reference input
  - this makes “continue from chosen result” affect the real execution path, not only the visible prompt text
- This moves the Agent another step closer to a production-director workflow:
  - users can choose the exact prior result they want to build on
  - that chosen result now feeds the actual generation call by default
  - internal provider/baseUrl/route/upstream model data remains hidden
- Validation:
  - `npx vitest --run apps/api/test/agent-executor.test.ts apps/api/test/agent-tool-runner.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentThread.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentToolTimeline.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx`
  - `npm run build`

## 2026-07-03 - Agent Batch Shared Settings Normalization

- Fixed another real Agent executor schema failure for batch image requests where the text model placed image settings such as `size`, `routeKey`, or `routeLabel` at `generate_image_batch.arguments` instead of inside each image item.
- Batch tool call normalization now treats those top-level image settings as shared defaults and copies them into every generated image prompt, while preserving per-image overrides.
- This keeps strict validation intact after normalization and prevents multi-image prompts like `我要做一套动物运动会的场景套图` from failing on `Unrecognized key: "size"`.
- Validation:
  - `npm test -- apps/api/test/agent-tool-schemas.test.ts`
  - `npm test -- apps/api/test/agent-tool-schemas.test.ts apps/api/test/agent-executor.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-07-03 - Agent Batch Tool Items Alias Fix

- Fixed a real Agent executor failure where the text model returned `generate_image_batch.arguments.items` for a multi-image request such as `生成一套动物森林运动会的套图`, while the server tool schema only accepted `arguments.images`.
- Added a schema normalization path that maps batch `items` into canonical `images` before strict validation, while preserving the existing validation limits and provider-secret redaction checks.
- Added regression coverage for the exact `items`-instead-of-`images` shape so this model output no longer fails with a raw Zod validation list in the Agent panel.
- Validation:
  - `npm test -- apps/api/test/agent-tool-schemas.test.ts`
  - `npm run build --workspace @aigc-flow/api`

## 2026-07-03 - Agent Approval Stream Failure Fix

- Fixed the Agent executor stream path so `turns/execute/stream` and `tool-calls/approve/stream` write SSE chunks as soon as tool events are emitted instead of buffering the entire tool execution before sending a response.
- This specifically addresses the approval-step failure where the UI could reach `approval_required`, but clicking confirm could show a browser-level `Failed to fetch` before any structured Agent event reached the panel.
- Stream errors after the SSE connection starts now return a structured `turn_failed` event to the Agent UI.
- Hardened the production static frontend `/api` proxy for Agent SSE POST requests:
  - approval POST bodies are proxied through to the API
  - `text/event-stream` chunks pass back through the frontend container
  - hop-by-hop request/response headers are stripped so proxy-only headers do not leak across the API boundary
- Validation:
  - `npm test -- apps/api/test/agent-executor.test.ts`
  - `npm test -- apps/api/test/agent.test.ts apps/api/test/agent-executor.test.ts`
  - `npm test -- scripts/serve-dist.test.ts`
  - `npm run build --workspace @aigc-flow/api`
  - `npm run build`

## 2026-06-28 - Agent Panel Utility Actions Hide Fix

- Fixed the canvas top-right utility chrome so `积分` and `通知` no longer overlap the Agent workspace when the Agent panel is open.
- The Agent open/close state is now lifted to `FlowCanvasPage`, then passed down in two directions:
  - into `AiFlowCanvas` so the canvas can notify the page when the Agent opens or closes
  - into `FlowTopToolbar` so the toolbar can hide only the top-right utility actions while the Agent is visible
- The left-side project title / project menu remains visible, so users can still keep orientation in the canvas while the Agent is open.
- Added regression coverage for:
  - page-level toolbar visibility changes when Agent state changes
  - toolbar-level hiding of credits and notifications when utility actions are disabled
- Validation:
  - `npm test -- src/flowCanvas/FlowCanvasPage.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx`
  - `npm test -- src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

## 2026-06-28 - Agent Workspace Top Clearance Tightening

- Reduced the fixed top clearance of the Agent dock shell so the panel no longer leaves a large empty strip above its own header.
- The workspace shell now sits much closer to the canvas top chrome while still keeping a small visual breathing room.
- Updated the shell regression test to assert the tighter top offset.
- Validation:
  - `npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`
  - `npm test -- src/flowCanvas/FlowCanvasPage.test.tsx src/flowCanvas/canvas/FlowTopToolbar.test.tsx src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
  - `npm run build`
## 2026-06-30 - TapFlow Agent External Bridge Hardening

- continued the infinite-canvas-level agent upgrade by turning the new `apps/tapflow-agent` workspace into a real, testable stdin/stdout bridge instead of a partially wired stub.
- extracted the bridge logic into a reusable `src/bridge.ts` module so the JSON-RPC handling can be tested without spawning the process shell.
- added a focused Vitest config plus a bridge test that verifies:
  - the bridge can lazily create an Agent session when no session id is provided
  - canvas ops are forwarded through the authenticated TapFlow API
  - the bridge returns the canonical JSON-RPC tool response shape
- removed the unused `@modelcontextprotocol/sdk` dependency from the bridge package for now so the package stays aligned with the current minimal transport implementation and does not advertise a dependency it does not actually use yet.
- added a root `dev:tapflow-agent` script for local bridge execution.
- validation still pending after the bridge refactor in this turn:
  - `npm run build --workspace @aigc-flow/tapflow-agent`
  - `npm test --workspace @aigc-flow/tapflow-agent`
  - `npm run build`

## 2026-06-30 - TapFlow Agent Staging Smoke Entry And Deployment Hooks

- finished the last missing piece for server-realistic agent validation by adding an explicit smoke entry and deployment-facing documentation for the `apps/tapflow-agent` bridge package.
- added root-level scripts:
  - `start:tapflow-agent`
  - `smoke:tapflow-agent`
- added `scripts/smoke-tapflow-agent.ts` to exercise the authenticated agent session + canvas-op flow against a real TapFlow API endpoint without leaking tokens.
- documented the bridge smoke flow in `docs/staging-runbook.md` so staging operators now have a repeatable command for the real-environment agent check.
- added bridge environment placeholders to `docs/STAGING_ENV_TEMPLATE.md` so the deployment checklist now includes the bridge variables needed for testing.
- validation:
  - `npm run build`
  - `npm run build --workspace @aigc-flow/tapflow-agent`
  - `npm test --workspace @aigc-flow/tapflow-agent`
  - `npm run test --workspace @aigc-flow/api -- agent-tool-schemas.test.ts agent-tool-policy.canvas.test.ts agent-context-builder.canvas.test.ts agent-tool-runner.test.ts agent-executor.test.ts agent-canvas-ops.test.ts`

## 2026-07-04 - Canvas Reference Picker White-Screen Fix

- fixed the production white-screen crash caused by `connectNodes` being called inside `src/flowCanvas/nodes/FlowNodes.tsx` without being read from the flow canvas store.
- the image-node reference picker now safely reuses the shared store action before linking an upstream canvas image source into the current node.
- validation:
  - `npm test -- src/flowCanvas/nodes/ReferenceSourcePicker.test.tsx src/flowCanvas/utils/referenceSourceResolver.test.ts`
  - `npm run build`

## 2026-07-06 - Production Studios Browser Smoke

- added a repeatable real-browser smoke command for the canvas production studios:
  - `npm run smoke:production-studios`
- the smoke page mounts `ProductionStudioShell` through Vite and verifies the Scheme C studio flow in Chromium:
  - `3D导演台` renders the Three.js viewport hook
  - `故事板` can create a storyboard sheet image request from asset-backed cells
  - `剪辑工程` can switch to the `1:1 1080p` output preset and create the `video.editor.ffmpeg` export request
  - placeholder-only video editor timelines disable export and show `请先绑定素材库资产`
- the smoke writes artifacts under `output/playwright/` so local QA can inspect the generated page, check code, and screenshot without storing them in the canvas draft graph.
- validation:
  - `npm test -- scripts/smoke-production-studios.test.ts`
  - `npm run smoke:production-studios`
  - `npm test -- scripts/smoke-production-studios.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
  - `npm run build`

## 2026-07-06 - Production Studios Asset Drop Browser Smoke

- extended the production studios real-browser smoke to dispatch `application/x-tapflow-asset-id` drag/drop payloads through the mounted studio UI instead of only checking pre-bound sample assets.
- the smoke now verifies asset-id patches for:
  - 3D director actor image-plane binding
  - 3D director scene background binding
  - storyboard cell image binding
  - video editor clip binding
  - video editor audio track binding
- the browser check also sends an ignored signed-preview `text/plain` payload so the smoke guards the v2 rule that canvas draft patches persist asset ids, not temporary preview URLs.
- validation:
  - `npm test -- scripts/smoke-production-studios.test.ts`
  - `npm run smoke:production-studios`
  - `npm test -- scripts/smoke-production-studios.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
  - `npm run build`

## 2026-07-06 - Production Image Mode Billing Guard

- wired the image-node generate action into the production mode route/pricing support guard before launching a workflow run.
- 360° panorama and 270° wraparound/subject-orbit modes now fail closed on the canvas when the selected route lacks declared mode support or active pricing, instead of enqueueing a free or unsupported run.
- the image prompt cost pill now shows `未配置` for blocked production modes instead of showing fallback hardcoded credits that cannot be reserved server-side.
- kept the error codes visible while localizing the node error messages:
  - `UNSUPPORTED_GENERATION_MODE`
  - `PRICING_NOT_FOUND`
- added a component regression that proves `panorama_360` on an unpriced `GPT-Image-2` fallback route does not call `runBackendWorkflow`.
- validation:
  - `npm test -- src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
  - `npm test -- src/flowCanvas/utils/imageGenerationModeSupport.test.ts src/flowCanvas/utils/runtimeRouteOptions.test.ts src/flowCanvas/utils/modelCatalogOptions.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/ImagePromptActionRow.test.tsx scripts/smoke-production-studios.test.ts`
  - `npm run build`

## 2026-07-06 - Production Suite Catalog Smoke

- added a read-only staging smoke for the Scheme C production suite catalog:
  - `npm run smoke:production-suite-catalog`
  - the smoke reads the v2 model catalog route metadata for `gpt-image-2` and `video-editor-ffmpeg`.
  - image routes must expose `standard`, `panorama_360`, `wraparound_270`, and `subject_orbit_270` with positive `image_generation` pricing.
  - the local FFmpeg video editor route must expose `video_editor_export` with positive `video_generation` pricing.
- documented the smoke in `docs/staging-runbook.md` and added staging checklist fields in `docs/STAGING_ENV_TEMPLATE.md` so deployment validation covers UI availability, route capability, and billing readiness before manual canvas QA.
- kept runtime behavior unchanged:
  - no generation is enqueued by this smoke, no credits are reserved or settled, and no API route, database migration, worker executor, provider credential, asset persistence path, or billing mutation path changed.
- validation:
  - red test observed on 2026-07-06: `npm test -- scripts/smoke-production-suite-catalog.test.ts` first failed because the catalog smoke helper module did not exist.
  - `npm test -- scripts/smoke-production-suite-catalog.test.ts` passed on 2026-07-06: 2 tests.
  - `npm pkg get scripts.smoke:production-suite-catalog` returned `tsx scripts/smoke-production-suite-catalog.ts`.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.
- live staging execution still requires a deployed API URL and short-lived `TAPFLOW_ACCESS_TOKEN`.

## 2026-07-06 - Director Shots To Video Editor Sync

- added a direct 3D Director Desk -> video editor sync path:
  - director shots with persisted `generatedAssetId` values can now be pushed into an existing or newly created `video_editor` node as image clips.
  - synced clips preserve source metadata including director node id, shot id, camera id, motion, and prompt.
  - synced subtitles align with the generated director clips and use shot prompts or shot numbering.
  - re-syncing from the same director replaces previous director-sourced clips/subtitles instead of duplicating them.
- kept v2 persistence and billing boundaries unchanged:
  - only safe asset ids are accepted; `blob:`, `data:`, and signed/http URLs are still stripped by director/video normalizers.
  - this local sync does not enqueue generation, export video, reserve credits, settle billing, create assets, change AI routes, expose provider secrets, or add database schema.
- extended the production studios browser smoke:
  - the smoke now clicks the director `同步到剪辑工程` action and verifies the safe sync request includes `asset-director-shot-smoke`.
- validation:
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/directorVideoSync.test.ts` first failed because `directorVideoSync` did not exist.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx -t "video editor sync from generated director shots"` first failed because the director desk had no `同步到剪辑工程` action.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx -t "generated director shots"` first failed because the canvas had no director-to-video sync handler.
  - red test observed on 2026-07-06: `npm test -- scripts/smoke-production-studios.test.ts -t "browser check"` first failed because the browser smoke did not verify `directorVideoSyncRequest`.
  - red test observed on 2026-07-06: `npm test -- src/flowCanvas/utils/videoEditorNodeData.test.ts -t "director clip metadata"` first failed because unknown director shot motions were not filtered.
  - `npm test -- src/flowCanvas/utils/directorVideoSync.test.ts src/flowCanvas/utils/videoEditorNodeData.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx scripts/smoke-production-studios.test.ts` passed on 2026-07-06: 81 tests.
  - `npm run smoke:production-studios` passed on 2026-07-06 with `directorVideoSyncRequest: true`.
  - `npm run build` passed on 2026-07-06 with existing Browserslist, dynamic-import, and chunk-size warnings only.

## 2026-07-11 - AI Model Configuration Wizard Completion

- completed the Model Center model-configuration wizard rollout so admins can create a product model from a primary entry or by cloning the currently selected route without leaving Model Center.
- wired `AiSettingsPage` to:
  - expose the new primary `配置新模型` entry beside the existing secondary `高级配置` entry
  - open the five-step wizard in blank mode or backup-from-route mode
  - hydrate backup drafts from the selected route's provider, model, connection, credential, and pricing metadata
  - refresh Model Center data after a successful publish and close the wizard cleanly
- expanded the page integration tests to cover:
  - opening the wizard from the primary entry
  - reloading admin data after publish
  - opening a new model draft from the selected route backup action
- validation:
  - `npm test -- src/account/ai-settings/AiSettingsPage.test.tsx`
  - `npm test -- src/services/v2AiModelConfigurationsApi.test.ts src/account/ai-settings/modelConfigurationWizardState.test.ts src/account/ai-settings/ModelConfigurationWizard.test.tsx src/account/ai-settings/AiSettingsPage.test.tsx`
  - `npm run test --workspace @aigc-flow/api -- ai-model-configurations.schemas.test.ts ai-model-configurations.test.ts ai-gateway.service.test.ts`
  - `npm run test --workspace @aigc-flow/db -- ai-plugin-packages.test.ts` skipped locally because the database-backed suite had no configured test database environment
  - `npm run build` passed on 2026-07-11 with existing Browserslist age, dynamic-import, and chunk-size warnings only

## 2026-07-20 - Prompt Plaza Approved Design

- completed the approved product design for an official image-prompt plaza:
  - official curated prompts only in the first release;
  - user discovery, search, category filtering, copy, favorites, and reference;
  - standalone `/prompts` and `/prompts/:promptId` routes plus a compact canvas prompt panel;
  - prompt reference always creates a new image-generation node and never overwrites an existing node;
  - standalone reference uses a tenant-scoped project picker, while canvas reference uses the current project;
  - copy is a separate action that writes only the main prompt to the clipboard;
  - administrators enter or batch-import prompt records and publish them through a protected admin surface;
  - effect examples use object storage and short-lived signed URLs, with prompt source/id snapshots retained on referenced nodes.
- browser brainstorming decisions were recorded for:
  - search-first prompt grid;
  - full detail page with a left 2x2 effect gallery and fixed right prompt panel;
  - independent copy, favorite, and reference action hierarchy;
  - official categories plus user favorites, without custom folders or community submissions in v1.
- design specification:
  - `docs/superpowers/specs/2026-07-20-prompt-plaza-design.md`
- implementation remains pending approval of the written specification and a follow-up implementation plan.

## 2026-07-23 - Prompt Image Original Upload Limit

- raised the prompt image original upload limit to 25 MB.
- added browser preflight with the exact error `效果图大小必须在 25 MB 以内` before upload.
- mapped Fastify custom `application/x-prompt-media` content-parser/body-limit failures to HTTP 413 for oversized prompt image uploads.
- kept original uploads prompt-only in the server directory; they are not exposed in Prompt Plaza.
- Prompt Plaza continues to use generated WebP thumbnail and preview derivatives.
- no database migration or environment-variable changes were required.

## 2026-07-24 - Prompt Plaza Adaptive Masonry Width

- changed Prompt Plaza masonry to use an adaptive 340px column width instead of fixed breakpoint column counts.
- a 1600px desktop viewport now renders four columns, while narrower available areas reduce the column count instead of compressing cards.
- card rendering, prompt media behavior, WebP derivatives, and dedicated server-directory persistence are unchanged.
- no database migration or environment-variable changes were required.

## 2026-07-30 - Personal Wallet Cutover Completed on Staging

- resolved the previously missing active `tenant_owner` for tenant `e208ecf5-2ec4-445c-b71b-3e4c4389838e` by assigning the sole member `aigc@sina.com`.
- personal-wallet dry-run passed with `activeReservationCount: 0`, `migratedCredits: 24586.2`, `migratedGrantCount: 9`, no unresolved tenants, and `verificationMatched: true`.
- confirmed personal-wallet write completed with the same totals and verification result.
- restarted the v2 staging services: Redis healthy, API running, Worker started, and Frontend running.
- remaining staging work is payment-provider merchant configuration and end-to-end XunhuPay acceptance; do not repeat the wallet cutover.
- configured the staging XunhuPay merchant environment with `PAYMENTS_ENABLED=true`, recreated the API container, and verified `GET /health` returns HTTP 200 with `{"status":"ok"}`.
- payment reconciliation scheduler is running with no pending candidates in the initial check.

## 2026-07-30 - XunhuPay Billing Runtime Fixes

- fixed the personal-wallet summary query by replacing the PostgreSQL-reserved `grant` alias with `credit_grant`.
- added migration `000046_wallet_runtime_acl.sql` to grant wallet/payment function execution to the runtime API role when the migration connection uses a separate Supabase role.
- added `API_DATABASE_ROLE` to the migrator-only Compose environment and staging/production deployment documentation.
- validation passed: DB tests 28 passed / 34 skipped, API payment tests 5 passed / 3 skipped, Worker tests 66 passed / 16 skipped, DB/API/Worker builds passed.
- staging smoke exposed a second PostgreSQL ACL gap (`permission denied for table billing_recharge_plans`) during checkout creation.
- added migration `000047_wallet_checkout_table_acl.sql` to reassert the callback-owner table privileges required by checkout functions; focused migration SQL tests pass after observing the expected red failure first.
- staging metadata diagnostics confirmed the checkout function owner, `SECURITY DEFINER` flag, execute ACL, and recharge-plan `SELECT` ACL were correct; the remaining denial came from `SELECT ... FOR SHARE`, which also requires table `UPDATE` privilege.
- added migration `000048_wallet_checkout_plan_lock.sql` to remove the unnecessary recharge-plan row lock while keeping administrator-managed plan updates inaccessible to the callback role.
- the first successful real checkout exposed an application-side reconciliation query error (`column reference "id" is ambiguous`) in joined admin payment reads.
- qualified every selected payment column in `billing_wallet_payments JOIN users` queries so the reconciler can inspect and settle pending XunhuPay orders; this fix requires an API rebuild and no database migration.
- after reconciliation reached provider-confirmed paid orders, staging exposed an RLS failure on `billing_wallet_ledger` caused by `INSERT ... RETURNING id` requiring callback SELECT visibility.
- added migration `000049_wallet_payment_ledger_insert.sql` to pre-generate the immutable ledger UUID and insert it directly, preserving the callback role's no-browse ledger boundary while allowing paid orders to credit atomically.

## 2026-07-31 - XunhuPay Wallet Balance Reconciliation

- traced successful payment ledger rows with an unchanged wallet total to PostgreSQL RLS: callback-owned mutators had an `UPDATE` policy on `billing_wallets`, but no callback `SELECT` policy, so wallet updates silently affected zero visible rows.
- added migration `000050_wallet_balance_reconciliation.sql` to grant the isolated callback role wallet-row visibility and rebuild cached wallet balance/reserved totals from authoritative credit-grant batches.
- aligned the billing activity frontend with the personal-wallet ledger response field `amountCredits`, so recharge entries display their actual `+100` and `+700` changes.
- added focused regression coverage for both the callback wallet policy/reconciliation and the personal-wallet ledger field mapping.
- staging acceptance confirmed migration `000050` is recorded, the wallet total is `19410.2`, reserved credits are `0`, and the two paid orders display `+100` and `+700` ledger changes.

## 2026-07-31 - Global Redeem Codes and Billing Admin

- added migration `000051_global_redeem_code_scope.sql` so redeem-code lookup no longer filters by `tenant_id`; old and new codes can be redeemed from any workspace while `billing_redeem_code_redemptions.tenant_id` continues to record the workspace where redemption occurred.
- changed super-admin code creation so an omitted `tenantId` creates a platform-global code (`tenant_id = NULL`), while explicit tenant ownership remains available for compatibility and auditing.
- added structured redeem-error localization for not-found, inactive, expired, exhausted, and already-redeemed codes; unknown server errors continue to use a safe Chinese fallback.
- renamed the super-admin entry and panel to `充值套餐与支付`, localized its controls, and clarified that plan edits affect new orders only because paid orders retain commercial snapshots.
- validation:
  - focused redeem, payment-panel, API scope, and migration tests passed: 11 assertions passed and 1 database-backed integration test skipped.
  - `npm run test --workspace @aigc-flow/db` passed: 34 tests passed and 34 database-backed tests skipped because no test database was configured.
  - `npm run test --workspace @aigc-flow/api` passed: 242 tests passed and 120 database-backed tests skipped for the same reason.
  - `npm run build --workspace @aigc-flow/api` passed, including database and AI Gateway dependency builds.
  - `npm run build` passed with the existing Browserslist age, mixed dynamic/static import, and chunk-size warnings.
  - the full root `npm test -- --reporter=dot` remains red with 26 unrelated existing failures in legacy asset migration fixtures, Three.js tests missing `ResizeObserver`, Canvas Agent integration expectations, and AI Gateway multipart tests under the current Node runtime; all task-focused suites above pass independently.

## 2026-07-31 - Redeem Ledger Constraint and Payment Polling Fix

- staging read-only diagnostics confirmed the reported active, unused, unexpired redeem code was rejected because `billing_wallet_ledger_entry_type_check` did not allow the existing `redeem` entry type used by `app.wallet_redeem_code`.
- added forward-only migration `000052_wallet_redeem_ledger_entry_type.sql` to preserve all existing ledger entry types and allow `redeem`.
- fixed billing-page payment synchronization by storing the active payment ID in React state and updating it immediately after checkout creation; the existing three-second bounded poll now starts without a manual reload.
- added regression coverage for the migration constraint and current-page payment polling.
- validation passed: frontend billing tests 18 passed, database focused tests 18 passed / 1 database-backed test skipped, API focused tests 5 passed, DB/API/AI Gateway builds passed, and the production frontend build passed with existing warnings only.

## 2026-07-31 - Redeem Function Runtime Repair and Payment Poll Recovery

- production diagnostics confirmed migration `000052` and the `redeem` ledger constraint were applied; the reported code remained active, unused, and unexpired.
- reproduced the redeem failure inside a rolled-back production transaction and traced it through three PostgreSQL runtime defects: ambiguous `RETURNS TABLE` output names, missing `UPDATE` privilege required by `SELECT ... FOR UPDATE`, and positional assignment of the nine-column wallet-credit result into the thirteen-column ledger row type.
- added migration `000053_wallet_redeem_qualified_columns.sql` to qualify colliding columns, use named conflict constraints, explicitly map wallet-credit results, grant the callback role the required redemption-row update privilege, and persist redeem ledger entries as `redeem`.
- validated the complete `TF-3418A50398` redeem path in a rolled-back production transaction; it returned a 1,000-credit `redeem` ledger result without consuming the code or changing the wallet.
- extended frontend payment polling from 60 seconds to six minutes and added an immediate recheck when the billing tab becomes visible again, while preventing overlapping polls and cleaning up timers/listeners.
- focused validation passed: billing page tests 7 passed; personal-wallet DB tests 19 passed / 1 integration skipped; DB build passed.

## 2026-08-01 - Canvas Image Generation Staging Diagnosis

- reproduced the reported canvas `INTERNAL_ERROR` against the staging database inside a rolled-back transaction; no data was changed.
- confirmed the failure occurs during workflow-run creation in `app.wallet_reserve(...)`, before worker enqueue or provider request.
- PostgreSQL returned `42702: column reference "user_id" is ambiguous` because the wallet reserve function's `RETURNS TABLE` output parameter collides with an unqualified `user_id` column reference.
- recent workflow/node records show prior provider failures/refunds but no new run for the reproduced launch path, consistent with the reserve-stage failure.
- no production code or migration fix was applied in this diagnostic task; the required repair is a forward-only SQL migration that qualifies wallet-reserve table references, followed by a rolled-back reserve smoke test and one real canvas generation.

## 2026-08-01 - Wallet Reserve Qualified-Column Repair

- added forward-only migration `000055_wallet_reserve_qualified_columns.sql` to recreate only `app.wallet_reserve(...)` with explicit aliases for wallet, ledger, and credit-grant columns that collide with `RETURNS TABLE` output names.
- preserved the existing reserve validation, user guard, idempotency conflict handling, lazy expiry, FEFO grant allocation, reservation/ledger writes, callback owner, and `SESSION_USER` execute ACL.
- added a migration SQL regression test using TDD: the new test failed when `000055` was absent, then passed after the migration was added.
- validation passed: focused migration test passed; DB wallet migration/accounting tests passed with 20 assertions and 1 database-backed integration test skipped; API tests passed with 270 assertions and 126 database-backed tests skipped; worker tests passed with 66 assertions and 16 skipped; DB and API builds passed; the root frontend build passed with existing warnings.
- a direct worker-only TypeScript build can report a stale `@aigc-flow/redis` `walletExpiry`/`WalletExpiryJobPayload` export mismatch when the redis package has not been built first; the production Docker build order (`redis` before `worker`) passes, and no worker files were changed for this SQL-only repair.
- the root `npm test` completion check was attempted but timed out after 10 minutes while collecting repository worktrees and retrying unavailable Redis connections; the task-focused suites above were rerun successfully afterward.
- local PostgreSQL execution and staging rollout were not performed because this workspace has no `DATABASE_URL` or `psql`, and Docker Desktop's Linux engine was unavailable. The next staging rollout must apply `000055` using the documented worker-stop migration order, then run the rolled-back reserve smoke and one real canvas generation.

## 2026-08-01 - Wallet Credit-Grant Reservation Constraint Repair

- after staging applied `000055`, a rolled-back reserve diagnostic reached the credit-grant update and reproduced PostgreSQL `23514`: `billing_wallet_credit_grants_check` rejected a non-zero reservation despite a wallet balance and active grant availability of `20770.2` credits.
- traced the failure to the historical `000042` constraint `remaining_credits + reserved_credits <= original_credits`; the current reserve operation correctly leaves `remaining_credits` unchanged while incrementing `reserved_credits`, so any newly credited grant was rejected on its first reservation.
- added forward-only migration `000056_wallet_credit_grant_reservation_constraint.sql`, replacing that invalid combined check with `remaining_credits <= original_credits` and `reserved_credits <= remaining_credits`.
- added a migration SQL regression test with an observed red state before `000056` existed and a green state after it was added.
- validation passed before final integration: focused DB migration/accounting tests (21 passed, 1 skipped), DB build, API build, and API tests (270 passed, 126 skipped). Staging rollout and a real canvas-generation smoke test remain pending.

## 2026-08-01 - Wallet Reservation Migration Naming-Conflict Repair

- staging diagnostics proved `000056_wallet_credit_grant_reservation_constraint.sql` had not been recorded and the original combined credit-grant constraint continued to reject every reserve attempt with PostgreSQL `23514`.
- the first staging migration attempt exposed the blocking deployment defect: the historical schema already has non-negative `billing_wallet_credit_grants_remaining_credits_check` and `billing_wallet_credit_grants_reserved_credits_check` constraints, so `000056` could not add identically named constraints and rolled back with `42710`.
- because `000056` was never applied or recorded, corrected that pending migration in place: it now drops the historical combined and same-name bounds checks first, then recreates each bound while preserving non-negative credits and enforcing `reserved_credits <= remaining_credits <= original_credits`.
- extended the migration SQL regression test, observed the expected red state for the missing drops, then verified green after the minimal migration correction.
- final source validation and redeployment remain pending.

## 2026-08-01 - Wallet Reservation Runtime RLS Repair

- after `000056` applied successfully, a rolled-back staging reserve reached the allocation insert and exposed PostgreSQL `42501`: forced RLS rejected the callback-owned `app.wallet_reserve(...)` insert into `billing_wallet_credit_reservations`.
- traced the full reserve/settle/refund data path and confirmed that the dedicated callback role also needs ledger SELECT visibility plus reservation SELECT and UPDATE visibility for completion operations; ordinary API sessions must retain no direct financial-table write access.
- added forward-only migration `000057_wallet_reservation_runtime_rls.sql` with narrowly scoped callback SELECT on `billing_wallet_ledger`, SELECT/INSERT/UPDATE policies on `billing_wallet_credit_reservations`, and matching table privileges without DELETE or broad `FOR ALL` access.
- added a focused migration regression test and observed the expected red state before the migration existed, followed by green after the minimal RLS repair.
- final source validation, staging migration, rolled-back reserve verification, and one real canvas-generation smoke remain pending.

## 2026-08-01 - Wallet Completion And Provider-Poll Recovery

- staging diagnostics for workflow run `51f9a568-9506-4d28-b7a5-ab7da089a19e` and node run `f55d29c0-a017-4c47-8935-142445cc1494` confirmed that the Worker had created provider task `1481a574daa242e497ad2e32fdda4091`; this is not a Redis queue backlog or a missing provider submission.
- traced successful provider completion to `app.wallet_settle_or_refund(...)`, where unqualified references collided with `RETURNS TABLE` output variables and caused PostgreSQL `42702` during settlement/refund.
- the provider-poll error handler attempted to record failure in the same now-aborted transaction, which replaced the original SQLSTATE with `25P02` and left the canvas node in `waiting_provider`.
- added forward-only migration `000058_wallet_completion_runtime_recovery.sql`: it qualifies settlement/refund SQL, preserves completion idempotency and accounting, revokes public function execution, grants only the runtime API role execution for wallet completion and `app.wallet_expire_due(...)`, and does not grant runtime financial-table DML.
- added a Worker provider-poll savepoint before asynchronous result persistence. A caught provider-poll persistence error now rolls back to and releases that savepoint before the existing failed-node/refund write, preserving the real error path without changing synchronous node completion handling.
- Worker failure logs now retain safe PostgreSQL diagnostics (`errorCode`, `constraint`, `detail`, and `table`) alongside the message. They do not log credentials, provider authorization, prompts, request bodies, or raw result payloads.
- source validation passed: DB migration SQL tests 18 passed; DB personal-wallet tests 23 passed with 1 database-backed test skipped; DB build passed; Worker tests 68 passed with 17 database-backed tests skipped.
- staging rollout remains required: stop the Worker, apply compiled migrations through `node packages/db/dist/cli.js`, restart all v2 services, verify expiry-job ACL errors are absent, inspect the exact stored run/node state, then enqueue exactly one `provider.poll` only if it is still `waiting_provider`. Do not create a new workflow run, clear Redis, or reserve credits again.

## 2026-08-01 - Text Node Error-State Crash Repair

- traced the immediate canvas black screen after failed text generation to `TextNodeComponent`: its error renderer referenced `hasGenerationError`, but that variable existed only inside the separate image-node component.
- added a focused React render regression test for a text node with `generationStatus: 'error'` and an error message; the test first reproduced `ReferenceError: hasGenerationError is not defined` before the production change.
- fixed the crash by deriving `hasGenerationError` inside `TextNodeComponent`, preserving the existing inline error message and retry button without changing workflow execution, billing, or provider routing.
- validation passed: the focused error-state test passed, the complete `FlowNodes.agent-metadata.test.tsx` suite passed with 15 assertions, and the production frontend build completed successfully with existing non-blocking warnings only.
## 2026-08-02 - Aittco Multi-Protocol Text Relay

- added the `aittco.text-relay` plugin manifest with eight priced product text models: Gemini-3.1-pro, Gemini-3.5-flash, GPT-5.6-sol, GPT-5.6-terra, GPT-5.5, Claude-Opus-5, Claude-Sonnet-5, and Claude-Opus-4-8.
- added one server-side `aittco-text-relay` adapter that uses the configured Gemini GenerateContent, OpenAI Responses, or Claude Messages request path and always sends the configured upstream model rather than the canvas product model key.
- kept the shared Aittco Bearer Key in CredentialVault: no runtime Compose variable, frontend value, node draft field, or source-controlled secret is introduced.
- corrected plugin route installation to persist `requestConfig.model` as `ai_routes.upstream_model` and model-configuration publishing to look up prices by `ai_models.model_key`; this preserves Gemini preview upstream names while pricing by product model.
- canvas text model catalog options now read `manufacturer` and `logoKey` from database catalog UI metadata, use the supplied Gemini/OpenAI/Claude logos, and group active positive-priced options by Gemini, GPT, Claude, then other models.
- staging rollout and live route smoke tests remain pending: install the plugin through the authenticated admin API with the shared Key, execute each generated route test, then perform a text-node canvas generation before disabling the legacy SiphonLab package.

## 2026-08-02 - Aittco GPT Chat Completions Cutover

- verified the relay model list, Gemini native GenerateContent, and Claude Messages calls against the configured service; each returned HTTP 200.
- confirmed the Aittco OpenAI Responses endpoint timed out twice after 60 seconds, so the three GPT routes now use `/v1/chat/completions` with the same upstream models, route keys, and prices.
- added adapter and manifest regression coverage for Chat Completions request/response handling, normalized route metadata, and declared provider capabilities; Gemini and Claude protocols remain unchanged.
- no real relay Key is stored in source. Deployment, authenticated plugin reinstallation with the verified raw Key, and all eight live route tests remain pending.

## 2026-08-02 - Text Node Terra Default

- new text nodes now initialize with product model `gpt-5.6-terra` and route `text.gpt-5-6-terra`.
- explicit model and route overrides remain authoritative, and existing saved nodes are not migrated.
- validation passed: node-factory tests (8 assertions) and the production frontend build; existing Vite warnings remain non-blocking.

## 2026-08-02 - Text Picker GPT White Icon

- applied a text-picker-only white filter to the OpenAI/GPT logo in both menu rows and the selected-model trigger, preserving the shared SVG asset and Gemini/Claude rendering.
- added a DOM regression assertion covering the rendered OpenAI logo filter.
- validation passed: FlowNodes agent-metadata tests and the production frontend build; existing Vite warnings remain non-blocking.
## 2026-08-02 - Password Reset Flow

Added email-code password recovery: request/resend/confirm APIs, hashed one-time challenges, password update with session and refresh-token revocation, Resend delivery, and the public `/forgot-password` recovery page linked from login. Validation: `npm run build`, API build, and focused Resend tests pass in the isolated `codex/password-reset` worktree. Database-backed auth tests require `DATABASE_URL`.

## 2026-08-03 - PixelHub Video Models Integration Design

- approved the detailed v2 integration design for `gemini-omni-flash`, `sora-v3-pro`, and `veo31-fast` through one CredentialVault-backed PixelHub provider connection, three stable product routes, and a dedicated asynchronous `pixelhub-video` adapter.
- defined catalog-driven differences for ratios, resolutions, exact durations, generated-audio controls, per-kind reference limits, input-mode availability, automatic mode transitions, and safe model-switch correction.
- separated the five video modes by input semantics: Gemini and Sora support text, single-image, multi-image, and all-reference input; Veo supports text, single first-frame, and ordered first/last-frame input.
- fixed the approved base pricing at 1 credit/second for Gemini, 10 credits/second for Sora, and 0.5 credit/second for Veo, with exact route pricing and fail-closed billing requirements.
- recorded the design in `docs/superpowers/specs/2026-08-03-pixelhub-video-models-design.md`; no runtime integration or staging change was made in this design-only task.

## 2026-08-03 - PixelHub Reference Role Boundary Correction

- aligned Gemini all-reference validation across the canvas and AI Gateway: it now accepts only `reference_image` static references and exactly one `source_video`.
- confirmed Veo image-to-video remains limited to exactly one `first_frame`; ordered first/last-frame behavior remains unchanged.
- added focused contract and canvas regression coverage; frontend build and both focused suites passed in the isolated `codex/pixelhub-video-models` worktree.
- the broader PixelHub integration plan remains in progress; this record covers only the reference-role correction.

## 2026-08-03 - PixelHub Video Models Implementation And Local QA

- implemented catalog-driven PixelHub video products with stable routes `video.pixelhub.gemini-omni-flash`, `video.pixelhub.sora-v3-pro`, and `video.pixelhub.veo31-fast`, one `pixelhub-video` adapter, exact duration-second pricing, and asynchronous task polling.
- route capabilities enforce Gemini at 1 credit/second, Sora at 10 credits/second, and Veo at 0.5 credits/second. The creator receives only route-confirmed controls and exact pricing; credentials and signed media URLs remain server-side.
- Gemini all-reference accepts only `reference_image` assets plus exactly one `source_video`. Veo image-to-video accepts exactly one `first_frame`; first/last-frame input is two ordered images.
- corrected the canvas deletion path: removing either Veo first/last frame now reruns automatic mode and role normalization. A remaining image becomes `image_to_video` with `first_frame`, rather than leaving an invalid `last_frame` reference.
- local focused validation passed: 58 PixelHub contract/canvas/smoke assertions, `npm run smoke:video-node` across desktop/narrow/mobile viewports, and `npm run build`.
- complete package evidence: AI Gateway Core `141` passed; API `283` passed and `126` database-backed tests skipped without `DATABASE_URL`; Worker `70` passed and `17` tests skipped; Redis `5` passed and `2` tests skipped; the complete video/canvas focused suite passed `180` assertions. All four package builds and the root frontend build passed.
- the full root `npm test` was rerun and remains red due to existing unrelated legacy migration, asset presigning, Canvas Agent, and AI Gateway multipart tests. The PixelHub focused suites passed in that worktree.
- local v2 project QA could not start: `npm run dev:infra` could not connect to the missing Docker Desktop Linux engine pipe. The workspace has neither `DATABASE_URL` nor `REDIS_URL`, so authenticated project/canvas QA was not simulated.
- no live Provider Connection, credential, PixelHub API, staging installation, inactive-route test, or active-route test was performed. Staging remains pending the runbook in `docs/PIXELHUB_VIDEO_MODELS_RUNBOOK.md`.

## 2026-08-04 - PixelHub Structured Video Runtime Route Repair

- staging validation reproduced a pre-provider `UNSUPPORTED_VIDEO_MODE` response for the active Gemini PixelHub route, despite the persisted route capability declaring `video_generation` and passing the shared capability parser.
- traced the request path to `WorkflowRunsService`: its runtime workflow whitelist only contained `video_editor_export`, so it silently removed `video_generation` while constructing route context and rejected every structured PixelHub video request.
- added `video_generation` to the runtime whitelist and a regression test that loads a PixelHub route context from the same nested `request_config.capabilities` shape used by production.
- validation passed: focused workflow-pricing resolver test (24 passed), complete API test suite (284 passed, 126 database-backed tests skipped), and API build.
- server rollout is required: rebuild and restart `tapflow-api` and `tapflow-worker`, then retry a Gemini text-to-video run before enabling the remaining production route smoke matrix.

## 2026-08-04 - PixelHub Video Node And Credential Isolation Follow-up

- video nodes now size empty and uploaded/generated portrait media from requested and natural dimensions, use contain previews, retain a durable ready state when preview signing is unavailable, and expose download/fullscreen without upload replacement controls.
- formal creator labels and route-confirmed PixelHub capability assertions cover Gemini Omni Flash, Sora V3 Pro, and Veo 3.1 Fast. Route-scoped install inputs now require complete distinct credentials and connections for PixelHub while preserving legacy single-credential plugins.
- validated with 25 FlowNodes metadata tests, 10 model catalog tests, 15 plugin registry tests, 13 PixelHub adapter tests, 16 API service tests, frontend build, API build, and 4 database-backed API integration tests skipped because staging infrastructure is unavailable.
- staging install, live provider generation, and billing smoke remain pending; do not mark the old shared connection inactive until the documented route query and controlled generation matrix pass.

## 2026-08-04 - PixelHub Video Node And Credential Isolation Verification

- removed the last generated-video `posterUrl` persistence path so signed asset URLs never enter `flow_drafts.graph_json`; video previews continue to obtain fresh URLs only at runtime.
- added complete browser-side form gating for PixelHub installation: the protected Template Library now enables installation only after Gemini, Sora, and Veo route secrets are all present; service-side completeness validation remains the authoritative fail-closed check.
- validation passed: frontend build; API `294` passed with `129` database-backed skips without `DATABASE_URL`; Worker `70` passed with `17` skips; AI Gateway Core `142` passed; DB `45` passed with `36` database-backed skips; video smoke unit suites `6` passed; `npm run smoke:video-node` passed across desktop, narrow, and mobile screenshots.
- `npm test` did not complete within 120 seconds and ended with the command timeout/EPIPE after unrelated existing Three.js and React test warnings; it is not counted as passing. `npm run smoke:video-node-visual` also timed out after 124 seconds with no result, so visual smoke remains unverified.
- no local database, Redis, Docker Linux engine, staging credential installation, live PixelHub provider generation, or billing settlement/refund smoke was performed. Keep any old shared route connection intact until the runbook's route/fingerprint and controlled generation checks pass.
- implementation commits: `c19988d2`, `4c51d3e2`, `dab29899`, `81642406`, `7b895c35`, `fd52a6e1`, `baea0b73`, `145b0263`, `6bdc943c`, `d99db1a4`, and `1b86c01b`.
- final review follow-up restored the inactive-route and activation checks in the runbook. The browser smoke now uses a real Gemini capability fixture and passed its `9:16` empty-node, upload-entry, discrete-duration, ready-toolbar, and contain-preview checks across the desktop/narrow/mobile harness. The separate visual smoke remains unverified because it times out after 124 seconds.

## 2026-08-04 - Video Node Interaction Consistency

- empty video previews are passive selection surfaces. Only the selected empty node's top upload button opens the file picker; dropping on the placeholder does not upload, and ready uploaded/generated video nodes expose neither upload nor replacement controls.
- video editor controls now use a node-relative inverse-zoom surface without transform animation, keeping the editor screen size stable while React Flow zoom changes. Text and image editor density, widths, anchoring, transforms, shadows, and animation contracts are unchanged.
- video nodes no longer render manual resize controls. Requested aspect ratio remains authoritative before output, while the natural media ratio remains authoritative after upload or generation.
- validation passed: `npx vitest --run src/flowCanvas/nodes/NodeEditorSurface.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/video/videoNodeSizing.test.ts src/flowCanvas/video/VideoReadyState.test.tsx scripts/smoke-video-node.test.ts` (72 passed); `npm run smoke:video-node` returned `status: ok` across desktop, narrow, and mobile; and `npm run build` passed with only the existing non-blocking Vite warnings.
- the full `npm test` was attempted after the focused verification and timed out after 154 seconds without an attributable failure output. It is not counted as passing, so this branch is preserved for explicit integration approval rather than being merged automatically.

## 2026-08-05 - Video Composer Capsule Density

- video composer model and parameter triggers now use content-sized 40px pill capsules, with safe model-plus-route truncation, an explicit route label, and video-only maximum-width tokens. Text and image editor geometry and density files were not changed.
- parameter summary now shows only aspect ratio, resolution, and duration; fixed count-one is omitted. Models with implicit always-on audio show a non-interactive audio indicator, without introducing an audio toggle.
- the Generate control is now a labeled, accessible circular 40px action. Existing disabled, pending, retry, pricing, capability, credential, and generation behavior remains unchanged.
- expanded the real XYFlow/Playwright smoke harness to measure model and parameter capsule widths at 1440, 1024, 768, and 390 viewport widths. It asserts capsules match content, the parameter capsule cannot flex-expand, and preserves prior feedback, upload-boundary, no-resize, inverse-zoom, and ready-video checks.
- validation passed: focused editor/video/smoke contract suite `40` passed; extended video catalog/menu suite `52` passed; `npm run test:smoke-video-node` `4` passed; `npm run smoke:video-node` returned `status: ok` across all four target viewports; and `npm run build` passed with existing Browserslist age, mixed import, and chunk-size warnings only.
- the full root `npm test` was attempted with a 180-second limit and timed out after 183 seconds. Its output contained existing unavailable-Redis, Three.js, and React `act(...)` warnings, followed by reporter `EPIPE` on timeout; it is not counted as passing.

## 2026-08-05 - Video Generate Toolbar Consistency

- video generation now reuses the image node's compact `ImageGenerateToolbar`: 28px pill, 24px circular arrow action, matching credits treatment, hover/disabled styling, and generating feedback.
- the shared toolbar accepts an external disabled state and caller-specific accessible labels so video model/catalog blockers remain fail-closed while retaining the video action semantics.
- focused toolbar and video composer tests passed (`26` tests); frontend build passed with the existing Browserslist, mixed-import, chunk-size, and CSS warnings.

## 2026-08-05 - Video Composer And Fullscreen Follow-up

- compressed only the video editor surface and prompt control to a 120px surface minimum, 52px prompt minimum, and 120px prompt maximum; text and image density values remain unchanged.
- creator-facing video model capsules now show only the product model name and retain route metadata exclusively for runtime/admin use.
- native video fullscreen now toggles from the same top-right button, synchronizes on `fullscreenchange`, updates icon/label, and keeps the existing portal fallback behavior.
- validation passed: focused video/fullscreen/density/editor tests (`40` tests), frontend build, and `git diff --check`.
- `npm run smoke:video-node` was attempted but its internal `npx.cmd` process timed out after 60 seconds without a visual result, so browser smoke is not counted as passing.

## 2026-08-05 - Video Bottom Controls Density And Surface Color

- aligned video model and parameter capsules with the image node bottom row: 28px capsule height and 24px action token; top video tool buttons remain unchanged.
- aligned the video editor surface background with the image editor surface (`rgba(38,38,38,0.98)`) while preserving video-only inverse-zoom and positioning behavior.
- focused density, surface, composer, and shared toolbar tests passed (`39` tests); frontend build passed with existing non-blocking Vite warnings.

## 2026-08-05 - Video Capsule Visual Unification

- introduced one shared video composer capsule class for mode, camera, palette, model, and parameter triggers, matching the credits pill's translucent background, subtle border, inset highlight, hover, focus, and disabled states.
- all video composer triggers now use 28px height, pill radius, 14px icons, 9px horizontal padding, and 6px internal spacing; the palette trigger is a 28px circle.
- focused capsule, mode, palette, composer, and shared generation toolbar tests passed (`42` tests); frontend build passed with existing non-blocking Vite warnings.

## 2026-08-05 - Video Reference Capsule Visual Unification

- reference slot and add-reference controls now reuse the shared video capsule styling, including 28px height, full radius, translucent surface, border, inset highlight, hover, focus, and disabled states.
- selected reference chips retain their delete action in a compact 20px circular control, preventing the reference row from expanding vertically.
- focused reference, composer, and density tests passed (`38` tests); frontend build passed with existing non-blocking Vite warnings.

## 2026-08-05 - Video Reference Edge Recovery

- existing image-to-video edges are now reconciled into `videoGeneration.referenceInputs` when the video node renders, including drafts created before typed video references were persisted.
- automatic image reference roles now use `main_image` for normal image-to-video and ordered frame roles for first/last-frame semantics; capability correction also normalizes legacy roles before preflight.
- reference recovery no longer stops merely because a stale/generated video preview exists, so retrying after replacing an upstream image can resolve the current image asset.
- focused store, capability, reference-rule, composer, and node metadata tests were run; 88 passed and one pre-existing submitting-feedback assertion failed because the button label changes to `生成中` immediately. Frontend `npm run build` passed with existing Vite warnings.

## 2026-08-06 - Video Stale Reference Asset Recovery

- connecting an image node to an image-to-video node now replaces stale image asset references for the same main-image role instead of sending both the deleted asset ID and the current upstream image.
- this prevents `REFERENCE_ASSET_NOT_FOUND` failures after an image node is replaced while its video connection remains.
- focused video/store/worker tests passed (`76` passed, `17` skipped); frontend build and `git diff --check` passed with existing Vite warnings.

## 2026-08-06 - Gemini Main Image And Veo Frame Removal

- Gemini Omni Flash image-to-video now sends its single main image through PixelHub's singular `image_url` field, while multi-image/style-reference workflows retain `reference_image_urls`.
- removing an upstream Veo first/last frame now disconnects the corresponding canvas edge before mode resolution, preventing the deleted frame from being automatically restored.
- image-to-video reference reconciliation now keeps one already-active upstream image when legacy drafts contain multiple incoming image edges, preventing the React maximum-update-depth loop that blacked out the canvas.
- focused video reference and adapter tests passed (`63` assertions across the focused suites), the complete AI Gateway core suite passed (`143` tests), and frontend build plus `git diff --check` passed with existing Vite warnings.

## 2026-08-08 - Media Mention Input Accessibility And Recovery

- disabled media mention editors now call Lexical `setEditable(false)` and disable mention removal controls, preventing edits while a node is unavailable or generating.
- media candidate activation failures are caught, announced through an accessible alert, and retain the query/menu so the creator can retry without retyping.
- the prompt combobox now exposes active mention candidates through list autocomplete ARIA relationships, and each portal option has a unique stable ID.
- valid mention removal controls are always keyboard reachable and support Enter or Space.
- focused mention regression suites passed (`28` assertions) and the frontend production build passed; existing Lexical test-harness `flushSync`, Browserslist age, mixed-import, and chunk-size warnings remain non-blocking.

## 2026-08-08 - Unified Media Mentions And Input Previews

- connected text inputs now render as one aggregate first-position group; media inputs remain reorderable only after that group, and remove-all text is one Store transaction.
- image and video inputs resolve separate thumbnail and hover-preview URLs. Hover previews use image or muted video portals and remain runtime-only; canonical graph persistence keeps stable `mediaMentionBindings` but strips transient preview fields.
- image and video nodes now use the shared media-only `@` editor. Text candidates are excluded; connected media inserts directly, canvas media auto-connects before insertion, and library assets are added to ordered inputs before insertion. Mention deletion only edits prompt text.
- focused frontend suites passed (`14` files, `195` tests); Worker suite passed (`79` tests, `17` skipped); `npm run build` passed with existing Browserslist, mixed-import, and chunk-size warnings. The smoke contract passed (`2` tests); full `npm run smoke:node-input-tray` needs a follow-up fix for its generated check-code execution context before it can be counted as an end-to-end pass.

## 2026-08-08 - Unified Input Groups And Mention Fixes

- Text nodes now show upstream text, image, video, and audio inputs in the shared tray. Groups render in text/image/video/audio order with independent numbering, while `audio -> text` connections are accepted.
- Canvas Backspace/Delete shortcuts are isolated from native and Lexical editors. Media `@` menus trigger on the first keystroke, support element selections, and anchor to the real caret rectangle.
- Video mention candidates now fail closed while the catalog is loading or unavailable and are filtered by route-confirmed per-mode media limits. The LibTV-style candidate menu adds search, source grouping, media grouping, and disabled-candidate handling.
- Focused validation passed for TextNode/input projection (40 tests), mention/caret (25 tests), capability/candidate/menu suites (30 tests), and the combined regression set (144 tests). Frontend `npm run build` passed; worker tests passed (`79` passed, `17` skipped). Worker build remains blocked by existing AI Gateway type drift in `apps/worker/src/workflow-runtime/service.ts`; browser smoke timed out waiting for the generated tray page and is not counted as passing.

## 2026-08-08 - Media Mention Caret Recovery And Smoke Regression

- Media mention activation now preserves the saved `@query` validation but falls back to the current trailing text node when Lexical restores an element/root selection during asynchronous candidate activation. This fixes the first-keystroke `@` flow without allowing stale candidates to insert into unrelated text.
- The node-input-tray browser smoke now exercises real keyboard selection (`@`, ArrowDown, Enter), asserts stable independent labels (`@视频1`, `@图片2`), and verifies image hover preview with a representative thumbnail fixture.
- Validation passed: focused media mention/input suites (`61` tests), `npm run smoke:node-input-tray`, and the frontend build. Existing Lexical `flushSync`, Browserslist, mixed-import, chunk-size, and CSS warnings remain non-blocking.

## 2026-08-08 - Media Mention Preview And Controlled Caret Follow-up

- Media mention capsules retain runtime thumbnails through controlled prompt re-renders, and candidate thumbnails are used when activation returns only stable input identity.
- Controlled Lexical updates compare the actual serialized editor value before rebuilding the root, preserving the insertion caret after an immediate parent value write-back.
- Deferred caret restoration is retried after focus and guarded against editor unmounts; disabled candidates cannot be activated through keyboard paths.
- Focused media mention, candidate menu, image input, and video composer suites passed (`61` tests). Existing React/Lexical harness warnings remain non-blocking.

## 2026-08-11 - Cinematic Auth Home Design

- approved a replacement for the current AI-SaaS-style anonymous login screen: four full-screen silent video chapters with a coherent surreal-cinematic art direction and minimal TapFlow brand copy.
- login, registration, verification, and password recovery move into one responsive overlay while retaining the v2 auth clients, tenant behavior, and `returnTo` routing.
- the existing video-generation API is designated for curated offline brand-film production, not per-visitor generation; public CDN media, versioned manifests, poster fallback, reduced-motion behavior, and one-video-at-a-time playback are specified.
- implementation has not started; the approved design is recorded in `docs/superpowers/specs/2026-08-11-cinematic-auth-home-design.md`.

## 2026-08-11 - Cinematic Auth Home Implementation And Validation

- implemented the v1 cinematic anonymous-auth experience across the landing-film prompt/pipeline scripts, runtime manifest and playback policy, four-chapter film stage, responsive auth dialog/panels, public auth route orchestration, deployment media-base plumbing, and browser smoke coverage. The implementation history is recorded in commits `c7f5c3c2`, `66ecd2ba`, `42d0fbe4`, `1aa92c78`, `3747dc6b`, `42d2c8a4`, `acf2b9fb`, `23e6bf22`, `1c04ece6`, `2c66dfaa`, `f9cd98a3`, `9c548305`, `f02b7ec0`, `2fe3d117`, `2f115da8`, `54449d63`, `a638e87c`, `adc85255`, and `81b18e4d`.
- the public media contract is versioned at `landing-film-v1`; `npm run landing-films:dry-run` completed with `status: "dry_run"`, `jobCount: 24`, and route key `video.pixelhub.gemini-omni-flash`. The dry-run does not create provider tasks or publish media.
- focused cinematic coverage passed with `9` test files and `57` tests: landing manifest, playback policy, film stage, auth dialog/navigation/pages, public routes, Gemini film pipeline, and smoke contract. `npm run test:smoke-cinematic-auth-home` also passed (`2` tests).
- `npm run build` passed. `npm run smoke:cinematic-auth-home` passed against its local media fixture at desktop `1440x900` and mobile `390x844`, including four dynamic chapters, reduced-motion poster fallback, one-active-video playback/preload behavior, nonblank screenshot pixel checks, auth dialog focus/dismissal, registration, and password-reset routes. This verifies the runtime/browser flow only; it is not real published-media QA.
- the complete root suite was attempted as `npm test -- --exclude '.worktrees/**'`, but did not complete within the 363-second command limit and then emitted reporter `EPIPE`. The option was accepted, yet Vitest still discovered existing `.codex-tmp` and `output/reference` tests; this result is not counted as passing. Existing React `act(...)`, Lexical `flushSync`, Three.js, and jsdom `scrollBy` warnings were also emitted before timeout.
- live Gemini generation, encoding, immutable S3 publication, and real public-media browser QA remain pending. In this validation environment `LANDING_FILM_TENANT_ID`, `LANDING_MEDIA_PUBLIC_BASE_URL`, and `VITE_LANDING_MEDIA_BASE_URL` were unset, while `ffmpeg` and `ffprobe` were unavailable. No media masters, posters, object-store records, or CDN URLs were created or claimed.

## 2026-08-11 - Gemini Landing-Film Pilot Generation

- the landing-film generator now supports a fully qualified `--include=<chapter>/<variant>/<desktop|mobile>` filter, allowing one paid pilot asset to be generated without also creating the alternate viewport output.
- using the explicitly selected system-scoped `video.pixelhub.gemini-omni-flash` route, generated and downloaded one local 16:9, 8-second, 1080P `imagination/variant-a/desktop` master. The master remains in the ignored local generation directory and has not been transcoded, uploaded, published, or wired into the landing page.
- validation passed: the landing-film pipeline suite (`14` tests) and a one-job dry run. The downloaded file is 2,081,556 bytes and identifies as an MP4 through its `ftyp` file header. `ffprobe` is still unavailable on this host, so codec, duration, and audio-stream verification remain pending before publication.

## 2026-08-11 - Gemini Pilot Wired Into The Homepage

- pinned the first `imagination` chapter to the reviewed `variant-a` asset, so the homepage no longer randomly selects an ungenerated variant before the full film batch is ready.
- added the Gemini pilot MP4 and a neutral WebP reduced-motion/loading poster under the default Vite public landing-film path. The generated master remains excluded from `.codex-tmp`; only the runtime delivery copy is versioned with the homepage.
- validation passed: `FilmStage` regression coverage (`10` tests) and `npm run build`. The production `dist` output contains the expected video (2,081,556 bytes) and poster (9,338 bytes). Full CDN publication and the remaining chapter/mobile assets are still pending the approved batch pipeline.

## 2026-08-11 - Gemini Full Landing Film Set

- generated twelve successful Gemini Omni Flash desktop masters: three variants for each of `imagination`, `rewrite`, `form`, and `resolution`. The public Vite media tree now ships twelve matching `loop.mp4` files and twelve WebP fallback posters, totaling 25,737,835 bytes of video.
- repeated provider-side 9:16 tasks returned a terminal `failed` state without a usable failure detail. The landing stage therefore uses the approved desktop Gemini source for mobile as a deliberate `object-fit: cover` fallback, preventing missing-media failures while all visible homepage backgrounds remain Gemini-generated.
- added safe pipeline diagnostics: provider error category/status and asynchronous provider task IDs are retained in local CLI failure output without exposing credentials.
- validation passed: landing-film pipeline, landing stage, and smoke contract suites (`28` tests); `npm run build`; and `npm run smoke:cinematic-auth-home`, covering four chapters at desktop/mobile, nonblank media pixels, playback behavior, reduced-motion posters, auth dialog interaction, and overlap checks. Existing Browserslist, CSS `task`, mixed-import, and chunk-size warnings remain non-blocking.
## 2026-08-11 - Asset Library Media Pagination

- corrected the asset library request flow so image, video, and audio tabs send their media `kind` to `/api/v2/assets`; list totals and page contents now describe the same media result set.
- added server-backed numbered pagination at 30 assets per page, with compact previous/next controls, boundary disabled states, current-page semantics, and bounded page-number rendering for large libraries.
- changing media tab, search query, folder, or favorite state now returns to page 1; stale page results remain protected by the existing request sequence guard and cache entries are scoped by media tab and page.
- validation passed: `npm test -- src/assets/useAssetLibrary.test.tsx src/assets/AssetLibraryPage.test.tsx` (26 tests) and `npm run build`. Full `npm test` completed with two unrelated failures in `src/flowCanvas/video/VideoReferenceStrip.test.tsx`: its two Veo frame-removal tests expect numbered input labels while the rendered controls currently expose `undefined`; this pagination branch does not modify that component or test.

## 2026-08-11 - Chinese Auth Experience

- translated all user-facing authentication UI to Chinese across the login, registration, email-verification, and password-recovery flows, including dialog titles, labels, actions, progress states, and local fallback messages.
- retained the TapFlow brand name, email addresses, auth routes, client calls, and server-provided error messages unchanged.

## 2026-08-11 - Video Upstream Text Preflight

- video generation preflight now accepts a non-empty connected text node as a valid prompt source, including mixed text-and-image input flows, without copying text into the video's local prompt field.
- empty local and connected text remains blocked before workflow submission; the worker regression confirms that upstream-only text becomes the provider prompt exactly once.
- validation passed: video capability, composer, FlowNodes integration, input projection, and worker runtime regression suites; `npm run build` also passed. Local authenticated canvas end-to-end verification was not run because no frontend (`5188`) or API (`3366`) service was listening in this environment.
- the root `npm test -- --exclude ".worktrees/**" --exclude ".codex-tmp/**" --exclude "output/**"` exited `1` after 252 seconds in unrelated suites: `packages/ai-gateway-core/test/runtime.test.ts` multipart image-edit expectations and existing `src/flowCanvas/video/VideoReferenceStrip.test.tsx` input-label expectations. These files are outside this branch's diff; the focused video prompt regressions remain passing.

## 2026-08-11 - Video Static Text Runtime Prompt Recovery

- fixed the worker upstream-output merge so an empty prior runtime output no longer suppresses the connected text node's persisted static text. Video requests now receive that text as their prompt when the video's local editor is empty.
- non-empty runtime output remains authoritative, while static node configuration fills only missing fields. Whitespace-only static text remains invalid and does not create a prompt.
- validation passed: worker runtime suite (`31` passed, `17` skipped) and `npm run build`.

## 2026-08-12 - Authenticated Home Workspace Overview

- replaced the `/home` AI marketing hero with the approved workspace-overview direction while keeping the existing `WorkspaceShell` logo, navigation items, notifications, monitoring, billing balance, and account controls unchanged.
- the homepage now uses real workspace project data for the latest project and recent projects, creates a real project through the existing v2 project/flow path, and links secondary actions to the existing prompt plaza, asset library, and workspace project manager.
- added explicit loading, empty-project, project-load error, and server-persistence status surfaces; removed the non-functional voice, send, AI capability, and capability-preview controls.
- validation passed: `HomePage` and unchanged `WorkspaceShell` focused suites (`12` tests) and `npm run build`; existing `WorkspaceShell` test-harness `act(...)`, CSS, mixed-import, Browserslist, and chunk-size warnings remain non-blocking.

## 2026-08-12 - Durable Canvas Image Uploads

- new local image uploads initiated from a project canvas now create durable `/api/v2/assets` records backed by the configured S3-compatible object storage. Canvas graph data stores the resulting `assetId` and `assetIds`, with signed asset previews treated only as recoverable UI data.
- standalone `/workbench` reference-image uploads remain temporary seven-day `workbench_reference_uploads.bytes` (`bytea`) records. The temporary reference-upload helper and workbench APIs were intentionally not changed.
- existing saved canvas drafts containing `referenceUploadId` were deliberately not migrated or rewritten.
- validation passed: `npx vitest --run src/flowCanvas/utils/localImageUpload.test.ts src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx` (`2` files, `13` tests) and `npm run build`. Build emitted existing Browserslist, mixed-import, and chunk-size warnings only.

## 2026-08-12 - Aittco Auth Drawer And Legal Consent

- replaced the centered login dialog with a cinematic right-side desktop drawer and a mobile bottom sheet; the silent landing film remains visible, slows while authentication is open, and the chapter rail no longer competes with the panel.
- login and registration now require the current Aittco User Agreement and Privacy Policy versions. The API records immutable, idempotent user-level consent rows for registration and password-verified login flows, including device-verification challenges.
- added public `/legal/terms` and `/legal/privacy` pages sourced from the API, plus an opt-in remembered-email preference that stores only a normalized email address and never a password, verification code, or token.
- added migration `000066_user_legal_consents.sql`, API legal endpoints, focused frontend/API/database coverage, and cinematic browser acceptance checks for the drawer, consent links, and remembered-email boundary.
- production publication remains gated on operator/legal review of both Aittco legal drafts and a real approved `LEGAL_CONTACT_URL` in `/opt/aittco/env/tapflow.staging.env`; run migration `000066` with the worker stopped before rolling out API/frontend images.
