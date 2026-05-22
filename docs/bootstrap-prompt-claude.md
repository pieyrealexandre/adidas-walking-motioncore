# adiGen — A-to-Z bootstrap prompt for Claude Code

Paste the prompt below into a fresh Claude Code session that's running in a **freshly-cloned** adigen repo (e.g., `git clone https://github.com/pieyrealexandre/adigen.git adigen-<slug> && cd adigen-<slug>`).

Before pasting, verify:
- `gcloud auth list` shows your GCP user with access to `manifest-vault-452305-a8`
- `gh auth status` shows you authenticated to GitHub
- Supabase MCP tools are connected (in Claude Code: check `mcp__claude_ai_Supabase__list_projects` returns results)
- Vercel MCP tools are connected
- You know the new category slug, display name, and have decided whether you have a content brief ready

---

## The prompt

```
I'm bootstrapping a NEW adiGen category from this freshly-cloned adigen
repo. Take me from here to a fully working deployment, A to Z.

═══ INPUTS (replace these placeholders before sending) ═══
- Category slug (kebab-case, used in URLs/buckets/DB):  football-emea
- Display name (shown on Login + Dashboard):            Football — EMEA
- GCP project ID:                                       manifest-vault-452305-a8
- GCP region:                                           europe-west1
- New GitHub repo name (under pieyrealexandre):         adigen-football-emea
- Vercel project name:                                  adigen-football-emea
- Content brief path (or "none" to use placeholders):   none

═══ ARCHITECTURE — read carefully, don't reinvent ═══
adiGen ships ONE codebase per category with SHARED backend infrastructure.
For a new category, you create:
  ✓ One new GCS bucket             (saga-<slug>-images-eu)
  ✓ One new Cloud Run service       (adigen-<slug>-backend)
  ✓ One new GitHub repo + Vercel project
  ✓ Additive DB column on 4 shared Supabase tables (if not yet present)

You DO NOT create:
  ✗ A new Supabase project           — reuse ylgmmgdkcazhnubxyoho (shared)
  ✗ A new runtime service account    — reuse adigen-runtime@... (shared)
  ✗ New Secret Manager secrets       — reuse EU_SUPA_SERVICE_ROLE_KEY,
                                       EU_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY,
                                       CROPPING_PROTOTYPE_ANTHROPIC_KEY,
                                       FAL_API_KEY (already granted to SA)
  ✗ Forked Edge Functions            — they live in the bball repo and stay
                                       basketball-prompted; the client-side
                                       category-tag band-aid handles isolation
  ✗ A new Docker image               — reuse the bball backend image

═══ AUTHORITATIVE DOCS — read these FIRST, in order ═══
1. docs/new-category-bootstrap.md  — the human-driven fork-and-rename workflow
                                     (Phase 2 detail)
2. docs/backend.md                 — Cloud Run / GCS / IAM / Secret Manager
                                     (Phases 3-5 detail; the gcloud commands
                                     under "Initial deploy" are the template)
3. docs/category-port-runbook.md   — DB migration SQL (Step 1), Edge Function
                                     band-aid pattern, RLS gotcha, FAL
                                     placeholder URL gotcha

═══ AVAILABLE TOOLS ═══
- Supabase MCP (mcp__claude_ai_Supabase__*) for DB inspection + apply_migration
- Vercel MCP (mcp__claude_ai_Vercel__*) for project create + env vars + deploy
- gcloud CLI for GCS + Cloud Run + IAM (assume authed)
- gh CLI for GitHub repo creation (assume authed)
- PowerShell as the default shell

═══ WORKFLOW ═══
Execute the PHASES below in order. After each phase, report status in one
sentence and pause for my "go" before starting the next. For any DESTRUCTIVE
step (DB migration, bucket create, Cloud Run deploy, repo push, Vercel
deploy), print the EXACT command/SQL FIRST and wait for explicit "yes" before
running.

────────────────────────────────────────────────────────────
PHASE 1 — PLAN & CONFIRM
────────────────────────────────────────────────────────────
- Read the three docs above end-to-end.
- Sanity-check the inputs:
  * `gcloud storage buckets describe gs://saga-<slug>-images-eu` MUST 404
    (slug not in use)
  * `gcloud run services describe adigen-<slug>-backend --region <region>`
    MUST 404
  * `gh repo view pieyrealexandre/<repo-name>` MUST fail (repo doesn't exist)
- Print a one-page plan listing every command/migration/file edit you'll
  run, grouped by Phase 2-7. Wait for my "go".

────────────────────────────────────────────────────────────
PHASE 2 — FRONTEND RENAME (no infra yet, fully reversible)
────────────────────────────────────────────────────────────
Follow docs/new-category-bootstrap.md Steps 2-3 verbatim:

  $slug = '<slug>'
  Rename-Item -Path src/running-japan -NewName $slug
  Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | ForEach-Object {
    (Get-Content $_.FullName -Raw) -replace '@/running-japan', "@/$slug" |
      Set-Content $_.FullName -NoNewline
  }

Then edit src/<slug>/index.ts lines 3-4:
  CATEGORY_SLUG = '<slug>'
  CATEGORY_DISPLAY_NAME = '<Display Name>'

Then:
- `npm install && npm run build` — MUST exit 0. If it fails, stop and
  report errors verbatim.
- Grep src/ for "running-japan" and categorize every hit as:
  (A) historical comment — expected, no action
  (B) un-rewritten import — BUG in the rename script, stop and report
  (C) live runtime string literal — BUG in the refactor, stop and report
- Continue only if all hits are (A).

────────────────────────────────────────────────────────────
PHASE 3 — DATABASE MIGRATION (via Supabase MCP)
────────────────────────────────────────────────────────────
REMINDER: DO NOT create a new Supabase project. Use the SHARED EU project
`ylgmmgdkcazhnubxyoho` for every category.

Use mcp__claude_ai_Supabase__list_tables on project `ylgmmgdkcazhnubxyoho`.
For each of these tenant-scoped tables, check if a `category text` column
exists: assets, saved_copy, copy_projects, reference_images.

  IF the column exists on all 4 tables → migration already applied from
  the running-japan port. Skip this phase entirely (idempotent).

  IF any table is missing the column → apply this migration per-table
  via mcp__claude_ai_Supabase__apply_migration (print the SQL and wait for
  "yes" before each):

    ALTER TABLE public.<table> ADD COLUMN IF NOT EXISTS category text;
    UPDATE public.<table> SET category = 'basketball' WHERE category IS NULL;
    CREATE INDEX IF NOT EXISTS idx_<table>_category
      ON public.<table> (category, user_id);

CRITICAL — DO NOT:
  ✗ Add NOT NULL constraint — would break bball INSERTs that don't write
    the column
  ✗ Modify bball's existing RLS policies — the new category INHERITS
    bball's shared-workspace model by default. If this category needs
    per-user privacy on `assets`, see docs/category-port-runbook.md
    "RLS is shared-workspace, not per-user" for the RESTRICTIVE policy
    template — but ASK ME FIRST.

────────────────────────────────────────────────────────────
PHASE 4 — GCS BUCKET + IAM
────────────────────────────────────────────────────────────
Step 4a — Create the CORS config file in the repo:
  Copy docs/lifecycle/cors-running-japan.json to
  docs/lifecycle/cors-<slug>.json (contents are identical — same CORS
  policy across categories). This file gets committed in Phase 6.

Step 4b — Create the bucket (print command, wait for "yes"):
  gcloud storage buckets create gs://saga-<slug>-images-eu `
    --location=<region> `
    --project=<gcp-project>
  # Do NOT enable uniform bucket-level access (--uniform-bucket-level-access);
  # the bball backend uses per-object public ACLs which require fine-grained
  # access. See docs/backend.md:117-119.

Step 4c — Apply CORS:
  gcloud storage buckets update gs://saga-<slug>-images-eu `
    --cors-file=docs/lifecycle/cors-<slug>.json `
    --project=<gcp-project>

Step 4d — Grant the SHARED `adigen-runtime` service account access to
the new bucket (do NOT create a new SA):
  $SA = "adigen-runtime@<gcp-project>.iam.gserviceaccount.com"
  gcloud storage buckets add-iam-policy-binding gs://saga-<slug>-images-eu `
    --member="serviceAccount:$SA" `
    --role="roles/storage.objectAdmin"

The other IAM grants (logging.logWriter, monitoring.metricWriter,
secretmanager.secretAccessor on the 5 shared secrets,
iam.serviceAccountTokenCreator on self) are ALREADY in place on
adigen-runtime from the running-japan deploy — do not re-grant.

────────────────────────────────────────────────────────────
PHASE 5 — CLOUD RUN SERVICE
────────────────────────────────────────────────────────────
Deploy `adigen-<slug>-backend` reusing the bball Docker image and the
shared `adigen-runtime` service account. Print the command and wait
for "yes":

  $SA = "adigen-runtime@<gcp-project>.iam.gserviceaccount.com"
  gcloud run deploy adigen-<slug>-backend `
    --image=gcr.io/<gcp-project>/adidas-basketball-backend:latest `
    --region=<region> `
    --platform=managed `
    --allow-unauthenticated `
    --service-account=$SA `
    --memory=1Gi --cpu=1 --max-instances=10 --port=8080 `
    --set-env-vars="DEFAULT_SUPABASE_PROJECT_ID=ylgmmgdkcazhnubxyoho,GCS_BUCKET_NAME=saga-<slug>-images-eu,GCP_PROJECT_ID=<gcp-project>,RATE_LIMIT_MAX=100" `
    --set-secrets="SUPA_SERVICE_ROLE_KEY=EU_SUPA_SERVICE_ROLE_KEY:latest,SUPABASE_ANON_KEY=EU_SUPABASE_ANON_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,CROPPING_PROTOTYPE_ANTHROPIC_KEY=CROPPING_PROTOTYPE_ANTHROPIC_KEY:latest,FAL_API_KEY=FAL_API_KEY:latest" `
    --project=<gcp-project>

Notes:
  - 4 plain env vars + 5 mounted secrets — every one is required;
    omitting any breaks specific feature paths (uploads, AI gen, FAL,
    Supabase auth)
  - `DEFAULT_SUPABASE_PROJECT_ID` is what makes the backend construct
    the right Supabase URL; do NOT also set `SUPABASE_URL`
  - Capture the deployed URL from gcloud's output —
    `https://adigen-<slug>-backend-836947241942.<region>.run.app` —
    you need it for Phase 6 .env update

Smoke-check the deploy:
  curl https://<deployed-url>/health
  # Should return 200 with `{"status":"ok"}` or equivalent

────────────────────────────────────────────────────────────
PHASE 6 — ENV + GITHUB + VERCEL
────────────────────────────────────────────────────────────
Step 6a — Update env files in the repo:
  - .env.example: replace VITE_BACKEND_URL value with the new Cloud Run URL
  - .env.local:  same (it stays gitignored; only edit your local copy)
  Supabase vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) stay unchanged.

