import sharp from 'sharp';
import { detectFaces, pickMainFace } from '../lib/faceDetector.js';

// Padding around the face that should stay inside the crop, expressed as a
// fraction of the crop dimensions on each side. 0.08 = the face must be at
// least 8% of crop width/height away from any crop edge.
const FACE_PADDING_RATIO = 0.08;

// In retinaface mode we only know where the face is, not where the body ends.
// To bias the crop downward (face in upper third instead of dead-centered), we
// shift the crop center this many face-heights below the face center.
const RETINAFACE_DOWNWARD_BIAS_FACE_HEIGHTS = 1.5;

const VISION_MODEL = 'claude-sonnet-4-6';

const SUPPORTED_MODES = ['box', 'focal', 'retinaface', 'product', 'manual'];
const isMode = (m) => SUPPORTED_MODES.includes(m);
const requiresClaude = (m) => m === 'box' || m === 'focal' || m === 'product';

// Pixel-bomb defense: parity with the upload pipeline (see UPLOADS.md). 200 MP
// covers any realistic camera/scan output and rejects pathological inputs that
// would OOM the instance during decode. Skipping sequentialRead here because
// extract() operations need random access.
const SHARP_INPUT_OPTS = { limitInputPixels: 200_000_000 };

// Mode "box": Claude returns tight bounding boxes for the body and face.
// The server centers the crop on the body box centroid and pads from the face box.
const REPORT_MAIN_SUBJECT_TOOL = {
  name: 'report_main_subject',
  description: 'Identify the MAIN human subject in the image. Return tight bounding boxes for their body and their face. The server centers the crop on the body and uses the face box to enforce padding from the crop edges.',
  input_schema: {
    type: 'object',
    properties: {
      body_box: {
        type: 'object',
        description: "VERY TIGHT bounding box hugging ONE person's body + head silhouette. The box must wrap the chosen subject closely — do not pad, do not leave generous margins. EXCLUDE: other people in the frame (even if they overlap or stand close), outstretched arms or legs that reach far beyond the torso, held objects (basketballs, bags), shadows, props, and any background. The box's centroid is used to center the crop, so a wide or loose box pulls the framing off-center. Coords normalized 0-1 where (0,0) is top-left of the source.",
        properties: {
          left: { type: 'number' },
          top: { type: 'number' },
          right: { type: 'number' },
          bottom: { type: 'number' },
        },
        required: ['left', 'top', 'right', 'bottom'],
      },
      face_box: {
        type: 'object',
        description: "Tight bounding box around the main subject's face/head only — chin to top of hair, ear to ear. Coords normalized 0-1 like body_box. Omit only if the face is genuinely not visible (back of head).",
        properties: {
          left: { type: 'number' },
          top: { type: 'number' },
          right: { type: 'number' },
          bottom: { type: 'number' },
        },
        required: ['left', 'top', 'right', 'bottom'],
      },
      no_subject: {
        type: 'boolean',
        description: 'Set true ONLY if no human subject is visible at all. The server will then center-crop the source.',
      },
      reasoning: { type: 'string', description: 'Brief description of who the main subject is and where they sit in the frame.' },
    },
  },
};

// Mode "focal": Claude returns a single focal point + a face circle. Avoids
// asking the model to reason about four box edges; just one point to center
// on plus a circle for the padding constraint.
const REPORT_FOCAL_POINT_TOOL = {
  name: 'report_focal_point',
  description: 'Identify the MAIN human subject. Return a single focal point on their body for the crop to center on, and a circle around their face for padding constraints.',
  input_schema: {
    type: 'object',
    properties: {
      focal_point: {
        type: 'object',
        description: "A single point on the main subject where the crop should be centered. Place it on the body's center of mass — chest/torso for full body, head for a headshot. Coords normalized 0-1 from the top-left.",
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
        required: ['x', 'y'],
      },
      face: {
        type: 'object',
        description: "Circle that tightly encloses the main subject's face/head (chin to top of hair, ear to ear). x, y = center, normalized 0-1 from top-left. radius normalized 0-1 to the SHORTER source dimension (so a 100-pixel-radius face on a 500-pixel-tall portrait has radius ≈ 0.2). Omit only if the face is genuinely not visible (back of head).",
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          radius: { type: 'number' },
        },
        required: ['x', 'y', 'radius'],
      },
      no_subject: {
        type: 'boolean',
        description: 'Set true ONLY if no human subject is visible at all. The server will then center-crop the source.',
      },
      reasoning: { type: 'string', description: 'Brief description of who the main subject is and where they sit in the frame.' },
    },
  },
};

