# adiGen — Backend Reference

The backend code is NOT in this repo. It lives in `pieyrealexandre/sagastudioxadidasbball` (the bball repo, at `backend/`). adiGen deploys the same code as a **separate Cloud Run service** so that per-category configuration (GCS bucket, future secrets) is isolated, while the codebase stays single-source-of-truth.

This document is the contract between adiGen and that backend: what routes exist, what env vars they expect, how to deploy/update the service, and how to add new functionality.

---

## Topology

```
                                    Shared Supabase project (EU)
                                      ylgmmgdkcazhnubxyoho
                                              │
                ┌─────────────────────────────┼──────────────────────────────┐
                ▼                             ▼                              ▼
        adidas-basketball-           adigen-running-japan-           Supabase Edge Functions
        backend (Cloud Run)          backend (Cloud Run)             (Deno runtime, 12 fns)
        europe-west1                 europe-west1
        BUCKET=sagastudios-gnutts    BUCKET=saga-running-japan-images-eu
                │                             │
                └─────────────┬───────────────┘
                              ▼
                  Same code, same Docker image
                  (bball repo, backend/)

      bball frontend  ─────────►  bball backend
      adiGen frontend ─────────►  adigen-running-japan backend
```

**One codebase, two Cloud Run services**, distinguished only by env vars (most importantly `GCS_BUCKET_NAME`). Same Docker image can be deployed to both services — Cloud Run lets you point any number of services at a single image.

When we add a third category (e.g. football, tennis), it gets its own Cloud Run service with `BUCKET_NAME=saga-<category>-images-eu`. No code changes.

---

## Service Reference

| Service | Cloud Run name | URL | Bucket |
|---|---|---|---|
| bball | `adidas-basketball-backend` | `https://adidas-basketball-backend-836947241942.europe-west1.run.app` | `sagastudios-gnutts` |
| adiGen — running-japan | `adigen-running-japan-backend` *(TBD — needs initial deploy)* | TBD post-deploy | `saga-running-japan-images-eu` *(TBD — needs creation)* |

Both run in **europe-west1** (Belgium) to match the EU residency mandate and minimize Edge Function → backend latency (Supabase is in eu-central-1 / Frankfurt, ~250 ms RTT — acceptable).

---

## Routes the backend exposes

All routes are HTTPS, JSON in/out unless noted. Authentication is via `Authorization: Bearer <supabase-jwt>` header — the backend validates the JWT against Supabase Auth and extracts `user_id`. Unauthenticated requests get 401.

### Phase 3 — Cropping Toolkit

| Method | Path | Purpose | Body |
|---|---|---|---|
| POST | `/api/upload-assets/init` | Mint a signed GCS URL for direct browser upload | `{ filename, mimetype }` |
| POST | `/api/upload-assets/process` | After client PUT to signed URL, server processes (Sharp: rotate, resize, JPEG) and moves to final path | `{ tempPath, originalName }` |
| POST | `/api/smart-crop/analyze` | Vision analysis — SCRFD face detection OR Claude vision (focal/product/box modes) | `{ image_base64, mime_type, mode }` |
| POST | `/api/smart-crop` | Final crop generation using analysis results | `{ image_base64, mime_type, aspect_ratio, mode, ...analysis_results }` |
| GET | `/api/airtable/campaigns/:id/touchpoints` | Touchpoint dimensions for a campaign (currently placeholder data — only `DEMOCAMPAIGN0001` returns content) | URL param |
| GET | `/health` | Health check | none |
| GET | `/api/ping` | Simpler health check | none |

### Phase 4 — Image Generation

The Phase 4 image pipeline calls **Supabase Edge Functions** (`generate-image-pro`, `generate-outfit`, etc.), not the backend directly. Edge Functions then call the backend via `EXTERNAL_IMAGE_ENDPOINT_NANO` for FAL.AI orchestration. From adiGen's perspective, image gen is a Supabase RPC, not a backend HTTP call.

