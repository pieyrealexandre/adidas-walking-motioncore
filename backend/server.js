import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyFormbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
import { Storage } from '@google-cloud/storage'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { createClient } from '@supabase/supabase-js'
import http from 'http'

import healthRoutes from './routes/health.js'
import smartCropRoutes from './routes/smartCrop.js'
import uploadAssetsRoutes from './routes/uploadAssets.js'
import airtableRoutes from './routes/airtable.js'

const IS_LOCAL = !process.env.K_SERVICE

if (IS_LOCAL) dotenv.config()

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'manifest-vault-452305-a8'
const secretClient = new SecretManagerServiceClient()

async function getSecret(name) {
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${GCP_PROJECT_ID}/secrets/${name}/versions/latest`,
    })
    return version.payload.data.toString('utf8')
  } catch (err) {
    console.error(`Failed to fetch secret ${name}:`, err.message)
    return null
  }
}

async function loadSecrets() {
  if (IS_LOCAL) {
    console.log('Loading secrets from .env')
    return
  }
  console.log('Fetching secrets from Google Secret Manager')
  process.env.SUPA_SERVICE_ROLE_KEY ||= await getSecret('SUPA_SERVICE_ROLE_KEY')
  process.env.ANTHROPIC_API_KEY ||= await getSecret('ANTHROPIC_API_KEY')
  process.env.CROPPING_PROTOTYPE_ANTHROPIC_KEY ||= await getSecret('CROPPING_PROTOTYPE_ANTHROPIC_KEY')
}

await loadSecrets()

const { default: Anthropic } = await import('@anthropic-ai/sdk')
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID || 'ylgmmgdkcazhnubxyoho'
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${SUPABASE_PROJECT_ID}.supabase.co`
const SUPABASE_SERVICE_KEY = process.env.SUPA_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPA_SERVICE_ROLE_KEY env var')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Compatibility shim for routes ported from bball that expect the multi-
// project decoration pattern (getSupabaseClient + DEFAULT_SUPABASE_PROJECT_ID).
// adiGen is single-tenant on the data layer, so this always returns the same
// client regardless of the requested project ID.
const getSupabaseClient = () => supabase

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'saga-running-japan-images-eu'
const storage = IS_LOCAL
  ? new Storage({ keyFilename: 'gcs-service-account.json' })
  : new Storage()
const bucket = storage.bucket(BUCKET_NAME)

const LOG_PRETTY = process.env.LOG_PRETTY === 'true'
const fastify = Fastify({
  logger: LOG_PRETTY
    ? {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'yyyy-mm-dd HH:MM:ss.l o', colorize: true, ignore: 'pid,hostname' },
        },
      }
    : {
        level: 'info',
        serializers: {
          err: (err) => ({ type: err.constructor.name, message: err.message, stack: err.stack }),
        },
      },
  bodyLimit: 52428800,
})

fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    done(null, JSON.parse(body))
  } catch (err) {
    err.statusCode = 400
    done(err, undefined)
  }
})

await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
})
await fastify.register(fastifyHelmet, { contentSecurityPolicy: false, frameguard: { action: 'deny' }, xssFilter: true })
await fastify.register(fastifyFormbody)
await fastify.register(fastifyRateLimit, { max: Number(process.env.RATE_LIMIT_MAX ?? 100), timeWindow: '1 minute' })
await fastify.register(multipart)

fastify.decorate('supabase', supabase)
fastify.decorate('getSupabaseClient', getSupabaseClient)
fastify.decorate('DEFAULT_SUPABASE_PROJECT_ID', SUPABASE_PROJECT_ID)
fastify.decorate('anthropic', anthropic)
fastify.decorate('bucket', bucket)
fastify.decorate('BUCKET_NAME', BUCKET_NAME)
fastify.decorate('storage', storage)

await fastify.register(healthRoutes)
await fastify.register(smartCropRoutes)
await fastify.register(uploadAssetsRoutes)
await fastify.register(airtableRoutes)

const PORT = Number(process.env.PORT || 8080)
const server = http.createServer((req, res) => fastify.server.emit('request', req, res))

server.listen(PORT, '0.0.0.0', () => {
  fastify.log.info(`adiGen backend listening on http://localhost:${PORT}`)
  fastify.log.info(`Supabase: ${SUPABASE_URL}`)
  fastify.log.info(`GCS bucket: ${BUCKET_NAME}`)
})
