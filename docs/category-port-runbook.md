# adiGen — Category Port Runbook

Written after porting **running-japan** off bball. Use this for the next category (football, tennis, lifestyle-EMEA, etc.) so you don't re-walk the same ground.

This is two documents in one:
1. **A retrospective** — what the running-japan port actually did, what the original plan missed, what to do differently next time.
2. **A runbook** — step-by-step instructions for the next category, distilled from the patterns that worked.

Read [docs/backend.md](backend.md) alongside this — that covers Cloud Run / GCS / Supabase setup. This covers the frontend port.

---

## TL;DR — the single most important rule

> **Mirror bball. Do not invent.**

bball ships and works. adiGen is a port of bball with category-specific data. Every time we invented something from scratch (custom topbar, custom AssetContext, custom Gallery filter UI, placeholder URL filter), the user had to course-correct and we had to throw work away. Every time we read the bball file first and ported it verbatim with narrow data swaps, things worked first try.

The local mirror lives at `C:\Users\Cecile\bball-ref` (partial fetch). For files not present, use `gh api -H "Accept: application/vnd.github.raw" repos/pieyrealexandre/sagastudioxadidasbball/contents/src/<path>` to fetch on demand.

---

## What got built in the running-japan port

Listed roughly in shipping order (not original-plan order — see the gap analysis below).

### Phase 0/1 — Infrastructure (already done before this work started)
- adigen repo created on GitHub.
- Cloud Run service `adigen-running-japan-backend` deployed (europe-west1, same Docker image as bball).
- GCS bucket `saga-running-japan-images-eu` created with CORS for signed uploads.
- Supabase: shared EU project `ylgmmgdkcazhnubxyoho`.
- adiGen frontend on Vercel pointing at the above.

### Phase 1 — Database migrations (additive only)
- `assets` — added `category` text column, backfilled 46,055 existing rows to `'basketball'`, added `(category, user_id)` index. **Not yet:** NOT NULL constraint, RLS policies for adiGen.
- `saved_copy` — same pattern, 25 rows backfilled.
- `copy_projects` — same pattern, 3 rows backfilled.
- `reference_images` — same pattern, 4 rows backfilled.

bball is unaffected — its queries never reference the new column, so backfilled `'basketball'` rows stay visible to it.

### Phase 2 — Copy Generator (shipped, then re-done to mirror bball)
- Initial port was a minimal form; rebuilt to mirror bball's full UX:
  - Step 1 settings → Step 2 results flow
  - Touchpoint groups (HP / GLP / CatLP / CLP / PDP / PLP / App & Other) with collapsible items + per-group select-all
  - Format chips (Headline / Body / Subject / Preheader / Snippet)
  - Per-touchpoint Re-Generate button (appends variations)
  - **Heart-to-save** flow that writes to `saved_copy` with `category = 'running-japan'`
  - Project picker with inline "+ New project…" creating rows in `copy_projects`
  - Flagged-issues alerts per variation
- Product picker reads from `src/running-japan/products.ts` (Supernova line, 5 SKUs).

### Phase 3 — Cropping Toolkit (was already live before this work)
Unchanged.

### Phase 4 — Image Generation (Lifestyle)
- `src/utils/jsonPromptBuilder.ts` — 220 LOC vs bball's 926. Reads pose / location / scene-style / garment data from `src/running-japan/*` instead of hardcoded per-pose branches.
- `src/utils/garmentCombinations.ts` — thin orchestration helper; the catalog + lookup helpers already live in `src/running-japan/garments.ts`.
- `src/components/image-creation/*` — `SelectionModal`, `ModelSelector`, `SceneStyleSelector`, `OptimizedImage`, `ProductPicker` (now just shared type re-exports).
- `src/pages/LifestyleGen.tsx` — ~270 LOC vs bball's 870. Dropped: `POSES_WITH_BASKETBALL` reference injection, hardcoded socks reference URLs, basketball-court location strings, `POSE_VARIATIONS` per-model image swaps, `PresetManager` (deferred).
- `src/running-japan/references.ts` — populated `MODELS` array with the sport-neutral subset of bball's roster (digital twins + a few Japan-relevant Asian models).

