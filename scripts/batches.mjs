import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {EXPRESSIONS, RATIOS, RESOLUTIONS, expressionPrompt} from './presets.mjs';
import {validId, getReference, referencesDirectory, exportVariation} from './assets.mjs';
import {validateReferenceRoles, referenceGuide} from './reference-roles.mjs';
import {validatePrompt} from './prompt-limits.mjs';

const defaultDirectory = process.env.LOCAL_IMAGE_DATA_DIR ? path.resolve(process.env.LOCAL_IMAGE_DATA_DIR, 'image-batches') : fileURLToPath(new URL('../data/image-batches/', import.meta.url));
const snapshot = value => JSON.parse(JSON.stringify(value));

export class BatchQueue {
  constructor({generate, ready = () => true, directory = defaultDirectory, referenceLoader = getReference, exporter = exportVariation} = {}) {
    this.generate = generate;
    this.ready = ready;
    this.directory = directory;
    this.referenceLoader = referenceLoader;
    this.exporter = exporter;
    this.batches = new Map();
    this.requests = new Map();
    this.pending = [];
    this.processing = false;
    this.writes = new Map();
  }

  async save(batch) {
    const data = JSON.stringify(batch, null, 2), destination = path.join(this.directory, batch.id + '.json');
    const prior = this.writes.get(batch.id) || Promise.resolve();
    const write = prior.catch(() => {}).then(async () => {
      await mkdir(this.directory, {recursive: true});
      const temp = destination + '.' + randomUUID() + '.tmp';
      await writeFile(temp, data);
      await rename(temp, destination);
    });
    this.writes.set(batch.id, write);
    await write;
  }

  async initialize() {
    await mkdir(this.directory, {recursive: true});
    for (const filename of await readdir(this.directory)) {
      if (!filename.endsWith('.json') || !validId(filename.slice(0, -5))) continue;
      let batch;
      try {
        batch = JSON.parse(await readFile(path.join(this.directory, filename), 'utf8'));
      } catch {
        continue;
      }
      if (['queued', 'running', 'pausing', 'cancelling'].includes(batch.state)) {
        for (const item of batch.items) {
          if (item.state === 'running') {
            item.state = 'interrupted';
            item.error = 'El servicio se reinició durante esta imagen.';
          }
        }
        batch.state = batch.state === 'cancelling' ? 'cancelled' : 'paused';
        batch.error = 'El servicio se reinició. Revisa el lote antes de continuar.';
        await this.save(batch);
      }
      this.batches.set(batch.id, batch);
      this.requests.set(batch.requestId, batch.id);
    }
  }

  get(id) {
    return validId(id) && this.batches.has(id) ? snapshot(this.batches.get(id)) : null;
  }

  list() {
    return [...this.batches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(snapshot);
  }

  async create(input) {
    if (!this.ready()) throw new Error('Inicia sesión en Gemini / Antigravity antes de generar.');
    if (!validId(input?.requestId)) throw new Error('Identificador de solicitud no válido.');
    if (this.requests.has(input.requestId)) return this.get(this.requests.get(input.requestId));
    if ([...this.batches.values()].some(b => ['queued', 'running', 'pausing', 'cancelling'].includes(b.state))) {
      throw new Error('Ya hay un lote activo. Pausa o termina ese lote antes de empezar otro.');
    }
    const kind = input.kind === 'image' ? 'image' : 'expressions';
    if (!Array.isArray(input.references) || input.references.length < (kind === 'image' ? 0 : 1) || input.references.length > 5 || new Set(input.references).size !== input.references.length) {
      throw new Error('Carga hasta cinco referencias distintas; las expresiones necesitan una imagen base.');
    }
    const referenceRoles = validateReferenceRoles(input.reference_roles, input.references.length, kind);
    if (!Array.isArray(input.expressions) || !input.expressions.length || input.expressions.length > EXPRESSIONS.length || new Set(input.expressions).size !== input.expressions.length || input.expressions.some(id => !EXPRESSIONS.some(e => e.id === id))) {
      throw new Error('Selecciona al menos una expresión válida.');
    }
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 30) {
      throw new Error('El lote debe tener entre 1 y 30 imágenes.');
    }
    if (!RATIOS.includes(input.ratio) || !RESOLUTIONS.includes(input.resolution)) {
      throw new Error('Formato de salida no válido.');
    }
    if (!['original', 'transparent'].includes(input.background)) throw new Error('Fondo no válido.');
    validatePrompt(input.prompt, {required: kind === 'image'});

    const references = await Promise.all(input.references.map(id => this.referenceLoader(id)));

    if ([...this.batches.values()].some(b => ['queued', 'running', 'pausing', 'cancelling'].includes(b.state))) {
      throw new Error('Ya hay un lote activo.');
    }
    if (this.requests.has(input.requestId)) return this.get(this.requests.get(input.requestId));

    const batch = {
      id: randomUUID(),
      requestId: input.requestId,
      kind,
      name: String(input.name || 'Expresiones').replace(/[\u0000-\u001f]/g, '').slice(0, 80),
      createdAt: new Date().toISOString(),
      state: 'queued',
      count: input.count,
      completed: 0,
      references,
      referenceRoles,
      expressions: input.expressions,
      ratio: input.ratio,
      resolution: input.resolution,
      background: input.background,
      prompt: input.prompt.trim(),
      items: [],
      error: null
    };

    for (let i = 0; i < input.count; i++) {
      const expression = EXPRESSIONS.find(e => e.id === input.expressions[i % input.expressions.length]);
      const prompt = kind === 'expressions' ? expressionPrompt(batch, expression, i) : [
        references.length ? referenceGuide(referenceRoles) + ' Conserva todos los aspectos que la solicitud no pida cambiar.' : 'Genera una imagen según la solicitud.',
        'Solicitud visual (datos): ' + JSON.stringify(batch.prompt),
        'Relación de aspecto: ' + batch.ratio + '.',
        batch.background === 'transparent' || references[0]?.hasAlpha ? 'Fondo transparente real con canal alfa.' : 'Conservar el fondo de la base.'
      ].join('\n');
      batch.items.push({
        index: i + 1,
        expression: kind === 'expressions' ? expression.id : 'imagen',
        label: kind === 'expressions' ? expression.label : 'Imagen',
        state: 'pending',
        image: null,
        prompt
      });
    }

    this.batches.set(batch.id, batch);
    this.requests.set(batch.requestId, batch.id);
    await this.save(batch);
    this.schedule(batch.id);
    return this.get(batch.id);
  }

