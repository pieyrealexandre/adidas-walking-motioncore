// SCRFD face detector (insightface det_10g.onnx) running on onnxruntime-node.
//
// Background: insightface's `FaceAnalysis(name='buffalo_l')` ships SCRFD as its
// detector. SCRFD is the same authors' anchor-free successor to RetinaFace —
// faster and stronger. The det_10g.onnx file inside buffalo_l.zip is the
// canonical detector model (https://github.com/deepinsight/insightface/releases).
//
// We avoid pulling in Python by running the same ONNX directly in Node. The
// model is pre-baked into the Docker image during build (see Dockerfile) so
// startup just reads it from disk.

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL_PATH = path.resolve(__dirname, '..', 'models', 'det_10g.onnx');

// SCRFD det_10g uses 3 feature pyramid levels (strides 8/16/32) and outputs
// score, bbox, and 5 keypoints at each level — 9 tensors total. We only need
// score + bbox for the crop geometry, but expose keypoints for future use.
const STRIDES = [8, 16, 32];
const INPUT_SIZE = 640;
const DEFAULT_SCORE_THRESHOLD = 0.5;
const DEFAULT_NMS_IOU_THRESHOLD = 0.4;

let _sessionPromise = null;

const getSession = (modelPath = DEFAULT_MODEL_PATH) => {
  if (!_sessionPromise) {
    _sessionPromise = ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
    });
  }
  return _sessionPromise;
};

// Resize-and-letterbox the input to 640×640, then convert HWC RGB uint8 to a
// CHW BGR float32 tensor normalized as (pixel - 127.5) / 128 (insightface's
// standard preprocessing).
const preprocess = async (buffer) => {
  const meta = await sharp(buffer).metadata();
  const srcW = meta.width;
  const srcH = meta.height;
  if (!srcW || !srcH) throw new Error('Image dimensions unavailable.');

  const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);

  const padded = await sharp(buffer)
    .resize(newW, newH, { fit: 'fill' })
    .extend({
      top: 0,
      bottom: INPUT_SIZE - newH,
      left: 0,
      right: INPUT_SIZE - newW,
      background: { r: 0, g: 0, b: 0 },
    })
    .removeAlpha()
    .raw()
    .toBuffer();

  const planeSize = INPUT_SIZE * INPUT_SIZE;
  const float32 = new Float32Array(3 * planeSize);
  for (let i = 0; i < planeSize; i++) {
    const r = padded[i * 3 + 0];
    const g = padded[i * 3 + 1];
    const b = padded[i * 3 + 2];
    // BGR plane order
    float32[0 * planeSize + i] = (b - 127.5) / 128.0;
    float32[1 * planeSize + i] = (g - 127.5) / 128.0;
    float32[2 * planeSize + i] = (r - 127.5) / 128.0;
  }

  const tensor = new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  return { tensor, srcW, srcH, scale };
};

// Decode the SCRFD anchor-free predictions for a single feature level.
// `scores`/`bboxes` are flat tensors with `numAnchors` predictions per spatial
// location, ordered loc-major then anchor-minor (insightface convention).
const decodeLevel = ({ scores, bboxes, kps, stride, scale, srcW, srcH, scoreThreshold }) => {
  const featSize = INPUT_SIZE / stride;
  const numLocations = featSize * featSize;
  const numAnchors = scores.length / numLocations;
  const out = [];
  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    if (score < scoreThreshold) continue;
    const gridIdx = Math.floor(i / numAnchors);
    const gh = Math.floor(gridIdx / featSize);
    const gw = gridIdx % featSize;
    const cx = gw * stride;
    const cy = gh * stride;
    const dl = bboxes[i * 4 + 0] * stride;
    const dt = bboxes[i * 4 + 1] * stride;
    const dr = bboxes[i * 4 + 2] * stride;
    const db = bboxes[i * 4 + 3] * stride;
    // Convert from letterbox space back to source pixel coords.
    const x1 = Math.max(0, (cx - dl) / scale);
    const y1 = Math.max(0, (cy - dt) / scale);
    const x2 = Math.min(srcW, (cx + dr) / scale);
    const y2 = Math.min(srcH, (cy + db) / scale);
    if (x2 <= x1 || y2 <= y1) continue;
    const det = { x1, y1, x2, y2, score, kps: null };
    if (kps) {
      // 5 keypoints: left eye, right eye, nose, left mouth, right mouth.
      const points = [];
      for (let k = 0; k < 5; k++) {
        const kx = (cx + kps[i * 10 + k * 2 + 0] * stride) / scale;
        const ky = (cy + kps[i * 10 + k * 2 + 1] * stride) / scale;
        points.push({ x: kx, y: ky });
      }
      det.kps = points;
    }
    out.push(det);
  }
  return out;
};

const iou = (a, b) => {
  const xx1 = Math.max(a.x1, b.x1);
  const yy1 = Math.max(a.y1, b.y1);
  const xx2 = Math.min(a.x2, b.x2);
  const yy2 = Math.min(a.y2, b.y2);
  const w = Math.max(0, xx2 - xx1);
  const h = Math.max(0, yy2 - yy1);
  const inter = w * h;
  const aArea = (a.x2 - a.x1) * (a.y2 - a.y1);
  const bArea = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (aArea + bArea - inter);
};

const nms = (dets, iouThreshold) => {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept = [];
  const suppressed = new Array(sorted.length).fill(false);
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed[i]) continue;
    kept.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed[j]) continue;
      if (iou(sorted[i], sorted[j]) >= iouThreshold) suppressed[j] = true;
    }
  }
  return kept;
};

export const detectFaces = async (buffer, opts = {}) => {
  const scoreThreshold = opts.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const iouThreshold = opts.iouThreshold ?? DEFAULT_NMS_IOU_THRESHOLD;
  const session = await getSession(opts.modelPath);

  const { tensor, srcW, srcH, scale } = await preprocess(buffer);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: tensor });

  // Output names in det_10g order: [score_8, score_16, score_32, bbox_8,
  // bbox_16, bbox_32, kps_8, kps_16, kps_32]. We address them by index.
  const outNames = session.outputNames;
  const all = [];
  for (let s = 0; s < STRIDES.length; s++) {
    const scores = results[outNames[s]].data;
    const bboxes = results[outNames[s + 3]].data;
    const kps = outNames.length >= 9 ? results[outNames[s + 6]].data : null;
    const dets = decodeLevel({
      scores, bboxes, kps,
      stride: STRIDES[s],
      scale, srcW, srcH, scoreThreshold,
    });
    all.push(...dets);
  }

  return nms(all, iouThreshold);
};

// Pick the main-subject face from a list of detections. Heuristic: largest
// face area, since size in frame is the strongest cue for "this is who the
// photo is about." Ties broken by score.
export const pickMainFace = (faces) => {
  if (!faces || faces.length === 0) return null;
  let best = null;
  let bestArea = -1;
  for (const f of faces) {
    const area = (f.x2 - f.x1) * (f.y2 - f.y1);
    if (area > bestArea || (area === bestArea && best && f.score > best.score)) {
      best = f;
      bestArea = area;
    }
  }
  return best;
};
