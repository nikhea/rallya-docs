# Conversation History (Restore on Demand)

Status: implemented (`feat/anony-visitor-25-thread-history`; supersedes the
auto-restore variant in `feat/anony-visitor-24-restore-last-chat`).
See also `plan/ai-assistan.md`, `plan/anony_vistor.md`, `plan/feedback.md`.

## Goal

A reload should not trap the user in a stale-looking chat. New page = fresh
thread; previous conversations live behind **History** and are restored on
demand (selected from the modal).

## Decisions (updated 2026-11-06)

| Decision | Choice |
| --- | --- |
| Reload behavior | Fresh empty thread on every page load (no auto-restore) |
| History access | Modal History view lists the visitor's threads (Mastra `listMemoryThreads({ resourceId })`), grouped by day, searchable |
| Selecting a thread | Re-mount the runtime with Mastra's `thread.id` + messages from `/api/docs-memory`; replies continue that thread |
| New Thread (+) | Always available; remounts an empty runtime; Mastra thread created lazily on first message |
| Proxy shape | `GET /api/docs-memory?visitorId=…` → `{ threads: [...] }`; `…&threadId=…` → `{ thread, messages }`; thread mode verifies `resourceId == visitorId` (no cross-visitor reads) |
| Invalidation | `thread.runEnd` invalidates the history query (React Query), so new threads appear in History automatically |
| Client transport | `useQuery(["docs-memory-thread", …])` for the selected thread; `useQuery(["docs-memory-threads", …])` for the list (5 s staleTime) |

Superseded: the "auto-restore most recent thread on reload" behavior from the
first version of this plan. (Old transport/format decisions below still apply
unchanged; only the restore trigger was replaced.)

| Decision | Choice |
| --- | --- |
| Scope | Restore/select any one of the visitor's threads on demand; nothing restores automatically on mount |
| Transport | Same-origin `GET /api/docs-memory?visitorId=…[&threadId=…]` proxy |
| Format | Server reshapes Mastra `format: 2` parts into AI SDK v7 UIMessage parts (`text`, `reasoning` → `state:"done"`, `tool-invocation` → `tool-<name>` + `output-available`); `step-start`, `data-om-*`, `signal` messages dropped |
| Client | `useQuery(["docs-memory-thread", …])` seeds `useChatRuntime({ id, messages })`; continuing the chat appends to the same Mastra thread |
| First visit / no thread / error | Falls back to the fresh empty chat; nothing crashes |
| Visitor identity | `visitorId` from localStorage (as established) |

## Verification (2026-11-06)

- [x] Live E2E against :3000 + agent: fresh thread created; restore returns the
      thread + messages with correctly reshaped parts
- [x] Second turn appended to the same thread; restore returns all turns in order
- [x] List mode returns the visitor's threads (5 real records seen, structured correctly)
- [x] Ownership check: message mode refuses threads whose resourceId ≠ visitorId
      (returns 404); invalid visitorIds → 400; unknown visitor → empty list
- [x] Proxy tested against the dev agent with zero requests to Mastra from the browser
- [x] `tsc --noEmit`, eslint — clean
- [ ] Visual confirmation in browser (History opens; selecting a thread restores it; + starts fresh)
