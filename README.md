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
  `POST /docs-chat` (AI SDK v7 UI-message SSE). No Next.js API route, and the
  agent must be reachable from the browser (not just from the server).
- `app/docs/docs-assistant.tsx` wires `useChatRuntime` (`@assistant-ui/ai-sdk`) to
  an `AssistantChatTransport` pointing at `NEXT_PUBLIC_DOCS_CHAT_URL`.
- Conversations are **not persisted across reloads**: each page load starts a
  fresh runtime thread; `memory.thread` sent to Mastra is that thread id, and
  `memory.resource` is the static value of `NEXT_PUBLIC_DOCS_RESOURCE_ID`
  (`docs-visitor`). One anonymous Postgres thread row is created per runtime
  thread — see "Thread growth" below.

Environment variables (`.env.local` for dev, deploy env for prod):

| Var | Dev default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_DOCS_CHAT_URL` | `http://localhost:4111/docs-chat` | Mastra agent runs separately on `:4111`. In prod point at the deployed agent origin, e.g. `https://<agent-host>/docs-chat`. |
| `NEXT_PUBLIC_DOCS_RESOURCE_ID` | `docs-visitor` | Static resource id reported to Mastra Memory; shared by all anonymous visitors by design. |

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
