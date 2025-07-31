import { Tree, formatFiles, generateFiles, joinPathFragments } from '@nx/devkit';
import { parse } from 'yaml';
import {
  ComponentDefinition,
  ECSSchema,
  FieldDefinition, FieldTypeReverse,
  FilterDefinition,
  IInputDefinition,
  InputFieldDefinition,
  PlayerResourceDefinition,
  SingletonDefinition,
} from '@lagless/types';
import { typeToArrayConstructor, getTypeSizeBytes, typeStringToFieldType, typedArrayConstructors } from '@lagless/core';
import { align8 } from '@lagless/misc';

interface GeneratorOptions {
  configPath: string;
}

function parseInputFieldType(fieldName: string, fieldType: string): InputFieldDefinition {
  const res = parseFieldType(fieldType);

  return {
    name: fieldName,
    ...res,
    type: typeStringToFieldType[res.type],
    byteLength: align8(res.isArray ? getTypeSizeBytes(res.type) * res.arrayLength! : getTypeSizeBytes(res.type)),
  };
}

function parseFieldType(typeStr: string): FieldDefinition {
  const arrayMatch = typeStr.match(/^(\w+)\[(\d+)]$/);
  if (arrayMatch) {
    const baseType = arrayMatch[1];
    const arrayLength = parseInt(arrayMatch[2], 10);

    if (!Object.keys(typeToArrayConstructor).includes(baseType)) {
      throw new Error(`Unsupported array base type: ${baseType}`);
    }

    if (arrayLength <= 0) {
      throw new Error(`Array length must be positive: ${arrayLength}`);
    }

    return {
      type: baseType,
      isArray: true,
      arrayLength,
    };
  } else {
    if (!Object.keys(typeToArrayConstructor).includes(typeStr)) {
      throw new Error(`Unsupported type: ${typeStr}`);
    }

    return {
      type: typeStr,
      isArray: false,
    };
  }
}

function parseYamlConfig(configContent: string): ECSSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawConfig = parse(configContent) as any;

  if (!rawConfig.components && !rawConfig.singletons) {
    throw new Error('Config must contain at least one of: components, singletons');
  }

  const components: ComponentDefinition[] = [];
  const singletons: SingletonDefinition[] = [];

  // Parse components
  let componentIdx = 0;
  if (rawConfig.components) {
    for (const [componentName, componentFields] of Object.entries<Record<string, string>>(rawConfig.components)) {
      const fields: Record<string, FieldDefinition> = {};

      for (const [fieldName, fieldType] of Object.entries<string>(componentFields)) {
        fields[fieldName] = parseFieldType(fieldType);
      }

      components.push({
        name: componentName,
        id: Math.pow(2, componentIdx++),
        fields,
      });
    }
  }

  // Parse singletons
  if (rawConfig.singletons) {
    for (const [singletonName, singletonFields] of Object.entries<Record<string, string>>(rawConfig.singletons)) {
      const fields: Record<string, FieldDefinition> = {};

      for (const [fieldName, fieldType] of Object.entries<string>(singletonFields)) {
        fields[fieldName] = parseFieldType(fieldType);
      }

      singletons.push({
        name: singletonName,
        fields,
      });
    }
  }

  const playerResources = new Array<PlayerResourceDefinition>();
  // Parse player resources
  if (rawConfig.playerResources) {
    for (const [resourceName, resourceFields] of Object.entries<Record<string, string>>(rawConfig.playerResources)) {
      const fields: Record<string, FieldDefinition> = {};

      for (const [fieldName, fieldType] of Object.entries<string>(resourceFields)) {
        fields[fieldName] = parseFieldType(fieldType);
      }

      playerResources.push({
        name: resourceName,
        fields,
      });
    }
  }

  const filters = new Array<FilterDefinition>();
  // Parse filters
  if (rawConfig.filters) {
    for (const [filterName, filterComponents] of Object.entries<Record<string, string[]>>(rawConfig.filters)) {
      const include: ComponentDefinition[] = [];
      const exclude: ComponentDefinition[] = [];

      for (const componentName of filterComponents.include || []) {
        const component = components.find(c => c.name === componentName);
        if (!component) {
          throw new Error(`Component not found in schema: ${componentName}`);
        }
        include.push(component);
      }

      for (const componentName of filterComponents.exclude || []) {
        const component = components.find(c => c.name === componentName);
        if (!component) {
          throw new Error(`Component not found in schema: ${componentName}`);
        }
        exclude.push(component);
      }

      filters.push({
        name: filterName,
        include,
        exclude,
      });
    }
  }

  const inputs = new Array<IInputDefinition>();
  // Parse inputs
  if (rawConfig.inputs) {
    let inputIdx = 1;
    for (const [inputName, inputFields] of Object.entries<Record<string, string>>(rawConfig.inputs)) {
      const fields = new Array<InputFieldDefinition>();

      for (const [fieldName, fieldType] of Object.entries<string>(inputFields)) {
        fields.push(parseInputFieldType(fieldName, fieldType));
      }

      inputs.push({
        name: inputName,
        id: inputIdx++,
        fields,
      });
    }
  }


  return { components, singletons, filters, playerResources, inputs };
}

