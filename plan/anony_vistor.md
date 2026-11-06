# Anonymous Visitor Attribution for the Docs Assistant

Status: approved, implemented via the `feat/anony-visitor-*` branch stack.
Base branch: `feat/docs-ai-assistant` (stacked; `main` untouched).
See also `plan/ai-assistan.md` (original assistant plan) and `README.md` → Ask AI.

## Goal

Know where anonymous, unauthenticated docs queries come from — repeat
browsers, tab sessions, referring pages, UTM campaigns, device — and store it
on each Mastra memory thread as **metadata**. No sign-in, no new table, no
public write surface on the agent.

## Decisions (locked 2026-11-06)

| Decision | Choice |
| --- | --- |
| Visitor identity | UUID in `localStorage` (`docs_visitor_id`), long-lived |
| Mastra `resourceId` | The visitorId (per-visitor resource; threads listable per visitor) |
| Session grouping | UUID in `sessionStorage` (`docs_session_id`), per tab |
| Write path | **Option B** — browser → same-origin Next Route Handler → Mastra `/api/memory/threads/:id` with a server-held admin token; visitor IP captured by the Next route |
| Store | Thread metadata only; no `anonymous_visitors` table |
| Agent (`rallya-docs-agent`) | **No code changes** (env note only) |
| Attribution fields | visitorId, sessionId, page, origin, referrer, firstReferrer, utmSource/Medium/Campaign, userAgent, ip (server-set), firstSeenAt, lastSeenAt |
| Client data layer | TanStack React Query (`useMutation` on `thread.runEnd`) |

### Why Option B over the alternatives

- **Inline metadata in `/docs-chat` body** — the agent would merge thread
  metadata at creation time for free, but there is no clean way to add the
  **IP server-side** (Hono middleware cannot safely rewrite the already-parsed
  JSON body), and React Query would have nothing to manage.
- **Public `/docs-visitor-meta` route on the agent** — viable, but adds a new
  public write surface (strict allowlist validation + rate limiting required)
  and forces internal memory APIs. Rejected in favour of the documented
  `@mastra/client-js` → `/api/memory/*` contract.
- **Option B (chosen)** — same-origin (no CORS/preflight), works while the
  agent enforces SimpleAuth on `/api/*`, token never ships to the browser,
  React Query manages the mutation honestly (retry, non-blocking failure).

## Flow

```
Browser: ask question
  prepareSendMessagesRequest → memory: { thread: options.id, resource: getOrCreateVisitorId() }
  → POST /docs-chat   (agent creates thread on first message; unchanged)
Run ends → useAuiEvent("thread.runEnd", ({ threadId }) => ...)
  → useMutation → POST /api/docs-visitor-meta   (same-origin, retry: 2, non-blocking)
Route Handler:
  validate body  { threadId (≤128 chars), metadata (allowlisted scalar keys, length caps) }
  read IP        cf-connecting-ip → x-forwarded-for (first) → x-real-ip
  MastraClient({ baseUrl: DOCS_AGENT_INTERNAL_URL, headers: Bearer DOCS_AGENT_ADMIN_TOKEN })
    getMemoryThread({ threadId, agentId: "docs-agent" }).get()
    merge existing metadata (preserve firstSeenAt/firstReferrer; bump lastSeenAt)
    thread.update({ metadata })
  404 → JSON error (client retries, then warns; chat unaffected)
```

## Metadata schema

Shallow scalars only (Mastra metadata filter rules). Keys alphanumeric/underscore-ish,
≤128 chars, all strings:

```
visitorId  sessionId  page  origin  referrer  firstReferrer
utmSource  utmMedium  utmCampaign  userAgent  ip
firstSeenAt  lastSeenAt            (ISO 8601)
```

`firstSeenAt` / `firstReferrer` are write-once (preserved across updates);
`lastSeenAt` and `page`/`referrer`/UTMs are last-write-wins.

