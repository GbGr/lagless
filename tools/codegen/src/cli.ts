#!/usr/bin/env node
import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseYamlConfig } from './parser.js';
import { generateCode } from './generator.js';
import { FileOperations } from './template-engine.js';
import { DIRNAME } from './dirname.js';

interface CliOptions {
  config: string;
  output?: string;
  templates?: string;
}

program
  .name('lagless-codegen')
  .description('Generate ECS code from YAML configuration')
  .version('1.0.0')
  .requiredOption('-c, --config <path>', 'Path to YAML configuration file')
  .option('-o, --output <path>', 'Output directory (default: config_dir/../code-gen)')
  .option('-t, --templates <path>', 'Templates directory')
  .action(async (options: CliOptions) => {
    try {
      await generateFromConfig(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function generateFromConfig(options: CliOptions): Promise<void> {
  const { config: configPath, output: outputPath, templates: templatesPath } = options;

  // Validate config file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  // Read and parse config
  const configContent = fs.readFileSync(configPath, 'utf-8');
  if (!configContent.trim()) {
    throw new Error(`Config file is empty: ${configPath}`);
  }

  const { schema, projectName } = parseYamlConfig(configContent, configPath);

  // Determine output directory
  const outputDir = outputPath || path.join(path.dirname(configPath), '..', 'code-gen');

  // Determine templates directory
  const templateDir = templatesPath || path.join(DIRNAME, '..', 'files');

  console.log(`Generating ECS code...`);
  console.log(`Config: ${configPath}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Templates: ${templateDir}`);
  console.log(`Project: ${projectName}`);

  // Create file operations for Node.js filesystem
  const fileOperations: FileOperations = {
    readFile: (filePath: string) => {
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch {
        return '';
      }
    },
    writeFile: (filePath: string, content: string) => {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
    },
    joinPath: (...segments: string[]) => path.join(...segments),
    exists: (filePath: string) => fs.existsSync(filePath),
    readDir: (dirPath: string) => {
      try {
        return fs.readdirSync(dirPath);
      } catch {
        return [];
      }
    },
    isDirectory: (filePath: string) => {
      try {
        return fs.statSync(filePath).isDirectory();
      } catch {
        return false;
      }
    },
  };

  // Generate code
  await generateCode({
    schema,
    projectName,
    outputDir,
    templateDir,
    fileOperations,
  });

  console.log('ECS code generation complete!');
  console.log(`Generated ${schema.components.length} components and ${schema.singletons.length} singletons.`);
  console.log(`Project name: ${projectName}`);
  console.log(`Output written to: ${outputDir}`);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start CLI if this file is run directly
if (require.main === module) {
  program.parse();
}