// Mode "product": Claude identifies the four extremity points of the product
// silhouette (topmost / bottommost / leftmost / rightmost). The server takes
// min/max across the points to derive the bounding box. Asking for specific
// extreme pixels yields tighter results than asking for a bounding box edge —
// each extreme is a concrete landmark, while box edges invite padding-for-safety.
// Used as the auto-escalation when SCRFD finds no face. Single pass — products
// don't benefit from the annotated pass-2 refinement that the human box mode uses.
const POINT_SCHEMA = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' } },
  required: ['x', 'y'],
};
const REPORT_PRODUCT_TOOL = {
  name: 'report_product',
  description: 'Identify the MAIN product in the image (shoe, garment, accessory, or other physical object that is clearly the subject). Return its four extremity points (top/bottom/left/right). The server takes min/max of the points to derive the crop bounding box.',
  input_schema: {
    type: 'object',
    properties: {
      extremes: {
        type: 'object',
        description: "Four extremity points on the product silhouette. Each extreme is one specific (x, y) pixel of the product, not the whole edge. Coords normalized 0-1 where (0,0) is top-left of the source.",
        properties: {
          top: { ...POINT_SCHEMA, description: 'The single pixel of the product with the SMALLEST y value (highest in the frame). E.g. for a sneaker shown from the side, this is usually the top of the heel collar or the highest point of the laces.' },
          bottom: { ...POINT_SCHEMA, description: 'The single pixel of the product with the LARGEST y value (lowest in the frame). E.g. for a sneaker, this is usually the sole-ground contact point.' },
          left: { ...POINT_SCHEMA, description: 'The single pixel of the product with the SMALLEST x value (furthest to the left). E.g. for a side-view sneaker facing right, this is the back of the heel.' },
          right: { ...POINT_SCHEMA, description: 'The single pixel of the product with the LARGEST x value (furthest to the right). E.g. for a side-view sneaker facing right, this is the toe tip.' },
        },
        required: ['top', 'bottom', 'left', 'right'],
      },
      no_subject: {
        type: 'boolean',
        description: 'Set true if the image contains no clear product subject (empty, abstract, pattern, or only a person with no product). Prefer this over guessing when uncertain. When true, omit extremes.',
      },
      reasoning: { type: 'string', description: 'Brief description of which product was chosen and what each extreme corresponds to (e.g., "right shoe; top = heel collar, bottom = sole, left = heel back, right = toe").' },
    },
  },
};

const buildPass1Prompt = (srcW, srcH) => [
  `Source image: ${srcW} × ${srcH} px.`,
  ``,
  `Pick the ONE main human subject (most prominent / largest / clearly the protagonist). If multiple people are visible, the box must enclose ONLY the chosen one — ignore everyone else, even if they stand close or overlap.`,
  ``,
  `Return:`,
  `- body_box: VERY TIGHT rectangle hugging that one person's body + head silhouette. No padding, no generous margins. Exclude other people, outstretched arms/legs reaching beyond the torso, held objects (basketballs, bags), shadows, and background.`,
  `- face_box: tight rectangle around the same person's face/head only (chin to top of hair, ear to ear).`,
  ``,
  `Coords normalized 0-1 where (0,0) is the top-left of the source.`,
  ``,
  `Be precise. The server uses these boxes to compute the crop:`,
  `- It centers on the body_box centroid. A loose or oversized body_box pulls the framing off-center.`,
  `- It then enforces ${Math.round(FACE_PADDING_RATIO * 100)}% padding around the face_box from the crop edges.`,
  ``,
  `Your output will be drawn on the image and shown back to you for verification, so accuracy on this first pass saves work.`,
  ``,
  `If the face is genuinely not visible (back of head turned), omit face_box.`,
  `If no human is visible at all, set no_subject=true.`,
].join('\n');

const buildPass2Prompt = () => [
  `This image is your previous output, drawn back on the source:`,
  `  • RED rectangle = the body_box you proposed.`,
  `  • BLUE rectangle = the face_box you proposed.`,
  ``,
  `Verify each of the 4 edges of EACH box independently:`,
  `  • If there's any empty space between the rectangle edge and the actual subject — TIGHTEN that edge inward.`,
  `  • If the rectangle is cutting INTO the subject — EXPAND that edge outward.`,
  `  • If it already hugs the subject correctly — leave it.`,
  ``,
  `Apply the same rules as before:`,
  `  • body_box must enclose ONLY the chosen subject (not other people standing nearby).`,
  `  • Exclude held objects, shadows, props, background, and outstretched limbs reaching beyond the torso.`,
  `  • face_box covers the same person's head only.`,
  ``,
  `Return the FINAL adjusted coordinates (normalized 0-1, top-left origin). It is OK to return the same coordinates if the boxes are already correct.`,
].join('\n');

const buildFocalPrompt = (srcW, srcH) => [
  `Source image: ${srcW} × ${srcH} px.`,
  ``,
  `Pick the ONE main human subject (most prominent / largest / clearly the protagonist). If multiple people are visible, focus on only the chosen one.`,
  ``,
  `Return:`,
  `- focal_point: a single point (x, y) on that subject where the crop should be centered. Place it on the body's center of mass — typically chest/torso for a full body shot, or the head for a headshot.`,
  `- face: a circle (x, y center + radius) that tightly encloses that same person's face/head, from chin to top of hair, ear to ear.`,
  ``,
  `Coords:`,
  `- focal_point.x, focal_point.y, face.x, face.y: normalized 0-1 from the top-left corner.`,
  `- face.radius: normalized 0-1 to the SHORTER source dimension (so a face that's 100 pixels in radius on a 500-pixel-tall portrait has radius ≈ 0.2).`,
  ``,
  `The server centers the crop on focal_point and uses the face circle to enforce ${Math.round(FACE_PADDING_RATIO * 100)}% padding from the crop edges.`,
  ``,
  `If the face is genuinely not visible (back of head turned), omit face.`,
  `If no human is visible at all, set no_subject=true.`,
].join('\n');

