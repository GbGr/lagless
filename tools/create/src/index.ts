#!/usr/bin/env node
import { program } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ejs from 'ejs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { select } from '@inquirer/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json once (single source of truth)
const _pkgJsonPath = path.resolve(__dirname, '..', 'package.json');
let _packageVersion = '0.0.0';
try {
  const _pkg = JSON.parse(fs.readFileSync(_pkgJsonPath, 'utf-8'));
  _packageVersion = _pkg.version || _packageVersion;
} catch {
  // fallback
}

type SimulationType = 'raw' | 'physics2d' | 'physics3d';

interface CreateOptions {
  preset: string;
  port: string;
  serverPort: string;
  simulationType?: SimulationType;
}

function toPascalCase(kebab: string): string {
  return kebab.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function getTemplatesDir(): string {
  const devPath = path.resolve(__dirname, '..', 'templates');
  if (fs.existsSync(devPath)) return devPath;
  const distPath = path.resolve(__dirname, '..', '..', 'templates');
  if (fs.existsSync(distPath)) return distPath;
  throw new Error('Templates directory not found');
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function processPath(filePath: string, vars: Record<string, string>): string {
  let result = filePath;
  result = result.replace(/__packageName__/g, vars.packageName);
  result = result.replace(/__ProjectName__/g, vars.projectName);
  return result;
}

async function promptSimulationType(): Promise<SimulationType> {
  return select<SimulationType>({
    message: 'Select simulation type:',
    choices: [
      { value: 'raw', name: 'Raw ECS', description: 'Manual velocity/position management, no physics engine' },
      { value: 'physics2d', name: 'Physics 2D (Rapier)', description: 'Rapier 2D rigid body physics with auto-managed transforms' },
      { value: 'physics3d', name: 'Physics 3D (Rapier)', description: 'Rapier 3D rigid body physics with top-down 2D rendering' },
    ],
  });
}

program
  .name('create-lagless')
  .description('Scaffold a new Lagless multiplayer game project')
  .version(_packageVersion)
  .argument('<project-name>', 'Project name in kebab-case (e.g., my-game)')
  .option('--preset <preset>', 'Project preset', 'pixi-react')
  .option('--port <port>', 'Frontend dev server port', '4203')
  .option('--server-port <port>', 'Backend server port', '3400')
  .option('--simulation-type <type>', 'Simulation type: raw, physics2d, or physics3d')
  .action(async (projectArg: string, options: CreateOptions) => {
    const targetDir = path.resolve(process.cwd(), projectArg);
    const packageName = path.basename(targetDir).toLowerCase();
    const pascalName = toPascalCase(packageName);

    if (fs.existsSync(targetDir)) {
      console.error(`Error: Directory "${targetDir}" already exists.`);
      process.exit(1);
    }

    const templatesDir = getTemplatesDir();
    const presetDir = path.join(templatesDir, options.preset);

    if (!fs.existsSync(presetDir)) {
      console.error(`Error: Preset "${options.preset}" not found. Available: ${fs.readdirSync(templatesDir).join(', ')}`);
      process.exit(1);
    }

    // Determine simulation type — from CLI flag or interactive prompt
    let simulationType: SimulationType;
    if (options.simulationType) {
      const valid: SimulationType[] = ['raw', 'physics2d', 'physics3d'];
      if (!valid.includes(options.simulationType as SimulationType)) {
        console.error(`Error: Invalid simulation type "${options.simulationType}". Valid: ${valid.join(', ')}`);
        process.exit(1);
      }
      simulationType = options.simulationType as SimulationType;
    } else {
      simulationType = await promptSimulationType();
    }

    const laglessVersion = _packageVersion;

    const vars: Record<string, string> = {
      projectName: pascalName,
      packageName,
      frontendPort: options.port,
      serverPort: options.serverPort,
      laglessVersion,
      simulationType,
    };

    console.log(`\nCreating Lagless project "${packageName}"...`);
    console.log(`  Preset: ${options.preset}`);
    console.log(`  Simulation: ${simulationType}`);
    console.log(`  Frontend port: ${options.port}`);
    console.log(`  Server port: ${options.serverPort}`);
    console.log(`  Target: ${targetDir}\n`);

    const templateFiles = walkDir(presetDir);

    for (const templateFile of templateFiles) {
      const relativePath = path.relative(presetDir, templateFile);
      const outputRelative = processPath(relativePath, vars);
      const outputPath = path.join(targetDir, outputRelative);
      const outputDir = path.dirname(outputPath);

      const content = fs.readFileSync(templateFile, 'utf-8');

      // Only process text files that might contain EJS tags
      const ext = path.extname(templateFile);
      const textExts = ['.ts', '.tsx', '.json', '.yaml', '.yml', '.html', '.css', '.md', '.toml', '.gitignore'];

      if (textExts.includes(ext) || ext === '.ejs') {
        const rendered = ejs.render(content, vars, { filename: templateFile });
        const finalPath = ext === '.ejs' ? outputPath.replace(/\.ejs$/, '') : outputPath;

        // Skip writing empty/whitespace-only files (conditional template exclusion)
        if (rendered.trim().length === 0) {
          continue;
        }

        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(finalPath, rendered, 'utf-8');
      } else {
        // Binary or unknown — copy as-is
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.copyFileSync(templateFile, outputPath);
      }
    }

    // Remove physics docs that don't match the selected simulationType
    const docsDir = path.join(targetDir, 'docs');
    if (simulationType !== 'physics2d') {
      const f = path.join(docsDir, '08-physics2d.md');
      if (fs.existsSync(f)) fs.rmSync(f);
    }
    if (simulationType !== 'physics3d') {
      const f = path.join(docsDir, '08-physics3d.md');
      if (fs.existsSync(f)) fs.rmSync(f);
    }

    // Clone lagless framework source for AI reference
    const sourcesDir = path.join(docsDir, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });
    console.log('Cloning lagless framework source for AI reference...');
    try {
      execSync(`git clone --depth 1 https://github.com/GbGr/lagless.git "${path.join(sourcesDir, 'lagless')}"`, {
        stdio: 'inherit',
      });
      // Remove .git to save space
      fs.rmSync(path.join(sourcesDir, 'lagless', '.git'), { recursive: true, force: true });
    } catch {
      console.warn('Warning: Could not clone lagless source. AI reference will be unavailable.');
      console.warn('You can manually clone later: git clone --depth 1 https://github.com/GbGr/lagless.git docs/sources/lagless');
    }

    // Install dependencies
    console.log('\nInstalling dependencies...');
    try {
      execSync('pnpm install', { cwd: targetDir, stdio: 'inherit' });
    } catch {
      console.error('Warning: pnpm install failed. Run it manually after creation.');
    }

    // Run ECS codegen to generate code from schema
    console.log('\nGenerating ECS code from schema...');
    try {
      execSync('pnpm codegen', { cwd: targetDir, stdio: 'inherit' });
    } catch {
      console.error('Warning: codegen failed. Run "pnpm codegen" manually after creation.');
    }

    console.log('\nProject created successfully!\n');
    console.log('To start developing:');
    console.log(`  cd ${packageName}`);
    console.log('  pnpm dev               # Start backend + frontend + dev-player\n');
    console.log('Or run individually:');
    console.log('  pnpm dev:backend       # Game server (Bun, watches for changes)');
    console.log('  pnpm dev:frontend      # Frontend (Vite HMR)');
    console.log('  pnpm dev:player        # Dev-player (multiplayer testing, port 4210)\n');
    console.log('To regenerate ECS code after schema changes:');
    console.log('  pnpm codegen\n');
  });

program.parse();
