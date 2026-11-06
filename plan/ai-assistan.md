# AI Assistant for the Rallya Docs Site

Status: planned, not started. Do not implement until this plan is approved.
Branch: `feat/docs-ai-assistant`

## Goal

Add an "Ask AI" assistant to the Rallya documentation site (`rallya-docs`, Next.js 16 + Fumadocs + Tailwind v4) that answers questions from the official docs, backed by the existing Mastra docs agent (`docs-agent`).

## Decisions (already made)

| Decision | Choice |
| --- | --- |
| Backend endpoint | Existing public, unauthenticated `POST http://localhost:4111/docs-chat` (not `/chat/docs-agent`) |
| UI surface | Floating "Ask AI" button + panel on every `/docs` page (assistant-ui `assistant-modal` element) |
| Conversation persistence | Fresh session every visit (new `thread` + `resource` UUIDs per mount) |
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

"Fresh session every visit" means one Postgres thread row per page load on the Mastra side. One-line change later: scope the thread id to `sessionStorage` (one thread per tab session) instead of per mount. Implemented as specified for now.

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
- Generate `threadId` and `resourceId` once per mount: `useState(() => crypto.randomUUID())` (fresh session every visit — per this plan).
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

## Rollback

`git revert` the feature branch merge, or remove `<DocsAssistant />` from `app/docs/layout.tsx` and the modal button disappears; elements can stay unused without affecting the build.

## Verification of assumptions to re-check first, before Phase 2

- Mastra still listening on `:4111`; `/docs-chat` still reachable; CORS preflight still `POST` + `Content-Type`.
- No changes to `rallya-docs-agent` were made by this plan — the backend needs **no** modifications.
