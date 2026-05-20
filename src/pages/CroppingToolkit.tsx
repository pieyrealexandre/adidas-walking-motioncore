import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, ArrowLeft, RotateCw, Move, Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { copyGenerator } from '@/lib/copy-agents/copyGenerator';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';
if (!BACKEND_URL) {
  console.warn('[adiGen] VITE_BACKEND_URL not set — backend calls will fail. Add it to .env.local.');
}
const INIT_ENDPOINT = `${BACKEND_URL}/api/upload-assets/init`;
const PROCESS_ENDPOINT = `${BACKEND_URL}/api/upload-assets/process`;
const SMART_CROP_ENDPOINT = `${BACKEND_URL}/api/smart-crop`;
const SMART_CROP_ANALYZE_ENDPOINT = `${BACKEND_URL}/api/smart-crop/analyze`;
const TOUCHPOINTS_ENDPOINT = (id: string) =>
  `${BACKEND_URL}/api/airtable/campaigns/${encodeURIComponent(id)}/touchpoints`;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const ACCEPTED_EXT = /\.(jpe?g|png|webp|tiff?)$/i;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 10;
const CROP_CONCURRENCY = 3;
const COPY_CONCURRENCY = 3;

type Step = 'upload' | 'touchpoints' | 'cropping' | 'review';

type UploadedAsset = {
  url: string;
  width: number;
  height: number;
  original_name: string;
  size_bytes: number;
};

type CropSpec = { device: string; width: number; height: number };

type Touchpoint = {
  contentPlanId: string;
  contentName: string;
  componentName: string;
  channel: string;
  phase: string;
  touchpoints: string[];
  touchpointAbbreviations: string[];
  guidelines: string;
  creativeGuidance: string;
  copyGuidance: string;
  ctaDestination: string;
  cropsRequired: string[];
  crops: CropSpec[];
  skipped: boolean;
};

type CropTarget = {
  sourceUrl: string;
  sourceName: string;
  sourceWidth: number;
  sourceHeight: number;
  contentPlanId: string;
  // The slug-style row identifier (Airtable `Content Name`) — the only field
  // we've found that's reliably row-unique. Both `Touchpoints Selection` on
  // CONTENT PLAN and `Touchpoint Abb.` on Component Library return the same
  // values for every row of a given component in a campaign, so they can't
  // distinguish e.g. four Banner Hero rows from each other. The slug encodes
  // the per-row touchpoint combo and variant suffix (`hp_wglp_kglp-banner-
  // hero_1`), which is what the client uses to tell them apart.
  contentName: string;
  componentName: string;
  device: string;
  width: number;
  height: number;
};

type CropRect = { left: number; top: number; width: number; height: number };

// Per-tile state. `method` drives which button shows on the tile after a
// success: 'retinaface' (default human framing) → "Redo image (Claude)";
// everything else ('product' from the auto-escalation, 'claude' after a redo,
// 'manual' after a drag-fix) → "Manual fix" only, since redoing a Claude pass
// with the same prompt won't yield a different result.
// `cropRect` (in source pixels) is captured from each successful crop response
// so the manual-fix editor can open at the right starting position.
type CropResult = {
  key: string;
  target: CropTarget;
  status: 'pending' | 'in-progress' | 'done' | 'error';
  method: 'retinaface' | 'product' | 'claude' | 'manual';
  arBase64: string | null;
  cropRect: CropRect | null;
  errorMessage: string | null;
};

type Box = { left: number; top: number; right: number; bottom: number };

type Point = { x: number; y: number };
type ProductExtremes = { top: Point; bottom: Point; left: Point; right: Point };

// Default cropping path uses SCRFD first; if no face is found, the frontend
// auto-escalates to a Claude product-detection pass. Discriminated union keeps
// the cropOne dispatch explicit about which mode the source resolved to.
// `extremes` are the 4 points Claude returned (top/bottom/left/right of the
// product silhouette); the box is derived from them server-side. They're
// forwarded to /smart-crop so the debug overlay can render them as crosshairs.
type Analysis =
  | { kind: 'face'; face_box: Box }
  | { kind: 'product'; product_box: Box; extremes: ProductExtremes | null }
  | { kind: 'none' };

type FaceAnalysis = {
  face_box: Box | null;
  no_subject: boolean;
};

type ProductAnalysis = {
  product_box: Box | null;
  extremes: ProductExtremes | null;
  no_subject: boolean;
};

// Claude vision returns both a body box and a face box. Used by the "Redo
// image" path as an alternative cropping method to the default SCRFD flow.
type ClaudeAnalysis = {
  body_box: Box | null;
  face_box: Box | null;
  no_subject: boolean;
};

type CopyStatus = 'pending' | 'in-progress' | 'done' | 'skipped' | 'error';

type CopyResult = {
  contentPlanId: string;
  touchpointId: string | null;
  status: CopyStatus;
  headline: string | null;
  body: string | null;
  errorMessage: string | null;
};

// Slug a Component Name for the copy generator's kebab IDs.
//   "Banner Hero" -> "banner-hero", "Hero Block - Image" -> "hero-block-image"
const slugComponent = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Derive the copy-generator touchpoint ID from an Airtable abbreviation +
// component name. Returns null if either input is empty.
//   ("HP", "Banner Hero") -> "hp-banner-hero"
const deriveTouchpointId = (abb: string | undefined, component: string): string | null => {
  const a = (abb || '').trim().toLowerCase();
  const c = slugComponent(component || '');
  if (!a || !c) return null;
  return `${a}-${c}`;
};

// Turn a slug-style Airtable `Content Name` into a human-readable label using
// the component name as a structural anchor. The client's slugs follow the
// convention "{campaign}-{tp1}_{tp2}_..._{tpN}-{component-slug}[_{variant}]",
// e.g.:
//   "global-originals_liberty_london--fw25-launch-hp_wglp_kglp-banner-hero_1"
//   → "HP WGLP KGLP Banner Hero #1"
// Touchpoints are joined with `_` and separated from the component slug by `-`,
// the variant suffix (if any) trails the component with `_`. We anchor on the
// slugified component name and walk left to recover the touchpoint cluster.
// Falls back to the raw contentName if the component can't be located.
const formatContentName = (contentName: string, componentName: string): string => {
  if (!contentName) return '';
  if (!componentName) return contentName;
  const compSlug = componentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!compSlug) return contentName;
  // Allow either `-` or `_` between the component-slug's own words so
  // "banner_hero" matches as well as the conventional "banner-hero".
  const compPattern = compSlug.replace(/-/g, '[-_]');
  const re = new RegExp(`(?:^|[-_])(${compPattern})((?:[-_]\\w+)?)$`, 'i');
  const m = contentName.match(re);
  if (!m) return contentName;
  const before = contentName.slice(0, m.index ?? 0);
  // Touchpoint cluster sits between the last `-` of the campaign portion and
  // the leading separator of the component slug. Touchpoints inside it are
  // joined with `_`.
  const lastDash = before.lastIndexOf('-');
  const touchpointPart = lastDash >= 0 ? before.slice(lastDash + 1) : before;
  const touchpoints = touchpointPart
    ? touchpointPart.split(/_+/).filter(Boolean).map((t) => t.toUpperCase())
    : [];
  let variant = '';
  if (m[2]) {
    const cleaned = m[2].replace(/^[-_]+/, '');
    if (cleaned) variant = `#${cleaned}`;
  }
  return [touchpoints.join(' '), componentName, variant].filter(Boolean).join(' ');
};

