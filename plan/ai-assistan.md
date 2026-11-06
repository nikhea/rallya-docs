# AI Assistant for the Rallya Docs Site

Status: implemented and verified (Phases 1–8), committed per phase on `feat/docs-ai-assistant`. See Phase 8 for production notes.
Branch: `feat/docs-ai-assistant`

## Goal

Add an "Ask AI" assistant to the Rallya documentation site (`rallya-docs`, Next.js 16 + Fumadocs + Tailwind v4) that answers questions from the official docs, backed by the existing Mastra docs agent (`docs-agent`).

## Decisions (already made)

| Decision | Choice |
| --- | --- |
| Backend endpoint | Existing public, unauthenticated `POST http://localhost:4111/docs-chat` (not `/chat/docs-agent`) |
| UI surface | Floating "Ask AI" button + panel on every `/docs` page (assistant-ui `assistant-modal` element) |
| Conversation persistence | Fresh thread every visit; static shared `resource` id from env (`NEXT_PUBLIC_DOCS_RESOURCE_ID`) |
| Styling | assistant-ui CLI-copied elements, adapted to the fumadocs palette via a CSS token bridge |
| Protocol | AI SDK v7 UI-message SSE, consumed directly by `useChatRuntime` + `AssistantChatTransport` |

## Backend contract (verified live, 2026-11-06)

- `POST http://localhost:4111/docs-chat`
  - Built on `chatRoute()` from `@mastra/ai-sdk` with `version: "v7"`, hardwired to agent `docs-agent` (id, not registry key).
  - Public: no auth required by design (`requiresAuth: false`).
  - `/chat/docs-agent` does **not** exist — it returns the Mastra Studio HTML shell.
- **Required request body field**: `memory: { thread, resource }`. Without it the run fails with `OBSERVATIONAL_MEMORY_THREAD_ID_REQUIRED` (verified). With it the agent streams a correct, cited answer (verified).
- **CORS**: route-level, `access-control-allow-origin: *` in dev; restricted by `DOCS_CHAT_CORS_ORIGINS` on the Mastra server in production. Preflight allows `POST` + `Content-Type` only.
- **Stream**: `data:` SSE frames. Includes `data-signal` / `data-om-status` parts — passed through by assistant-ui, render as nothing. A `traceId` rides on the `start` part via `messageMetadata` (currently unused; reserved for feedback wiring later).
- **Memory**: threads are persisted in Postgres via Mastra Memory. A fresh thread id is created on demand per request if it doesn't exist.
- **Human-in-the-loop**: none — the public route exposes no destructive tools, so `sendAutomaticallyWhen` / approval handling is out of scope.
- **Reasoning**: not streamed (`sendReasoning` not enabled).

## Why not `useLocalRuntime` / `useExternalStoreRuntime`

Mastra already emits the exact protocol assistant-ui consumes (AI SDK v7 UI messages over SSE). `useLocalRuntime` and `useExternalStoreRuntime` are for backends that do not speak a supported protocol and would add a needless adapter layer. `useChatRuntime` from `@assistant-ui/ai-sdk` is the correct choice, and it is what the Mastra integration guide describes. No Next.js API route is needed; the browser calls Mastra directly (same pattern as `rallya-web`).

## Scope

In scope: floating ask-AI panel on `/docs/**`, anonymous Q&A, streamed answers, tool-call rendering via the default `ToolFallback`, env-driven endpoint URL.

Out of scope (future): thread list / history UI (`useRemoteThreadListRuntime` + Mastra `/api/memory/threads`), authenticated chat, per-page context pinning, feedback (up/down) via `traceId`, production `DOCS_CHAT_CORS_ORIGINS` (documented, not set here), anonymous thread cleanup in Postgres.

## Known trade-off

"Fresh session every visit" means one Postgres thread row per runtime thread (page load, or "New Thread" in the modal) on the Mastra side. One-line change later: scope the thread id to `sessionStorage` (one thread per tab session) instead of per mount. Implemented as specified for now.

## Environment

- `NEXT_PUBLIC_DOCS_CHAT_URL=http://localhost:4111/docs-chat` in `.env.local` and `.env.example`.
- Production: set `NEXT_PUBLIC_DOCS_CHAT_URL` in the deploy env; set `DOCS_CHAT_CORS_ORIGINS=https://<docs-domain>` on the Mastra server.

---

