import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, copyFile, readdir, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {resolveGeminiBinary} from './gemini-binary.mjs';
import {referenceGuide} from './reference-roles.mjs';
import {validatePrompt} from './prompt-limits.mjs';

const jobsDirectory = process.env.LOCAL_IMAGE_DATA_DIR ? path.resolve(process.env.LOCAL_IMAGE_DATA_DIR, 'image-jobs') : fileURLToPath(new URL('../data/image-jobs/', import.meta.url));
const imagesDirectory = process.env.LOCAL_IMAGE_OUTPUT_DIR ? path.resolve(process.env.LOCAL_IMAGE_OUTPUT_DIR) : fileURLToPath(new URL('../generated/', import.meta.url));

const jobs = new Map(), requests = new Map(), pending = [];
let processing = false;

const executable = resolveGeminiBinary();

export function checkConnection() {
  if (!existsSync(executable)) return false;
  try {
    const check = spawnSync(executable, ['models'], {encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000});
    return check.status === 0 && /gemini/i.test(check.stdout || '');
  } catch {
    return false;
  }
}

let connected = checkConnection();

export const generatorStatus = () => {
  if (!connected) connected = checkConnection();
  return {ready: connected, engine: 'gemini-native', local: true};
};

const publicJob = job => ({
  id: job.id,
  state: job.state,
  prompt: job.prompt,
  image: job.image || null,
  error: job.error || null
});

const save = async job => {
  const destination = path.join(jobsDirectory, job.id, 'job.json');
  await mkdir(path.dirname(destination), {recursive: true});
  await writeFile(destination + '.tmp', JSON.stringify(job, null, 2));
  await rename(destination + '.tmp', destination);
};

export async function findJob(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  let job = jobs.get(id);
  if (!job) {
    try {
      job = JSON.parse(await readFile(path.join(jobsDirectory, id, 'job.json'), 'utf8'));
    } catch {
      return null;
    }
  }
  return publicJob(job);
}

export async function enqueue(prompt, requestId, options = {}) {
  if (!generatorStatus().ready) {
    throw new Error('Gemini / Antigravity necesita una sesión activa iniciada en este equipo.');
  }
  validatePrompt(prompt);
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId)) {
    throw new Error('La solicitud no tiene un identificador válido.');
  }
  if (requests.has(requestId)) return publicJob(jobs.get(requests.get(requestId)));
  if (pending.length >= 3) throw new Error('La cola está llena. Espera a que termine la imagen actual.');

  const job = {
    id: randomUUID(),
    prompt: prompt.trim(),
    state: 'queued',
    createdAt: new Date().toISOString(),
    image: null,
    error: null,
    ...options
  };

  jobs.set(job.id, job);
  requests.set(requestId, job.id);
  pending.push(job);
  await save(job);
  void drain();
  return publicJob(job);
}

async function drain() {
  if (processing) return;
  processing = true;
  try {
    while (pending.length) {
      const job = pending.shift();
      try {
        await generate(job);
      } catch (err) {
        job.state = 'failed';
        job.error = err.message || 'No se pudo completar la generación con Gemini.';
        await save(job);
      }
    }
  } finally {
    processing = false;
  }
}

export async function generateNative(job) {
  return generate(job);
}

function resolveBrainDirectories() {
  const home = os.homedir();
  return [
    path.join(home, '.gemini', 'antigravity-cli', 'brain'),
    path.join(home, '.gemini', 'antigravity', 'brain'),
    path.join(home, 'AppData', 'Local', 'gemini', 'brain')
  ].filter(p => existsSync(p));
}

async function findGeneratedImageFile(jobId, conversationId) {
  const brainDirs = resolveBrainDirectories();
  const searchDirs = [];

  if (conversationId) {
    for (const base of brainDirs) {
      const convoDir = path.join(base, conversationId);
      if (existsSync(convoDir)) searchDirs.push(convoDir);
    }
  }
  searchDirs.push(...brainDirs);

  const prefix = `gemini_job_${jobId}`;
  for (const dir of searchDirs) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.startsWith(prefix) && /\.(jpe?g|png|webp)$/i.test(entry)) {
          return path.join(dir, entry);
        }
      }
    } catch {}
  }

  // Fallback: search for any recently modified image in convoDir
  if (conversationId) {
    for (const base of brainDirs) {
      const convoDir = path.join(base, conversationId);
      if (existsSync(convoDir)) {
        try {
          const entries = await readdir(convoDir);
          const images = entries.filter(e => /\.(jpe?g|png|webp)$/i.test(e));
          if (images.length > 0) {
            return path.join(convoDir, images[images.length - 1]);
          }
        } catch {}
      }
    }
  }

  return null;
}

async function generate(job) {
  job.state = 'running';
  job.startedAt = new Date().toISOString();
  await save(job);

  const ratio = job.ratio || job.aspect_ratio || '1:1';
  const references = job.referencePaths || [];
  const refInstructions = references.length ? referenceGuide(job.referenceRoles) : '';

  const imageName = `gemini_job_${job.id}`;
  const instruction = [
    `Genera una imagen usando la herramienta generate_image con los siguientes parámetros exactos:`,
    `- ImageName: '${imageName}'`,
    `- AspectRatio: '${ratio}'`,
    references.length ? `- ImagePaths: ${JSON.stringify(references)}` : null,
    `- Prompt: ${JSON.stringify(job.prompt)}`,
    refInstructions ? `Indicaciones para referencias: ${refInstructions}` : null,
    job.transparent ? `Requisito: Fondo transparente recortado con canal alfa.` : null,
    `Devuelve la confirmación una vez que la herramienta generate_image termine.`
  ].filter(Boolean).join('\n');

  const args = [
    '-p', instruction,
    '--dangerously-skip-permissions',
    '--output-format', 'json'
  ];

  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({timedOut: true, stdout, stderr, code: null});
    }, 480000);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', code => {
      clearTimeout(timer);
      resolve({timedOut: false, stdout, stderr, code});
    });
  });

  if (result.timedOut) {
    job.state = 'failed';
    job.error = 'Gemini no terminó dentro del tiempo límite de generación.';
    job.finishedAt = new Date().toISOString();
    await save(job);
    return;
  }

  let conversationId = null;
  try {
    const parsed = JSON.parse(result.stdout);
    conversationId = parsed.conversation_id;
  } catch {}

  const sourceFile = await findGeneratedImageFile(job.id, conversationId);
  if (!sourceFile) {
    job.state = 'failed';
    job.cliExitCode = result.code;
    job.error = 'No se encontró la imagen generada por Gemini.';
    job.finishedAt = new Date().toISOString();
    await save(job);
    return;
  }

  const sourceStat = await stat(sourceFile);
  if (!sourceStat.isFile() || sourceStat.size < 100) {
    throw new Error('El archivo generado está corrupto o vacío.');
  }

  const bytes = await readFile(sourceFile);
  let extension = 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg';
  else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = 'png';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF') extension = 'webp';

  await mkdir(imagesDirectory, {recursive: true});
  const filename = `${job.id}.${extension}`;
  await copyFile(sourceFile, path.join(imagesDirectory, filename));

  job.extension = extension;
  job.state = 'completed';
  job.image = '/images/' + filename;
  job.finishedAt = new Date().toISOString();
  job.cliExitCode = result.code;
  await save(job);
}

export async function imageResponse(filename) {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(filename)) return null;
  try {
    const bytes = await readFile(path.join(imagesDirectory, filename));
    return {
      bytes,
      type: filename.endsWith('.png') ? 'image/png' : filename.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'
    };
  } catch {
    return null;
  }
}
