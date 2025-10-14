import { Tree, formatFiles, joinPathFragments } from '@nx/devkit';
import { parseYamlConfig } from './parser.js';
import { generateCode } from './generator.js';
import { FileOperations } from './template-engine.js';
import * as fs from 'fs';
import { DIRNAME } from './dirname.js';

interface GeneratorOptions {
  configPath: string;
}

export default async function (tree: Tree, options: GeneratorOptions) {
  // Read and parse YAML config
  const configPath = options.configPath;
  if (!tree.exists(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configContent = tree.read(configPath, 'utf-8');
  if (!configContent) throw new Error(`Config file is empty: ${configPath}`);

  const { schema, projectName } = parseYamlConfig(configContent, configPath);

  // Generate output directory from config path (../code-gen)
  const outputDir = joinPathFragments(configPath, '../code-gen');
  const templateDir = joinPathFragments(DIRNAME, '..', 'files');

  // Create file operations adapter for NX Tree
  const fileOperations: FileOperations = {
    writeFile: (path: string, content: string) => tree.write(path, content),
    // Only writeFile uses tree, other methods use fs
    readFile: (path: string) => fs.readFileSync(path, 'utf-8'),
    joinPath: (...segments: string[]) => joinPathFragments(...segments),
    exists: (path: string) => {
      try {
        fs.accessSync(path, fs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
    readDir: (path: string) => {
      try {
        return fs.readdirSync(path);
      } catch {
        return [];
      }
    },
    isDirectory: (path: string) => {
      try {
        return fs.statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
  };

  if (!tree.exists(outputDir)) {
    tree.write(joinPathFragments(outputDir, '.gitkeep'), '');
  }

  // Generate code using the unified template engine
  await generateCode({
    schema,
    projectName,
    outputDir,
    templateDir,
    fileOperations,
  });

  await formatFiles(tree);

  return () => {
    console.log('ECS code generation complete!');
    console.log(`Generated ${schema.components.length} components and ${schema.singletons.length} singletons.`);
    console.log(`Project name: ${projectName}`);
  };
}
