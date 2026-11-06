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
| `npm run migrate:docs`    | One-time import of `content/docs` into Sanity  |

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
- Conversations are **not persisted across reloads**: each page load starts a
  fresh runtime thread; `memory.thread` sent to Mastra is that thread id, and
  `memory.resource` is the anonymous visitor id from localStorage
  (`docs_visitor_id`), so one browser's threads group together — see
  "Anonymous visitor attribution" below.

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
logged and dropped.

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

The Mastra server does **not** need code changes, but its CORS must allow the
docs origin. Dev defaults to `*` via `DOCS_CHAT_CORS_ORIGINS`; set it to the
docs origin in production (e.g. `DOCS_CHAT_CORS_ORIGINS=https://<docs-domain>`).

Thread growth: Mastra Memory stores one thread per runtime thread the browser
creates, with no anonymous-thread cleanup. If that becomes a concern, scope the
thread id to `sessionStorage` (one thread per tab session) in
`docs-assistant.tsx`, or add a retention job on the agent side.

## Content management

Content lives in Sanity (project **Rallya Docs**, org **rallya**, dataset
`production`) as `docPage` and `docSection` documents; the embedded studio is
at [`/studio`](http://localhost:3000/studio). `sanity/schema.ts` defines the
schemas, `sanity/lib/` the client and GROQ queries, and `lib/source.ts` feeds
them into the Fumadocs loader (pages are compiled from MDX at build time with
the same plugin preset the old file-based pipeline used).

Publishing flow: edit in the studio → publish → a Sanity webhook POSTs to
`/api/sanity-revalidate` (signature checked against `SANITY_REVALIDATE_SECRET`)
→ the source cache is dropped and affected routes revalidate on next visit.

The original MDX files are kept in `content/docs/` for reference only — they
are not part of the build; Sanity is the source of truth.

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
