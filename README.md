# Rallya Docs

Documentation site for the [Rallya](https://github.com/nikhea/rallya) event
platform — guides for organizers, door staff, and developers. Built with
[Next.js](https://nextjs.org) + [Fumadocs](https://fumadocs.dev) (MDX).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — `/` redirects to `/docs`.

| Script          | Purpose                              |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server                 |
| `npm run build` | Production build (runs `fumadocs-mdx` codegen) |
| `npm run start` | Serve the production build           |
| `npm run lint`  | Run ESLint                           |

## Authoring content

Pages live in `content/docs/*.mdx` (frontmatter: `title`, `description`) and
are registered in order in `content/docs/meta.json`. Source config is in
`source.config.ts`; the loader in `lib/source.ts` serves them at `/docs`.

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
