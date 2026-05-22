# adiGen — New Category Bootstrap

You're forking this repo to launch a new category (football-EMEA, tennis, lifestyle-US, whatever). This doc gets you from `git clone` to a booting dev server with the new category wired in.

It does **not** cover porting new pages from bball, gotchas, or post-launch work — for those, read [docs/category-port-runbook.md](category-port-runbook.md) once you've finished bootstrap. It also does not cover backend provisioning in depth — that's [docs/backend.md](backend.md).

---

## First 30 minutes — the checklist

Numbered so you can skim. Each step links to its detail section below.

1. **Clone** `adigen` → `adigen-<slug>` on GitHub. Local clone alongside this repo.
2. **Run the rename block** (one PowerShell paste — see [Step 2](#step-2--mechanical-renames)).
3. **Edit two constants** in `src/<slug>/index.ts` — `CATEGORY_SLUG` and `CATEGORY_DISPLAY_NAME`. These are the only two values that propagate; the Login wordmark and localStorage keys derive from them.
4. **Provision infrastructure** — new GCS bucket, new Cloud Run service, new env vars. Follow [docs/backend.md](backend.md) "Step 0 — Infrastructure".
5. **Apply DB migration** — additive `category` column on tenant-scoped tables. Follow [docs/category-port-runbook.md](category-port-runbook.md) Step 1.
6. **Replace category data** in `src/<slug>/*.ts` per the content brief. Clone [docs/content-brief-running-japan.md](content-brief-running-japan.md) → `docs/content-brief-<slug>.md` and fill in.
7. **Update `.env.local`** — `VITE_BACKEND_URL` to the new Cloud Run hostname. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` stay (Supabase project is shared across categories).
8. **Boot and verify** — `npm install && npm run dev`, hit `/login`, confirm the wordmark reads `adiGen — <your display name>`.

---

## Step 2 — Mechanical renames

Two PowerShell scripts, copy-paste in order. Run from the repo root.

### A. Rename the data folder

```powershell
$slug = 'football-emea'  # EDIT ME — kebab-case, used in URLs, bucket names, DB filters
Rename-Item -Path src/running-japan -NewName $slug
```

### B. Rewrite import paths

```powershell
Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | ForEach-Object {
  (Get-Content $_.FullName -Raw) -replace '@/running-japan', "@/$slug" |
    Set-Content $_.FullName -NoNewline
}
```

That's it for mechanical edits. The localStorage keys and Login wordmark already derive from `CATEGORY_SLUG` / `CATEGORY_DISPLAY_NAME`, so you don't need to hunt for them.

### Manual edits (judgment calls)

Three edits that need a human:

- **`src/<slug>/index.ts` lines 3-4** — the only constants you must change by hand:
  ```ts
  export const CATEGORY_SLUG = '<slug>' as const           // matches the folder name
  export const CATEGORY_DISPLAY_NAME = '<Display Name>'    // shown on Login + Dashboard
  ```
  Punctuation choice matters for `CATEGORY_DISPLAY_NAME` — running-japan uses an em-dash (`Running — Japan`). Pick what reads right for the category.

- **`.env.example` + `.env.local`** — replace `VITE_BACKEND_URL` with the new Cloud Run hostname (placeholder is fine until infra is provisioned in Step 4). The Supabase vars stay unchanged.

- **`src/<slug>/references.ts`** (around line 147 in the running-japan version) — `MODEL_FACES_BASE` is a Supabase storage URL pointing at the shared `reference-images` bucket. Leave it alone unless the new category will host its own model faces (most won't).

---

## Step 6 — Replacing category data

The `src/<slug>/` folder has 6 files (~677 LOC, mostly placeholder strings). Replace contents while keeping the export shapes:

| File | What to fill in |
|---|---|
| `index.ts` | Only the two constants (Step 2 manual edits). The barrel re-exports stay. |
| `poses.ts` | `POSES` array — your category's pose catalog. Keep the `RunningPose` interface shape (rename the type per category). |
| `garments.ts` | `SHOES`, `TOPS`, `BOTTOMS`, `GARMENT_COMBINATIONS`. Same shape; replace entries. |
| `references.ts` | `LOCATIONS`, `SCENE_STYLES`, `MODELS`. Locations are category-flavored; scene styles are reusable conceptually but want fresh thumbnails; models can default to the shared sport-neutral roster. |
| `products.ts` | Copy-gen product list. Set `franchise` to the new product family. |
| `copy-guidelines.md` | Brand voice / tone / words-to-avoid. The content team owns this — engineering supplies the template. |

**Placeholder URLs:** prefer real-but-cosmetic URLs (e.g., a single grey placeholder image in the new bucket) over `CONTENT_TBD` strings. The FAL gateway 422s on non-URL strings — see runbook "Placeholder image URLs break FAL" gotcha.

---

## Step 8 — Verification

Each item has a one-line check. Run in order.

- **`npm run build` exits 0.** No broken imports.
- **`npm run dev` boots.** Hit http://localhost:5173/login — wordmark reads `adiGen — <your CATEGORY_DISPLAY_NAME>`. Sidebar nav renders.
- **localStorage keys use the new slug.** DevTools → Application → Local Storage after one lifestyle gen + one group-shot gen: keys should be `lastLifestyleGeneration-<slug>` and `lastGroupShotGeneration-<slug>`. No `running-japan` keys.
- **No live `running-japan` references in code.** Search `src/` for `running-japan` — only the historical code comments should remain (see "Known cosmetic leftovers" below).
- **Gallery is empty on first load.** Proves the category filter is wired to the new slug. If running-japan rows show, the rename didn't propagate to `CATEGORY_SLUG`.
- **End-to-end smoke gen.** Generate one lifestyle image. New row appears in `/gallery` and in the Supabase `assets` table with `category = '<slug>'`.
- **Cross-category isolation.** Sign in to bball with the same user — your new category's rows should be invisible. (Optional but recommended before launch.)

### Known cosmetic leftovers (don't fix)

- **~70 inline code comments** still mention `category = 'running-japan'`. These are documentary lineage notes ("ported from bball, filters by running-japan"). Not load-bearing; replace gradually as you touch files.
- **`docs/category-port-runbook.md`** and **`docs/content-brief-running-japan.md`** stay as historical reference and template respectively. Don't rename or rewrite — copy them when you need a new one.
- **`docs/backend.md`** uses `running-japan` as the example throughout. Your new category gets its own Cloud Run service and bucket alongside, following the same recipe.

---

## What you should read next

Once bootstrap is done and you're ready to actually build:

- **[docs/category-port-runbook.md](category-port-runbook.md)** — retrospective + step-by-step for porting individual pages from bball. Covers patterns, gotchas, Tailwind v4↔v3 deltas, RLS model, FAL edge cases.
- **[docs/backend.md](backend.md)** — Cloud Run / GCS / Supabase topology + deploy commands. The authoritative reference for anything infra.
- **[docs/content-brief-running-japan.md](content-brief-running-japan.md)** — adidas content team's asset spec format. Template for what you need to ask your content team to deliver.

---

## What this doc is NOT

- **Not a guide to porting new pages from bball.** That's the runbook.
- **Not a template extraction.** adiGen is forked, not extracted-and-reused. We decided to wait until 2+ categories are stable before designing a multi-tenant abstraction (runbook Step 11).
- **Not a substitute for reading the runbook.** Bootstrap gets you booting; the runbook gets you shipping.
