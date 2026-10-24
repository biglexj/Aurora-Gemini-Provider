import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {generatorStatus, generateNative, findJob} from './gemini-native.mjs';
import {BatchQueue} from './batches.mjs';
import {EXPRESSIONS, RATIOS, RESOLUTIONS} from './presets.mjs';
import {storeReference, storedImage} from './assets.mjs';
import {batchZip} from './zip.mjs';
import {loadConfig, saveOrigins} from './config.mjs';
import {IMAGE_JOB_JSON_MAX_BYTES, IMAGE_PROMPT_MAX_CHARS} from './prompt-limits.mjs';
import {requestBody as body} from './request-body.mjs';

const config = await loadConfig();
const port = Number(process.argv[2] || 54800);
const allowedOrigins = new Set(process.env.LOCAL_IMAGE_ALLOWED_ORIGINS !== undefined ? process.env.LOCAL_IMAGE_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : config.allowedOrigins);
const queue = new BatchQueue({generate: generateNative, ready: () => generatorStatus().ready});
await queue.initialize();

const publicJob = batch => ({
  id: batch.id,
  status: batch.state,
  created_at: batch.createdAt,
  progress: {completed: batch.completed, total: batch.count},
  outputs: batch.items.filter(i => i.state === 'completed').map(i => ({
    index: i.index,
    expression: i.label,
    url: i.image,
    width: i.width,
    height: i.height,
    filename: i.filename
  })),
  error: batch.error,
  batch
});