## Phase 1 — Branch & prerequisites audit

- Branch `feat/docs-ai-assistant` (done before this file was committed).
- Read `node_modules/next/dist/docs` where relevant (Next 16 breaking changes); confirm no config change is needed for a client component under a server layout.
- Confirm the Mastra endpoint contract again before coding: `POST /docs-chat` with `memory: { thread, resource }` returns a v7 stream; missing `memory` returns the `OBSERVATIONAL_MEMORY_THREAD_ID_REQUIRED` error.
- Confirm the docs site builds/devs cleanly on `:3000` before adding anything.
- Deliverable: notes in this file if anything differs from the verified contract.

### Phase 1 verification (2026-11-06)

- Next 16 `use client` doc read: client components may be nested inside Server Components; props must be serializable (`<DocsAssistant />` takes none); no config change required.
- Docs site does not run on `:3000` yet (nothing listening); will boot for Phase 6 verification.
- `POST /docs-chat` with `memory: { thread: "phase1-verify-<ts>", resource: "docs-visitor" }` → v7 stream opened with `traceId` (see 2026-11-06 probe). Throwaway thread deleted afterwards (`DELETE /api/memory/threads/<id>?agentId=docs-agent` → `200`).
- Missing-`memory` failure mode and CORS preflight (`POST` + `Content-Type`, `access-control-allow-origin: *`) re-confirmed on 2026-11-06.
- Backend needs **no** modifications for this feature.
- `.env.example` + `.env.local` now carry `NEXT_PUBLIC_DOCS_CHAT_URL` and `NEXT_PUBLIC_DOCS_RESOURCE_ID` (`docs-visitor`).

## Phase 2 — Scaffolding & dependencies

- Add a minimal `components.json` (Tailwind v4, aliases `@/components`, `@/lib/utils`, Base UI flavor as the CLI default) so `assistant-ui add` resolves paths.
- Add `lib/utils.ts` exporting `cn()` (`clsx` + `tailwind-merge`). Ensure `@/lib/utils` resolves via the existing `@/*` path alias.
- `npm install @assistant-ui/react @assistant-ui/ai-sdk ai clsx tailwind-merge`
- Verify `npm ls @assistant-ui/react @assistant-ui/ai-sdk ai`.
- Deliverable: clean install, no peer warnings that block build.

## Phase 3 — CSS token bridge (`app/globals.css`)

- Define shadcn-compatible tokens (`--color-background`, `--color-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-card`, `--color-card-foreground`, `--color-border`, `--color-input`, `--color-ring`, `--color-accent`, `--color-accent-foreground`, `--radius-*`) mapped onto fumadocs' `neutral` palette variables (inspect `node_modules/fumadocs-ui/css/neutral.css` for the exact source values).
- Keep fumadocs' own tokens untouched; scope the bridge under `@theme inline` / a single wrapper so docs styling is unaffected.
- Deliverable: utilities like `bg-background text-foreground border-border` resolve; dark mode still correct.

## Phase 4 — Install & adapt assistant-ui elements

- `npx assistant-ui@latest add assistant-modal` (pulls `thread`, `markdown-text`, `tool-fallback`, `reasoning`, `sources`, etc. and npm deps such as `tw-shimmer`; Base UI flavor).
- Adapt the copied `components/assistant-ui/elements/thread.aui.tsx`:
  - Welcome copy → docs-assistant wording ("Ask about the Rallya docs…").
  - Composer placeholder → "Ask about the docs…".
  - Keep `ToolFallback` default so `knowledge_search` / `knowledge_read` render ("Called knowledge_search…") — this is intentional transparency for sourced answers.
  - Change container/surface classes only if the token bridge is insufficient; prefer editing the copied file over globals.
- Confirm `assistant-modal.aui.tsx` renders bottom-right and auto-expands on `thread.runStart` (default behaviour; keep).
- Deliverable: elements compile; no missing-module errors; `@/components/assistant-ui/elements/assistant-modal.aui` importable.

## Phase 5 — `DocsAssistant` client component