### Phase 5 — Editor + Notebook
- `src/pages/Notebook.tsx` (~600 LOC, near-verbatim from bball) — project list, project detail, PDF + CSV export, edit/delete dialogs, touchpoint filter. All queries filter by `category`.
- `src/pages/Editor.tsx` (~600 LOC) — chat-driven image editor: image picker (assets + uploaded refs), chat with AI, quick-action chips (resize 9:16, resize 16:9, upscale, product swap, masked product swap), realtime subscription for pending asset updates.
- Editor components: `ChipButtons`, `MaskingModal` (paints a mask, uploads to shared `reference-images` storage bucket), `GarmentSelectionModal` (the one place running-japan garments diverge from bball — pulls from `running-japan/garments.ts`).
- `ImageSelector`, `ChatImageModal` — verbatim.
- `useReferenceImages` — simplified: keeps own state instead of bball's `AppStateContext` (we didn't port that context).

### Bonus — Group Shots + Product Images
Originally **out of v1 scope** per the plan, but the user wanted them. Ported:
- `src/pages/GroupShotPage.tsx` — two-character composition, 4 group poses (running-themed labels but bball pose IDs, see gotcha below), location picker, calls `generate-group-shot` Edge Function.
- `src/pages/ProductImageCreation.tsx` — Step 1 product grid → Step 2 configure shot. URL state machine preserved verbatim. Per-product-type layouts (shoes: bottoms+model+location; tops: front/back toggle+location; bottoms: location only).
- `src/pages/ImageCreation.tsx` — entry grid now shows all 3 mode cards.

### Layout / Nav / Architecture
- **Sidebar layout** ported from bball (not the topbar I initially built). Logo + nav icons + logout. Always-expanded for v1; bball's collapse-on-small + tooltip behavior is a TODO.
- **Routes restructured** to mirror bball: `/` → `/dashboard`, `/image-creation`, `/image-creation/lifestyle`, `/image-creation/product`, `/image-creation/group`, `/gallery`, `/editor`, `/copy-generator`, `/notebook`, `/toolkit`.
- **ProtectedRoute** wrapper on every authenticated route.
- **AssetContext** / **useSimpleAssets** / **useAssetRealtime** ported verbatim, with two narrow deltas: (a) query adds `eq('category', CATEGORY_SLUG)`, (b) realtime INSERT events skip rows from other categories.
- **AuthContext** extended to expose `isLoading` + `logout` so bball's ProtectedRoute + Sidebar drop in unchanged.

### UI primitives ported from bball
Added incrementally as needed. Install the radix dep, drop in the shadcn file from bball verbatim:

| Component | Radix dep | Used by |
|---|---|---|
| `scroll-area` | `@radix-ui/react-scroll-area` | Editor, GarmentSelectionModal |
| `badge` | (none — cva only) | Notebook, CopyGenerator |
| `alert-dialog` | `@radix-ui/react-alert-dialog` | Notebook |
| `label` | `@radix-ui/react-label` | Notebook, CopyGenerator |
| `slider` | `@radix-ui/react-slider` | MaskingModal |
| `select` | `@radix-ui/react-select` | CopyGenerator |
| `checkbox` | `@radix-ui/react-checkbox` | CopyGenerator |
| `alert` | (none — cva only) | CopyGenerator |
| `toggle` + `toggle-group` | `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group` | ProductImageCreation, Gallery (TODO swap) |

Already present at start of work: `button`, `card`, `dialog`, `input`, `textarea`.

---

## Patterns that worked (port these verbatim next time)

### 1. Per-category data folder

