import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {outputSize} from './presets.mjs';

export const referencesDirectory = process.env.LOCAL_IMAGE_DATA_DIR ? path.resolve(process.env.LOCAL_IMAGE_DATA_DIR, 'image-references') : fileURLToPath(new URL('../data/image-references/', import.meta.url));
export const generatedDirectory = process.env.LOCAL_IMAGE_OUTPUT_DIR ? path.resolve(process.env.LOCAL_IMAGE_OUTPUT_DIR) : fileURLToPath(new URL('../generated/', import.meta.url));

export const validId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);

export async function storeReference(bytes, name) {
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error('Cada referencia debe pesar como máximo 12 MB.');
  const image = sharp(bytes, {limitInputPixels: 32_000_000, animated: false});
  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw new Error('El archivo no es una imagen válida.');
  }
  if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) {
    throw new Error('Usa una imagen estática PNG, JPG o WebP.');
  }
  const id = randomUUID();
  await mkdir(referencesDirectory, {recursive: true});
  const {data, info} = await image.autoOrient().png().toBuffer({resolveWithObject: true});
  await writeFile(path.join(referencesDirectory, id + '.png'), data, {flag: 'wx'});
  const hasTransparency = metadata.hasAlpha ? !(await sharp(data).stats()).isOpaque : false;
  const reference = {
    id,
    name: String(name || 'Referencia').replace(/[\u0000-\u001f]/g, '').slice(0, 160),
    width: info.width,
    height: info.height,
    hasAlpha: hasTransparency,
    url: '/references/' + id + '.png'
  };
  await writeFile(path.join(referencesDirectory, id + '.json'), JSON.stringify(reference));
  return reference;
}

export async function getReference(id) {
  if (!validId(id)) throw new Error('Referencia no válida.');
  try {
    return JSON.parse(await readFile(path.join(referencesDirectory, id + '.json'), 'utf8'));
  } catch {
    throw new Error('No se encuentra una referencia. Vuelve a subirla.');
  }
}

export async function exportVariation(job, batch, item, index) {
  const bytes = await readFile(path.join(generatedDirectory, job.id + '.' + job.extension));
  const metadata = await sharp(bytes).metadata();
  const size = outputSize(batch.ratio, batch.resolution);
  const transparency = metadata.hasAlpha ? await sharp(bytes).stats() : null;
  const hasTransparency = Boolean(transparency && !transparency.isOpaque);
  if (batch.background === 'transparent' && !hasTransparency) {
    throw new Error('El generador devolvió un fondo opaco. Revisa el resultado.');
  }
  const filename = String(index + 1).padStart(2, '0') + '_' + item.expression + '.png';
  const destination = path.join(generatedDirectory, batch.id);
  await mkdir(destination, {recursive: true});
  await sharp(bytes).resize({...size, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toFile(path.join(destination, filename));
  return {
    image: '/images/' + batch.id + '/' + filename,
    filename,
    width: size.width,
    height: size.height,
    nativeWidth: metadata.width,
    nativeHeight: metadata.height,
    hasTransparency,
    normalized: metadata.width !== size.width || metadata.height !== size.height
  };
}

export async function storedImage(relative, reference = false) {
  const valid = reference ? /^[a-f0-9-]{36}\.png$/.test(relative) : /^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(relative) || /^[a-f0-9-]{36}\/\d{2}_[a-z]+\.png$/.test(relative);
  if (!valid) return null;
  try {
    const bytes = await readFile(path.join(reference ? referencesDirectory : generatedDirectory, relative));
    return {
      bytes,
      type: relative.endsWith('.jpg') ? 'image/jpeg' : relative.endsWith('.webp') ? 'image/webp' : 'image/png'
    };
  } catch {
    return null;
  }
}
