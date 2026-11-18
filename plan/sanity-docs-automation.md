# Sanity docs automation — repo → Sanity → deploy

Status: planned (no implementation yet)
Branch: `feat/docs-sanity-sync`
Scope: **`rallya-docs` only.** No changes to `rallya`, the SDK repos, or the docs agent.

## Goal

Edit docs in `content/docs/*.mdx` in the repo. When a change lands on `main`, the
matching Sanity documents are updated and published automatically, and the site is
rebuilt so the static pages and `llms.txt` reflect the new content — no manual
`npm run migrate:docs`, no Studio clicking.

## Confirmed decisions

| Question | Decision |
| --- | --- |
| Source of truth | **Repo wins.** `content/docs` is authored; Sanity is a published target. |
| Publish timing | **Publish immediately on merge to main.** API writes go to published docs. |
| Deleted pages | **Delete, scoped.** Prune only docs stamped `managedBy: "repo"` whose slug disappeared. |
| Deploy ordering | **GitHub Action syncs, then triggers a Vercel Deploy Hook.** Automatic `main` builds are skipped. |

## Current state

- `content/docs/*.mdx` + `content/docs/meta.json` hold the pages.
- `scripts/migrate-docs-to-sanity.mjs` is a one-time, manual `createOrReplace` import.
- The site renders from Sanity (`lib/source.ts`); docs routes are **static**:
  `generateStaticParams()` in `app/docs/[[...slug]]/page.tsx`, `revalidate = false`
  in `app/llms.txt/route.ts` and `app/llms-full.txt/route.ts`. Content is frozen at
  deploy time.
- `app/api/sanity-revalidate/route.ts` clears a `globalThis` source cache and
  revalidates paths. On Vercel that cache is **per-instance**, so the webhook alone
  cannot be trusted to refresh a static deployment.
- No `.github/` directory exists. `main` does not yet contain the Sanity migration;
  the work is on `feat/sanity-cms` / `feat/docs-sanity-publish`.
- Both `bun.lock` and `package-lock.json` are committed; `bun.lock` is the actively
  maintained one (`1b06532`), so CI uses bun.

## Target flow

```
edit content/docs/*.mdx
  → PR: validate only (no writes)
  → merge to main
  → GitHub Action: validate → sync repo → Sanity (published) → prune stale docs
  → trigger Vercel production deploy hook
  → static site + llms endpoints rebuilt from fresh Sanity content
```

Hard rule: **Sanity must be written before the production build runs.**

## Design

### 1. `scripts/sync-docs-to-sanity.mjs`

Replaces the one-time migrate script.

- Reads `meta.json` for section titles/icons/order and each `.mdx` for frontmatter + body.
- Deterministic IDs: `docPage.<slug>`, `docSection.<slugified-title>`.
- **Change detection:** fetch existing docs, compare a `bodyHash` (sha256 of normalized
  fields + body), write only pages that changed. Code-only runs become no-ops; Studio
  `_updatedAt` and webhook traffic stay quiet.
- Writes in one `client.transaction()`.
- Stamps every written doc with `managedBy: "repo"` and `bodyHash`.
- Prune query:
  `*[_type == "docPage" && managedBy == "repo" && !(slug.current in $slugs)]`
  (and the `docSection` equivalent).
- Flags:
  - `--check` — no writes; required `title`, duplicate slugs, icon allowlist, and
    compile each body with `compile()` from `@mdx-js/mdx` using the **same plugin
    preset as `lib/source.ts`**. Broken PRs fail CI, not the deploy.
  - `--dry-run` — print create/update/prune set, write nothing.
  - `--prune` — enable deletion. Without it, deletions are reported only.
- Exit code 1 on any validation or write failure.
- Env: `SANITY_API_WRITE_TOKEN` (+ committed project id/dataset defaults).
- Add `@sanity/client` as an explicit devDependency (today it is only transitive).

### 2. `sanity/schema.ts`

- Add hidden, read-only `managedBy` and `bodyHash` fields to `docPage` and
  `docSection` under a "System" fieldset.
- Move `sidebarIcons` to a shared module so the schema and `--check` validate against
  one list instead of two copies.

### 3. `.github/workflows/docs-sync.yml`

- `push` → `main`, paths: `content/docs/**`, `scripts/**`, `sanity/**`,
  `package.json`, `bun.lock`, the workflow file itself.
- `workflow_dispatch` for manual runs.
- `pull_request` (same paths): **`--check` only**, no writes.
- Push job: `bun install --frozen-lockfile` → `--check` → sync → `curl -fsS -X POST
  "$VERCEL_DEPLOY_HOOK_URL"`.
- `concurrency: docs-sync` with `cancel-in-progress: false` so two merges cannot
  interleave writes.
- GitHub secrets: `SANITY_API_WRITE_TOKEN`, `VERCEL_DEPLOY_HOOK_URL`. The write token
  can also read, so no extra read token is needed in CI.

### 4. Vercel + Sanity settings (manual, one-time)

- Vercel → Settings → Git → **Ignored Build Step** — skip `main`, build the rest:
  ```sh
  if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi
  ```
- Create a **Production Deploy Hook**; store the URL as `VERCEL_DEPLOY_HOOK_URL`.
- Keep the existing Sanity webhook to `/api/sanity-revalidate`. The rebuild is what
  guarantees static pages update; the webhook only freshens ISR/dynamic routes.
- Confirm the write token has Editor role and the deployed domain is in Sanity CORS
  (see `x.md`).

### 5. Docs

- Rewrite the "Content management" / "Publishing flow" sections of `README.md`:
  repo → Sanity → deploy, and the rule *"a push to `main` overwrites Sanity for pages
  present in `content/docs`; edit those in the repo, not Studio."*
- Update `.env.example` comments; replace `migrate:docs` with `sync:docs` in
  `package.json`.

## Rollout order

1. Merge the Sanity migration (`feat/sanity-cms`) into `main` — prerequisite.
2. Land script + schema + workflows on `feat/docs-sanity-sync`; run `--check` and
   `--dry-run` locally against the dataset.
3. Add the two GitHub secrets, create the deploy hook, set the Ignored Build Step.
4. Run the workflow via `workflow_dispatch`; verify Sanity docs, then the live site
   and `/llms.txt`.
5. First real prune: review a `--dry-run` before enabling deletion.

## Trade-offs and known gaps

- **Slug renames** create a new page and prune the old one; the old URL 404s. A
  `redirects:` frontmatter field feeding `next.config.ts` is a clean follow-up.
- **Rollback** is safe: redeploying an old Vercel build does not touch Sanity,
  because CI is the only writer.
- **Studio edits** to repo-managed pages are overwritten on the next `main` push.
  This must be stated in the README.
- **PR previews** show the last published Sanity content, not the PR's content.
  Optional future work: PRs write `drafts.docPage.*`, promoted on merge.

## Out of scope

- PR draft previews in Studio.
- Redirect generation for renamed slugs.
- Link checking beyond MDX compilation.
- Any change to the docs agent or the other repos.
