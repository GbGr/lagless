#!/usr/bin/env node
import { program } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ejs from 'ejs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CreateOptions {
  preset: string;
  port: string;
  serverPort: string;
}

function toPascalCase(kebab: string): string {
  return kebab.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function getTemplatesDir(): string {
  // In development (source), templates are sibling to src/
  // In dist, templates are at package root (copied by files field)
  const devPath = path.resolve(__dirname, '..', 'templates');
  if (fs.existsSync(devPath)) return devPath;
  // Fallback for npm install
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

program
  .name('create-lagless')
  .description('Scaffold a new Lagless multiplayer game project')
  .version('0.0.30')
  .argument('<project-name>', 'Project name in kebab-case (e.g., my-game)')
  .option('--preset <preset>', 'Project preset', 'pixi-react')
  .option('--port <port>', 'Frontend dev server port', '4200')
  .option('--server-port <port>', 'Backend server port', '3333')
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

    // Read package.json from this package to get current lagless version
    const pkgJsonPath = path.resolve(__dirname, '..', 'package.json');
    let laglessVersion = '0.0.30';
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      laglessVersion = pkg.version || laglessVersion;
    } catch {
      // fallback
    }

    const vars = {
      projectName: pascalName,
      packageName,
      frontendPort: options.port,
      serverPort: options.serverPort,
      laglessVersion,
    };

    console.log(`\nCreating Lagless project "${packageName}"...`);
    console.log(`  Preset: ${options.preset}`);
    console.log(`  Frontend port: ${options.port}`);
    console.log(`  Server port: ${options.serverPort}`);
    console.log(`  Target: ${targetDir}\n`);

    const templateFiles = walkDir(presetDir);

    for (const templateFile of templateFiles) {
      const relativePath = path.relative(presetDir, templateFile);
      const outputRelative = processPath(relativePath, vars);
      const outputPath = path.join(targetDir, outputRelative);
      const outputDir = path.dirname(outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const content = fs.readFileSync(templateFile, 'utf-8');

      // Only process .ejs files or text files that might contain EJS tags
      const ext = path.extname(templateFile);
      const textExts = ['.ts', '.tsx', '.json', '.yaml', '.yml', '.html', '.css', '.md', '.toml', '.gitignore'];

      if (textExts.includes(ext) || ext === '.ejs') {
        const rendered = ejs.render(content, vars, { filename: templateFile });
        const finalPath = ext === '.ejs' ? outputPath.replace(/\.ejs$/, '') : outputPath;
        fs.writeFileSync(finalPath, rendered, 'utf-8');
      } else {
        // Binary or unknown — copy as-is
        fs.copyFileSync(templateFile, outputPath);
      }
    }

    console.log('Project created successfully!\n');
    console.log('Next steps:');
    console.log(`  cd ${packageName}`);
    console.log('  pnpm install');
    console.log('  pnpm codegen        # Generate ECS code from schema');
    console.log('  pnpm dev:backend    # Start game server');
    console.log('  pnpm dev:frontend   # Start frontend dev server\n');
  });

program.parse();
