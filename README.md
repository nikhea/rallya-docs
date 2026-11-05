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
