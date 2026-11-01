import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface TaskOptions {
  plan?: boolean;
  check?: boolean;
  channel?: string;
  args: string[];
}

function parseCliArgs(): { task: string; options: TaskOptions } {
  const rawArgs = process.argv.slice(2);
  let task = 'dev';
  const options: TaskOptions = {
    plan: false,
    check: false,
    args: [],
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--plan') {
      options.plan = true;
    } else if (arg === '--check') {
      options.check = true;
    } else if (!arg.startsWith('-')) {
      if (!task || task === 'dev') {
        if (['dev', 'build', 'release', 'publish'].includes(arg)) {
          task = arg;
        } else if (['github'].includes(arg)) {
          options.channel = arg;
        } else {
          options.args.push(arg);
        }
      } else if (['github'].includes(arg)) {
        options.channel = arg;
      } else {
        options.args.push(arg);
      }
    } else {
      options.args.push(arg);
    }
  }

  return { task, options };
}

function runCommand(command: string, plan: boolean, cwd: string = process.cwd()): void {
  if (plan) {
    console.log(`[plan] Sería ejecutado: ${command}`);
    return;
  }
  console.log(`> ${command}`);
  execSync(command, { stdio: 'inherit', cwd });
}

function getAppInfo(): { name: string; version: string } {
  const pkgPath = resolve(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return {
      name: pkg.name || 'aurora-gemini-provider',
      version: pkg.version || '1.0.0',
    };
  }
  return { name: 'aurora-gemini-provider', version: '1.0.0' };
}

function executeTask(task: string, options: TaskOptions): void {
  const { name, version } = getAppInfo();

  switch (task) {
    case 'dev': {
      console.log(`[mise] Modo desarrollo para ${name} v${version}`);
      runCommand('node scripts/provider.mjs 54800', options.plan);
      break;
    }

    case 'build': {
      console.log(`[mise] Comprobación de sintaxis para ${name} v${version} (sin empaquetar)`);
      runCommand('node --check scripts/provider.mjs', options.plan);
      break;
    }

    case 'release': {
      console.log(`[mise] Preparación de distribuible local para ${name} v${version}`);
      runCommand('node --check scripts/provider.mjs', options.plan);
      console.log(`[mise] Servicio preparado para ejecución local.`);
      break;
    }

    case 'publish': {
      const channel = options.channel || 'github';
      console.log(`[mise] Publicación de ${name} v${version} (canal: ${channel})`);

      if (options.check) {
        console.log(`[mise preflight] Verificando requisitos de publicación...`);
        const branch = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).stdout.trim();
        const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
        const tag = `v${version}`;
        const tagExists = spawnSync('git', ['tag', '-l', tag], { encoding: 'utf8' }).stdout.trim() === tag;

        console.log(`  - Rama actual: ${branch}`);
        console.log(`  - Cambios sin confirmar: ${status ? 'Sí' : 'No'}`);
        console.log(`  - Tag esperado: ${tag} (${tagExists ? 'Existe' : 'No creado'})`);
        console.log(`  - Destino: GitHub Releases (${channel})`);
        console.log(`  - Nota: Herramienta utilitaria complementaria sin mantenimiento activo.`);
        return;
      }

      if (options.plan) {
        console.log(`[plan] Se verificaría git status, tag v${version} y se crearía Release en GitHub (${channel})`);
        return;
      }

      throw new Error(`Publicación directa no autorizada sin verificación previa (--check/--plan).`);
    }

    default:
      throw new Error(`Tarea desconocida: ${task}`);
  }
}

const { task, options } = parseCliArgs();
executeTask(task, options);