Phase 4 backend routes (called via Edge Functions, not the frontend):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/fal-nano/edit` | `fal-ai/nano-banana-2/edit` — multi-image edit (up to 10 refs). Core image gen path. |
| POST | `/api/fal-multi-image/generate` | `fal-ai/flux-pro/kontext/max/multi` — multi-ref Flux Pro Kontext (legacy/fallback) |
| POST | `/api/fal-kontext/edit` | `fal-ai/flux-pro/kontext/max` — single-ref Flux Kontext editing |
| POST | `/api/fal-text-image/generate` | `fal-ai/imagen4/preview/ultra` — text-to-image |
| POST | `/api/fal-birefnet/generate` | `fal-ai/birefnet/v2` — background removal |
| POST | `/api/fal-crystal-upscale/generate` | `fal-ai/crystal-upscaler` — 2x/4x upscale |
| POST | `/api/fal-llm/generate` | Anthropic Claude pass-through (used by some flows) |

For routes not listed here, check the bball repo's `backend/server.js` for the full registration list — keep this file in sync.

---

## Env vars the running-japan service needs

Set in Cloud Run service config (NOT committed to repo). Source secrets from Google Secret Manager unless noted.

| Name | Value | Source |
|---|---|---|
| `SUPABASE_URL` | `https://ylgmmgdkcazhnubxyoho.supabase.co` | Plain env (not secret) |
| `SUPA_SERVICE_ROLE_KEY` | (legacy service_role JWT for EU project) | GCP Secret Manager: `SUPA_SERVICE_ROLE_KEY` |
| `SUPABASE_ANON_KEY` | (legacy anon JWT for EU project) | GCP Secret Manager: `SUPABASE_ANON_KEY` |
| `ANTHROPIC_API_KEY` | Anthropic API key (used by smart-crop and AI chat) | GCP Secret Manager: `ANTHROPIC_API_KEY` |
| `CROPPING_PROTOTYPE_ANTHROPIC_KEY` | Same as above, or a separate billing-isolated key | GCP Secret Manager: `CROPPING_PROTOTYPE_ANTHROPIC_KEY` |
| `FAL_API_KEY` | FAL.AI API key (Phase 4) | GCP Secret Manager: `FAL_API_KEY` |
| `GCS_BUCKET_NAME` | **`saga-running-japan-images-eu`** ← critical, this is what makes the service category-specific | Plain env |
| `GCP_PROJECT_ID` | `manifest-vault-452305-a8` | Plain env |
| `DEFAULT_SUPABASE_PROJECT_ID` | `ylgmmgdkcazhnubxyoho` | Plain env |
| `PORT` | `8080` | Cloud Run default |
| `RATE_LIMIT_MAX` | `100` | Plain env |

The bball backend code also reads some unused-by-adiGen env vars (`ELEVENLABS_API_KEY`, `SUPA_SERVICE_ROLE_KEY_2/3`, `SUPABASE_FUNCTIONS_URL_2/3`) — leave them unset. The code handles missing values gracefully.

---

## Initial deploy (one-time)