const buildProductPrompt = (srcW, srcH) => [
  `Source image: ${srcW} × ${srcH} px.`,
  ``,
  `Pick the ONE most prominent product (shoe, garment, accessory, or other physical object that is clearly the subject). If multiple products are visible, choose the largest or most visually dominant.`,
  ``,
  `Identify the FOUR extremity points of the chosen product's silhouette:`,
  `- top: the single pixel of the product with the SMALLEST y value (highest in the frame).`,
  `- bottom: the single pixel of the product with the LARGEST y value (lowest in the frame).`,
  `- left: the single pixel with the SMALLEST x value (furthest to the left).`,
  `- right: the single pixel with the LARGEST x value (furthest to the right).`,
  ``,
  `Each extreme is one specific (x, y) pixel ON the product surface. The leftmost point has its own (x, y) — the y of the leftmost pixel is whatever y that pixel happens to sit at. Don't average. Don't pad. Pick the actual extreme pixel.`,
  ``,
  `Coords normalized 0-1 where (0,0) is the top-left of the source.`,
  ``,
  `The server takes min/max across these four points to build the crop bounding box and centers the crop on its centroid. Accuracy on the four extreme pixels directly determines crop tightness — under-shooting clips the product, over-shooting wastes crop area on shadows and background.`,
  ``,
  `Exclude: shadows, reflections, props, packaging or hangtags, background, and any held objects that aren't part of the chosen product.`,
  ``,
  `If you are uncertain whether the image contains a clear product subject, prefer no_subject=true over guessing. If the image is empty, abstract, a pattern, or contains only a person with no product, set no_subject=true and omit extremes.`,
].join('\n');