`src/<category>/` with these files:
- `index.ts` — barrel exports + `CATEGORY_SLUG` + `CATEGORY_DISPLAY_NAME` constants
- `poses.ts` — `POSES`, `POSES_BY_ID`, `RunningPose` interface (rename per category)
- `garments.ts` — `SHOES`, `TOPS`, `BOTTOMS`, `ALL_PRODUCTS`, `PRODUCTS_BY_ID`, `GARMENT_COMBINATIONS`, helpers
- `references.ts` — `LOCATIONS`, `SCENE_STYLES`, `MODELS` (+ their `_BY_ID` and `_BY_GENDER` lookups)
- `products.ts` — copy-gen `ProductOption` list
- `copy-guidelines.md` — brand voice / tone / words-to-avoid for the category

bball had this data scattered across 4-5 different files with split-brain bugs (pose visibility flags in one file, pose names in another). Consolidating into one shape per data type makes the rest of the port mechanical.

### 2. Additive category migration

```sql
ALTER TABLE public.<table> ADD COLUMN IF NOT EXISTS category text;
UPDATE public.<table> SET category = 'basketball' WHERE category IS NULL;
CREATE INDEX IF NOT EXISTS idx_<table>_category ON public.<table> (category, user_id);
```

- **No NOT NULL constraint** until bball is updated to write `category = 'basketball'` on inserts (or we patch the Edge Functions). Otherwise legacy bball INSERTs will fail.
- **No RLS changes** to bball's existing policies. Add new RLS policies for adiGen alongside.
- Tables that needed it for running-japan: `assets`, `saved_copy`, `copy_projects`, `reference_images`. There may be more — do a fresh audit per category.

### 3. Client-side category tag band-aid

The Edge Functions (`generate-image-pro`, `generate-image`, `upscale-image`, `generate-group-shot`, `generate-product`) live in the bball repo and don't read `category` from the payload. After every successful invoke that returns an `assetId`:

```ts
await supabase.from('assets').update({ category: CATEGORY_SLUG }).eq('id', data.assetId)
```

Without this, the new row stays NULL-tagged → invisible to the adiGen Gallery (which filters by `category`) AND visible to bball (cross-contamination). RLS allows users to update their own rows, so the patch works without a server change.

**Better long-term:** update the Edge Functions to read `category` from the request body and write it on insert. Lives in the bball repo, requires coordination.

### 4. Realtime subscriptions, not polling

bball uses Supabase Realtime via `useAssetRealtime` + a shared channel singleton. `useSimpleAssets` subscribes once and updates the in-memory list when rows change. **Do not write a polling loop.** Status changes (pending → processing → completed/failed) push through automatically.

### 5. Filter assets by status, not by render-time guards

```ts
.in('status', ['completed', 'processing', 'pending'])
```

Failed assets simply don't appear in the gallery. No need to render a "failed" state. bball solved the stuck-spinner problem this way years ago; don't re-derive it.

### 6. Lean ports for data-driven code

When the bball file is mostly data + branching on the data, the port is the place to consolidate. `jsonPromptBuilder.ts` went from 926 LOC of per-pose hardcoded overrides to 220 LOC reading from `RunningPose` properties. The lifestyle page went from 870 LOC to 270.

For pure-UI code (Notebook, Editor, GarmentSelectionModal, MaskingModal), port verbatim — adapting visual shape adds work without value.

### 7. Use a local mirror + gh api for ondemand fetches

Local mirror saves bandwidth and lets you grep. For files not in the mirror:

```bash
gh api -H "Accept: application/vnd.github.raw" \
  repos/pieyrealexandre/sagastudioxadidasbball/contents/src/<path> > <local-path>
```

---

## What the initial plan got wrong (and what to do instead)

### Wrong: "v1 excludes Group Shot, 3D upload, Airtable"
What happened: the user wanted Group Shots three weeks into the work. We ported it.
**Next time:** the v1 scope should be "the modes adidas Japan actually uses for their FY26 campaign brief." Don't assume Group Shot is out — confirm with the category team early. ProductImages should probably be in v1 by default; running-japan needed it.

