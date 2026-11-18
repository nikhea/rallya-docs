# Rallya Docs

Documentation site for the [Rallya](https://github.com/nikhea/rallya) event
platform — guides for organizers, door staff, and developers. Built with
[Next.js](https://nextjs.org) + [Fumadocs](https://fumadocs.dev); content is
managed in [Sanity CMS](https://www.sanity.io).

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in the Sanity credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — `/` redirects to `/docs`.

| Script                    | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| `npm run dev`             | Start the dev server                           |
| `npm run build`           | Production build                               |
| `npm run start`           | Serve the production build                     |
| `npm run lint`            | Run ESLint                                     |
| `npm run sync:docs`      | Validate and push `content/docs` into Sanity |

## Ask AI assistant

Every `/docs` page shows a floating **Ask AI** button (bottom-right) that opens a
chat panel backed by the [Rallya docs agent](https://github.com/nikhea/rallya)
(Mastra, `docs-agent`). Answers are grounded in the official docs and include
citations; the underlying tool calls (`knowledge_search` / `knowledge_read`) are
visible in the panel.

How it fits together:

- The browser calls the agent's **public, unauthenticated** endpoint directly —
  `POST /docs-chat` (AI SDK v7 UI-message SSE). No Next.js API route proxies the
  chat stream, and the agent must be reachable from the browser (not just from
  the server).
- `app/docs/docs-assistant.tsx` wires `useChatRuntime` (`@assistant-ui/ai-sdk`) to
  an `AssistantChatTransport` pointing at `NEXT_PUBLIC_DOCS_CHAT_URL`.
- Conversations **do not** auto-restore on reload: every page load starts a
  fresh thread (as on first visit). Previous conversations for your visitor are
  listed under **History** (titles from Mastra, grouped by day) — opening one
  restores it and subsequent replies continue that thread. History is scoped by
  your anonymous visitor id (`resourceId` = `docs_visitor_id`); threads created
  before the visitor-id switch live under the shared `docs-visitor` resource and
  are intentionally not shown.

### Anonymous visitor attribution

Every run that ends syncs a small, non-sensitive attribution payload onto the
Mastra memory thread as **metadata** (see `plan/anony_vistor.md`):

- **Identity**: a random UUID in `localStorage` (`docs_visitor_id`, long-lived)
  — also sent as `memory.resource`. A per-tab UUID in `sessionStorage`
  (`docs_session_id`) groups one browsing session.
- **Source**: `page` (path), `origin`, `referrer`, `firstReferrer`, and
  `utmSource` / `utmMedium` / `utmCampaign` (captured from the URL on first
  load, cached in `sessionStorage`).
- **Device/network**: `userAgent` (browser-reported) and `ip` — the IP is read
  **server-side** from `cf-connecting-ip` / `x-forwarded-for` by the
  same-origin route, never from client input; it is only as trustworthy as
  your proxy setting those headers (Vercel/Cloudflare do).
- **Bookkeeping**: `firstSeenAt` / `firstReferrer` are write-once;
  `lastSeenAt` and the rest are refreshed on every run end.

Flow: when a run ends, `ThreadMetaSync` (mounted inside the assistant runtime
provider) fires a `useMutation` (React Query, `retry: 2`, fire-and-forget) that
`POST`s `{ threadId, metadata }` to `/api/docs-visitor-meta`. That Next.js
Route Handler validates and sanitizes the payload (allowlisted keys, scalars
only, length caps), attaches the visitor IP, then upserts the merged metadata
onto the thread via Mastra's memory API (`/api/memory/threads/:id`) using a
**server-only** admin token. It never blocks chat: failures are retried, then
logged and dropped. Thread restore after a reload (`/api/docs-memory`) uses
the same same-origin proxy pattern and server-held token.

The Mastra server needs **no code changes** for this. Because `/api/*` is
token-protected when the agent has SimpleAuth configured, the browser cannot
call it directly — hence the same-origin proxy. The token lives only in the
docs deploy env (`DOCS_AGENT_ADMIN_TOKEN`); the agent itself is unchanged.

Environment variables (`.env.local` for dev, deploy env for prod):

| Var | Dev default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_DOCS_CHAT_URL` | `http://localhost:4111/docs-chat` | Mastra agent runs separately on `:4111`. In prod point at the deployed agent origin, e.g. `https://<agent-host>/docs-chat`. |
| `DOCS_AGENT_INTERNAL_URL` | `http://localhost:4111` | Server-only. Where `/api/docs-visitor-meta` reaches Mastra's memory API. In prod set to the internal agent origin. |
| `DOCS_AGENT_ADMIN_TOKEN` | _(unset)_ | Server-only. Bearer for `/api/memory/*`; must match the agent's `DOCS_AGENT_ADMIN_TOKEN`. Required when the agent has SimpleAuth configured; optional in dev. |

**Privacy:** no PII beyond what a browser normally exposes; `ip` and `userAgent`
are analytics signal, not identity, and are never used for security decisions.
Clearing site storage resets the anonymous identity. Data lives only on the
thread row in Postgres; inspect it via Studio or `listMemoryThreads({
resourceId })` per visitor.

### Feedback on answers

Every assistant reply has thumbs up/down actions (they reveal on the last
reply / on hover). 👍 sends immediately; 👎 opens an inline panel with reason
pills and a comment box (the comment is joined from the pills + note and capped
at 1000 chars). Both are recorded in Mastra observability as a `thumbs`
feedback record (`value` ±1) anchored to the message's `traceId` — the same
trace the run reports — with `feedbackSource: "user"` and `feedbackUserId` set
to the anonymous visitor id. The agent/entity on the record comes from the
traced docs-agent run.

The browser posts directly to the docs agent's public `POST /docs-feedback`
route (the same Mastra server as `/docs-chat`; override the URL with
`NEXT_PUBLIC_DOCS_FEEDBACK_URL` if needed). That route rehydrates the trace
from observability storage and writes through
`mastra.observability.addFeedback()`, so the record flows through the
observability event bus to Mastra Platform and shows up in Studio. The send is
fire-and-forget (React Query `useMutation`, retry 1): failures log a warning
and chat is unaffected. Feedback is also readable via
`GET /api/observability/feedback?traceId=…`.

The legacy same-origin `app/api/docs-feedback/route.ts` handler (which wrote
via `mastraClient.createFeedback` with a server-only token) is kept in the
repo but no longer called by the chat; the old fetch is commented out in
`docs-assistant.tsx` as a rollback path.

Restored conversations keep their feedback anchors too: Mastra's stored
messages do not retain the stream's `messageMetadata`, so `/api/docs-memory`
matches each assistant reply to its thread trace by run timestamp and attaches
`metadata.custom.traceId` before the client seeds the runtime. Replies whose
trace has aged out of observability retention stay unanchored, and their thumbs
submission is skipped.

The docs agent exposes public `POST /docs-chat` and `POST /docs-feedback`
routes, and its CORS must allow the docs origin for both. Dev defaults to `*`
via `DOCS_CHAT_CORS_ORIGINS`; set it to the docs origin in production (e.g.
`DOCS_CHAT_CORS_ORIGINS=https://<docs-domain>`).

Thread growth: Mastra Memory stores one thread per runtime thread the browser
creates, with no anonymous-thread cleanup. If that becomes a concern, scope the
thread id to `sessionStorage` (one thread per tab session) in
`docs-assistant.tsx`, or add a retention job on the agent side.

## Content management

The MDX files in `content/docs/` are the **source of truth**. Every push to
`main` runs `.github/workflows/docs-sync.yml`, which

1. validates frontmatter, slugs, sidebar icons and MDX compilation (`--check`),
2. syncs the pages and sections into Sanity (project **Rallya Docs**, org
   **rallya**, dataset `production`) as `docPage` / `docSection` documents,
3. deletes Sanity documents removed from the manifest, and
4. triggers the production deploy with a Vercel deploy hook.

Pushes to Sanity happen before the build, so the static pages and the `llms`
endpoints always render the content that was just merged.

```
edit content/docs/*.mdx → PR (--check) → merge to main → sync → deploy
```

The embedded studio is at [`/studio`](http://localhost:3000/studio).
`sanity/schema.ts` defines the schemas, `sanity/lib/` the client and GROQ
queries, and `lib/source.ts` feeds them into the Fumadocs loader (pages are
compiled from MDX at build time with the same plugin preset the old file-based
pipeline used).

### When are documents touched?

- Pages are keyed by filename: `content/docs/<slug>.mdx` → `docPage.<slug>`.
  Renaming the file creates a new document and deletes the old one, so the old
  URL 404s.
- Sidebar sections come from `---[Icon]Section---` entries in `meta.json`.
- The sync stamps every document it writes with `managedBy: "repo"` and a
  content hash. Unchanged pages are not rewritten.
- **Only documents stamped `managedBy: "repo"` are updated or deleted.** Pages
  created directly in Studio are never touched by the sync.
- **A push to `main` overwrites Sanity for every page present in
  `content/docs`.** Edit those pages in the repo, not in Studio — Studio edits
  to repo-managed pages are lost on the next sync.
- Deletions are scoped: a section is only deleted when no non-synced page still
  references it.

### Running the sync locally

With `SANITY_API_WRITE_TOKEN` in `.env.local`:

```bash
node scripts/sync-docs-to-sanity.mjs --check    # validate only, no writes
node scripts/sync-docs-to-sanity.mjs --dry-run  # list creates/updates/deletes
node scripts/sync-docs-to-sanity.mjs --prune    # apply, including deletions
```

Review a `--dry-run --prune` before the first real prune.

### One-time deployment setup

- **Vercel → Settings → Git → Ignored Build Step** — skip automatic builds for
  `main` so they cannot race the Sanity sync:

  ```sh
  if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi
  ```

- **Vercel → Settings → Git → Deploy Hooks** — create a production hook and put
  its URL in the GitHub secret `VERCEL_DEPLOY_HOOK_URL`.
- **GitHub → Settings → Secrets and variables → Actions** — add
  `SANITY_API_WRITE_TOKEN` (Editor role) and `VERCEL_DEPLOY_HOOK_URL`.
- **Sanity** — keep the webhook to `/api/sanity-revalidate` (it freshens ISR
  routes); the redeploy is what updates the static pages. Make sure the
  deployed origin is in the project's CORS origins.
- `SANITY_REVALIDATE_SECRET` must match between Sanity and the deploy env.

The Sanity webhook and `app/api/sanity-revalidate/route.ts` remain useful, but
they are not the publishing mechanism: the source cache is per-instance, so a
rebuild is what guarantees static pages reflect the merge.

## Authoring fields

Each `docPage` has `title`, `slug`, `description`, `icon` (a lucide-react
name, e.g. `Rocket`), `section` (sidebar separator), `order` (sort position),
and `body` (MDX source). `docSection` has `title`, `icon`, and `order`.

## Features

- **Ask AI assistant** — floating chat on every `/docs` page, answered by the
  Rallya docs agent (Mastra) with citations from the docs corpus. See
  [Ask AI assistant](#ask-ai-assistant).
- **Search** — `app/api/search/route.ts` (`createFromSource`), queried by the
  docs layout's search dialog.
- **Copy page menu** — `components/page-actions.tsx` on every docs page: copy
  as Markdown, view as Markdown, open in Claude, open in Codex.
- **LLM endpoints** — `/llms.txt` (index), `/llms-full.txt` (whole corpus),
  per-page Markdown at `/docs/<page>.md` (rewrite → `app/llms.mdx/...`).
  See [Using Docs with AI](content/docs/llms-txt.mdx) for details.
- **Home redirect** — `/` → `/docs` (permanent, in `next.config.ts` +
  `app/page.tsx`).

## Related

- [Rallya](https://github.com/nikhea/rallya) — main repo
- [TypeScript SDK](https://github.com/nikhea/rallya-js-sdk)
  ([npm](https://www.npmjs.com/package/@rallya/sdk))
- [Go SDK](https://github.com/nikhea/rallya-go-sdk)
