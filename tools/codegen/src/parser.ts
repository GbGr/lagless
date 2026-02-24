import {
  getTypeSizeBytes,
  InputFieldDefinition,
  typeStringToFieldType,
  typeToArrayConstructor,
} from '@lagless/binary';
import {
  ComponentDefinition,
  ECSSchema,
  FieldDefinition,
  FilterDefinition,
  IInputDefinition,
  PlayerResourceDefinition,
  SingletonDefinition,
} from '@lagless/core';
import { parse } from 'yaml';

export type SimulationType = 'raw' | 'physics2d' | 'physics3d';

export interface ECSConfig {
  projectName?: string;
  simulationType?: SimulationType;
  components?: Record<string, Record<string, string>>;
  singletons?: Record<string, Record<string, string>>;
  playerResources?: Record<string, Record<string, string>>;
  filters?: Record<string, { include?: string[]; exclude?: string[] }>;
  inputs?: Record<string, Record<string, string>>;
}

export function parseInputFieldType(fieldName: string, fieldType: string): InputFieldDefinition {
  const res = parseFieldType(fieldType);

  return {
    name: fieldName,
    ...res,
    type: typeStringToFieldType[res.type],
    byteLength: res.isArray && res.arrayLength ? getTypeSizeBytes(res.type) * res.arrayLength : getTypeSizeBytes(res.type),
  };
}

export function parseFieldType(typeStr: string): FieldDefinition {
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

export function getProjectNameFromConfigPath(configPath: string): string {
  let projectName = configPath.split('/').slice(-5)[0];
  projectName = projectName.slice(0, 1).toUpperCase() + projectName.slice(1);
  // kebab to PascalCase
  projectName = projectName.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
  return projectName;
}

export function parseYamlConfig(
  configContent: string,
  configPath?: string,
): { schema: ECSSchema; projectName: string; simulationType: SimulationType } {
  const rawConfig = parse(configContent) as ECSConfig;

  if (!rawConfig.components && !rawConfig.singletons) {
    throw new Error('Config must contain at least one of: components, singletons');
  }

  const simulationType: SimulationType = rawConfig.simulationType ?? 'raw';

  // Determine project name: from config or from path
  let projectName: string;
  if (rawConfig.projectName) {
    projectName = rawConfig.projectName;
  } else if (configPath) {
    projectName = getProjectNameFromConfigPath(configPath);
  } else {
    throw new Error('projectName must be specified in config or configPath must be provided');
  }

  // Auto-prepend physics components if needed
  if (simulationType === 'physics3d') {
    if (!rawConfig.components) rawConfig.components = {};

    if (!rawConfig.components['Transform3d']) {
      rawConfig.components = {
        Transform3d: {
          positionX: 'float32',
          positionY: 'float32',
          positionZ: 'float32',
          rotationX: 'float32',
          rotationY: 'float32',
          rotationZ: 'float32',
          rotationW: 'float32',
          prevPositionX: 'float32',
          prevPositionY: 'float32',
          prevPositionZ: 'float32',
          prevRotationX: 'float32',
          prevRotationY: 'float32',
          prevRotationZ: 'float32',
          prevRotationW: 'float32',
        },
        ...rawConfig.components,
      };
    }

    if (!rawConfig.components['PhysicsBody3d']) {
      // Insert after Transform3d
      const entries = Object.entries(rawConfig.components);
      const transform3dIdx = entries.findIndex(([name]) => name === 'Transform3d');
      const insertIdx = transform3dIdx >= 0 ? transform3dIdx + 1 : 0;
      entries.splice(insertIdx, 0, [
        'PhysicsBody3d',
        {
          bodyHandle: 'uint32',
          bodyType: 'uint8',
          colliderHandle: 'uint32',
          mass: 'float32',
          linearDamping: 'float32',
          angularDamping: 'float32',
        },
      ]);
      rawConfig.components = Object.fromEntries(entries);
    }
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
    for (const [filterName, filterComponents] of Object.entries(rawConfig.filters)) {
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

  // Auto-add PhysicsBody3dFilter for physics3d
  if (simulationType === 'physics3d') {
    const hasPhysicsFilter = filters.some((f) => f.name === 'PhysicsBody3dFilter');
    if (!hasPhysicsFilter) {
      const physicsBody = components.find((c) => c.name === 'PhysicsBody3d');
      const transform3d = components.find((c) => c.name === 'Transform3d');
      if (physicsBody && transform3d) {
        filters.push({
          name: 'PhysicsBody3dFilter',
          include: [physicsBody, transform3d],
          exclude: [],
        });
      }
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

  const schema = { components, singletons, filters, playerResources, inputs };
  return { schema, projectName, simulationType };
}