// Device sort order for the review grouping. Most components come back from
// Airtable with one tile per device; we want them rendered in a consistent
// mobile → tablet → desktop reading order regardless of Airtable row order.
const DEVICE_PRIORITY: Record<string, number> = {
  mobile: 0,
  phone: 0,
  tablet: 1,
  desktop: 2,
  web: 2,
};

const compareDevices = (a: string, b: string) => {
  const ai = DEVICE_PRIORITY[a.toLowerCase()] ?? 99;
  const bi = DEVICE_PRIORITY[b.toLowerCase()] ?? 99;
  if (ai !== bi) return ai - bi;
  return a.localeCompare(b);
};

const STEP_LABELS: Record<Step, string> = {
  upload: '1. Upload',
  touchpoints: '2. Touchpoints',
  cropping: '3. Cropping',
  review: '4. Review',
};

const STEP_ORDER: Step[] = ['upload', 'touchpoints', 'cropping', 'review'];

const slugifyForPath = (s: string) =>
  s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const folderForTouchpoint = (contentName: string, componentName: string, fallback: string) => {
  const label = formatContentName(contentName, componentName) || componentName || fallback;
  return slugifyForPath(label) || fallback;
};

const sourceSubfolder = (index: number, sourceName: string) => {
  const base = sourceName.replace(/\.[^.]+$/, '');
  const slug = slugifyForPath(base) || `source-${index}`;
  return `${String(index).padStart(2, '0')}-${slug}`;
};

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CSV_HEADERS = [
  'Folder',
  'Component',
  'Channel',
  'Phase',
  'Touchpoints',
  'Headline',
  'Body',
  'Copy Status',
  'Copy Notes',
  'Content Name',
];

async function uploadOne(file: File, token: string): Promise<UploadedAsset> {
  const initRes = await fetch(INIT_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mimetype: file.type }),
  });
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new Error(body.error || `Init failed: ${initRes.status}`);
  }
  const { uploadUrl, tempPath } = await initRes.json();

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

  const procRes = await fetch(PROCESS_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempPath, originalName: file.name }),
  });
  if (!procRes.ok) {
    const body = await procRes.json().catch(() => ({}));
    throw new Error(body.error || `Process failed: ${procRes.status}`);
  }
  return procRes.json();
}

async function gcsUrlToDataUrl(url: string): Promise<{ dataUrl: string; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result as string, mime: blob.type || 'image/jpeg' });
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

const cropKey = (sourceUrl: string, contentPlanId: string, device: string, componentName: string) =>
  `${sourceUrl}::${contentPlanId}::${device}::${componentName}`;