## Subtasks (one branch + one commit each, stacked on feat/docs-ai-assistant)

| # | Branch | Deliverable |
| --- | --- | --- |
| 1 | `feat/anony-visitor-01-plan` | This file |
| 2 | `feat/anony-visitor-02-deps` | `bun add @tanstack/react-query @mastra/client-js` (lockfile + package.json) |
| 3 | `feat/anony-visitor-03-providers` | `app/providers.tsx` QueryClientProvider; mounted in root layout |
| 4 | `feat/anony-visitor-04-visitor-lib` | `lib/visitor.ts` — id/session/UTM helpers + `buildThreadMetadata()` allowlist |
| 5 | `feat/anony-visitor-05-meta-route` | `app/api/docs-visitor-meta/route.ts` — validation, IP capture, read-merge-write merge |
| 6 | `feat/anony-visitor-06-thread-meta-sync` | `app/docs/thread-meta-sync.tsx` — `thread.runEnd` → mutation (retry: 2, silent warn) |
| 7 | `feat/anony-visitor-07-assistant` | `docs-assistant.tsx`: resource = visitorId; mount sync; drop `NEXT_PUBLIC_DOCS_RESOURCE_ID` |
| 8 | `feat/anony-visitor-08-env` | `.env.example`: `DOCS_AGENT_INTERNAL_URL`, `DOCS_AGENT_ADMIN_TOKEN`; drop `NEXT_PUBLIC_DOCS_RESOURCE_ID` (`.env.local` updated locally, gitignored) |
| 9 | `feat/anony-visitor-09-docs` | README Ask AI section rewrite; this flow + env table + privacy note |
| 10 | `feat/anony-visitor-10-verify` | `tsc --noEmit`, lint, build/E2E checks + fixes; verification results appended here |

## Environment

| Var | Scope | Notes |
| --- | --- | --- |
| `DOCS_AGENT_INTERNAL_URL` | server-only | Mastra origin; default `http://localhost:4111` |
| `DOCS_AGENT_ADMIN_TOKEN` | server-only | Bearer for `/api/memory/*`; required in prod when agent SimpleAuth is on; optional in dev |

Removed: `NEXT_PUBLIC_DOCS_RESOURCE_ID` (shared `docs-visitor` resource abandoned;
threads created before the change keep it).

## Explicitly out of scope

`anonymous_visitors` Postgres table; cookies over localStorage; agent middleware or
custom public routes; CORS changes; per-visitor analytics dashboards/rollups; feedback
(`traceId`) wiring; thread history UI.

## Trade-offs / notes

- Metadata write is **best-effort**, not transactional with the run; failures never
  block streaming chat (warn in console after retries).
- Clearing localStorage = new anonymous identity (by design).
- IP trust depends on the proxy setting `cf-connecting-ip` / `x-forwarded-for`
  correctly (Vercel/Cloudflare do); behind neither, `ip` may be absent or spoofable —
  treat as a signal, never as identity or for security decisions.
- Read-merge-write is non-atomic; acceptable for analytics (last-write-wins `lastSeenAt`).
- Resource cardinality: one Mastra resource per visitor; fine for storage and for
  `listMemoryThreads({ resourceId })` per-visitor views.
- Pre-existing threads keep resource `docs-visitor`; only new threads use the visitorId.
- `bun.lock` is the committed JS lockfile (project uses bun); `package-lock.json` is stale
  and left untouched pending maintainer decision.

## Verification (filled in by subtask 10)

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Dev E2E: question asked; thread metadata shows all fields incl. `ip`; resource = visitorId
- [ ] Second message: `firstSeenAt` preserved, `lastSeenAt` bumped, no metadata clobber
- [ ] New tab: same visitorId, new sessionId
- [ ] Agent with SimpleAuth tokens set: proxy succeeds, direct browser → `/api/memory/*` gets 401
- [ ] Failure drill: agent stopped → chat still streams, warning logged, no crash