- New file `app/docs/docs-assistant.tsx`, `"use client"`.
- Threading: the runtime owns an in-memory thread list, so `memory.thread` is the runtime thread id (`options.id` in `prepareSendMessagesRequest`). Every page load starts a fresh thread (fresh session every visit); the modal's "New Thread" likewise creates a fresh Mastra memory thread.
- `resourceId` comes from `process.env.NEXT_PUBLIC_DOCS_RESOURCE_ID` (static, shared, e.g. `docs-visitor`) — set in both `.env.local` and `.env.example`.
- `useChatRuntime({ transport: new AssistantChatTransport({ api: process.env.NEXT_PUBLIC_DOCS_CHAT_URL ?? "http://localhost:4111/docs-chat", prepareSendMessagesRequest }) })`
  - `prepareSendMessagesRequest`: return a body mirroring the default (`...options.body`, `id`, `messages`, `trigger`, `messageId`, `metadata`) **plus** `memory: { thread: threadId, resource: resourceId }`. Omitting `messages` breaks the stream ("Messages must be an array of UIMessage objects").
  - `fetch`: default is fine (no credentials).
- Render `<AssistantRuntimeProvider runtime={runtime}><AssistantModal /></AssistantRuntimeProvider>`.
- Hoist any `components` override objects to module scope (no inline objects → no remounts).
- Deliverable: component renders with no provider/runtime errors.

## Phase 6 — Wire into the docs layout & env

- `app/docs/layout.tsx`: render `<DocsAssistant />` alongside `{children}` (server layout stays server; the client island is fine).
- Ensure the modal only mounts on `/docs/**`, not on `/studio` or `/llms.txt`.
- `.env.local`: add `NEXT_PUBLIC_DOCS_CHAT_URL=http://localhost:4111/docs-chat`.
- `.env.example`: add the same with a comment (public, unauthenticated endpoint; set to the deployed Mastra origin in prod).
- Deliverable: `npm run dev` on :3000 → `/docs` shows the floating button; `/studio` does not.

## Phase 7 — Verification

- `npx tsc --noEmit`
- `npm run lint`
- Manual E2E in browser:
  1. Open `/docs/quickstart` (or any page).
  2. Click "Ask AI"; ask "How do I create an API key?".
  3. Confirm streamed answer with markdown, tool-call fallback cards, citations/links to docs pages.
  4. Confirm no CORS errors, no console errors, no hydration warnings.
  5. Reload → previous answer is gone (fresh session per visit) — confirms the intended behaviour.
- Confirm network request body contains `memory: { thread, resource }`.
- Deliverable: checklist in the PR description with results; screenshots optional.

## Phase 8 — Production notes & handoff

- Document in `.env.example` / `README.md`: `NEXT_PUBLIC_DOCS_CHAT_URL`, and that the Mastra server should set `DOCS_CHAT_CORS_ORIGINS` to the docs origin in production (currently `*`).
- Note the Postgres thread-growth trade-off and the `sessionStorage` one-liner alternative (see above).
- Note that Mastra runs separately on `:4111`; the docs deploy must point `NEXT_PUBLIC_DOCS_CHAT_URL` at the deployed agent (e.g. `https://<agent-host>/docs-chat`).
- Deferred items list (thread history, feedback via `traceId`, anonymous thread cleanup, per-page context).
- Deliverable: updated docs + PR ready to review; no implementation in this phase beyond notes.

### Phase 8 done (2026-11-06)

- `README.md` gained an "Ask AI assistant" section: architecture (browser → public `POST /docs-chat`), env var table, CORS requirement (`DOCS_CHAT_CORS_ORIGINS`, defaults to `*` in dev), fresh-session threading model, and the thread-growth trade-off with the `sessionStorage` alternative.
- `.env.example` documents both `NEXT_PUBLIC_DOCS_CHAT_URL` and `NEXT_PUBLIC_DOCS_RESOURCE_ID` with a production pointer.
- Verified on branch: typecheck, lint (0 errors), headless-Chrome E2E against the live agent (`/docs-chat` 200, correct cited answer, fresh session after reload, no CORS/page errors). All Phase 1–8 criteria met.
- None of the deferred items (thread history, feedback, anonymous thread cleanup, per-page context) were started.

## Rollback

`git revert` the feature branch merge, or remove `<DocsAssistant />` from `app/docs/layout.tsx` and the modal button disappears; elements can stay unused without affecting the build.

## Verification of assumptions to re-check first, before Phase 2

- Mastra still listening on `:4111`; `/docs-chat` still reachable; CORS preflight still `POST` + `Content-Type`.
- No changes to `rallya-docs-agent` were made by this plan — the backend needs **no** modifications.
