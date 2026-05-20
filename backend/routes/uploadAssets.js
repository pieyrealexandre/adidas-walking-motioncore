import sharp from 'sharp';
import crypto from 'crypto';

const TMP_PREFIX = 'tmp-uploads';
const FINAL_PREFIX = 'uploads';
const SIGNED_URL_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_LONG_SIDE = 2500;
const JPEG_QUALITY = 85;
const SHARP_INPUT_OPTS = { limitInputPixels: 200_000_000, sequentialRead: true };

const TEMP_PATH_RE = /^tmp-uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;
const isValidTempPath = (tempPath, userId) =>
  typeof tempPath === 'string' &&
  TEMP_PATH_RE.test(tempPath) &&
  tempPath.startsWith(`${TMP_PREFIX}/${userId}/`);

export default async function uploadAssetsRoutes(fastify, options) {
  const { getSupabaseClient, DEFAULT_SUPABASE_PROJECT_ID, bucket, BUCKET_NAME } = fastify;

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
      fastify.log.warn(
        {
          authErrorMessage: userErr?.message,
          authErrorStatus: userErr?.status,
          supabaseProjectId: DEFAULT_SUPABASE_PROJECT_ID,
          tokenHead: token.slice(0, 12),
        },
        '[upload-assets] auth failed'
      );
      reply.status(401).send({ error: 'Invalid or expired token' });
      return null;
    }
    return userData.user.id;
  }

  fastify.post('/api/upload-assets/init', async (request, reply) => {
    const userId = await authedUserId(request, reply);
    if (!userId) return;

    const { filename, mimetype } = request.body ?? {};
    const ext = (typeof filename === 'string' ? filename.match(/\.[a-z0-9]{2,5}$/i)?.[0] : null)?.toLowerCase() ?? '.bin';
    const tempPath = `${TMP_PREFIX}/${userId}/${crypto.randomUUID()}${ext}`;

    let uploadUrl;
    try {
      [uploadUrl] = await bucket.file(tempPath).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + SIGNED_URL_TTL_MS,
        contentType: typeof mimetype === 'string' && mimetype ? mimetype : 'application/octet-stream',
      });
    } catch (e) {
      fastify.log.error({ err: e, errMessage: e.message, userId, tempPath }, '[upload-assets/init] signing failed');
      return reply.status(500).send({ error: 'Failed to mint upload URL' });
    }

    fastify.log.info({ userId, tempPath, ttlMs: SIGNED_URL_TTL_MS }, '[upload-assets/init] minted');
    return { uploadUrl, tempPath };
  });

  fastify.post('/api/upload-assets/process', async (request, reply) => {
    const startedAt = Date.now();
    const userId = await authedUserId(request, reply);
    if (!userId) return;

    const { tempPath, originalName } = request.body ?? {};
    if (!isValidTempPath(tempPath, userId)) {
      fastify.log.warn({ userId, tempPath }, '[upload-assets/process] invalid tempPath');
      return reply.status(400).send({ error: 'Invalid tempPath' });
    }

    const tempFile = bucket.file(tempPath);

    let meta;
    try {
      [meta] = await tempFile.getMetadata();
    } catch (e) {
      if (e.code === 404) {
        return reply.status(404).send({ error: 'Upload not found' });
      }
      fastify.log.error({ err: e, errMessage: e.message, tempPath }, '[upload-assets/process] getMetadata failed');
      return reply.status(500).send({ error: 'Failed to inspect upload' });
    }

    if (Number(meta.size) > MAX_UPLOAD_BYTES) {
      await tempFile.delete().catch(() => {});
      return reply.status(413).send({ error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` });
    }

    let outBuffer, outMeta;
    try {
      const transformer = sharp(SHARP_INPUT_OPTS)
        .rotate()
        .resize({ width: MAX_LONG_SIDE, height: MAX_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

      tempFile.createReadStream().pipe(transformer);
      const { data, info } = await transformer.toBuffer({ resolveWithObject: true });
      outBuffer = data;
      outMeta = info;
    } catch (e) {
      fastify.log.error(
        { err: e, errName: e.name, errMessage: e.message, tempPath },
        '[upload-assets/process] sharp pipeline failed'
      );
      await tempFile.delete().catch(() => {});
      return reply.status(422).send({ error: 'Image processing failed' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const finalPath = `${FINAL_PREFIX}/${userId}/${today}/${crypto.randomUUID()}.jpg`;
    try {
      await bucket.file(finalPath).save(outBuffer, {
        metadata: { contentType: 'image/jpeg' },
        resumable: false,
        public: true,
      });
    } catch (e) {
      fastify.log.error({ err: e, errMessage: e.message, finalPath }, '[upload-assets/process] GCS write failed');
      await tempFile.delete().catch(() => {});
      return reply.status(500).send({ error: 'Storage write failed' });
    }

    await tempFile.delete().catch((err) =>
      fastify.log.warn({ err, tempPath }, '[upload-assets/process] temp cleanup failed')
    );

    fastify.log.info(
      { userId, finalPath, bytesIn: Number(meta.size), bytesOut: outMeta.size, ms: Date.now() - startedAt },
      '[upload-assets/process] done'
    );

    return {
      original_name: typeof originalName === 'string' ? originalName : null,
      url: `https://storage.googleapis.com/${BUCKET_NAME}/${finalPath}`,
      width: outMeta.width,
      height: outMeta.height,
      size_bytes: outMeta.size,
    };
  });
}
