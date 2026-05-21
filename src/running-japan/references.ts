// Reference assets for running-japan image generation:
//   - Locations (the campaign backdrop)
//   - Scene styles (the photographic treatment / mood)
//   - Models (the human face references)
//
// In bball these lived scattered across `LifestyleImageCreation.tsx` (the
// `locationOptions` + `sceneStyleOptions` constants), the `mockProducts.location`
// array in `SelectionModal.tsx`, and `ModelSelector.tsx`. Consolidating here so
// running-japan-specific picks live in one file with running-japan's other data.
//
// CONTENT STATUS: All thumbnails are placeholders. Scene-style PROMPTS are
// reused conceptually from bball (the photographic vocabulary is sport-agnostic),
// but the thumbnails illustrating them need to be re-shot in running contexts.

const CONTENT_TBD = 'PLACEHOLDER — see docs/content-brief-running-japan.md'

// -----------------------------------------------------------------------------
// Locations

export interface RunningLocation {
  id: string
  name: string
  /** UI thumbnail. */
  thumbnailUrl: string
  /**
   * AI prompt describing the location. Should include lighting, weather,
   * distinctive features. The jsonPromptBuilder concatenates this into the
   * scene description.
   */
  prompt: string
}

export const LOCATIONS: RunningLocation[] = [
  {
    id: 'tokyo_marathon_street',
    name: 'Tokyo Marathon Street',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'a Tokyo city street during the marathon, mid-morning natural light, urban crowd in the background, modern Japanese architecture',
  },
  {
    id: 'kyoto_temple_path',
    name: 'Kyoto Temple Path',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'a traditional temple approach in Kyoto, lanterns lining the stone path, soft early-morning light, weathered wood and stone, traditional Japanese architecture',
  },
  {
    id: 'mt_fuji_lake_road',
    name: 'Mt. Fuji Lake Road',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'a lakefront road with Mt. Fuji in the background, calm water, low natural sunlight, distant snow-capped peak, open sky',
  },
  {
    id: 'tokyo_night_neon',
    name: 'Tokyo Night Neon',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'a neon-lit Shibuya street at night, wet pavement reflections, dense modern signage in Japanese, dramatic city lights',
  },
]

export const LOCATIONS_BY_ID: Record<string, RunningLocation> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l]),
)

// -----------------------------------------------------------------------------
// Scene styles

export interface RunningSceneStyle {
  id: string
  name: string
  thumbnailUrl: string
  /** Photographic-treatment prompt fragment ("golden hour, soft warm light, …"). */
  prompt: string
}

export const SCENE_STYLES: RunningSceneStyle[] = [
  {
    id: 'golden_hour',
    name: 'Golden Hour',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'golden hour photography, warm soft directional sunlight, long shadows, editorial composition, candid feel',
  },
  {
    id: 'editorial_daylight',
    name: 'Editorial Daylight',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'mid-day editorial photography, even bright daylight, crisp focus, magazine-quality composition, balanced colour palette',
  },
  {
    id: 'candid_action',
    name: 'Candid Action',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'candid sports photography, motion blur on background, subject in sharp focus, dynamic angle, documentary feel',
  },
  {
    id: 'low_angle_drama',
    name: 'Low-Angle Drama',
    thumbnailUrl: CONTENT_TBD,
    prompt:
      'low-angle shot looking up, dramatic perspective, sky as backdrop, subject powerful in frame, high-impact composition',
  },
]

export const SCENE_STYLES_BY_ID: Record<string, RunningSceneStyle> = Object.fromEntries(
  SCENE_STYLES.map((s) => [s.id, s]),
)

// -----------------------------------------------------------------------------
// Models
//
// The Phase 4 explore identified that bball's 16-model roster (faces + back-view
// pairs) is sport-neutral and reusable. For running-japan v1 we either:
//   (a) keep using bball's roster as-is (URLs reference assets in
//       sagastudios-gnutts that we have read access to), OR
//   (b) curate a Japan-market-specific roster.
//
// (a) is the v1 default — fastest path; the adidas content team can decide later
// whether a Japan-specific roster is needed. The list below is a placeholder
// structure; real entries are imported from a future ModelSelector port.

export interface RunningModel {
  id: string
  gender: 'male' | 'female'
  name: string
  /** Face reference image sent to the AI on every generation. */
  faceUrl: string
  /** Smaller image used in the picker UI; falls back to faceUrl. */
  thumbnailUrl?: string
  /** Back-of-head reference, only used for poses with view === 'back'. */
  backUrl?: string
  /** Skin-tone description used by jsonPromptBuilder. */
  skinTone?: string
}

// bball's GCS bucket is the canonical source of the model faces. The shared
// Supabase project also serves the originals via the public reference-images
// bucket. We reference both; adidas content team can replace these with Japan-
// curated models later.
const BBALL_BUCKET = 'https://storage.googleapis.com/sagastudios-gnutts'
const SUPABASE_PUBLIC =
  'https://ylgmmgdkcazhnubxyoho.supabase.co/storage/v1/object/public/reference-images/Model%20Faces'

export const MODELS: RunningModel[] = [
  {
    id: 'female_8',
    gender: 'female',
    name: 'Digital Twin Female',
    faceUrl: `${SUPABASE_PUBLIC}/Female_Model_8.png`,
    thumbnailUrl: `${BBALL_BUCKET}/model-faces/Female_Model_8_Thumb.jpg`,
    skinTone: 'medium-brown skin tone',
  },
  {
    id: 'male_8',
    gender: 'male',
    name: 'Digital Twin Male',
    faceUrl: `${SUPABASE_PUBLIC}/Male_Model_8.png`,
    thumbnailUrl: `${BBALL_BUCKET}/model-faces/Male_Model_8_Thumb.jpg`,
    skinTone: 'medium-brown skin tone',
  },
  {
    id: 'female_1',
    gender: 'female',
    name: 'Woman 1',
    faceUrl: `${SUPABASE_PUBLIC}/Female_model_v1.jpeg`,
    skinTone: 'african-american skin',
  },
  {
    id: 'female_3',
    gender: 'female',
    name: 'Woman 3 (Asian)',
    faceUrl: `${SUPABASE_PUBLIC}/Female_Model_2_Asian.jpeg`,
    skinTone: 'asian skin',
  },
  {
    id: 'female_7',
    gender: 'female',
    name: 'Woman 7 (Asian)',
    faceUrl: `${SUPABASE_PUBLIC}/Female_Model_7.jpg`,
    skinTone: 'asian skin',
  },
  {
    id: 'male_4',
    gender: 'male',
    name: 'Man 4',
    faceUrl: `${SUPABASE_PUBLIC}/Male_Model_4.jpeg`,
    skinTone: 'medium-dark skin tone',
  },
]

export const MODELS_BY_ID: Record<string, RunningModel> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
)

export const MODELS_BY_GENDER = {
  male: MODELS.filter((m) => m.gender === 'male'),
  female: MODELS.filter((m) => m.gender === 'female'),
}
