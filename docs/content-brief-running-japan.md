# adiGen — Running Japan Content Brief

This document specifies the visual + textual content the adidas Running Japan team needs to produce so that the **adiGen** tooling (a generalized version of the bball creative tool) can ship for running-japan.

Engineering is building the platform in parallel and will not be blocked on this brief until Phase 4 (Image Generation) reaches QA — likely ~3 weeks from kickoff. **Please confirm an owner and start date as soon as possible; this is the project's critical path.**

---

## What the tool does

adiGen lets adidas creative teams generate brand-compliant marketing assets via AI:
1. **Copy Generator** — produces headline + body copy across touchpoints (homepage, PDP, email, push, etc.) given a brief and a product.
2. **Image Generation** — produces lifestyle/product imagery via FAL.AI by combining: a chosen pose, garment combination, reference assets, location, scene style, and model face.
3. **Cropping Toolkit** — auto-crops campaign hero shots to all required marketing touchpoint dimensions.
4. **Editor / Notebook** — image refinement.

For running-japan v1, all four features will be available. The content below feeds the **Copy Generator** (1) and **Image Generation** (2). The Cropping Toolkit (3) and Editor (4) do not require new content.

---

## 1. Copy guidelines (Copy Generator)

**File location**: `src/running-japan/copy-guidelines.md` (already exists as a structural placeholder with TBD sections).

**What's needed**: a 1–2 page markdown document mirroring the structure of bball's `sport-specific/basketball.md`. Specifically:

- **Brand voice for Running Japan** — tone, formality register, Japan market considerations.
- **Key messaging pillars** — what running-japan stands for (3–5 themes).
- **Acceptable terms** — preferred words for runners, training, race events, etc. (e.g. do we say "runners" or "athletes"?).
- **Terms to avoid** — running clichés, cultural insensitivities, brand-prohibited language.
- **Audience considerations** — core runner vs lifestyle/casual runner vs other personas, with notes on language register per audience.
- **Campaign tone examples** — 3 example mini-copies showing high-energy launch tone vs heritage storytelling vs lifestyle tone.

Global brand rules (lowercase "adidas", British English where applicable, words-to-avoid list, trademark avoidance) are already encoded in shared files and don't need to be re-documented here.

**Delivery format**: plaintext markdown or Google Doc. Engineering will commit it to the repo.

---

## 2. Products list (Copy Generator + Image Generation)

**Current state**: 5 Supernova SKUs are pre-populated (`supernova-rise`, `supernova-prima`, `supernova-stride`, `supernova-solution`, `supernova-gtx`). Each has a tagline ("THE EVERYDAY ONE", etc.) carried over from bball's product catalog.

**What's needed**: confirmation of the running-japan in-scope product list for v1. Specifically:
- Are the 5 Supernova SKUs above correct for the Japan market launch?
- Any additional Japan-market-specific running shoes that should be included (e.g. Adizero Adios Pro 3, Boston, Takumi Sen, Adizero Japan, Adios Pro Evo)?
- For each product, we'll need the standard product guidance markdown (key benefit, approved technical claims, model taglines, headlines-by-touchpoint examples) following the structure of `agent-instructions/products/supernova.md`.

---

## 3. Image generation assets

These are the highest-volume content items, and the longest lead time.

### 3a. Pose sketches (~15–20 PNGs)

