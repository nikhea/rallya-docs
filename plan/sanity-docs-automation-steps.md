# Sanity docs automation — 10-step commit plan

Branch: `feat/docs-sanity-sync`
Companion: `plan/sanity-docs-automation.md`
Rule: one commit per step, each independently reviewable and green. No Vercel/Sanity
dashboard changes live in code — those are runbook steps in step 10.

Progress: steps 1–10 implemented on `feat/docs-sanity-sync`.

Deviations from the original notes:
- The icon allowlist lives in `sanity/icons.json` (not only `icons.ts`) so the
  Node script can read one shared list.
- `@sanity/client` is pinned to the v7 line that `next-sanity` uses; v8 pulled a
  second client type and broke `sanity/lib/client.ts`.
- `--check` also rejects `.mdx` files that are missing from `meta.json`, and the
  icon check found three icons (`FileCode`, `FileCode2`, `FileJson`) missing
  from the allowlist.

---

## 1. `docs(plan): repo to sanity sync automation plan`

**Files**
- `plan/sanity-docs-automation.md`
- `plan/sanity-docs-automation-steps.md`

**Work**
- Commit the two plan documents only.

**Done when**
- `git status` clean after the commit; no code touched.

---

## 2. `refactor(sanity): share the sidebar icon allowlist`

**Files**
- `sanity/icons.ts` (new) — exports `sidebarIcons` and `type SidebarIcon`.
- `sanity/schema.ts` — import instead of the inline array.

**Work**
- Move the `sidebarIcons` array out of `schema.ts` verbatim; no other changes.

**Verify**
- `bun run lint`
- `bunx tsc --noEmit`
- `bun run build` still succeeds (studio schema unchanged in behaviour).

---

## 3. `feat(sanity): mark repo-managed documents with system fields`

**Files**
- `sanity/schema.ts`

**Work**
- Add two hidden, read-only fields to both `docPage` and `docSection`:
  - `managedBy` — string, value `"repo"` for pipeline-owned docs.
  - `bodyHash` — string, sha256 of the normalized content.
- Put them in a `fieldset: "system"`, `readOnly: true`, `hidden: true`; do not add
  them to Studio previews.

**Done when**
- Studio still loads; existing documents show no required-field errors.

---

## 4. `chore(scripts): use @sanity/client directly`

**Files**
- `package.json`, `bun.lock`

**Work**
- `bun add -d @sanity/client` (currently only transitive).
- No script changes yet.

**Verify**
- `bun install --frozen-lockfile` passes.
- `node -e "require('@sanity/client')"` resolves.

---

## 5. `feat(scripts): sync content/docs into sanity`

**Files**
- `scripts/sync-docs-to-sanity.mjs` (new; leave the old migrate script in place for
  this commit)
- `package.json` — add `"sync:docs": "node scripts/sync-docs-to-sanity.mjs"`

**Work**
- Parse `content/docs/meta.json` (titles, icons, order) and every `.mdx`
  (frontmatter + body).
- Deterministic `_id`s: `docSection.<slugified-title>`, `docPage.<slug>`.
- `managedBy: "repo"` + `bodyHash` on every write.
- Fetch existing docs first; skip writes whose hash is unchanged.
- Apply all changes in one `client.transaction()`.
- `--dry-run` prints create/update sets and writes nothing.
- Read `SANITY_API_WRITE_TOKEN` from the environment; fall back to `.env.local` for
  local runs only.

**Verify**
- `bun run sync:docs --dry-run` lists the expected ~24 pages and sections.
- `bun run sync:docs` → inspect 2 documents in Studio by hand.
- Re-run → prints "no changes", confirming hash stability.

---

## 6. `feat(scripts): validate docs with --check`

**Files**
- `scripts/sync-docs-to-sanity.mjs`

**Work**
- Add `--check`: no writes, exits 1 on any failure.
- Checks: `title` present, unique slugs, `icon` in `sidebarIcons`, `meta.json` entry
  without a matching `.mdx`, and every body compiles with `compile()` from
  `@mdx-js/mdx` using the same preset as `lib/source.ts` (remark-gfm,
  remark-heading, remark-structure, rehype-code, rehype-toc).
