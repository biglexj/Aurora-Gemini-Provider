#!/usr/bin/env bun
/**
 * Despachador único de tareas de Aurora Gemini Provider (Mise).
 *
 * Contrato: Docs/global/architecture/mise-command-standard.md
 *   mise dev      Servidor local en loopback (127.0.0.1:54800).
 *   mise build    Comprueba la sintaxis de todos los scripts y la resolución de dependencias.
 *   mise check    Verifica entorno y configuración local, en solo lectura.
 *   mise test     Ejecuta las pruebas unitarias de los módulos puros.
 *   mise release  Verifica la preparación para distribución local; nunca publica.
 *   mise publish  Verificación de publicación; solo publica con autorización expresa.
 *
 *   --plan   Muestra lo que se ejecutaría. No ejecuta, no escribe ni consulta la red.
 *   --check  Solo lectura. Válido en publish.
 *
 * La raíz del repositorio se resuelve desde la ubicación de este archivo.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_PORT, loadConfig} from './config.mjs';
import {resolveGeminiBinary} from './gemini-binary.mjs';

const scriptDirectory = import.meta.dir ?? dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '..');
const scriptsDirectory = join(root, 'scripts');
const taskNames = ['dev', 'build', 'check', 'test', 'release', 'publish'];

interface Options {
  plan: boolean;
  check: boolean;
  channel: string;
  args: string[];
}

const emptyOptions = (): Options => ({plan: false, check: false, channel: '', args: []});

function packageInfo(): {name: string; version: string} {
  const file = join(root, 'package.json');
  if (existsSync(file)) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    return {name: pkg.name || 'aurora-gemini-provider', version: pkg.version || '1.0.0'};
  }
  return {name: 'aurora-gemini-provider', version: '1.0.0'};
}

function parseArgs(argv: string[]): {task: string; options: Options} {
  const options: Options = emptyOptions();
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg === '--plan') options.plan = true;
    else if (arg === '--check') options.check = true;
    else if (arg.startsWith('-')) options.args.push(arg);
    else positional.push(arg);
  }

  let task = '';
  if (process.env.MISE_TASK_NAME && taskNames.includes(process.env.MISE_TASK_NAME)) {
    task = process.env.MISE_TASK_NAME;
  }
  if (!task && positional.length && taskNames.includes(positional[0])) {
    task = positional.shift() as string;
  }
  if (!task) task = 'dev';

  if (positional.length) {
    const first = positional.shift() as string;
    if (first === 'github') options.channel = first;
    else options.args.push(first);
  }
  options.args.push(...positional);

  return {task, options};
}

function run(command: string, args: string[], options: Options, label: string): number {
  if (options.plan) {
    console.log(`[plan] ${label}: ${[command, ...args].join(' ')}`);
    return 0;
  }
  console.log(`> ${label}: ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', shell: false});
  if (result.error) {
    console.error(`No se pudo ejecutar ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function scriptFiles(suffix: string): string[] {
  if (!existsSync(scriptsDirectory)) return [];
  return readdirSync(scriptsDirectory)
    .filter(name => name.endsWith(suffix))
    .sort()
    .map(name => join('scripts', name));
}

function defaultPort(): number {
  return DEFAULT_PORT;
}

function buildTask(options: Options): number {
  const files = scriptFiles('.mjs');
  if (options.plan) {
    console.log(`[plan] Se comprobaría la sintaxis de ${files.length} scripts en scripts/`);
    console.log('[plan] Se comprobaría que la dependencia sharp se resuelve desde la raíz del proyecto');
    return 0;
  }

  let status = 0;
  for (const file of files) {
    const code = run('node', ['--check', file], options, `sintaxis de ${file}`);
    if (code !== 0) status = code;
  }
  const sharp = run(
    'node',
    ['-e', "import('sharp').then(() => process.exit(0), error => { console.error(error.message); process.exit(1); })"],
    options,
    'resolución de la dependencia sharp'
  );
  return status === 0 ? sharp : status;
}

async function checkTask(options: Options): Promise<number> {
  if (options.plan) {
    console.log('[plan] Se verificaría la versión de Node, la dependencia sharp, el binario agy/gemini y los orígenes permitidos');
    return 0;
  }

  let status = 0;

  const nodeVersion = spawnSync('node', ['--version'], {cwd: root, encoding: 'utf8', shell: false});
  console.log(`  - Node.js: ${(nodeVersion.stdout || nodeVersion.stderr || 'desconocida').trim()}`);

  const sharp = spawnSync(
    'node',
    ['-e', "import('sharp').then(() => process.exit(0), error => { console.error(error.message); process.exit(1); })"],
    {cwd: root, encoding: 'utf8', shell: false}
  );
  console.log(`  - Dependencia sharp: ${sharp.status === 0 ? 'disponible' : 'no disponible'}`);
  if (sharp.status !== 0) {
    status = sharp.status ?? 1;
    console.error(`    ${(sharp.stderr || '').trim()}`);
  }

  const binary = resolveGeminiBinary();
  console.log(`  - Binario agy/gemini: ${binary} (${existsSync(binary) ? 'disponible' : 'no encontrado'})`);

  try {
    const config = await loadConfig();
    console.log(`  - Orígenes permitidos: ${config.allowedOrigins.length}`);
    for (const origin of config.allowedOrigins) console.log(`      ${origin}`);
  } catch (error) {
    status = 1;
    console.error(`  - Configuración local: ${(error as Error).message}`);
  }

  for (const directory of ['data', 'generated']) {
    const path = join(root, directory);
    console.log(`  - ${directory}/: ${existsSync(path) ? 'presente' : 'se creará al arrancar'}`);
  }

  return status;
}

function testTask(options: Options): number {
  const files = scriptFiles('.test.mjs');
  if (!files.length) {
    console.error('No hay pruebas que ejecutar en scripts/.');
    return 1;
  }
  if (options.plan) {
    console.log(`[plan] Se ejecutarían ${files.length} ${files.length === 1 ? 'suite' : 'suites'}: ${files.join(', ')}`);
    return 0;
  }
  let status = 0;
  for (const file of files) {
    const code = run('node', ['--test', file], options, `pruebas de ${file}`);
    if (code !== 0) status = code;
  }
  return status;
}

async function releaseTask(options: Options): Promise<number> {
  const {name, version} = packageInfo();
  console.log(`[mise] release ${name} v${version}: preparación local, sin publicación`);
  const built = buildTask(options);
  const checked = await checkTask(options);
  if (options.plan) return built === 0 && checked === 0 ? 0 : 1;
  if (built === 0 && checked === 0) {
    console.log('[mise] Preparación local verificada. No se ha publicado ni etiquetado nada.');
  }
  return built === 0 ? checked : built;
}

async function publishTask(options: Options): Promise<number> {
  const {name, version} = packageInfo();
  const tag = `v${version}`;
  const channel = options.channel || 'github';

  if (options.check) {
    console.log(`[mise preflight] Requisitos de publicación de ${name} v${version}`);
    const git = (args: string[]) => spawnSync('git', args, {cwd: root, encoding: 'utf8', shell: false}).stdout.trim();
    const branch = git(['branch', '--show-current']);
    const status = git(['status', '--porcelain']);
    const tagExists = git(['tag', '-l', tag]) === tag;
    const remote = git(['remote', 'get-url', 'origin']);
    const gh = spawnSync('gh', ['--version'], {cwd: root, encoding: 'utf8', shell: false});

    console.log(`  - Rama actual: ${branch || 'desconocida'}`);
    console.log(`  - Cambios sin confirmar: ${status ? 'Sí' : 'No'}`);
    console.log(`  - Tag esperado: ${tag} (${tagExists ? 'Existe' : 'No creado'})`);
    console.log(`  - Remoto origin: ${remote || 'no configurado'}`);
    console.log(`  - GitHub CLI: ${gh.status === 0 ? 'disponible' : 'no disponible'}`);
    console.log('  - Nota: utilidad complementaria sin mantenimiento activo; la publicación es manual.');
    return 0;
  }

  if (options.plan) {
    console.log(`[plan] Publicación prevista de ${name} v${version} en GitHub Releases (${channel}):`);
    console.log(`  1. Verificar que el árbol de trabajo está limpio y en la rama main.`);
    console.log(`  2. Crear el tag ${tag} sobre el commit validado.`);
    console.log(`  3. Publicar las notas de la versión y el código fuente asociado.`);
    console.log('[plan] No se ejecuta ninguna acción, no se escribe y no se consulta la red.');
    return 0;
  }

  throw new Error(
    'La publicación no está automatizada en este proyecto. Ejecuta "mise publish --check" para la verificación o "mise publish --plan" para ver el plan; publicar requiere autorización expresa y una acción manual.'
  );
}

async function main(): Promise<number> {
  const {task, options} = parseArgs(process.argv.slice(2));
  const {name, version} = packageInfo();

  if (options.channel && task !== 'publish') {
    throw new Error(`El canal solo es válido en publish.`);
  }
  if (options.check && task !== 'publish') {
    throw new Error(`--check solo es válido en publish.`);
  }

  switch (task) {
    case 'dev': {
      console.log(`[mise] dev ${name} v${version}: servidor local en http://127.0.0.1:${defaultPort()}`);
      return run('node', ['scripts/provider.mjs'], options, 'servidor Aurora Gemini Provider');
    }
    case 'build':
      console.log(`[mise] build ${name} v${version}: comprobación de sintaxis y dependencias, sin empaquetar`);
      return buildTask(options);
    case 'check':
      console.log(`[mise] check ${name} v${version}: verificación de entorno y configuración local`);
      return await checkTask(options);
    case 'test':
      console.log(`[mise] test ${name} v${version}: pruebas unitarias`);
      return testTask(options);
    case 'release':
      return await releaseTask(options);
    case 'publish':
      return await publishTask(options);
    default:
      throw new Error(`Tarea desconocida: ${task}. Usa ${taskNames.join(', ')}.`);
  }
}

try {
  process.exit(await main());
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