**Specs:**
- Resolution: 1024×1024 px
- Format: PNG with transparent or plain off-white background
- Style: line-drawing sketch (consistent with bball's pose sketches — refer to existing examples)
- A sketch per pose ID

**Suggested pose list for running** (refine with creative team):
- `running_jog_front` — medium-distance front-running, neutral pace
- `running_sprint_side` — side view sprint, full body
- `running_stride_back` — running away from camera
- `running_finish_line` — arms raised, finish-line moment
- `running_warm_up_stretch` — standing stretch
- `running_tying_shoe` — squatting, lacing shoe
- `running_hydrate_walking` — walking with water bottle
- `running_close_up_torso` — close-up jersey/torso
- `running_close_up_shoes` — close-up on feet/shoes
- `standing_full_back` — still hero pose, back view
- `standing_facing_close_up` — portrait
- `walking_relaxed` — cool-down walk
- `seated_on_steps_tying_shoe` — Japan-specific (temple/shrine steps)
- `crouched_starting_position` — sprint start
- `running_in_rain` — Japan-specific (umbrella or wet street)
- Plus 3–5 additional poses chosen by the creative team

For each pose, also note:
- **Visibility flags**: are the feet visible? Bottoms? Face? (Drives which product reference images get sent to the AI.)
- **View**: front / side / back (drives which product image variant is used).
- **Optional prop**: water bottle, towel, race bib — if the pose includes one, attach a reference image of the prop.

### 3b. Garment thumbnails

**Specs:**
- Resolution: 1024×1024 px (or square crop)
- Format: PNG or WebP, transparent or white background, product-photography quality
- For each garment: **front-view + back-view + side-view** versions

**Quantities (v1):**
- Tops: 6–8 (Tokyo Marathon jersey, light windbreaker, long-sleeve thermal, performance tee, etc.)
- Bottoms: 4–6 (running shorts, leggings, capris)
- Shoes: 4–6 (the Supernova line + any additional Japan-market SKUs from §2)

**Optional**: pre-rendered "hero outfit combinations" — when a specific tops+bottoms+shoes set is selected together, a single pre-composed reference image often gives better AI results than three separate ones. The creative team can identify 2–4 hero outfits per launch.

### 3c. Location references (~5)

**Specs:**
- Resolution: 1024×1024 px or 16:9
- Format: high-resolution location photograph
- Plus a short prompt description (1–2 sentences describing the location for the AI: lighting, weather, distinctive features)

**Suggested locations:**
- `tokyo_marathon_street` — Tokyo city street, marathon-day atmosphere
- `kyoto_temple_path` — temple approach, lanterns, traditional architecture
- `mt_fuji_lake_road` — lakefront with Fuji backdrop, natural light
- `tokyo_night_neon` — Shibuya at night, neon-lit street
- `sapporo_winter_park` — snowy park, optional (if running-japan campaign extends to winter)

Plus 1–2 alternates chosen by the creative team.

### 3d. Scene style thumbnails (8)

Re-usable concept from bball: golden hour, outdoor sunny, candid, flash photography, low angle, editorial, action shot, lifestyle.

**What's needed**: 8 small thumbnail images (256×256) that visually represent each style — used as picker UI in the tool. The actual style is encoded in prompts, so this is primarily a UI / brand-touch task.

### 3e. Model faces (optional)

bball uses a library of 16 sport-neutral model face references. These are reusable for running-japan as-is unless the adidas team wants a Japan-market-specific roster (e.g. local talent, market-relevant ethnicity mix). Confirm with brand whether to:
- (a) Reuse bball's 16 models, or
- (b) Curate a new Japan-market roster of 8–16 model faces (front + back views per model).

---

## 4. Delivery channel + naming

**Where to upload:**
- Engineering will create a new EU-region Google Cloud Storage bucket: `saga-running-japan-images-eu`.
- Content team uploads to that bucket via a shared folder, or hands files to engineering for upload — your choice.

**File naming convention:**
- Poses: `poses/<pose_id>.png` (e.g. `poses/running_sprint_side.png`)
- Garments: `garments/<product_id>/front.png`, `back.png`, `side.png`
- Locations: `locations/<location_id>.jpg`
- Scene styles: `scene-styles/<style_id>.jpg`
- Models: `models/<model_id>/face.jpg`, `back.jpg`

Engineering will map these paths into the application config.

---

## 5. Acceptance criteria

For each asset class, "done" means:
- File exists at the agreed path
- Specs match (resolution, format, background)
- Reviewed by adidas brand for accuracy + tone
- Engineering has confirmed the file loads correctly in the dev environment

---

## 6. Timeline + ownership

| Item | Lead time | Suggested owner |
|---|---|---|
| Copy guidelines markdown | 1 week | Brand/marketing writer + adidas legal |
| Product list confirmation + per-product guidance | 1–2 weeks | Brand marketing |
| Pose sketches (15–20) | 2–3 weeks | Creative / illustrator |
| Garment thumbnails (~50 images, 3 views each) | 2–3 weeks | Studio / product photography |
| Location references (~5) | 1–2 weeks | Creative / stock licensing |
| Scene style thumbnails (8) | 1 week | Creative |
| Model faces (if new) | 2–4 weeks | Casting / model agency |

**Critical path**: pose sketches + garment thumbnails. Engineering can begin Phase 4 (Image Generation) with placeholder content but cannot ship to QA without real assets.

**Suggested kickoff**: confirm scope + owners within 5 business days of this brief landing.

---

## Questions or sign-off?

Engineering point of contact: [TBD]
Adidas content lead: [TBD]

Please flag any item where the spec is unclear or the lead time is unrealistic, and we'll iterate before kickoff.