export default async function (tree: Tree, options: GeneratorOptions) {
  const projectName = getProjectNameFromConfigPath(options.configPath);
  // Read and parse YAML config
  const configPath = options.configPath;
  if (!tree.exists(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configContent = tree.read(configPath, 'utf-8');
  if (!configContent) throw new Error(`Config file is empty: ${configPath}`);
  const schema = parseYamlConfig(configContent);

  // Generate output directory from config path (../code-gen)
  const outputDir = joinPathFragments(configPath, '../code-gen');
  if (!tree.exists(outputDir)) {
    tree.write(outputDir + '/.gitkeep', '');
  }

  // Generate component classes
  for (const component of schema.components) {
    generateFiles(tree, joinPathFragments(__dirname, './files/component'), outputDir, {
      ...component,
      component,
      outputPath: outputDir,
      typeToArrayConstructor,
      getFieldByteSize: (field: FieldDefinition) => {
        const baseSize = getTypeSizeBytes(field.type);
        return field.isArray ? baseSize * field.arrayLength! : baseSize;
      },
    });
  }

  // Generate singleton classes
  for (const singleton of schema.singletons) {
    generateFiles(tree, joinPathFragments(__dirname, './files/singleton'), outputDir, {
      ...singleton,
      singleton,
      template: '',
      outputPath: outputDir,
      typeToArrayConstructor,
    });
  }

  // Generate playerResource classes
  for (const playerResource of schema.playerResources) {
    generateFiles(tree, joinPathFragments(__dirname, './files/playerResource'), outputDir, {
      ...playerResource,
      playerResource,
      template: '',
      outputPath: outputDir,
      typeToArrayConstructor,
    });
  }

  // Generate Filter classes
  for (const filter of schema.filters) {
    const componentsImports = [...filter.include, ...filter.exclude].map((c) => c.name);
    const includeMask = filter.include.reduce((acc, component) => acc | component.id, 0);
    const excludeMask = filter.exclude.reduce((acc, component) => acc | component.id, 0);
    generateFiles(tree, joinPathFragments(__dirname, './files/filter'), outputDir, {
      filter,
      includeMask,
      excludeMask,
      template: '',
      componentsImports,
      name: filter.name,
      outputPath: outputDir,
    });
  }

  // Generate Input classes
  for (const input of schema.inputs) {
    generateFiles(tree, joinPathFragments(__dirname, './files/input'), outputDir, {
      ...input,
      input,
      template: '',
      outputPath: outputDir,
      FieldTypeReverse,
      typedArrayConstructors,
    });
  }

  // generate input registry
  generateFiles(tree, joinPathFragments(__dirname, './files/input-registry'), outputDir, {
    template: '',
    projectName,
    inputs: schema.inputs,
    outputPath: outputDir,
    schema,
  });

  // Generate ECSCore class
  generateFiles(tree, joinPathFragments(__dirname, './files/core'), outputDir, {
    template: '',
    projectName,
    outputPath: outputDir,
    schema,
  });

  // Generate Runner class
  generateFiles(tree, joinPathFragments(__dirname, './files/runner'), outputDir, {
    template: '',
    projectName,
    outputPath: outputDir,
    schema,
  });

  // Generate a barrel file for easier imports
  generateBarrelFile(tree, outputDir, schema);

  await formatFiles(tree);

  return () => {
    console.log('ECS code generation complete!');
    console.log(`Generated ${schema.components.length} components and ${schema.singletons.length} singletons.`);
  };
}

function generateBarrelFile(tree: Tree, outputDir: string, schema: ECSSchema) {
  let content = '// Generated by @lagless/codegen. Do not edit manually.\n\n';

  // Export components
  schema.components.forEach((component) => {
    content += `export * from './${component.name}.js';\n`;
  });

  // Export singletons
  schema.singletons.forEach((singleton) => {
    content += `export * from './${singleton.name}.js';\n`;
  });

  // Export player resources
  schema.playerResources.forEach((playerResource) => {
    content += `export * from './${playerResource.name}.js';\n`;
  });

  // Export filters
  schema.filters.forEach((filter) => {
    content += `export * from './${filter.name}.js';\n`;
  });

  // Export inputs
  schema.inputs.forEach((input) => {
    content += `export * from './${input.name}.js';\n`;
  });

  // Export input registry
  content += `export * from './${getProjectNameFromConfigPath(outputDir)}InputRegistry.js';\n`;

  // Export core
  content += `export * from './ECSCore.js';\n`;

  // Export runner
  content += `export * from './ECSRunner.js';\n`;

  tree.write(`${outputDir}/index.ts`, content);
}

function getProjectNameFromConfigPath(configPath: string) {
  let projectName = configPath.split('/').slice(-5)[0];
  projectName = projectName.slice(0, 1).toUpperCase() + projectName.slice(1);
  // kebab to PascalCase
  projectName = projectName.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

  return projectName;
}
