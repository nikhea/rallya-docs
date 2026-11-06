# Thumbs Feedback for Docs Assistant Replies

Status: implemented (`feat/anony-visitor-11…18-feedback-*` stack, on top of the
`15-source-new-tab` stack). See also `plan/ai-assistan.md` and `plan/anony_vistor.md`.

## Goal

Let visitors rate every assistant reply (👍/👎) with an optional reason and
comment, and anchor the signal to the trace so it can be read next to spikes of
latency, errors, or low-quality answers in Mastra observability.

## Decisions

| Decision | Choice |
| --- | --- |
| Signal | `feedbackType: "thumbs"`, `value: 1` (👍) / `-1` (👎); `feedbackSource: "user"` |
| Anchor | Message's `traceId` — already rides on the stream's `start` part via `messageMetadata` on `POST /docs-chat`; surfaced to the client as `message.metadata.custom.traceId` |
| Where it's stored | Mastra observability feedback (DuckDB in dev), joined to the trace |
| Write path | Same-origin `POST /api/docs-feedback` Route Handler → `mastraClient.createFeedback` (server-held `DOCS_AGENT_ADMIN_TOKEN`); browser never calls Mastra directly |
| Eligibility check | Route fetches the trace and requires a docs-agent run (entityId/entityName `docs-agent`, or entityType `agent`); anything else → 403 |
| Client transport | `adapters.feedback` on `useChatRuntime` → assistant-ui `submitFeedback`; send is fire-and-forget via React Query `useMutation` (retry 1) |
| 👍 UX | One click, no comment |
| 👎 UX | Opens an inline panel below the action bar: reason pills (multi-select) + comment textarea (optional, 1000 chars cap); submitted as one `submitFeedback({ type: "negative", comment })` |
| `feedbackUserId` | Anonymous visitor id from localStorage (analytics grouping only) |

## Why the traceId check server-side

`traceId` comes from the client, so the proxy does "does this trace belong to
us?" before writing: `GET /api/observability/traces/:traceId` must be a
docs-agent run, otherwise 403/404. `contextMode` is intentionally omitted —
the OSS server defaults to `"provided"`, i.e. the context fields are asserted
by this server and the client cannot inflate scope.

## Flow

```
👎 click → panel (reasons + comment) → submit
  → aui.message.submitFeedback({ type: "negative", comment })
    → adapters.feedback.submit
      → fetch POST /api/docs-feedback { traceId, type, comment, visitorId }
        → validate → getTrace → docs-agent check → createFeedback({ feedbackType: "thumbs", … })
👍 click → immediate submitFeedback({ type: "positive" }) → same path, no comment
```

## Verification (2026-11-06)

- [x] `npx tsc --noEmit` clean
- [x] `npm run lint` — 0 errors
- [x] Live E2E: question asked; `POST /api/docs-feedback` from the wire path with
      `type: "negative"` + comment → record visible via
      `GET /api/observability/feedback?traceId=…` with `value: -1`,
      `entityId: docs-agent`, `feedbackType: thumbs`, comment stored,
      `feedbackUserId` = visitor id, `threadId`/`resourceId` attached from the trace
- [x] Positive feedback recorded too; eligibility gate verified by inspection
      (docs-agent trace accepted; any other entity → 403)
- [x] Failure drills: invalid traceId → 400 `invalid_trace_id` / `invalid_json`; unknown
      well-formed traceId → 404 `trace_not_found`; invalid type → 400 `invalid_type`;
      agent down → 502 `mastra_unreachable`; chat unaffected in all cases
- [x] Verification trace deleted (`POST /api/observability/traces/delete`) — its two
      feedback records cascade; memory thread deleted via
      `DELETE /api/memory/threads/<id>?agentId=docs-agent`