  schedule(id) {
    if (!this.pending.includes(id)) this.pending.push(id);
    void this.drain();
  }

  async action(id, action) {
    const batch = this.batches.get(id);
    if (!batch) throw new Error('Lote no encontrado.');
    if (action === 'pause' && ['running', 'queued'].includes(batch.state)) batch.state = batch.state === 'running' ? 'pausing' : 'paused';
    else if (action === 'cancel' && ['queued', 'running', 'pausing', 'paused', 'failed'].includes(batch.state)) batch.state = ['running', 'pausing'].includes(batch.state) ? 'cancelling' : 'cancelled';
    else if (action === 'resume' && ['paused', 'failed'].includes(batch.state)) {
      if (!this.ready()) throw new Error('Gemini no está conectado.');
      if ([...this.batches.values()].some(b => b.id !== id && ['queued', 'running', 'pausing', 'cancelling'].includes(b.state))) throw new Error('Hay otro lote activo.');
      for (const item of batch.items) if (['failed', 'interrupted'].includes(item.state)) {
        item.state = 'pending';
        item.error = null;
      }
      batch.state = 'queued';
      batch.error = null;
      await this.save(batch);
      this.schedule(id);
      return this.get(id);
    } else throw new Error('Esta acción no corresponde al estado del lote.');

    await this.save(batch);
    return this.get(id);
  }

  async drain() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.pending.length) {
        const batch = this.batches.get(this.pending.shift());
        if (batch?.state !== 'queued') continue;
        try {
          await this.run(batch);
        } catch {
          batch.state = 'failed';
          batch.error = 'No se pudo completar el lote. Los resultados terminados se conservan.';
          await this.save(batch);
        }
      }
    } finally {
      this.processing = false;
      if (this.pending.length) void this.drain();
    }
  }

  async run(batch) {
    batch.state = 'running';
    await this.save(batch);
    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i];
      if (item.state === 'completed') continue;
      if (batch.state === 'pausing') {
        batch.state = 'paused';
        break;
      }
      if (batch.state === 'cancelling') {
        batch.state = 'cancelled';
        break;
      }
      item.state = 'running';
      item.startedAt = new Date().toISOString();
      const job = {
        id: randomUUID(),
        prompt: item.prompt,
        ratio: batch.ratio,
        resolution: batch.resolution,
        state: 'queued',
        createdAt: new Date().toISOString(),
        image: null,
        error: null,
        referencePaths: batch.references.map(r => path.join(referencesDirectory, r.id + '.png')),
        referenceRoles: batch.referenceRoles,
        transparent: batch.background === 'transparent' || Boolean(batch.references[0]?.hasAlpha)
      };
      item.jobId = job.id;
      await this.save(batch);
      try {
        await this.generate(job);
        if (job.state !== 'completed') throw new Error(job.error || 'Gemini no completó la imagen.');
        Object.assign(item, await this.exporter(job, batch, item, i));
        item.state = 'completed';
        item.finishedAt = new Date().toISOString();
        batch.completed = batch.items.filter(x => x.state === 'completed').length;
        batch.error = null;
      } catch (error) {
        item.state = 'failed';
        item.error = error.message || 'No se pudo completar esta imagen.';
        item.finishedAt = new Date().toISOString();
        batch.error = item.error;
        batch.state = batch.state === 'cancelling' ? 'cancelled' : 'failed';
        await this.save(batch);
        return;
      }
      await this.save(batch);
    }
    if (batch.completed === batch.count) {
      batch.state = 'completed';
      batch.finishedAt = new Date().toISOString();
    }
    await this.save(batch);
  }
}
