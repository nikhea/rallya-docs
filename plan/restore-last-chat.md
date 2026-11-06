# Restore Most Recent Conversation on Reload

Status: implemented (`feat/anony-visitor-24-restore-last-chat`).
See also `plan/ai-assistan.md`, `plan/anony_vistor.md`, `plan/feedback.md`.

## Goal

A page reload should not wipe the panel. The most recent Mastra memory thread
for the anonymous visitor is re-opened with its full history; new messages
continue that thread.

## Decisions

| Decision | Choice |
| --- | --- |
| Scope | Restore the single most recent thread only; older conversations stay unlisted for now (full RemoteThreadListRuntime is the documented upgrade path) |
| Transport | Same-origin `GET /api/docs-memory?visitorId=…` proxy; Mastra remains the source of truth; browser cannot call `/api/memory/*` under SimpleAuth |
| Format | Server reshapes Mastra `format: 2` parts into AI SDK v7 UIMessage parts (`text`, `reasoning` → `state:"done"`, `tool-invocation` → `tool-<name>` + `output-available`); `step-start`, `data-om-*`, `signal` messages dropped |
| Client | `useQuery(["docs-memory-latest", visitorId], staleTime: Infinity)` → seed `useChatRuntime({ id, messages })`; continuing the chat appends to the same Mastra thread |
| First visit / no thread / error | Falls back to the fresh empty chat; nothing crashes |
| Visitor identity | `visitorId` from localStorage (as established); optional reason to also scope history per browser |

## Verification (2026-11-06)

- [x] Live E2E against :3000 + agent: fresh thread created; `GET /api/docs-memory`
      returns the thread + 2 messages with correctly reshaped parts
      (`reasoning`, `tool-knowledge_read` → `tool-knowledge_read` output-available)
- [x] Second turn appended to the same thread; restore returns 4 messages, order intact
- [x] Edge cases: invalid/missing/encoded visitorIds → 400; unknown visitor → `{thread:null}` 200;
      legacy `docs-visitor` threads restore without error
- [x] Verification thread deleted from Postgres afterwards
- [x] `tsc --noEmit`, eslint — clean
- [ ] Visual confirmation in browser (reload panel → history visible; send a follow-up → same thread continues)