const Stepper = ({ current }: { current: Step }) => (
  <div className="flex items-center gap-2 flex-wrap">
    {STEP_ORDER.map((s, i) => {
      const isActive = s === current;
      const isDone = STEP_ORDER.indexOf(current) > i;
      return (
        <div key={s} className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : isDone
                ? 'bg-muted text-foreground border-border'
                : 'bg-background text-muted-foreground border-border'
            }`}
          >
            {STEP_LABELS[s]}
          </span>
          {i < STEP_ORDER.length - 1 && <span className="text-muted-foreground">→</span>}
        </div>
      );
    })}
  </div>
);

// CropEditor — fixed-frame, no-zoom manual crop. The frame stays put in the
// canvas; the user drags the source image behind it. Display scale is chosen
// so the displayed source just covers the frame (max-fit), so the user can
// only adjust *position*, not size — which matches the "drag, no zoom" spec.
//
// Math:
//   displayScale = max(frameDisplayW/srcW, frameDisplayH/srcH)   (smallest scale that covers the frame)
//   displayedSrcW = srcW * displayScale
//   displayedSrcH = srcH * displayScale
//   Drag bounds keep the source covering the frame:
//     offset.x ∈ [canvasFrameX + frameDisplayW − displayedSrcW, canvasFrameX]
//     offset.y ∈ [canvasFrameY + frameDisplayH − displayedSrcH, canvasFrameY]
//   Output crop_rect (in source pixels):
//     left   = (canvasFrameX − offset.x) / displayScale
//     top    = (canvasFrameY − offset.y) / displayScale
//     width  = frameDisplayW / displayScale  (constant)
//     height = frameDisplayH / displayScale  (constant)
type CropEditorProps = {
  open: boolean;
  busy: boolean;
  imageSrc: string;
  sourceWidth: number;
  sourceHeight: number;
  targetW: number;
  targetH: number;
  initialRect: CropRect;
  componentLabel: string;
  deviceLabel: string;
  onCancel: () => void;
  onConfirm: (rect: CropRect) => void;
};

const CROP_EDITOR_FRAME_MAX = 420;
const CROP_EDITOR_PADDING = 60;

const CropEditor: React.FC<CropEditorProps> = ({
  open, busy, imageSrc, sourceWidth, sourceHeight, targetW, targetH, initialRect,
  componentLabel, deviceLabel, onCancel, onConfirm,
}) => {
  const targetAR = targetW / targetH;
  const frameDisplayW =
    targetAR >= 1 ? CROP_EDITOR_FRAME_MAX : Math.round(CROP_EDITOR_FRAME_MAX * targetAR);
  const frameDisplayH =
    targetAR >= 1 ? Math.round(CROP_EDITOR_FRAME_MAX / targetAR) : CROP_EDITOR_FRAME_MAX;

  const displayScale = Math.max(frameDisplayW / sourceWidth, frameDisplayH / sourceHeight);
  const displayedSrcW = sourceWidth * displayScale;
  const displayedSrcH = sourceHeight * displayScale;

  // Canvas: source size + padding so the dimmed area outside the frame is
  // visually present. If the source is exactly frame-sized in some dimension,
  // we still get the padding in that dim.
  const canvasW = displayedSrcW + CROP_EDITOR_PADDING * 2;
  const canvasH = displayedSrcH + CROP_EDITOR_PADDING * 2;
  const canvasFrameX = (canvasW - frameDisplayW) / 2;
  const canvasFrameY = (canvasH - frameDisplayH) / 2;

  const minOffsetX = canvasFrameX + frameDisplayW - displayedSrcW;
  const maxOffsetX = canvasFrameX;
  const minOffsetY = canvasFrameY + frameDisplayH - displayedSrcH;
  const maxOffsetY = canvasFrameY;

  const initialOffsetX = canvasFrameX - initialRect.left * displayScale;
  const initialOffsetY = canvasFrameY - initialRect.top * displayScale;

  const [offset, setOffset] = useState({ x: initialOffsetX, y: initialOffsetY });
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
    pointerId: number;
  } | null>(null);

  // Re-seed offset whenever the initial rect changes (a different tile opened)
  // or the dialog re-opens.
  useEffect(() => {
    if (open) setOffset({ x: initialOffsetX, y: initialOffsetY });
  }, [open, initialOffsetX, initialOffsetY]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const nx = Math.max(
      minOffsetX,
      Math.min(maxOffsetX, drag.startOffsetX + (e.clientX - drag.startClientX))
    );
    const ny = Math.max(
      minOffsetY,
      Math.min(maxOffsetY, drag.startOffsetY + (e.clientY - drag.startClientY))
    );
    setOffset({ x: nx, y: ny });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  const computeRect = (): CropRect => {
    const widthPx = frameDisplayW / displayScale;
    const heightPx = frameDisplayH / displayScale;
    const left = (canvasFrameX - offset.x) / displayScale;
    const top = (canvasFrameY - offset.y) / displayScale;
    return {
      left: Math.max(0, Math.min(sourceWidth - widthPx, left)),
      top: Math.max(0, Math.min(sourceHeight - heightPx, top)),
      width: widthPx,
      height: heightPx,
    };
  };

  const hasHorizontalSlack = displayedSrcW - frameDisplayW > 1;
  const hasVerticalSlack = displayedSrcH - frameDisplayH > 1;
  const noSlack = !hasHorizontalSlack && !hasVerticalSlack;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-none w-fit max-h-[95vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Manual crop — {componentLabel}</DialogTitle>
          <DialogDescription>
            {deviceLabel} · {targetW}×{targetH} · drag the image to position it inside the frame
            {noSlack && ' (source AR matches target — no drag range)'}
          </DialogDescription>
        </DialogHeader>
        <div
          className="relative select-none rounded bg-black/5 mx-auto"
          style={{
            width: canvasW,
            height: canvasH,
            cursor: noSlack ? 'default' : dragRef.current ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: displayedSrcW,
              height: displayedSrcH,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
          <div
            className="absolute bg-black/55 pointer-events-none"
            style={{ left: 0, top: 0, width: canvasW, height: canvasFrameY }}
          />
          <div
            className="absolute bg-black/55 pointer-events-none"
            style={{
              left: 0,
              top: canvasFrameY + frameDisplayH,
              width: canvasW,
              height: canvasH - canvasFrameY - frameDisplayH,
            }}
          />
          <div
            className="absolute bg-black/55 pointer-events-none"
            style={{ left: 0, top: canvasFrameY, width: canvasFrameX, height: frameDisplayH }}
          />
          <div
            className="absolute bg-black/55 pointer-events-none"
            style={{
              left: canvasFrameX + frameDisplayW,
              top: canvasFrameY,
              width: canvasW - canvasFrameX - frameDisplayW,
              height: frameDisplayH,
            }}
          />
          <div
            className="absolute pointer-events-none border-2 border-white"
            style={{
              left: canvasFrameX,
              top: canvasFrameY,
              width: frameDisplayW,
              height: frameDisplayH,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(computeRect())} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cropping…
              </>
            ) : (
              'Confirm'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const isStepString = (s: string | null): s is Step =>
  s === 'upload' || s === 'touchpoints' || s === 'cropping' || s === 'review';

const CroppingToolkit = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [uploads, setUploads] = useState<UploadedAsset[]>([]);
  const [campaignId, setCampaignId] = useState('DEMOCAMPAIGN0001');
  const [campaignBrief, setCampaignBrief] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingTouchpoints, setIsFetchingTouchpoints] = useState(false);

  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [skippedComponents, setSkippedComponents] = useState<string[]>([]);
  const [cropResults, setCropResults] = useState<CropResult[]>([]);
  const [copyResults, setCopyResults] = useState<Map<string, CopyResult>>(new Map());

  // Manual-fix editor state. `key` identifies which CropResult is being edited;
  // the rest is precomputed at open time so the editor renders synchronously.
  // `busy` covers the round-trip to /api/smart-crop after the user confirms.
  const [editorState, setEditorState] = useState<{
    key: string;
    imageSrc: string;
    sourceWidth: number;
    sourceHeight: number;
    targetW: number;
    targetH: number;
    initialRect: CropRect;
    componentLabel: string;
    deviceLabel: string;
  } | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [isBuildingZip, setIsBuildingZip] = useState(false);

  // Cache for resized-JPEG data URLs, keyed by GCS URL. Filled lazily on first crop
  // for a given upload so we only fetch each resized image once across all its crops.
  const dataUrlCacheRef = useRef<Map<string, Promise<{ dataUrl: string; mime: string }>>>(new Map());

  // Cache for the SCRFD face_box, keyed by GCS URL. One detector call per source —
  // every crop tile of that source reuses the same face box, so framing is
  // consistent across aspect ratios and we don't pay for N inference calls per upload.
  const faceAnalysisCacheRef = useRef<Map<string, Promise<FaceAnalysis>>>(new Map());

  // Auto-escalation cache: when SCRFD reports no face, we ask Claude for the
  // main product instead (typically shoes / apparel laid flat). One Claude call
  // per face-less source, reused across all touchpoint crops.
  const productAnalysisCacheRef = useRef<Map<string, Promise<ProductAnalysis>>>(new Map());

  // Separate cache for the Claude vision (box-mode) analysis used by the
  // "Redo image" button. Mirrors the SCRFD cache shape (per-source, populated
  // on first redo of any tile, reused across all subsequent redos so the
  // alternate framing stays consistent across touchpoints).
  const claudeAnalysisCacheRef = useRef<Map<string, Promise<ClaudeAnalysis>>>(new Map());

  // URL is the source of truth for step. `?step=touchpoints|cropping|review`,
  // omitted means upload. The clamp below downgrades the URL to the latest
  // reachable step when state can't service the requested one (e.g. refreshing
  // on `?step=review` with no in-memory crop results).
  const requestedStep: Step = (() => {
    const raw = searchParams.get('step');
    return isStepString(raw) ? raw : 'upload';
  })();

  const step: Step = (() => {
    switch (requestedStep) {
      case 'upload':
        return 'upload';
      case 'touchpoints':
        return touchpoints.length > 0 ? 'touchpoints' : 'upload';
      case 'cropping':
      case 'review':
        return cropResults.length > 0 ? requestedStep : 'upload';
    }
  })();

  // Reconcile URL → state when the URL is over-claiming. Replace (not push)
  // so a refresh on a stale step doesn't leave an unreachable history entry.
  useEffect(() => {
    if (requestedStep === step) return;
    const next = new URLSearchParams(searchParams);
    if (step === 'upload') next.delete('step');
    else next.set('step', step);
    setSearchParams(next, { replace: true });
  }, [requestedStep, step, searchParams, setSearchParams]);

  // Push a new history entry on forward step transitions so browser back works.
  // 'upload' clears the param to keep the bare URL clean.
  const goToStep = (s: Step) => {
    const next = new URLSearchParams(searchParams);
    if (s === 'upload') next.delete('step');
    else next.set('step', s);
    setSearchParams(next);
  };

  const cropableTouchpoints = useMemo(
    () => touchpoints.filter((t) => t.crops.length > 0),
    [touchpoints]
  );

  const totalCrops = useMemo(
    () => uploads.length * cropableTouchpoints.reduce((acc, t) => acc + t.crops.length, 0),
    [uploads.length, cropableTouchpoints]
  );

  const cropProgress = useMemo(() => {
    const done = cropResults.filter((r) => r.status === 'done').length;
    const errored = cropResults.filter((r) => r.status === 'error').length;
    return { done, errored, total: cropResults.length };
  }, [cropResults]);

  // Three-level review grouping: source → component → row (contentPlanId) →
  // device tiles. The inner row level keeps the mobile/tablet/desktop tiles of
  // a single Airtable row together so the operator sees one row's full set of
  // formats on a single line. Maps preserve insertion order, so component and
  // row order follow the order they first appear in cropResults; tiles inside
  // a row are sorted by device.
  const groupedReview = useMemo(() => {
    const bySource = new Map<
      string,
      {
        sourceUrl: string;
        sourceName: string;
        components: Map<string, Map<string, CropResult[]>>;
      }
    >();
    for (const r of cropResults) {
      const url = r.target.sourceUrl;
      let bucket = bySource.get(url);
      if (!bucket) {
        bucket = { sourceUrl: url, sourceName: r.target.sourceName, components: new Map() };
        bySource.set(url, bucket);
      }
      let compMap = bucket.components.get(r.target.componentName);
      if (!compMap) {
        compMap = new Map<string, CropResult[]>();
        bucket.components.set(r.target.componentName, compMap);
      }
      const list = compMap.get(r.target.contentPlanId) ?? [];
      list.push(r);
      compMap.set(r.target.contentPlanId, list);
    }
    for (const bucket of bySource.values()) {
      for (const compMap of bucket.components.values()) {
        for (const list of compMap.values()) {
          list.sort((a, b) => compareDevices(a.target.device, b.target.device));
        }
      }
    }
    return Array.from(bySource.values()).sort((a, b) => {
      const ai = uploads.findIndex((u) => u.url === a.sourceUrl);
      const bi = uploads.findIndex((u) => u.url === b.sourceUrl);
      return ai - bi;
    });
  }, [cropResults, uploads]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const getAuthToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const getDataUrl = (gcsUrl: string) => {
    const cache = dataUrlCacheRef.current;
    let p = cache.get(gcsUrl);
    if (!p) {
      p = gcsUrlToDataUrl(gcsUrl);
      cache.set(gcsUrl, p);
    }
    return p;
  };

  const getFaceAnalysis = (gcsUrl: string) => {
    const cache = faceAnalysisCacheRef.current;
    let p = cache.get(gcsUrl);
    if (!p) {
      p = (async () => {
        const token = await getAuthToken();
        if (!token) throw new Error('Not signed in');
        const { dataUrl, mime } = await getDataUrl(gcsUrl);
        const res = await fetch(SMART_CROP_ANALYZE_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_base64: dataUrl, mime_type: mime, mode: 'retinaface' }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Analyze HTTP ${res.status}`);
        }
        const data = await res.json();
        return {
          face_box: data.face_box ?? null,
          no_subject: !!data.no_subject,
        } as FaceAnalysis;
      })();
      cache.set(gcsUrl, p);
    }
    return p;
  };

  const getProductAnalysis = (gcsUrl: string) => {
    const cache = productAnalysisCacheRef.current;
    let p = cache.get(gcsUrl);
    if (!p) {
      p = (async () => {
        const token = await getAuthToken();
        if (!token) throw new Error('Not signed in');
        const { dataUrl, mime } = await getDataUrl(gcsUrl);
        const res = await fetch(SMART_CROP_ANALYZE_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_base64: dataUrl, mime_type: mime, mode: 'product' }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Product analyze HTTP ${res.status}`);
        }
        const data = await res.json();
        return {
          product_box: data.product_box ?? null,
          extremes: data.extremes ?? null,
          no_subject: !!data.no_subject,
        } as ProductAnalysis;
      })();
      cache.set(gcsUrl, p);
    }
    return p;
  };

  // Default analysis cascade: SCRFD face detection first (cheap, deterministic).
  // If no face is found, auto-escalate to a Claude product-detection pass for
  // the typical face-less case (shoe / apparel flat-lay). Errors in either
  // branch fall through to `kind: 'none'` → server center-crops.
  const getAnalysis = async (gcsUrl: string): Promise<Analysis> => {
    const face = await getFaceAnalysis(gcsUrl);
    if (face.face_box && !face.no_subject) {
      return { kind: 'face', face_box: face.face_box };
    }
    try {
      const product = await getProductAnalysis(gcsUrl);
      if (product.product_box && !product.no_subject) {
        return { kind: 'product', product_box: product.product_box, extremes: product.extremes };
      }
    } catch {
      // Silent fallback — server center-crops on no_subject.
    }
    return { kind: 'none' };
  };

  const getClaudeAnalysis = (gcsUrl: string) => {
    const cache = claudeAnalysisCacheRef.current;
    let p = cache.get(gcsUrl);
    if (!p) {
      p = (async () => {
        const token = await getAuthToken();
        if (!token) throw new Error('Not signed in');
        const { dataUrl, mime } = await getDataUrl(gcsUrl);
        const res = await fetch(SMART_CROP_ANALYZE_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image_base64: dataUrl, mime_type: mime, mode: 'box' }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Claude analyze HTTP ${res.status}`);
        }
        const data = await res.json();
        return {
          body_box: data.body_box ?? null,
          face_box: data.face_box ?? null,
          no_subject: !!data.no_subject,
        } as ClaudeAnalysis;
      })();
      cache.set(gcsUrl, p);
    }
    return p;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FILES_PER_BATCH);
    e.target.value = '';
    if (!files.length) return;

    const valid: File[] = [];
    for (const f of files) {
      if (!ACCEPTED_TYPES.includes(f.type) && !ACCEPTED_EXT.test(f.name)) {
        toast.error(`${f.name}: unsupported type (${f.type || 'unknown'})`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name}: too large (${(f.size / 1024 / 1024).toFixed(1)} MB > 200 MB)`);
        continue;
      }
      valid.push(f);
    }
    if (!valid.length) return;

    setIsUploading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('Sign in first.');
        return;
      }

      const settled = await Promise.allSettled(valid.map((f) => uploadOne(f, token)));
      const newUploads: UploadedAsset[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          newUploads.push(r.value);
        } else {
          toast.error(`${valid[i].name}: ${(r.reason as Error).message}`);
        }
      });

      if (newUploads.length) {
        setUploads((prev) => [...prev, ...newUploads]);
        toast.success(`Uploaded ${newUploads.length} image${newUploads.length === 1 ? '' : 's'}.`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleFetchTouchpoints = async () => {
    const id = campaignId.trim();
    if (!id) {
      toast.error('Enter a Campaign ID.');
      return;
    }
    if (uploads.length === 0) {
      toast.error('Upload at least one image first.');
      return;
    }
    setIsFetchingTouchpoints(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error('Sign in first.');
        return;
      }
      const res = await fetch(TOUCHPOINTS_ENDPOINT(id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || `Airtable request failed (${res.status})`);
        return;
      }
      const list: Touchpoint[] = body.touchpoints || [];
      const skipped: string[] = body.skippedComponents || [];
      if (list.filter((t) => t.crops.length > 0).length === 0) {
        toast.error('No touchpoints with crop dimensions found for this campaign.');
        return;
      }
      setTouchpoints(list);
      setSkippedComponents(skipped);
      goToStep('touchpoints');
    } catch (err) {
      toast.error(`Failed to load touchpoints: ${(err as Error).message}`);
    } finally {
      setIsFetchingTouchpoints(false);
    }
  };

  const generateCopyFor = async (tp: Touchpoint, brief: string) => {
    const tid = deriveTouchpointId(tp.touchpointAbbreviations[0], tp.componentName);
    const updateCopy = (patch: Partial<CopyResult>) =>
      setCopyResults((prev) => {
        const next = new Map(prev);
        const cur = next.get(tp.contentPlanId);
        if (cur) next.set(tp.contentPlanId, { ...cur, ...patch });
        return next;
      });

    if (!brief.trim() || !tid) {
      setCopyResults((prev) => {
        const next = new Map(prev);
        next.set(tp.contentPlanId, {
          contentPlanId: tp.contentPlanId,
          touchpointId: tid,
          status: 'skipped',
          headline: null,
          body: null,
          errorMessage: !brief.trim()
            ? 'No campaign brief provided'
            : 'No touchpoint mapping for copy generator',
        });
        return next;
      });
      return;
    }

    updateCopy({ status: 'in-progress', errorMessage: null });
    try {
      const guidanceParts: string[] = [];
      if (tp.creativeGuidance) guidanceParts.push(`Creative guidance: ${tp.creativeGuidance}`);
      if (tp.copyGuidance) guidanceParts.push(`Copy guidance: ${tp.copyGuidance}`);
      const context = guidanceParts.length ? guidanceParts.join('\n\n') : undefined;

      const response = await copyGenerator.generate({
        prompt: brief.trim(),
        context,
        config: {
          enableCharacterLimit: false,
          touchpoints: [tid],
          variationsPerTouchpoint: 1,
        },
      });
      const v = response.results[0]?.variations[0];
      if (!v) throw new Error('No variation returned');
      updateCopy({
        status: 'done',
        headline: v.headline ?? v.snippet ?? null,
        body: v.body ?? null,
        errorMessage: null,
      });
    } catch (err) {
      updateCopy({ status: 'error', errorMessage: (err as Error).message });
    }
  };

  const redoCopy = async (contentPlanId: string) => {
    const tp = touchpoints.find((t) => t.contentPlanId === contentPlanId);
    if (!tp) return;
    await generateCopyFor(tp, campaignBrief);
  };

  // Four crop methods, all hitting /api/smart-crop:
  //   default + face       → mode='retinaface' + cached SCRFD face box
  //   default + product    → mode='product' + cached Claude product box
  //                          (auto-escalation when SCRFD finds no face)
  //   default + no subject → mode='product' + no_subject=true → center crop
  //   useClaude=true       → mode='box' + cached Claude vision body+face boxes
  //   manual={rect}        → mode='manual' + raw crop_rect (no analysis)
  // Returns the cropped JPEG (base64), plus the resolved crop_rect and method
  // so the caller can store them on the tile for later (e.g. seeding the
  // manual editor at the right position).
  const cropOne = async (
    target: CropTarget,
    opts?: { useClaude?: boolean; manual?: CropRect }
  ): Promise<{ base64: string; cropRect: CropRect; method: 'retinaface' | 'product' | 'claude' | 'manual' }> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not signed in');
    const { dataUrl, mime } = await getDataUrl(target.sourceUrl);
    const baseBody = {
      image_base64: dataUrl,
      mime_type: mime,
      aspect_ratio: `${target.width}:${target.height}`,
    };
    let body: Record<string, unknown>;
    let method: 'retinaface' | 'product' | 'claude' | 'manual';
    if (opts?.manual) {
      method = 'manual';
      body = { ...baseBody, mode: 'manual', crop_rect: opts.manual };
    } else if (opts?.useClaude) {
      method = 'claude';
      const a = await getClaudeAnalysis(target.sourceUrl);
      body = {
        ...baseBody,
        mode: 'box',
        body_box: a.body_box,
        face_box: a.face_box,
        no_subject: a.no_subject,
      };
    } else {
      const a = await getAnalysis(target.sourceUrl);
      if (a.kind === 'face') {
        method = 'retinaface';
        body = {
          ...baseBody,
          mode: 'retinaface',
          face_box: a.face_box,
          no_subject: false,
        };
      } else if (a.kind === 'product') {
        method = 'product';
        body = {
          ...baseBody,
          mode: 'product',
          product_box: a.product_box,
          extremes: a.extremes,
          no_subject: false,
        };
      } else {
        method = 'product';
        body = {
          ...baseBody,
          mode: 'product',
          no_subject: true,
        };
      }
    }
    const res = await fetch(SMART_CROP_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      base64: data.result_base64 as string,
      cropRect: data.crop_rect as CropRect,
      method,
    };
  };

  const runCropping = async () => {
    const targets: CropTarget[] = [];
    for (const u of uploads) {
      for (const tp of cropableTouchpoints) {
        for (const c of tp.crops) {
          targets.push({
            sourceUrl: u.url,
            sourceName: u.original_name,
            sourceWidth: u.width,
            sourceHeight: u.height,
            contentPlanId: tp.contentPlanId,
            contentName: tp.contentName,
            componentName: tp.componentName,
            device: c.device,
            width: c.width,
            height: c.height,
          });
        }
      }
    }
    const initial: CropResult[] = targets.map((t) => ({
      key: cropKey(t.sourceUrl, t.contentPlanId, t.device, t.componentName),
      target: t,
      status: 'pending',
      method: 'retinaface',
      arBase64: null,
      cropRect: null,
      errorMessage: null,
    }));
    setCropResults(initial);

    // Seed copy results: one entry per cropable Airtable row, keyed by contentPlanId
    // so every crop tile from that row reads the same generated copy.
    // When no campaign brief was provided, we skip seeding entirely so the
    // copy section disappears from every tile (rather than rendering a
    // muted "No campaign brief provided" line on every crop).
    const initialCopy = new Map<string, CopyResult>();
    const copyJobs: Touchpoint[] = [];
    const briefTrimmed = campaignBrief.trim();
    if (briefTrimmed) {
      for (const tp of cropableTouchpoints) {
        const tid = deriveTouchpointId(tp.touchpointAbbreviations[0], tp.componentName);
        if (!tid) {
          initialCopy.set(tp.contentPlanId, {
            contentPlanId: tp.contentPlanId,
            touchpointId: tid,
            status: 'skipped',
            headline: null,
            body: null,
            errorMessage: 'No touchpoint mapping for copy generator',
          });
          continue;
        }
        initialCopy.set(tp.contentPlanId, {
          contentPlanId: tp.contentPlanId,
          touchpointId: tid,
          status: 'pending',
          headline: null,
          body: null,
          errorMessage: null,
        });
        copyJobs.push(tp);
      }
    }
    setCopyResults(initialCopy);
    goToStep('cropping');

    let cursor = 0;
    const updateOne = (key: string, patch: Partial<CropResult>) =>
      setCropResults((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= initial.length) return;
        const item = initial[idx];
        updateOne(item.key, { status: 'in-progress' });
        try {
          const { base64, cropRect, method } = await cropOne(item.target);
          updateOne(item.key, { status: 'done', method, arBase64: base64, cropRect });
        } catch (err) {
          updateOne(item.key, { status: 'error', errorMessage: (err as Error).message });
        }
      }
    };

    let copyCursor = 0;
    const copyWorker = async () => {
      while (true) {
        const idx = copyCursor++;
        if (idx >= copyJobs.length) return;
        await generateCopyFor(copyJobs[idx], briefTrimmed);
      }
    };

    const workers = Array.from({ length: Math.min(CROP_CONCURRENCY, initial.length) }, () => worker());
    const copyWorkers = Array.from(
      { length: Math.min(COPY_CONCURRENCY, copyJobs.length) },
      () => copyWorker()
    );
    await Promise.all([...workers, ...copyWorkers]);
    goToStep('review');
  };

  const retryCrop = async (key: string) => {
    const item = cropResults.find((r) => r.key === key);
    if (!item) return;
    setCropResults((prev) =>
      prev.map((r) => (r.key === key ? { ...r, status: 'in-progress', errorMessage: null } : r))
    );
    try {
      // Redo intentionally swaps to Claude vision (box mode) so the user
      // gets a different framing method than the default SCRFD pass.
      const { base64, cropRect } = await cropOne(item.target, { useClaude: true });
      setCropResults((prev) =>
        prev.map((r) =>
          r.key === key
            ? { ...r, status: 'done', method: 'claude', arBase64: base64, cropRect, errorMessage: null }
            : r
        )
      );
    } catch (err) {
      setCropResults((prev) =>
        prev.map((r) =>
          r.key === key
            ? { ...r, status: 'error', method: 'claude', errorMessage: (err as Error).message }
            : r
        )
      );
    }
  };

  const applyManualCrop = async (key: string, rect: CropRect) => {
    const item = cropResults.find((r) => r.key === key);
    if (!item) return;
    setCropResults((prev) =>
      prev.map((r) => (r.key === key ? { ...r, status: 'in-progress', errorMessage: null } : r))
    );
    try {
      const { base64, cropRect } = await cropOne(item.target, { manual: rect });
      setCropResults((prev) =>
        prev.map((r) =>
          r.key === key
            ? { ...r, status: 'done', method: 'manual', arBase64: base64, cropRect, errorMessage: null }
            : r
        )
      );
    } catch (err) {
      setCropResults((prev) =>
        prev.map((r) =>
          r.key === key
            ? { ...r, status: 'error', method: 'manual', errorMessage: (err as Error).message }
            : r
        )
      );
    }
  };

  const openManualEditor = async (key: string) => {
    const item = cropResults.find((r) => r.key === key);
    if (!item) return;
    if (!item.cropRect) {
      toast.error('No previous crop to start from — try Redo first.');
      return;
    }
    try {
      const { dataUrl } = await getDataUrl(item.target.sourceUrl);
      setEditorState({
        key,
        imageSrc: dataUrl,
        sourceWidth: item.target.sourceWidth,
        sourceHeight: item.target.sourceHeight,
        targetW: item.target.width,
        targetH: item.target.height,
        initialRect: item.cropRect,
        componentLabel: item.target.componentName,
        deviceLabel: item.target.device,
      });
    } catch (err) {
      toast.error((err as Error).message || 'Failed to load image for manual crop');
    }
  };

  const confirmManualEditor = async (rect: CropRect) => {
    if (!editorState) return;
    setEditorBusy(true);
    try {
      await applyManualCrop(editorState.key, rect);
      setEditorState(null);
    } finally {
      setEditorBusy(false);
    }
  };

  const cancelManualEditor = () => {
    if (editorBusy) return;
    setEditorState(null);
  };

  const resetAll = () => {
    goToStep('upload');
    setUploads([]);
    setCampaignId('');
    setCampaignBrief('');
    setTouchpoints([]);
    setSkippedComponents([]);
    setCropResults([]);
    setCopyResults(new Map());
    dataUrlCacheRef.current.clear();
    faceAnalysisCacheRef.current.clear();
    productAnalysisCacheRef.current.clear();
    claudeAnalysisCacheRef.current.clear();
  };

  const handleDownloadToolkit = async () => {
    if (isBuildingZip) return;
    setIsBuildingZip(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const multiSource = uploads.length > 1;
      const sourceIndexByUrl = new Map(uploads.map((u, i) => [u.url, i + 1]));
      const folderByContentPlanId = new Map<string, string>();
      const usedFolders = new Set<string>();

      let written = 0;
      let skipped = 0;

      for (const r of cropResults) {
        if (r.status !== 'done' || !r.arBase64) {
          if (r.status === 'error') skipped += 1;
          continue;
        }
        let folder = folderByContentPlanId.get(r.target.contentPlanId);
        if (!folder) {
          const base = folderForTouchpoint(
            r.target.contentName,
            r.target.componentName,
            r.target.contentPlanId
          );
          let candidate = base;
          let n = 2;
          while (usedFolders.has(candidate)) candidate = `${base}-${n++}`;
          usedFolders.add(candidate);
          folder = candidate;
          folderByContentPlanId.set(r.target.contentPlanId, folder);
        }
        const sourceIdx = sourceIndexByUrl.get(r.target.sourceUrl) ?? 1;
        const dir = multiSource
          ? `${folder}/${sourceSubfolder(sourceIdx, r.target.sourceName)}`
          : folder;
        const path = `${dir}/${r.target.device.toLowerCase()}.jpg`;
        const bytes = Uint8Array.from(atob(r.arBase64), (c) => c.charCodeAt(0));
        zip.file(path, bytes, { binary: true });
        written += 1;
      }

      if (written === 0) {
        toast.error('Nothing to download yet — no crops have completed.');
        return;
      }

      const touchpointById = new Map(touchpoints.map((t) => [t.contentPlanId, t]));
      const seenContentPlanIds = new Set<string>();
      const csvRows: string[][] = [CSV_HEADERS];
      for (const r of cropResults) {
        if (seenContentPlanIds.has(r.target.contentPlanId)) continue;
        seenContentPlanIds.add(r.target.contentPlanId);
        const tp = touchpointById.get(r.target.contentPlanId);
        const copy = copyResults.get(r.target.contentPlanId);
        const status = copy?.status ?? 'missing';
        const notes =
          copy && (copy.status === 'skipped' || copy.status === 'error')
            ? copy.errorMessage ?? ''
            : '';
        csvRows.push([
          folderByContentPlanId.get(r.target.contentPlanId) ?? '',
          r.target.componentName,
          tp?.channel ?? '',
          tp?.phase ?? '',
          (tp?.touchpoints ?? []).join(' | '),
          copy?.headline ?? '',
          copy?.body ?? '',
          status,
          notes,
          r.target.contentName,
        ]);
      }
      const csv = '﻿' + csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n');
      zip.file('copy.csv', csv);

      const blob = await zip.generateAsync({ type: 'blob' });
      const date = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `toolkit-${campaignId || 'export'}-${date}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast.success(
        skipped > 0
          ? `Downloaded ${written} crops. Skipped ${skipped} errored crops.`
          : `Downloaded ${written} crops.`
      );
    } catch (err) {
      console.error('Download toolkit failed:', err);
      toast.error('Failed to build the download. Try again.');
    } finally {
      setIsBuildingZip(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      <Stepper current={step} />

      {step === 'upload' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Source images</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleUploadClick} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    'Upload Images'
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={[...ACCEPTED_TYPES, '.tif', '.tiff'].join(',')}
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <span className="text-xs text-muted-foreground">
                  JPEG / PNG / WebP / TIFF · max 200 MB each · up to {MAX_FILES_PER_BATCH} per batch
                </span>
              </div>

              {uploads.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {uploads.map((u) => (
                    <div
                      key={u.url}
                      className="aspect-square border border-border rounded-md overflow-hidden bg-muted/30"
                    >
                      <img src={u.url} alt={u.original_name} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-xl">
                <label className="text-sm font-medium" htmlFor="campaignId">
                  Campaign ID
                </label>
                <Input
                  id="campaignId"
                  placeholder="DEMOCAMPAIGN0001"
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  disabled={isFetchingTouchpoints}
                />
              </div>

              <div className="space-y-2 max-w-xl">
                <label className="text-sm font-medium" htmlFor="campaignBrief">
                  Campaign brief
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="campaignBrief"
                  placeholder="Short narrative for the campaign — what the drop is about, audience, tone, key product call-outs."
                  value={campaignBrief}
                  onChange={(e) => setCampaignBrief(e.target.value)}
                  disabled={isFetchingTouchpoints}
                  rows={4}
                />
                <span className="text-xs text-muted-foreground">
                  Leave empty to skip copy generation and produce crops only.
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleFetchTouchpoints}
              disabled={
                isFetchingTouchpoints ||
                isUploading ||
                uploads.length === 0 ||
                campaignId.trim().length === 0
              }
            >
              {isFetchingTouchpoints ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading touchpoints…
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        </div>
      )}

      {step === 'touchpoints' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <span className="text-sm text-muted-foreground">
              {cropableTouchpoints.length} cropable · {totalCrops} crops across {uploads.length}{' '}
              image{uploads.length === 1 ? '' : 's'}
              {touchpoints.length !== cropableTouchpoints.length &&
                ` · ${touchpoints.length - cropableTouchpoints.length} skipped`}
            </span>
          </div>

          {skippedComponents.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 rounded-md px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              <div className="font-medium mb-1">
                {skippedComponents.length} component{skippedComponents.length === 1 ? '' : 's'} skipped — no dimensions configured:
              </div>
              <div className="flex flex-wrap gap-1">
                {skippedComponents.map((name) => (
                  <span key={name} className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 rounded">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {touchpoints.map((tp) => (
              <Card
                key={tp.contentPlanId}
                className={tp.skipped ? 'opacity-50' : ''}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{tp.componentName}</CardTitle>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground mt-1">
                    {tp.channel && <span className="px-2 py-0.5 bg-muted rounded">{tp.channel}</span>}
                    {tp.touchpointAbbreviations.map((abb) => (
                      <span key={abb} className="px-2 py-0.5 bg-muted rounded">
                        {abb}
                      </span>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="text-xs">
                  <div className="text-muted-foreground mb-2 break-all">{tp.contentName}</div>
                  {tp.skipped ? (
                    <div className="text-xs italic text-muted-foreground">
                      No dimensions configured — skipped.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tp.crops.map((c) => (
                        <span
                          key={c.device}
                          className="px-2 py-1 border border-border rounded text-xs"
                        >
                          {c.device} · {c.width}×{c.height}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button size="lg" onClick={runCropping} disabled={totalCrops === 0}>
              Run cropping ({totalCrops})
            </Button>
          </div>
        </div>
      )}

      {step === 'cropping' && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-sm font-medium text-foreground">
              Cropping images… {cropProgress.done} / {cropProgress.total}
              {cropProgress.errored > 0 && (
                <span className="text-muted-foreground"> · {cropProgress.errored} errored</span>
              )}
            </div>
            <div className="w-full max-w-md h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${
                    cropProgress.total === 0
                      ? 0
                      : ((cropProgress.done + cropProgress.errored) / cropProgress.total) * 100
                  }%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'review' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              {cropProgress.done} / {cropProgress.total} crops done
              {cropProgress.errored > 0 && ` · ${cropProgress.errored} errored`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleDownloadToolkit}
                disabled={cropProgress.done === 0 || isBuildingZip}
              >
                {isBuildingZip ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Download className="w-3 h-3 mr-1" />
                )}
                Download toolkit
              </Button>
              <Button variant="outline" size="sm" onClick={resetAll} disabled={isBuildingZip}>
                Start over
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            {groupedReview.map((src) => {
              const componentEntries = Array.from(src.components.entries());
              return (
                <section key={src.sourceUrl} className="flex flex-col gap-6">
                  <div className="flex flex-col gap-6">
                    {componentEntries.map(([component, rowMap]) => (
                      <div key={component} className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                            {component}
                          </div>
                          <div className="flex-1 h-px bg-border" />
                        </div>

                        {Array.from(rowMap.entries()).map(([contentPlanId, items]) => {
                          const name = items[0].target.contentName || '';
                          const label = formatContentName(name, items[0].target.componentName);
                          return (
                            <div key={contentPlanId} className="flex flex-col gap-2">
                              <div
                                className="text-xs font-medium leading-snug"
                                title={name}
                              >
                                {label || '—'}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {items.map((r) => (
                                  <Card key={r.key} className="overflow-hidden">
                                    <div className="aspect-square bg-muted/30 border-b border-border flex items-center justify-center overflow-hidden">
                                      {r.status === 'done' && r.arBase64 ? (
                                        <img
                                          src={`data:image/jpeg;base64,${r.arBase64}`}
                                          alt=""
                                          className="w-full h-full object-contain"
                                        />
                                      ) : r.status === 'error' ? (
                                        <div className="text-xs text-red-600 px-2 text-center">
                                          {r.errorMessage}
                                        </div>
                                      ) : (
                                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                      )}
                                    </div>
                                    <CardContent className="p-3 text-xs">
                                      <div className="font-medium">
                                        <span className="capitalize">{r.target.device}</span> ·{' '}
                                        {r.target.width}×{r.target.height}
                                      </div>

                                {(() => {
                                  const copy = copyResults.get(r.target.contentPlanId);
                                  if (!copy) return null;
                                  return (
                                    <div className="mt-2 pt-2 border-t border-border">
                                      {copy.status === 'pending' || copy.status === 'in-progress' ? (
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Generating copy…
                                        </div>
                                      ) : copy.status === 'done' ? (
                                        <>
                                          {copy.headline && (
                                            <div className="font-semibold leading-snug">
                                              {copy.headline}
                                            </div>
                                          )}
                                          {copy.body && (
                                            <div className="text-muted-foreground leading-snug mt-0.5">
                                              {copy.body}
                                            </div>
                                          )}
                                        </>
                                      ) : copy.status === 'skipped' ? (
                                        <div className="italic text-muted-foreground">
                                          {copy.errorMessage}
                                        </div>
                                      ) : (
                                        <div className="text-red-600">copy: {copy.errorMessage}</div>
                                      )}
                                    </div>
                                  );
                                })()}

                                <div className="flex flex-wrap gap-2 mt-2">
                                  {(r.status === 'done' || r.status === 'error') &&
                                    (r.method === 'retinaface' ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => retryCrop(r.key)}
                                        title="Re-crop with Claude vision (alternative to the default RetinaFace framing)"
                                      >
                                        <RotateCw className="w-3 h-3 mr-1" />
                                        Recrop
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => openManualEditor(r.key)}
                                        disabled={!r.cropRect}
                                        title="Drag the source image to position it inside the crop frame"
                                      >
                                        <Move className="w-3 h-3 mr-1" />
                                        Manual fix
                                      </Button>
                                    ))}
                                  {(() => {
                                    const copy = copyResults.get(r.target.contentPlanId);
                                    if (!copy || copy.status === 'skipped') return null;
                                    const inFlight =
                                      copy.status === 'pending' || copy.status === 'in-progress';
                                    return (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => redoCopy(r.target.contentPlanId)}
                                        disabled={inFlight}
                                      >
                                        {inFlight ? (
                                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        ) : (
                                          <RotateCw className="w-3 h-3 mr-1" />
                                        )}
                                        Redo copy
                                      </Button>
                                    );
                                  })()}
                                </div>
                              </CardContent>
                            </Card>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {editorState && (
        <CropEditor
          open={!!editorState}
          busy={editorBusy}
          imageSrc={editorState.imageSrc}
          sourceWidth={editorState.sourceWidth}
          sourceHeight={editorState.sourceHeight}
          targetW={editorState.targetW}
          targetH={editorState.targetH}
          initialRect={editorState.initialRect}
          componentLabel={editorState.componentLabel}
          deviceLabel={editorState.deviceLabel}
          onCancel={cancelManualEditor}
          onConfirm={confirmManualEditor}
        />
      )}
    </div>
  );
};

export default CroppingToolkit;