const buildAnnotationSvg = (w, h, bodyBox, faceBox) => {
  const stroke = Math.max(2, Math.round(Math.min(w, h) / 250));
  const rects = [];
  if (bodyBox) {
    const x = Number(bodyBox.left) * w;
    const y = Number(bodyBox.top) * h;
    const rectW = (Number(bodyBox.right) - Number(bodyBox.left)) * w;
    const rectH = (Number(bodyBox.bottom) - Number(bodyBox.top)) * h;
    rects.push(`<rect x="${x}" y="${y}" width="${rectW}" height="${rectH}" fill="none" stroke="red" stroke-width="${stroke}" />`);
  }
  if (faceBox) {
    const x = Number(faceBox.left) * w;
    const y = Number(faceBox.top) * h;
    const rectW = (Number(faceBox.right) - Number(faceBox.left)) * w;
    const rectH = (Number(faceBox.bottom) - Number(faceBox.top)) * h;
    rects.push(`<rect x="${x}" y="${y}" width="${rectW}" height="${rectH}" fill="none" stroke="blue" stroke-width="${stroke}" />`);
  }
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects.join('')}</svg>`;
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const normalizeBox = (b, srcW, srcH) => {
  if (!b) return null;
  const left = clamp01(Number(b.left)) * srcW;
  const top = clamp01(Number(b.top)) * srcH;
  const right = clamp01(Number(b.right)) * srcW;
  const bottom = clamp01(Number(b.bottom)) * srcH;
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
};

const decodeImage = async (image_base64) => {
  const cleanedBase64 = image_base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  const originalBuffer = Buffer.from(cleanedBase64, 'base64');
  const meta = await sharp(originalBuffer, SHARP_INPUT_OPTS).metadata();
  if (!meta.width || !meta.height) throw new Error('Image dimensions unavailable.');
  return { originalBuffer, srcW: meta.width, srcH: meta.height };
};

export default async function smartCropRoutes(fastify, options) {
  const { getSupabaseClient, DEFAULT_SUPABASE_PROJECT_ID } = fastify;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');

  // Boot-time visibility of misconfiguration. Modes that need Claude (box,
  // focal) are rejected at request time with a clean 503 if the key is
  // missing — see requiresClaude() guards in the route handlers below.
  // Retinaface and manual modes don't need Claude and stay available.
  const hasAnthropicKey = !!process.env.CROPPING_PROTOTYPE_ANTHROPIC_KEY;
  if (!hasAnthropicKey) {
    fastify.log.error(
      '[smart-crop] CROPPING_PROTOTYPE_ANTHROPIC_KEY is not set — box/focal modes will return 503 until it is.'
    );
  }

  const cropAnthropic = new Anthropic({
    apiKey: process.env.CROPPING_PROTOTYPE_ANTHROPIC_KEY,
  });

  async function authedUserId(request, reply) {
    const auth = request.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      reply.status(401).send({ error: 'Missing bearer token' });
      return null;
    }
    const supabase = getSupabaseClient(DEFAULT_SUPABASE_PROJECT_ID);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      reply.status(401).send({ error: 'Invalid or expired token' });
      return null;
    }
    return userData.user.id;
  }

  const callVision = async ({ imageBase64, mediaType, prompt, tool }) => {
    const startedAt = Date.now();
    const response = await cropAnthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 512,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });
    const elapsedMs = Date.now() - startedAt;
    const toolUse = response.content.find(
      (block) => block.type === 'tool_use' && block.name === tool.name
    );
    if (!toolUse) {
      const err = new Error('Vision response did not include subject');
      err.blocks = response.content?.map((b) => b.type);
      throw err;
    }
    return {
      input: toolUse.input,
      elapsedMs,
      usage: response.usage,
    };
  };

  // Mode "box" — two-pass vision. Pass 1 returns body+face boxes; pass 2 sees
  // its own boxes drawn back onto the image and refines the four edges. Falls
  // back to pass-1 boxes if pass 2 fails or if pass 1 returned no_subject /
  // no body_box.
  const analyzeBox = async (originalBuffer, srcW, srcH) => {
    const baseBuffer = await sharp(originalBuffer, SHARP_INPUT_OPTS)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const baseMeta = await sharp(baseBuffer).metadata();
    const baseW = baseMeta.width;
    const baseH = baseMeta.height;
    const baseBase64 = baseBuffer.toString('base64');
    const mediaType = 'image/jpeg';

    const pass1Prompt = buildPass1Prompt(srcW, srcH);
    const pass1 = await callVision({
      imageBase64: baseBase64, mediaType, prompt: pass1Prompt, tool: REPORT_MAIN_SUBJECT_TOOL,
    });
    const pass1BodyBox = pass1.input.body_box || null;
    const pass1FaceBox = pass1.input.face_box || null;
    const pass1NoSubject = !!pass1.input.no_subject;
    const pass1Reasoning = pass1.input.reasoning || '';

    const pass1Meta = {
      prompt: pass1Prompt,
      elapsed_ms: pass1.elapsedMs,
      usage: pass1.usage,
      body_box: pass1BodyBox,
      face_box: pass1FaceBox,
      no_subject: pass1NoSubject,
    };

    if (pass1NoSubject || !pass1BodyBox) {
      return {
        rawBodyBox: pass1BodyBox,
        rawFaceBox: pass1FaceBox,
        noSubject: pass1NoSubject,
        reasoning: pass1Reasoning,
        claudeMeta: {
          model: VISION_MODEL,
          media_type: mediaType,
          base_image_base64_bytes: baseBase64.length,
          passes: 1,
          pass1: pass1Meta,
          total_elapsed_ms: pass1.elapsedMs,
        },
      };
    }

    const annotatedSvg = buildAnnotationSvg(baseW, baseH, pass1BodyBox, pass1FaceBox);
    const annotatedBuffer = await sharp(baseBuffer)
      .composite([{ input: Buffer.from(annotatedSvg), top: 0, left: 0 }])
      .jpeg({ quality: 80 })
      .toBuffer();
    const annotatedBase64 = annotatedBuffer.toString('base64');

    const pass2Prompt = buildPass2Prompt();
    let pass2;
    try {
      pass2 = await callVision({
        imageBase64: annotatedBase64, mediaType, prompt: pass2Prompt, tool: REPORT_MAIN_SUBJECT_TOOL,
      });
    } catch (e) {
      fastify.log.warn({ err: e }, '[smart-crop/analyze] pass 2 failed; falling back to pass 1');
      return {
        rawBodyBox: pass1BodyBox,
        rawFaceBox: pass1FaceBox,
        noSubject: pass1NoSubject,
        reasoning: pass1Reasoning,
        claudeMeta: {
          model: VISION_MODEL,
          media_type: mediaType,
          base_image_base64_bytes: baseBase64.length,
          annotated_image_base64_bytes: annotatedBase64.length,
          passes: 1,
          pass1: pass1Meta,
          pass2_error: e.message,
          total_elapsed_ms: pass1.elapsedMs,
        },
      };
    }

    const pass2BodyBox = pass2.input.body_box || pass1BodyBox;
    const pass2FaceBox = pass2.input.face_box || pass1FaceBox;
    const pass2NoSubject = !!pass2.input.no_subject;
    const pass2Reasoning = pass2.input.reasoning || pass1Reasoning;

    return {
      rawBodyBox: pass2NoSubject ? null : pass2BodyBox,
      rawFaceBox: pass2NoSubject ? null : pass2FaceBox,
      noSubject: pass2NoSubject,
      reasoning: pass2Reasoning,
      claudeMeta: {
        model: VISION_MODEL,
        media_type: mediaType,
        base_image_base64_bytes: baseBase64.length,
        annotated_image_base64_bytes: annotatedBase64.length,
        passes: 2,
        pass1: pass1Meta,
        pass2: {
          prompt: pass2Prompt,
          elapsed_ms: pass2.elapsedMs,
          usage: pass2.usage,
          body_box: pass2BodyBox,
          face_box: pass2FaceBox,
          no_subject: pass2NoSubject,
        },
        total_elapsed_ms: pass1.elapsedMs + pass2.elapsedMs,
      },
    };
  };

  // Mode "retinaface" — runs the SCRFD face detector locally (no Claude call).
  // Returns the bounding box of the largest face (proxy for "main subject"),
  // normalized 0-1, plus all detected faces for debug. Cropping geometry uses
  // face center + a downward bias to keep the face in the upper third of the
  // crop — see RETINAFACE_DOWNWARD_BIAS_FACE_HEIGHTS.
  const analyzeRetinaface = async (originalBuffer, srcW, srcH) => {
    const startedAt = Date.now();
    const faces = await detectFaces(originalBuffer);
    const elapsedMs = Date.now() - startedAt;

    const main = pickMainFace(faces);
    const allFaces = faces.map((f) => ({
      box: {
        left: f.x1 / srcW,
        top: f.y1 / srcH,
        right: f.x2 / srcW,
        bottom: f.y2 / srcH,
      },
      score: f.score,
    }));

    return {
      faceBox: main
        ? {
            left: main.x1 / srcW,
            top: main.y1 / srcH,
            right: main.x2 / srcW,
            bottom: main.y2 / srcH,
          }
        : null,
      allFaces,
      noSubject: !main,
      detectorMeta: {
        model: 'scrfd-det_10g',
        elapsed_ms: elapsedMs,
        faces_found: faces.length,
        score_threshold: 0.5,
      },
    };
  };

  // Mode "focal" — single-pass vision. Asks Claude for one focal point and a
  // face circle instead of four box edges. Geometry downstream reuses the same
  // path as box mode by deriving a square face_box from the circle.
  const analyzeFocal = async (originalBuffer, srcW, srcH) => {
    const baseBuffer = await sharp(originalBuffer, SHARP_INPUT_OPTS)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const baseBase64 = baseBuffer.toString('base64');
    const mediaType = 'image/jpeg';

    const prompt = buildFocalPrompt(srcW, srcH);
    const pass = await callVision({
      imageBase64: baseBase64, mediaType, prompt, tool: REPORT_FOCAL_POINT_TOOL,
    });
    const focalPoint = pass.input.focal_point || null;
    const face = pass.input.face || null;
    const noSubject = !!pass.input.no_subject;
    const reasoning = pass.input.reasoning || '';

    return {
      rawFocalPoint: noSubject ? null : focalPoint,
      rawFace: noSubject ? null : face,
      noSubject,
      reasoning,
      claudeMeta: {
        model: VISION_MODEL,
        media_type: mediaType,
        base_image_base64_bytes: baseBase64.length,
        passes: 1,
        pass1: {
          prompt,
          elapsed_ms: pass.elapsedMs,
          usage: pass.usage,
          focal_point: focalPoint,
          face,
          no_subject: noSubject,
        },
        total_elapsed_ms: pass.elapsedMs,
      },
    };
  };

  // Mode "product" — single-pass vision for face-less images (typically shoes
  // or apparel laid flat). Auto-escalation target when SCRFD reports no face.
  // No annotated pass-2: products don't need edge refinement the way human
  // bodies do, and skipping it halves cost/latency vs. box mode.
  const analyzeProduct = async (originalBuffer, srcW, srcH) => {
    const baseBuffer = await sharp(originalBuffer, SHARP_INPUT_OPTS)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const baseBase64 = baseBuffer.toString('base64');
    const mediaType = 'image/jpeg';

    const prompt = buildProductPrompt(srcW, srcH);
    const pass = await callVision({
      imageBase64: baseBase64, mediaType, prompt, tool: REPORT_PRODUCT_TOOL,
    });
    const extremes = pass.input.extremes || null;
    const noSubject = !!pass.input.no_subject;
    const reasoning = pass.input.reasoning || '';

    // Derive box from extremes via min/max. Reject if the model returned
    // anything degenerate (missing point, zero-area).
    let productBox = null;
    if (!noSubject && extremes && extremes.top && extremes.bottom && extremes.left && extremes.right) {
      const xs = [extremes.top.x, extremes.bottom.x, extremes.left.x, extremes.right.x].map(Number);
      const ys = [extremes.top.y, extremes.bottom.y, extremes.left.y, extremes.right.y].map(Number);
      if (xs.every(Number.isFinite) && ys.every(Number.isFinite)) {
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);
        if (right > left && bottom > top) {
          productBox = { left, top, right, bottom };
        }
      }
    }

    return {
      rawProductBox: productBox,
      rawExtremes: noSubject ? null : extremes,
      noSubject,
      reasoning,
      claudeMeta: {
        model: VISION_MODEL,
        media_type: mediaType,
        base_image_base64_bytes: baseBase64.length,
        passes: 1,
        pass1: {
          prompt,
          elapsed_ms: pass.elapsedMs,
          usage: pass.usage,
          extremes,
          derived_product_box: productBox,
          no_subject: noSubject,
        },
        total_elapsed_ms: pass.elapsedMs,
      },
    };
  };

  fastify.post('/api/smart-crop/analyze', async (request, reply) => {
    const startTime = Date.now();
    const userId = await authedUserId(request, reply);
    if (!userId) return;

    const { image_base64, mime_type, mode = 'box' } = request.body || {};

    if (!image_base64 || !mime_type) {
      return reply.status(400).send({ error: 'Missing required fields: image_base64, mime_type' });
    }
    if (!isMode(mode)) {
      return reply.status(400).send({ error: `Invalid mode "${mode}". Expected one of: ${SUPPORTED_MODES.join(', ')}.` });
    }
    if (requiresClaude(mode) && !hasAnthropicKey) {
      return reply.status(503).send({ error: 'Smart cropping vision modes are not configured (missing CROPPING_PROTOTYPE_ANTHROPIC_KEY).' });
    }

    let srcW, srcH, originalBuffer;
    try {
      ({ originalBuffer, srcW, srcH } = await decodeImage(image_base64));
    } catch (e) {
      fastify.log.error({ err: e }, '[smart-crop/analyze] image decode failed');
      return reply.status(400).send({ error: 'Invalid image', details: e.message });
    }

    try {
      if (mode === 'retinaface') {
        const analysis = await analyzeRetinaface(originalBuffer, srcW, srcH);
        return reply.send({
          success: true,
          mode: 'retinaface',
          source: { width: srcW, height: srcH },
          face_box: analysis.faceBox,
          all_faces: analysis.allFaces,
          no_subject: analysis.noSubject,
          detector: analysis.detectorMeta,
          processing_ms: Date.now() - startTime,
        });
      }
      if (mode === 'focal') {
        const analysis = await analyzeFocal(originalBuffer, srcW, srcH);
        return reply.send({
          success: true,
          mode: 'focal',
          source: { width: srcW, height: srcH },
          focal_point: analysis.rawFocalPoint,
          face: analysis.rawFace,
          no_subject: analysis.noSubject,
          reasoning: analysis.reasoning,
          claude: analysis.claudeMeta,
          processing_ms: Date.now() - startTime,
        });
      }
      if (mode === 'product') {
        const analysis = await analyzeProduct(originalBuffer, srcW, srcH);
        return reply.send({
          success: true,
          mode: 'product',
          source: { width: srcW, height: srcH },
          product_box: analysis.rawProductBox,
          extremes: analysis.rawExtremes,
          no_subject: analysis.noSubject,
          reasoning: analysis.reasoning,
          claude: analysis.claudeMeta,
          processing_ms: Date.now() - startTime,
        });
      }
      const analysis = await analyzeBox(originalBuffer, srcW, srcH);
      return reply.send({
        success: true,
        mode: 'box',
        source: { width: srcW, height: srcH },
        body_box: analysis.rawBodyBox,
        face_box: analysis.rawFaceBox,
        no_subject: analysis.noSubject,
        reasoning: analysis.reasoning,
        claude: analysis.claudeMeta,
        processing_ms: Date.now() - startTime,
      });
    } catch (e) {
      fastify.log.error({ err: e, blocks: e.blocks }, '[smart-crop/analyze] Anthropic call failed');
      return reply.status(502).send({ error: 'Vision call failed', details: e.message });
    }
  });

  fastify.post('/api/smart-crop', async (request, reply) => {
    const startTime = Date.now();
    const userId = await authedUserId(request, reply);
    if (!userId) return;

    const {
      image_base64, mime_type, aspect_ratio,
      mode = 'box',
      body_box: inputBodyBox,
      face_box: inputFaceBox,
      focal_point: inputFocalPoint,
      face: inputFace,
      product_box: inputProductBox,
      extremes: inputExtremes,
      no_subject: inputNoSubject,
      target_width, target_height,
      crop_rect: inputCropRect,
    } = request.body || {};

    if (!image_base64 || !mime_type) {
      return reply.status(400).send({
        error: 'Missing required fields: image_base64, mime_type',
      });
    }
    if (!isMode(mode)) {
      return reply.status(400).send({ error: `Invalid mode "${mode}". Expected one of: ${SUPPORTED_MODES.join(', ')}.` });
    }
    if (requiresClaude(mode) && !hasAnthropicKey) {
      return reply.status(503).send({ error: 'Smart cropping vision modes are not configured (missing CROPPING_PROTOTYPE_ANTHROPIC_KEY).' });
    }
    // Auto modes need an aspect_ratio to drive the geometry. Manual mode
    // doesn't — the client already chose the rect, so AR is implicit.
    if (mode !== 'manual' && !aspect_ratio) {
      return reply.status(400).send({ error: 'Missing required field: aspect_ratio' });
    }

    // Manual mode: client supplies the exact crop rect in source pixels and we
    // just extract. No analysis, no geometry, no debug overlay. Used by the
    // toolkit's manual-fix editor where the operator drags the source under a
    // fixed-AR frame to choose the crop region themselves.
    if (mode === 'manual') {
      if (!inputCropRect) {
        return reply.status(400).send({ error: 'Missing crop_rect for manual mode.' });
      }
      const left = Math.round(Number(inputCropRect.left));
      const top = Math.round(Number(inputCropRect.top));
      const width = Math.round(Number(inputCropRect.width));
      const height = Math.round(Number(inputCropRect.height));
      if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        return reply.status(400).send({
          error: 'Invalid crop_rect. Expected { left, top, width, height } as positive numbers in source pixels.',
        });
      }
      let originalBuffer, srcW, srcH;
      try {
        ({ originalBuffer, srcW, srcH } = await decodeImage(image_base64));
      } catch (e) {
        fastify.log.error({ err: e }, '[smart-crop] image decode failed');
        return reply.status(400).send({ error: 'Invalid image', details: e.message });
      }
      if (left < 0 || top < 0 || left + width > srcW || top + height > srcH) {
        return reply.status(400).send({
          error: `crop_rect out of bounds. Source is ${srcW}×${srcH}, rect is ${width}×${height} at (${left}, ${top}).`,
        });
      }
      const extractRect = { left, top, width, height };
      let croppedBuffer;
      try {
        croppedBuffer = await sharp(originalBuffer, SHARP_INPUT_OPTS).extract(extractRect).jpeg({ quality: 90 }).toBuffer();
      } catch (e) {
        fastify.log.error({ err: e, extractRect, srcW, srcH }, '[smart-crop] manual extract failed');
        return reply.status(500).send({ error: 'Crop failed', details: e.message });
      }
      return reply.send({
        success: true,
        mode: 'manual',
        result_base64: croppedBuffer.toString('base64'),
        mime_type: 'image/jpeg',
        crop_rect: extractRect,
        output: { width, height, exact: false },
        focus_point: { x: (left + width / 2) / srcW, y: (top + height / 2) / srcH },
        source: { width: srcW, height: srcH },
        no_subject: false,
        processing_ms: Date.now() - startTime,
      });
    }

    const noSubject = !!inputNoSubject;
    if (!noSubject) {
      if (mode === 'box' && !inputBodyBox) {
        return reply.status(400).send({
          error: 'Missing subject info. Provide body_box (and optional face_box) from /api/smart-crop/analyze with mode="box", or set no_subject=true.',
        });
      }
      if (mode === 'focal' && !inputFocalPoint) {
        return reply.status(400).send({
          error: 'Missing subject info. Provide focal_point (and optional face circle) from /api/smart-crop/analyze with mode="focal", or set no_subject=true.',
        });
      }
      if (mode === 'retinaface' && !inputFaceBox) {
        return reply.status(400).send({
          error: 'Missing subject info. Provide face_box from /api/smart-crop/analyze with mode="retinaface", or set no_subject=true.',
        });
      }
      if (mode === 'product' && !inputProductBox) {
        return reply.status(400).send({
          error: 'Missing subject info. Provide product_box from /api/smart-crop/analyze with mode="product", or set no_subject=true.',
        });
      }
    }

    if (!/^\d+:\d+$/.test(aspect_ratio)) {
      return reply.status(400).send({ error: 'Invalid aspect_ratio format. Expected "W:H" (e.g., "16:9").' });
    }

    const [targetW, targetH] = aspect_ratio.split(':').map(Number);
    if (!targetW || !targetH) {
      return reply.status(400).send({ error: 'Invalid aspect_ratio values.' });
    }

    const exactWidth = target_width != null ? Number(target_width) : null;
    const exactHeight = target_height != null ? Number(target_height) : null;
    const wantExactPixels = exactWidth != null || exactHeight != null;
    if (wantExactPixels) {
      if (!Number.isFinite(exactWidth) || !Number.isFinite(exactHeight) || exactWidth <= 0 || exactHeight <= 0) {
        return reply.status(400).send({ error: 'target_width and target_height must both be positive numbers.' });
      }
      if (exactWidth > 8192 || exactHeight > 8192) {
        return reply.status(400).send({ error: 'target dimensions exceed 8192 px cap.' });
      }
    }

    let originalBuffer, srcW, srcH;
    try {
      ({ originalBuffer, srcW, srcH } = await decodeImage(image_base64));
    } catch (e) {
      fastify.log.error({ err: e }, '[smart-crop] image decode failed');
      return reply.status(400).send({ error: 'Invalid image', details: e.message });
    }

    // Derive geometry inputs in source-pixel coords. Focal mode synthesizes a
    // square face_box from the circle so the existing padding path is shared.
    // RetinaFace mode derives a focal point from the face center with a
    // downward bias so the face lands in the upper third of the crop.
    let bodyBox = null;
    let faceBox = null;
    let focalPoint = null;
    let faceCircle = null;
    let productBox = null;
    let productExtremes = null;

    if (!noSubject) {
      if (mode === 'retinaface') {
        faceBox = normalizeBox(inputFaceBox, srcW, srcH);
        if (faceBox) {
          const fcx = (faceBox.left + faceBox.right) / 2;
          const fcy = (faceBox.top + faceBox.bottom) / 2;
          const fh = faceBox.bottom - faceBox.top;
          focalPoint = {
            x: fcx,
            y: clamp(fcy + fh * RETINAFACE_DOWNWARD_BIAS_FACE_HEIGHTS, 0, srcH),
          };
        }
      } else if (mode === 'focal') {
        focalPoint = {
          x: clamp01(Number(inputFocalPoint.x)) * srcW,
          y: clamp01(Number(inputFocalPoint.y)) * srcH,
        };
        if (inputFace) {
          const fx = clamp01(Number(inputFace.x)) * srcW;
          const fy = clamp01(Number(inputFace.y)) * srcH;
          const fr = Math.max(0, Number(inputFace.radius)) * Math.min(srcW, srcH);
          if (fr > 0) {
            faceCircle = { x: fx, y: fy, r: fr };
            const left = clamp(fx - fr, 0, srcW);
            const top = clamp(fy - fr, 0, srcH);
            const right = clamp(fx + fr, 0, srcW);
            const bottom = clamp(fy + fr, 0, srcH);
            if (right > left && bottom > top) faceBox = { left, top, right, bottom };
          }
        }
      } else if (mode === 'product') {
        productBox = normalizeBox(inputProductBox, srcW, srcH);
        // Extremes are debug-only — they're the four points Claude returned
        // and from which the box was derived. Drawn as crosshairs in the
        // overlay so the operator can see what the model actually identified.
        if (inputExtremes) {
          const labels = ['top', 'bottom', 'left', 'right'];
          const points = labels
            .map((label) => {
              const pt = inputExtremes[label];
              if (!pt) return null;
              const x = clamp01(Number(pt.x)) * srcW;
              const y = clamp01(Number(pt.y)) * srcH;
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              return { x, y, label };
            })
            .filter(Boolean);
          if (points.length > 0) productExtremes = points;
        }
      } else {
        bodyBox = normalizeBox(inputBodyBox, srcW, srcH);
        faceBox = normalizeBox(inputFaceBox, srcW, srcH);
      }
    }

    // Crop dimensions: max-fit, target AR, full source on the longer side
    const targetAR = targetW / targetH;
    const srcAR = srcW / srcH;
    const baseW = srcAR > targetAR ? srcH * targetAR : srcW;
    const baseH = srcAR > targetAR ? srcH : srcW / targetAR;
    const cropW = Math.round(baseW);
    const cropH = Math.round(baseH);

    // Initial center: focal point > body centroid > product centroid > face centroid > source center
    let centerX, centerY;
    if (focalPoint) {
      centerX = focalPoint.x;
      centerY = focalPoint.y;
    } else if (bodyBox) {
      centerX = (bodyBox.left + bodyBox.right) / 2;
      centerY = (bodyBox.top + bodyBox.bottom) / 2;
    } else if (productBox) {
      centerX = (productBox.left + productBox.right) / 2;
      centerY = (productBox.top + productBox.bottom) / 2;
    } else if (faceBox) {
      centerX = (faceBox.left + faceBox.right) / 2;
      centerY = (faceBox.top + faceBox.bottom) / 2;
    } else {
      centerX = srcW / 2;
      centerY = srcH / 2;
    }

    let cropL = centerX - cropW / 2;
    let cropT = centerY - cropH / 2;

    // Face padding constraints: face must be at least padX/padY away from any crop edge.
    // Equivalent: cropL ≤ face.left - padX  AND  cropL ≥ face.right - cropW + padX  (and same Y).
    let facePaddingApplied = false;
    let facePaddingDegraded = false;
    if (faceBox) {
      const padX = cropW * FACE_PADDING_RATIO;
      const padY = cropH * FACE_PADDING_RATIO;
      const faceW = faceBox.right - faceBox.left;
      const faceH = faceBox.bottom - faceBox.top;

      // X axis
      const canPadX = faceW + 2 * padX <= cropW;
      const usedPadX = canPadX ? padX : 0;
      if (!canPadX) facePaddingDegraded = true;
      const minLx = faceBox.right - cropW + usedPadX;
      const maxLx = faceBox.left - usedPadX;
      if (minLx <= maxLx) {
        const before = cropL;
        cropL = clamp(cropL, minLx, maxLx);
        if (cropL !== before) facePaddingApplied = true;
      } else {
        // Face wider than the crop — center on face as last resort
        cropL = (faceBox.left + faceBox.right) / 2 - cropW / 2;
        facePaddingDegraded = true;
      }

      // Y axis
      const canPadY = faceH + 2 * padY <= cropH;
      const usedPadY = canPadY ? padY : 0;
      if (!canPadY) facePaddingDegraded = true;
      const minLy = faceBox.bottom - cropH + usedPadY;
      const maxLy = faceBox.top - usedPadY;
      if (minLy <= maxLy) {
        const before = cropT;
        cropT = clamp(cropT, minLy, maxLy);
        if (cropT !== before) facePaddingApplied = true;
      } else {
        cropT = (faceBox.top + faceBox.bottom) / 2 - cropH / 2;
        facePaddingDegraded = true;
      }
    }

    // Final clamp to source bounds (in case padding pushed us off)
    cropL = clamp(cropL, 0, srcW - cropW);
    cropT = clamp(cropT, 0, srcH - cropH);

    const extractRect = {
      left: Math.round(cropL),
      top: Math.round(cropT),
      width: Math.min(cropW, srcW - Math.round(cropL)),
      height: Math.min(cropH, srcH - Math.round(cropT)),
    };

    let croppedBuffer;
    let outputWidth, outputHeight;
    try {
      let pipe = sharp(originalBuffer, SHARP_INPUT_OPTS).extract(extractRect);

      if (wantExactPixels) {
        pipe = pipe.resize(exactWidth, exactHeight, { fit: 'fill' });
        outputWidth = exactWidth;
        outputHeight = exactHeight;
      } else {
        outputWidth = extractRect.width;
        outputHeight = extractRect.height;
      }
      croppedBuffer = await pipe.jpeg({ quality: 90 }).toBuffer();
    } catch (e) {
      fastify.log.error(
        { err: e, extractRect, srcW, srcH, exactWidth, exactHeight },
        '[smart-crop] sharp extract failed'
      );
      return reply.status(500).send({ error: 'Crop failed', details: e.message });
    }

    return reply.send({
      success: true,
      mode,
      result_base64: croppedBuffer.toString('base64'),
      mime_type: 'image/jpeg',
      crop_rect: extractRect,
      output: { width: outputWidth, height: outputHeight, exact: wantExactPixels },
      focus_point: {
        x: (extractRect.left + extractRect.width / 2) / srcW,
        y: (extractRect.top + extractRect.height / 2) / srcH,
      },
      source: { width: srcW, height: srcH },
      ...(mode === 'focal'
        ? { focal_point: inputFocalPoint || null, face: inputFace || null }
        : mode === 'retinaface'
          ? { face_box: inputFaceBox || null, focal_point: focalPoint
              ? { x: focalPoint.x / srcW, y: focalPoint.y / srcH }
              : null }
          : mode === 'product'
            ? { product_box: inputProductBox || null }
            : { body_box: inputBodyBox || null, face_box: inputFaceBox || null }),
      no_subject: noSubject,
      face_padding: {
        ratio: FACE_PADDING_RATIO,
        applied: facePaddingApplied,
        degraded: facePaddingDegraded,
      },
      processing_ms: Date.now() - startTime,
    });
  });
}