### Wrong: "Editor/Notebook are mostly drop-in"
What happened: Editor had ~5 dependencies (ImageSelector, ChatImageModal, useReferenceImages, GarmentSelectionModal, MaskingModal) that each needed porting. MaskingModal alone is 400+ LOC with canvas math.
**Next time:** treat each chat-driven editor as ~1 week of work, not "drop-in." Budget for the masking canvas math, the proxy-image Edge Function dependency, and the chat state machine.

### Wrong: backend codebase is "category-agnostic" (mostly)
What happened: the backend Cloud Run routes ARE category-agnostic (smart-crop, upload, FAL pass-through). But the **Supabase Edge Functions** are not — they have basketball pose/garment slugs hardcoded in their prompts. The frontend can route around it for now (lean prompts, the category-tag band-aid), but the Edge Functions are the real long-pole.
**Next time:** include "audit Edge Functions for category-specific logic" as a Phase 1 task. Possibly fork the relevant functions per category, similar to how Cloud Run is one image / multiple services.

### Missed: heart-to-save flow in CopyGenerator
What happened: I initially shipped a minimal CopyGenerator UI without the save-to-notebook flow. User discovered the missing heart button while testing Notebook.
**Next time:** when porting a feature, port the full feature including its sister-page interactions. Notebook is fed by CopyGenerator's hearts; one without the other is broken.