const server = createServer(async (req, res) => {
  const address = server.address(), origin = 'http://127.0.0.1:' + address.port;
  const send = (value, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(value));
  };

  try {
    if (!['127.0.0.1:' + address.port, 'localhost:' + address.port].includes(req.headers.host)) {
      return send({error: 'Solicitud no permitida.'}, 403);
    }
    const caller = req.headers.origin;
    if (caller && ![origin, 'http://localhost:' + address.port].includes(caller) && !allowedOrigins.has(caller)) {
      return send({error: 'Origen no permitido.'}, 403);
    }
    if (caller) {
      res.setHeader('Access-Control-Allow-Origin', caller);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, Idempotency-Key');
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, origin), route = url.pathname;

    if (route === '/api/config') {
      if (caller && ![origin, 'http://localhost:' + address.port].includes(caller)) {
        return send({error: 'Configura la conexión desde el panel del proveedor.'}, 403);
      }
      if (req.method === 'GET') {
        return send({allowedOrigins: [...allowedOrigins], environmentOverride: process.env.LOCAL_IMAGE_ALLOWED_ORIGINS !== undefined});
      }
      if (req.method !== 'POST') return send({error: 'Método no permitido.'}, 405);
      if (!req.headers['content-type']?.startsWith('application/json')) return send({error: 'Envía la configuración como JSON.'}, 415);
      const input = JSON.parse((await body(req, 4096)).toString('utf8'));
      const saved = await saveOrigins(input.allowedOrigins);
      allowedOrigins.clear();
      saved.allowedOrigins.forEach(value => allowedOrigins.add(value));
      return send(saved);
    }

    if (['/api/status', '/v1/status'].includes(route) && req.method === 'GET') {
      return send({
        ...generatorStatus(),
        name: 'Aurora Gemini Provider',
        api_version: '1',
        capabilities: {
          generation: true,
          edits: true,
          max_prompt_chars: IMAGE_PROMPT_MAX_CHARS,
          max_references: 5,
          reference_roles: true,
          max_batch: 30,
          serial: true,
          aspect_ratios: RATIOS,
          output_long_edges: RESOLUTIONS
        }
      });
    }

    if (route === '/api/presets' && req.method === 'GET') {
      return send({expressions: EXPRESSIONS, ratios: RATIOS, resolutions: RESOLUTIONS});
    }

    if (route === '/v1/jobs' && req.method === 'GET') {
      return send({jobs: queue.list().map(publicJob)});
    }

    if (route.startsWith('/api/jobs/') && req.method === 'GET') {
      const batch = queue.get(route.slice(10));
      if (batch) {
        const item = batch.items[0];
        return send({job: {id: batch.id, state: batch.state, image: item.image, prompt: batch.prompt, error: batch.error}});
      }
      const job = await findJob(route.slice(10));
      return job ? send({job}) : send({error: 'Solicitud no encontrada.'}, 404);
    }

    if (route.startsWith('/images/') || route.startsWith('/references/')) {
      if (!['GET', 'HEAD'].includes(req.method)) return send({error: 'Método no permitido.'}, 405);
      const reference = route.startsWith('/references/'), image = await storedImage(route.slice(reference ? 12 : 8), reference);
      if (!image) return send({error: 'Imagen no encontrada.'}, 404);
      res.writeHead(200, {'Content-Type': image.type, 'Content-Length': image.bytes.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff'});
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(image.bytes);
      return;
    }

    const match = route.match(/^\/v1\/jobs\/([a-f0-9-]{36})(?:\/(pause|resume|cancel|download))?$/);
    if (match) {
      const batch = queue.get(match[1]);
      if (!batch) return send({error: 'Trabajo no encontrado.'}, 404);
      if (!match[2] && req.method === 'GET') return send(publicJob(batch));
      if (match[2] === 'download' && req.method === 'GET') {
        const zip = await batchZip(batch);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="expresiones-' + batch.id + '.zip"',
          'Cache-Control': 'no-store'
        });
        res.end(zip);
        return;
      }
      if (['pause', 'resume', 'cancel'].includes(match[2]) && req.method === 'POST') {
        return send(publicJob(await queue.action(batch.id, match[2])));
      }
      return send({error: 'Método no permitido.'}, 405);
    }

    if (route === '/v1/references') {
      if (req.method !== 'POST') return send({error: 'Método no permitido.'}, 405);
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(req.headers['content-type']?.split(';')[0])) {
        return send({error: 'Sube un archivo PNG, JPG o WebP.'}, 415);
      }
      let name = 'Referencia';
      try { name = decodeURIComponent(req.headers['x-file-name'] || name); } catch {}
      return send({reference: await storeReference(await body(req, 12 * 1024 * 1024), name)}, 201);
    }

    if (!['/v1/images/generations', '/v1/images/edits', '/v1/batches', '/api/generate'].includes(route)) {
      return send({error: 'Página no encontrada.'}, 404);
    }

    if (req.method !== 'POST') return send({error: 'Método no permitido.'}, 405);
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      return send({error: 'Envía la solicitud como JSON.'}, 415);
    }

    let input;
    try {
      input = JSON.parse((await body(req, IMAGE_JOB_JSON_MAX_BYTES)).toString('utf8'));
    } catch (err) {
      if (err.status) throw err;
      return send({error: 'JSON no válido.'}, 400);
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) return send({error: 'Solicitud no válida.'}, 400);
    if (route === '/v1/images/edits' && (!Array.isArray(input.references) || !input.references.length)) {
      return send({error: 'La edición necesita al menos una referencia subida.'}, 400);
    }
    if (route === '/v1/images/generations' && input.references?.length) {
      return send({error: 'Usa /v1/images/edits para generar desde referencias.'}, 400);
    }

    const batchInput = {
      ...input,
      requestId: req.headers['idempotency-key'] || input.request_id || input.requestId,
      references: input.references || [],
      prompt: input.prompt || '',
      ratio: input.aspect_ratio || input.ratio || '1:1',
      resolution: String(input.resolution || '1024'),
      background: input.background || 'original',
      kind: route === '/v1/batches' ? 'expressions' : 'image',
      expressions: route === '/v1/batches' ? input.expressions : ['alegre'],
      count: route === '/v1/batches' ? input.count : 1
    };

    const batch = await queue.create(batchInput);
    if (route === '/api/generate') {
      return send({job: {id: batch.id, state: batch.state, prompt: batch.prompt, image: null, error: null}}, 202);
    }
    return send(publicJob(batch), 202);
  } catch (error) {
    return send({error: error.status === 413 ? error.message : error.message || 'No se pudo procesar la solicitud.'}, error.status || 400);
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `El puerto ${port} ya está ocupado.` : 'No se pudo iniciar el servidor local.');
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', async () => {
  await mkdir(new URL('../data/', import.meta.url), {recursive: true});
  await writeFile(new URL('../data/server.pid.json', import.meta.url), JSON.stringify({
    pid: process.pid,
    port,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
  }));
  console.log(`Aurora Gemini Provider: http://127.0.0.1:${server.address().port}/`);
});