Step 6b — Commit and push:
  git add src/<slug>/ src/pages/*.tsx .env.example docs/lifecycle/cors-<slug>.json
  git status   # review before committing
  git commit -m "Bootstrap <slug> category from adigen template"

Step 6c — Create GitHub repo (print command, wait for "yes"):
  gh repo create pieyrealexandre/<repo-name> `
    --public `
    --source=. `
    --remote=origin `
    --push

Step 6d — Vercel project + env vars + deploy via Vercel MCP:
  - Import the new GitHub repo as a Vercel project named <vercel-project>
  - Set 3 env vars (Production + Preview + Development scopes):
      VITE_SUPABASE_URL       (shared value from .env.example)
      VITE_SUPABASE_ANON_KEY  (shared value from .env.example)
      VITE_BACKEND_URL        (new Cloud Run URL from Phase 5)
  - Trigger the first deploy
  - Wait for build + deploy to finish; capture the production URL

────────────────────────────────────────────────────────────
PHASE 7 — SMOKE TEST
────────────────────────────────────────────────────────────
- Open the Vercel production URL in a browser (or web_fetch).
- /login wordmark MUST read "adiGen — <display name>".
- Sign in with my existing Supabase user credentials (ask me for them
  only if not in browser session already).
- Generate ONE lifestyle image OR product image. (Outputs will LOOK
  basketball-flavored because the Edge Functions are unchanged — that's
  expected; we're testing the wiring, not the content.)
- Via Supabase MCP: confirm a new row in `assets` table with
  category = '<slug>' and the asset URL points at saga-<slug>-images-eu.
- Via gcloud or console: confirm at least one object exists in the
  new bucket.
- Cross-isolation check (best-effort): if I have a bball login handy,
  open the bball app and confirm the new asset is NOT visible there.
  If not, just note "needs manual cross-isolation check".

────────────────────────────────────────────────────────────
PHASE 8 — POST-LAUNCH TODOS (do NOT execute, just print)
────────────────────────────────────────────────────────────
Print a punch list for me to handle later:
  - Set a $50/month billing alert on adigen-<slug>-backend + the new
    bucket (see docs/backend.md:251)
  - Replace placeholder data in src/<slug>/{poses,garments,references,
    products}.ts + copy-guidelines.md per content brief (refer to
    docs/content-brief-running-japan.md as the template; ask content
    team for a parallel brief named docs/content-brief-<slug>.md)
  - If this category needs per-user privacy on `assets`, apply the
    RESTRICTIVE RLS policy from docs/category-port-runbook.md
    "RLS is shared-workspace" gotcha
  - GCS storage-class lifecycle (Standard → Nearline → Coldline) —
    write docs/lifecycle/<slug>.json once bucket has >100 GB
    (docs/backend.md:184)
  - Edge Function refactor in bball repo so outputs reflect this
    category's prompts instead of basketball ones (cross-team work,
    not adiGen-side; runbook Step 4 caveat)

═══ IF YOU GET STUCK ═══
- Missing creds (gcloud, gh, MCP unavailable): STOP and tell me what
  to authenticate. Don't fake credentials.
- Doc says one thing, reality says another (column already exists,
  bucket name taken, repo exists): STOP, report the conflict, propose
  options, wait for direction.
- Build/deploy/migration failure: print error verbatim, propose root
  cause, DO NOT auto-retry with a workaround.
- Permission denied on a gcloud command: check `gcloud auth list` and
  `gcloud config get-value project`, tell me what you see.

═══ FINAL REPORT ═══
After Phase 7, give me a one-page summary:
- Production Vercel URL
- Cloud Run service URL + region
- GCS bucket name + region
- Supabase tables: which were touched, how many rows now have the new
  category tag
- GitHub repo URL
- Vercel project URL
- Known deferred work (the Phase 8 punch list)
- Any surprises or doc bugs you noticed during execution
```

---

## Why this prompt is structured the way it is

- **Phase gates with explicit "go".** Bootstrap touches money (Cloud Run = compute, GCS = storage), shared infra (Supabase), and a public deploy. Each destructive step gets a stop-and-confirm.
- **Phase 2 before Phase 3.** Frontend rename + build first because it's cheap to throw away. Don't provision infra until the frontend forks cleanly.
- **Explicit "DO NOT" architecture block at the top.** Without it, Claude might create a new Supabase project, a new SA, or new secrets — each wastes 30+ min and creates cleanup. The "what already exists and gets reused" answer is non-obvious from running-japan's deploy record (which created everything as a first-time setup).
- **MCP-first for DB and Vercel, gcloud for GCP.** Matches the tools available.
- **No NOT NULL warning.** That's the load-bearing constraint from the runbook that's easy to miss and would silently break bball.
- **Edge Function band-aid called out in Phase 7.** Without it, Claude might report "outputs look wrong" as a deploy bug instead of expected behavior.
- **Pre-flight auth at the top of this file (not in the prompt).** A pasted prompt can't introspect your shell. You verify auth before pasting.

## Maintenance

When `docs/backend.md`, `docs/category-port-runbook.md`, or `docs/new-category-bootstrap.md` change in a way that affects bootstrap (new infra dependency, new env var, new gotcha), update this prompt to match. The prompt deliberately repeats the load-bearing constraints (Supabase project ID, secret names, env var names) inline so a Claude session can execute confidently without re-reading every doc — that repetition is the maintenance tax.