### Missed: placeholder URLs causing 422s from FAL
What happened: `src/running-japan/garments.ts` has `payloadUrl: CONTENT_TBD` placeholder strings. We sent them to `fal-ai/nano-banana-2/edit` which 422'd because they're not valid URLs.
**Next time:** either (a) make placeholders be valid-but-cosmetic URLs (e.g., `https://placeholder.example/tbd.png` — fails image-load but doesn't 422 the AI gateway), or (b) ship a placeholder filter at the call site. Going with (a) is cleaner.

### Missed: scope of file dependencies
What happened: I underestimated how many supporting components / hooks / UI primitives an app like this needs. Every page port pulled in 3-5 new files.
**Next time:** start by listing every import in the target page tree and treating those as transitive port-required files. Estimate accordingly.

### Sub-optimal: my topbar layout
What happened: I designed a custom topbar nav. User pointed out bball uses a sidebar. Threw it away, ported bball's Sidebar.
**Next time:** look at the bball layout file FIRST. The Sidebar + Header + Outlet + FULL_BLEED_ROUTES pattern is non-obvious from outside; reading bball's Layout.tsx takes 30 seconds and saves a day.

### Sub-optimal: my AssetContext from scratch
What happened: wrote my own AssetContext with direct supabase queries, no caching, no realtime. Replaced it with bball's verbatim `AssetContext` wrapping `useSimpleAssets` + `useAssetRealtime`.
**Next time:** for contexts and hooks that wrap supabase queries, default to porting bball's version. Customization is almost never warranted; the bball version handles edge cases (cache, abort handling, visibility-change refresh, optimistic favorites) you'll re-derive otherwise.

### What was useful in the plan
- The "earn the abstraction" framing — building running-japan as a concrete `src/running-japan/` folder instead of a multi-tenant `src/categories/<slug>/` platform was the right call. We can extract the abstraction later from two real implementations.
- The shared-Supabase + per-category-bucket + per-category-Cloud-Run-service topology — proven by the work.
- The additive-migration discipline — kept bball working through every schema change.
- The "no deletion" GCS policy — simplified everything.

### What wasn't useful in the plan
- The "convergence trigger" section — interesting but not actionable in any specific PR. Move to a backlog doc, not the launch plan.
- The cost section — forward-looking, didn't drive any decisions in this work. Belongs in `docs/cost-monitoring.md` once that exists.
- The "no MCP" decision — quietly reversed. The Supabase MCP was useful for migrations + queries during this work.
- The migration testing checklist's "staging" step — there's no staging environment. We applied straight to prod with the user's per-migration approval. Worked because migrations were additive and bball was unaffected.

---

## Step-by-step runbook for the next category

Assume:
- Category slug: `<slug>` (e.g., `football-emea`)
- Display name: `<Display Name>`
- bball repo URL stays the same.

### Step 0 — Infrastructure

See [docs/backend.md](backend.md) for the GCS / Cloud Run / Supabase setup. Roughly:
1. Create GCS bucket `saga-<slug>-images-eu` in europe-west1, NO uniform bucket-level access, with CORS for PUT.
2. Create runtime service account, grant `roles/storage.objectAdmin` on bucket + `roles/iam.serviceAccountTokenCreator` on self.
3. Create Cloud Run service `adigen-<slug>-backend` pointing at the bball Docker image with `GCS_BUCKET_NAME=saga-<slug>-images-eu`.
4. Tag Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`.

### Step 1 — Database migration (additive)

```sql
-- For every tenant-scoped table touched by the category:
ALTER TABLE public.<table> ADD COLUMN IF NOT EXISTS category text;
UPDATE public.<table> SET category = 'basketball' WHERE category IS NULL;
CREATE INDEX IF NOT EXISTS idx_<table>_category ON public.<table> (category, user_id);
```

Tables that needed it for running-japan: `assets`, `saved_copy`, `copy_projects`, `reference_images`. **Audit `information_schema.columns` for any tenant table missing `category`** before declaring this step done.

### Step 2 — Data layer (`src/<slug>/`)

Copy `src/running-japan/` as a starting template. Replace contents:

- `index.ts` — set `CATEGORY_SLUG` and `CATEGORY_DISPLAY_NAME`. Re-export the data.
- `poses.ts` — pose catalog. The `RunningPose` interface shape is sport-agnostic; rename the type and replace the entries.
- `garments.ts` — `SHOES` / `TOPS` / `BOTTOMS` / `GARMENT_COMBINATIONS`. Same shape; replace the entries.
- `references.ts` — `LOCATIONS`, `SCENE_STYLES`, `MODELS`. Locations are category-flavored; scene styles are reusable conceptually (golden hour, candid action, etc.) but thumbnails should be re-shot in the new category's context; models can default to bball's sport-neutral roster.
- `products.ts` — copy-gen products. Set `franchise` to the new family slug.
- `copy-guidelines.md` — brand voice. The content team writes this; engineering supplies the template.

**Placeholder URLs:** prefer real-but-cosmetic URLs (e.g., a single grey placeholder image hosted in the new GCS bucket) over CONTENT_TBD strings. Avoids FAL 422s when users test the gen flow early.

### Step 3 — UI port

For each file, **read bball first, then port**. Default to verbatim. Adapt only what the new data requires.

Files to port from bball (verified working in running-japan port):

| bball file | adaptation needed |
|---|---|
| `App.tsx` | imports + route table |
| `components/Layout.tsx` | update FULL_BLEED_ROUTES |
| `components/Sidebar.tsx` | nav items list |
| `components/ProtectedRoute.tsx` | verbatim |
| `components/ImageSelector.tsx` | verbatim |
| `components/ChatImageModal.tsx` | verbatim |
| `components/image-creation/OptimizedImage.tsx` | verbatim |
| `components/image-creation/ModelSelector.tsx` | imports MODELS from `src/<slug>/references` |
| `components/image-creation/SceneStyleSelector.tsx` | imports SCENE_STYLES from `src/<slug>/references` |
| `components/image-creation/SelectionModal.tsx` | imports catalogs from `src/<slug>/*` |
| `components/image-creation/ProductPicker.tsx` | type-only barrel (verbatim) |
| `components/editor/ChipButtons.tsx` | verbatim |
| `components/editor/MaskingModal.tsx` | verbatim |
| `components/editor/GarmentSelectionModal.tsx` | imports SHOES/TOPS/BOTTOMS from `src/<slug>/garments` |
| `contexts/AuthContext.tsx` | extend with `isLoading` + `logout` |
| `contexts/AssetContext.tsx` | verbatim |
| `contexts/GenerationContext.tsx` | verbatim |
| `hooks/useSimpleAssets.ts` | add `eq('category', CATEGORY_SLUG)` to query |
| `hooks/useAssetRealtime.ts` | verbatim |
| `hooks/useReferenceImages.ts` | add category filter, simplify to internal state |
| `utils/jsonPromptBuilder.ts` | lean port reading from `src/<slug>/*` |
| `utils/garmentCombinations.ts` | thin helper (data lives in `src/<slug>/garments.ts`) |
| `pages/Index.tsx` | verbatim |
| `pages/Login.tsx` | verbatim |
| `pages/Dashboard.tsx` | swap CATEGORY_DISPLAY_NAME and tool list |
| `pages/ImageCreation.tsx` | swap hero text per category |
| `pages/LifestyleImageCreation.tsx` → `LifestyleGen.tsx` | category data + category tag |
| `pages/ProductImageCreation.tsx` | category data + simpler prompts + category tag |
| `pages/GroupShotPage.tsx` | category data + category tag |
| `pages/Editor.tsx` | category filter on `reference_images`, category tag on edge function outputs |
| `pages/Notebook.tsx` | category filter on `saved_copy` + `copy_projects` |
| `pages/CopyGenerator.tsx` | category filter + product filter |
| `pages/Gallery.tsx` | uses AssetContext (already category-scoped) |
| `pages/CroppingToolkit.tsx` | unchanged from prior adiGen work |

### Step 4 — Edge Function caveats

The current Edge Functions (`generate-image-pro`, `generate-image`, `upscale-image`, `generate-group-shot`, `generate-product`) have basketball-flavored prompts and basketball pose slugs baked in. The frontend uses the **client-side category-tag band-aid** to keep rows isolated, but generated outputs will look basketball until the Edge Functions are forked or parameterized.

**Plan ahead:** when the third category lands, this stops being acceptable. The bball repo's `supabase/functions/` needs a category-aware refactor. Until then, generated outputs are constrained.

### Step 5 — Wiring

1. Update `Sidebar.tsx` nav items.
2. Update `App.tsx` route imports and route table.
3. Update `Layout.tsx` `FULL_BLEED_ROUTES`.
4. Update `Dashboard.tsx` tool grid links.
5. Update `ImageCreation.tsx` card list (3 modes for full parity with bball).

### Step 6 — Testing

Smoke test (matching the running-japan launch checklist):
- Sign in / sign out works.
- All sidebar nav links route to the right page.
- `/copy-generator` generates copy for a touchpoint; heart-to-save creates a row in `saved_copy` with the right category.
- `/notebook` shows the saved row; PDF + CSV export work.
- `/image-creation/lifestyle` generates an image; new row tagged with category appears in `/gallery`.
- `/image-creation/product` Step 1 grid renders; Step 2 configure shot generates.
- `/image-creation/group` generates a 2-character image.
- `/editor` shows the asset picker; clicking through opens chat; resize/upscale/swap chips fire Edge Function calls.
- `/gallery` shows only the new category's assets; bball assets are invisible.
- Cross-category isolation: sign in as a bball user via the bball app, verify the new category's rows are invisible to bball.

---

## Known gotchas

### supabase.supabaseUrl / supabase.supabaseKey typing
`@supabase/supabase-js` v2 doesn't type these as public properties. bball reads them directly anyway (MaskingModal, ChatImageModal). Cast once at file top:

```ts
const supabaseUntyped = supabase as unknown as { supabaseUrl: string; supabaseKey: string }
```

### Edge Function 401 on first invoke after session expiry
`supabase.functions.invoke()` requires an active JWT. If the session expired, the gateway returns 401 with no log body. Re-auth and retry; the function itself is fine.

### Vercel/Vite build chunk size warning
The bundle is around 800 kB gzipped. The warning is a hint, not a blocker. Code-splitting with `import()` is a future optimization, not a launch blocker.

### bball Edge Function changes propagate to both Cloud Run services
The Docker image is shared. When the bball backend ships a fix, `gcloud run services update` BOTH `adidas-basketball-backend` AND `adigen-<slug>-backend` (and any other category services). See [docs/backend.md](backend.md) "Updating the deployed service" section.

### CopyGenerator save flow and Notebook are coupled
Notebook reads `saved_copy`. CopyGenerator writes via the heart button. If you port one without the other, Notebook is permanently empty. Port them together or document the gap.

### Placeholder image URLs break FAL
`CONTENT_TBD` strings in `src/<slug>/garments.ts` get passed straight to the AI API and fail with 422. Use real-but-cosmetic URLs in placeholders (a single grey PNG in the bucket).

### Layout full-bleed routes list is brittle
Every new image-creation route needs to be added to `FULL_BLEED_ROUTES` in `Layout.tsx` or it'll render with sidebar padding instead of edge-to-edge. Easy to miss when adding a new generation mode.

### POSE_VARIATIONS in bball's LifestyleImageCreation
bball swaps the pose thumbnail based on the selected model's gender (e.g. `Standing_FullBack_NOBall_Man.webp` vs `_Woman.webp`). adiGen's simpler version doesn't. If we add gender-aware pose thumbnails later, port the lookup.

---

## Tables touched (running-japan)

All in the shared Supabase project `ylgmmgdkcazhnubxyoho`:

| Table | Columns added | Purpose |
|---|---|---|
| `assets` | `category text` + index | Image / video generation outputs |
| `saved_copy` | `category text` + index | CopyGenerator → Notebook |
| `copy_projects` | `category text` + index | Notebook project organization |
| `reference_images` | `category text` + index | Editor uploaded references |

If the next category touches additional tenant-scoped tables, follow the same additive pattern.

---

## Forward work / open follow-ups

Tracked here so the next category port can decide what to inherit:

1. **Edge Function refactor** to read `category` from request body → drops the client-side category-tag band-aid. Lives in bball repo.
2. **NOT NULL constraint** on `category` columns. Requires bball patch first so its INSERTs write `'basketball'`.
3. **adiGen RLS policies** scoped strictly by `category`. Additive; bball policies stay untouched. Required before launch.
4. **Cross-category isolation tests** in CI.
5. **Sidebar collapse + tooltip behavior** from bball, not yet ported.
6. **Gallery's ToggleGroup migration** — Gallery still uses my hand-rolled filter buttons. Swap for the actual `ToggleGroup` primitive we ported later.
7. **PresetManager** (LifestyleGen) — deferred. Requires Supabase tables for preset storage.
8. **AppStateContext** — bball has one; adiGen never ported it. `useReferenceImages` works around it. If any next-category feature genuinely needs global state beyond auth/asset/generation, port AppState instead of re-deriving.
9. **Lifecycle policy JSON** for `saga-<slug>-images-eu` storage class transitions. Not urgent until the bucket has meaningful content.
10. **Backend convergence** — when category #3 ships, fold all per-category Cloud Run services into one shared service in its own repo. See [docs/backend.md](backend.md) convergence section.
11. **Platform extraction** — when running-japan + the next category are both stable, extract `Category` interface from the union of both `src/<slug>/` folders. Don't pre-build the abstraction.

---

## Related docs

- [docs/backend.md](backend.md) — Cloud Run / Supabase / GCS topology + deploy steps
- [docs/content-brief-running-japan.md](content-brief-running-japan.md) — adidas content team's asset spec for the running-japan category (template for next category's brief)
- bball repo `SUPABASE.md` — authoritative Supabase reference (project ref, region, edge function secrets, gotchas)
- bball repo `backend/` — canonical backend code shared across categories