- Keep failure output per-file so CI annotations are readable.

**Verify**
- `bun run sync:docs --check` passes on the current tree.
- Temporarily break a heading/code fence in a scratch copy → exits 1 with the file
  named; restore.

---

## 7. `feat(scripts): prune removed repo-managed docs`

**Files**
- `scripts/sync-docs-to-sanity.mjs`

**Work**
- Query `*[_type == "docPage" && managedBy == "repo" && !(slug.current in $slugs)]`
  and the `docSection` equivalent.
- Without `--prune`, report the would-be deletions in the output only.
- With `--prune`, include the deletes in the same transaction as the writes.
- Never touch documents without `managedBy: "repo"`.

**Verify**
- `bun run sync:docs --prune --dry-run` → "0 to delete" on the current tree.
- Create a throwaway page locally, sync it, delete the file, run with `--prune`
  → doc removed; a hand-made Studio doc with the same shape stays.

---

## 8. `feat(ci): validate docs changes on pull requests`

**Files**
- `.github/workflows/docs-sync.yml` (new)

**Work**
- `pull_request` on paths `content/docs/**`, `scripts/**`, `sanity/**`,
  `package.json`, `bun.lock`, the workflow file.
- Steps: checkout → `oven-sh/setup-bun` → `bun install --frozen-lockfile` →
  `bun run sync:docs --check`.
- No secrets, no writes.

**Verify**
- Push the branch, open a PR → job runs and passes.
- A deliberately broken MDX commit fails the job.

---

## 9. `feat(ci): sync to sanity and trigger deploy on main`

**Files**
- `.github/workflows/docs-sync.yml`

**Work**
- Add `push` → `main` (every push, because this workflow is the only production
  deploy trigger once automatic `main` builds are skipped) and `workflow_dispatch`.
- Add `concurrency: { group: docs-sync, cancel-in-progress: false }`.
- Job: `bun install --frozen-lockfile` → `--check` → `sync:docs --prune` →
  `curl -fsS -X POST "$VERCEL_DEPLOY_HOOK_URL"`.
- Use `SANITY_API_WRITE_TOKEN` and `VERCEL_DEPLOY_HOOK_URL` from secrets; fail the
  job if either is missing.

**Verify**
- `workflow_dispatch` on the branch (temporarily pointing at a test dataset or with
  prune off) completes; logs show "0 changes" on an unchanged tree.

---

## 10. `docs: document the repo to sanity publishing flow`

**Files**
- `README.md` — replace the "Content management" / "Publishing flow" sections.
- `.env.example` — note that the write token is consumed by CI and `sync:docs`.
- `package.json` — remove `migrate:docs` (the script file can stay for history).
- `plan/sanity-docs-automation.md` — tick the rollout checklist.

**Work**
- Document: repo is the source of truth; a `main` push overwrites Sanity for pages
  in `content/docs`; Studio edits to those pages are lost on the next sync;
  deletion is scoped to `managedBy: "repo"`.
- Runbook for the one-time dashboard work:
  1. Create the Vercel Production Deploy Hook, save the URL.
  2. Set the Ignored Build Step:
     `if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi`.
  3. Add GitHub secrets `SANITY_API_WRITE_TOKEN` and `VERCEL_DEPLOY_HOOK_URL`.
  4. Confirm Sanity CORS includes the deployed origin.
  5. Merge the Sanity migration to `main` before the first automated run.

**Verify (end to end)**
- Edit one page on a branch → PR check passes → merge → Action syncs → Vercel deploy
  → the page is live, `/llms.txt` lists it.
- Delete a page on a branch → merge → doc gone from Sanity and the site.
- Re-run the workflow with no content change → no Sanity writes, deploy still fires.

---

## Sequencing notes

- Steps 2–3 can land before 4–7; the script depends on both the shared icon list and
  the system fields.
- Steps 5, 6, 7 build on the same file — keep them separate commits for review but
  expect the script to be touched three times.
- Do not enable `--prune` in production until step 7's dry-run has been reviewed
  against the real dataset.
- The Sanity migration (`feat/sanity-cms`) must be on `main` before step 9 is
  exercised for real.
