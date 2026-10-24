import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory = process.env.LOCAL_IMAGE_DATA_DIR ? path.resolve(process.env.LOCAL_IMAGE_DATA_DIR) : fileURLToPath(new URL('../data/', import.meta.url));
const filename = path.join(directory, 'provider-config.json');

export function validateOrigins(origins) {
  if (!Array.isArray(origins) || origins.length > 8) throw new Error('Indica hasta ocho direcciones de frontend.');
  return [...new Set(origins.map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Indica solo el origen, por ejemplo http://localhost:4321.');
    }
    return url.origin;
  }))];
}

export async function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('No se pudo leer la configuración local.');
  }
  return {
    port: 54800,
    allowedOrigins: validateOrigins(saved.allowedOrigins || ['http://localhost:4321', 'http://127.0.0.1:4321', 'http://localhost:4322', 'http://127.0.0.1:4322'])
  };
}

export async function saveOrigins(origins) {
  const config = {allowedOrigins: validateOrigins(origins)};
  await mkdir(directory, {recursive: true});
  await writeFile(filename + '.tmp', JSON.stringify(config, null, 2));
  await rename(filename + '.tmp', filename);
  return config;
}