Prerequisites:
- `gcloud` authenticated as a user with `roles/run.admin` and `roles/storage.admin` on the `manifest-vault-452305-a8` GCP project.
- The Docker image already exists at `gcr.io/manifest-vault-452305-a8/adidas-basketball-backend` (bball's deploys keep it current). If not, build it from the bball repo first: `cd path/to/bball/backend && gcloud builds submit --tag gcr.io/manifest-vault-452305-a8/adidas-basketball-backend`.

Steps:

```powershell
# 1. Create the GCS bucket for running-japan
gcloud storage buckets create gs://saga-running-japan-images-eu `
  --location=europe-west1 `
  --uniform-bucket-level-access `
  --public-access-prevention=enforced

# 2. Optional: lifecycle policy (storage class transitions for cost)
#    Standard → Nearline at 30d → Coldline at 90d → Archive at 365d
#    Saves ~50-85% per GB without deleting anything
gcloud storage buckets update gs://saga-running-japan-images-eu --lifecycle-file=lifecycle.json

# 3. Deploy the bball image as a new Cloud Run service with running-japan config
gcloud run deploy adigen-running-japan-backend `
  --image gcr.io/manifest-vault-452305-a8/adidas-basketball-backend `
  --region europe-west1 `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars "SUPABASE_URL=https://ylgmmgdkcazhnubxyoho.supabase.co,GCS_BUCKET_NAME=saga-running-japan-images-eu,GCP_PROJECT_ID=manifest-vault-452305-a8,DEFAULT_SUPABASE_PROJECT_ID=ylgmmgdkcazhnubxyoho,RATE_LIMIT_MAX=100" `
  --set-secrets "SUPA_SERVICE_ROLE_KEY=SUPA_SERVICE_ROLE_KEY:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,CROPPING_PROTOTYPE_ANTHROPIC_KEY=CROPPING_PROTOTYPE_ANTHROPIC_KEY:latest,FAL_API_KEY=FAL_API_KEY:latest" `
  --memory 1Gi `
  --cpu 1 `
  --max-instances 10 `
  --service-account adigen-runtime@manifest-vault-452305-a8.iam.gserviceaccount.com

# 4. Capture the service URL (output from previous command), update adiGen .env.local
#    VITE_BACKEND_URL=https://adigen-running-japan-backend-<hash>.europe-west1.run.app
```

The service account `adigen-runtime@...` needs `roles/storage.objectAdmin` on `saga-running-japan-images-eu` to write uploads, and `roles/secretmanager.secretAccessor` on the listed secrets.

---

## Updating the deployed service

**When the bball repo's `backend/` changes (new route, bugfix):**

```powershell
# Trigger a fresh image build from bball repo (or wait for bball CI to do it)
cd path/to/bball
gcloud builds submit backend/ --tag gcr.io/manifest-vault-452305-a8/adidas-basketball-backend

# Then update both services to use the new image
gcloud run services update adidas-basketball-backend --region europe-west1 --image gcr.io/manifest-vault-452305-a8/adidas-basketball-backend
gcloud run services update adigen-running-japan-backend --region europe-west1 --image gcr.io/manifest-vault-452305-a8/adidas-basketball-backend
```

**When only adiGen's env vars change** (e.g. swap to a different bucket):

```powershell
gcloud run services update adigen-running-japan-backend `
  --region europe-west1 `
  --update-env-vars "GCS_BUCKET_NAME=new-bucket-name"
```

---

## CORS

The bball backend uses `cors: { origin: true, credentials: true }` — accepts any origin. adiGen's Vercel deploy URL works out of the box. No CORS config needed in adiGen.

If we tighten CORS later (recommended pre-launch), allow:
- `https://*-pieyres-projects.vercel.app` (preview deploys)
- `https://adigen.vercel.app` or whatever the prod domain ends up as
- `http://localhost:5173` and friends (dev)

CORS config lives in the bball repo's `backend/server.js`. Tightening it requires a code change there.

---

## How adiGen adds a new backend route

Since adiGen doesn't own the backend repo, route additions require coordination:

1. Open a PR against `pieyrealexandre/sagastudioxadidasbball` adding the route under `backend/routes/`.
2. Make sure the route is category-agnostic (reads category from request, doesn't hardcode anything).
3. Have it reviewed + merged.
4. Build a new image (bball CI or manual `gcloud builds submit`).
5. Roll the new image to both `adidas-basketball-backend` and `adigen-running-japan-backend`.

**Avoid this if possible.** For most adiGen-only logic, prefer:
- A Supabase Edge Function (lives in bball's `supabase/functions/` but is logically separable)
- A Vercel API route in adiGen's repo (no Cloud Run involved, scales to zero, ~no extra cost)
- Frontend-only solutions (the cropping toolkit's ZIP bundling is a good example — JSZip in browser, no backend involved)

---

## Logs and observability

| Need | Where |
|---|---|
| Backend stdout/stderr | `gcloud logging read 'resource.labels.service_name="adigen-running-japan-backend"' --limit 50 --format=json` |
| Cloud Run metrics (req count, latency, error rate) | https://console.cloud.google.com/run/detail/europe-west1/adigen-running-japan-backend/metrics |
| GCS bucket usage / billing | https://console.cloud.google.com/storage/browser/saga-running-japan-images-eu |
| Errors filtered | Add `severity>=ERROR` to the logging read query |

Recommended: set up a per-service billing alert at $50/month on Cloud Run + Storage combined. Catches runaway loops early. See `docs/cost-monitoring.md` once written.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 on every request | adiGen `.env.local` has stale anon key or wrong Supabase URL | Reset from Supabase dashboard, restart dev server |
| 500 from `/api/upload-assets/init` | Service account missing `roles/storage.objectAdmin` on the bucket | `gcloud storage buckets add-iam-policy-binding gs://saga-running-japan-images-eu --member=serviceAccount:adigen-runtime@... --role=roles/storage.objectAdmin` |
| CORS error in browser console | Vercel deploy URL not allowed (only after we tighten CORS — not yet) | Update CORS config in bball repo, redeploy |
| 503 / cold start timeout | Cloud Run scaled to zero, first request is slow | Normal. Set `--min-instances=1` if latency-critical. ~$5/mo extra. |
| Uploads land in wrong bucket | `GCS_BUCKET_NAME` env var wrong on the service | `gcloud run services describe adigen-running-japan-backend --region europe-west1` to inspect, update via `--update-env-vars` |
| Edge Function returns 401 with valid JWT | The Edge Function's own `supabase.auth.getUser(jwt)` rejected the token (e.g. it's a service_role JWT, not a user access token) | Use a real user's access token from `supabase.auth.getSession()` |

---

## Open questions / TBD

- [ ] **Initial deploy** of `adigen-running-japan-backend` Cloud Run service hasn't happened yet. Use the section above to deploy when ready.
- [ ] **`saga-running-japan-images-eu` GCS bucket** doesn't exist yet. Create as part of the deploy.
- [ ] **Service account** `adigen-runtime@...` doesn't exist yet. Create with `gcloud iam service-accounts create adigen-runtime --display-name='adiGen runtime'`, grant the IAM roles listed above.
- [ ] **Lifecycle policy JSON** (`lifecycle.json`) for storage-class transitions — write this and commit to `docs/lifecycle/running-japan.json`.
- [ ] **Backend CI/CD trigger**: when bball backend merges a change, who rolls the new image to `adigen-running-japan-backend`? Probably a Cloud Build trigger on bball repo `main` that updates both services.

---

## Related docs

- bball repo's `SUPABASE.md` — authoritative Supabase reference (project ref, region, edge function secrets, gotchas)
- bball repo's `STAGING.md` — staging environment reference
- bball repo's `backend/` source — the canonical backend code
- `docs/content-brief-running-japan.md` (this repo) — content workstream for the adidas team
