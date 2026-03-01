import { describe, it, expect } from 'vitest';
import { ComponentDefinition, FieldDefinition, FilterDefinition } from '@lagless/core';
import { parseYamlConfig } from '../parser.js';

describe('parseYamlConfig — simulationType', () => {
  it('should default simulationType to raw', () => {
    const yaml = `
components:
  Foo:
    x: float32
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    expect(result.simulationType).toBe('raw');
  });

  it('should parse simulationType: raw without adding extra components', () => {
    const yaml = `
simulationType: raw
components:
  Foo:
    x: float32
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    expect(result.simulationType).toBe('raw');
    expect(result.schema.components).toHaveLength(1);
    expect(result.schema.components[0].name).toBe('Foo');
  });

  it('should auto-prepend Transform3d and PhysicsRefs for physics3d', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    expect(result.simulationType).toBe('physics3d');
    expect(result.schema.components).toHaveLength(3);
    expect(result.schema.components[0].name).toBe('Transform3d');
    expect(result.schema.components[1].name).toBe('PhysicsRefs');
    expect(result.schema.components[2].name).toBe('Health');
  });

  it('should not duplicate Transform3d if user already defined it', () => {
    const yaml = `
simulationType: physics3d
components:
  Transform3d:
    positionX: float32
    positionY: float32
    positionZ: float32
    rotationX: float32
    rotationY: float32
    rotationZ: float32
    rotationW: float32
    prevPositionX: float32
    prevPositionY: float32
    prevPositionZ: float32
    prevRotationX: float32
    prevRotationY: float32
    prevRotationZ: float32
    prevRotationW: float32
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const names = result.schema.components.map((c: ComponentDefinition) => c.name);
    expect(names.filter((n: string) => n === 'Transform3d')).toHaveLength(1);
    expect(names).toContain('PhysicsRefs');
  });

  it('should assign correct component IDs (bit indices) after auto-prepend', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    // IDs are sequential bit indices
    expect(result.schema.components[0].id).toBe(0); // Transform3d
    expect(result.schema.components[1].id).toBe(1); // PhysicsRefs
    expect(result.schema.components[2].id).toBe(2); // Health
  });

  it('should auto-create PhysicsRefsFilter for physics3d', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsFilter = result.schema.filters.find((f: FilterDefinition) => f.name === 'PhysicsRefsFilter');
    expect(physicsFilter).toBeDefined();
    expect(physicsFilter!.include.map((c: ComponentDefinition) => c.name)).toEqual(['PhysicsRefs', 'Transform3d']);
    expect(physicsFilter!.exclude).toEqual([]);
  });

  it('should not overwrite user-defined PhysicsRefsFilter', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
filters:
  PhysicsRefsFilter:
    include: [PhysicsRefs]
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsFilter = result.schema.filters.find((f: FilterDefinition) => f.name === 'PhysicsRefsFilter');
    expect(physicsFilter).toBeDefined();
    // User's filter only includes PhysicsRefs (not Transform3d)
    expect(physicsFilter!.include).toHaveLength(1);
    expect(physicsFilter!.include[0].name).toBe('PhysicsRefs');
  });

  it('should use float64 for PhysicsRefs handle fields', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsRefs = result.schema.components.find((c: ComponentDefinition) => c.name === 'PhysicsRefs');
    expect(physicsRefs).toBeDefined();
    expect(physicsRefs!.fields['bodyHandle'].type).toBe('float64');
    expect(physicsRefs!.fields['colliderHandle'].type).toBe('float64');
    expect(physicsRefs!.fields['bodyType'].type).toBe('uint8');
    expect(physicsRefs!.fields['collisionLayer'].type).toBe('uint16');
  });

  // --- physics2d tests ---

  it('should auto-prepend Transform2d and PhysicsRefs for physics2d', () => {
    const yaml = `
simulationType: physics2d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    expect(result.simulationType).toBe('physics2d');
    expect(result.schema.components).toHaveLength(3);
    expect(result.schema.components[0].name).toBe('Transform2d');
    expect(result.schema.components[1].name).toBe('PhysicsRefs');
    expect(result.schema.components[2].name).toBe('Health');
  });

  it('should not duplicate Transform2d if user already defined it (physics2d)', () => {
    const yaml = `
simulationType: physics2d
components:
  Transform2d:
    positionX: float32
    positionY: float32
    rotation: float32
    prevPositionX: float32
    prevPositionY: float32
    prevRotation: float32
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const names = result.schema.components.map((c: ComponentDefinition) => c.name);
    expect(names.filter((n: string) => n === 'Transform2d')).toHaveLength(1);
    expect(names).toContain('PhysicsRefs');
  });

  it('should assign correct component IDs after auto-prepend (physics2d)', () => {
    const yaml = `
simulationType: physics2d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    expect(result.schema.components[0].id).toBe(0); // Transform2d
    expect(result.schema.components[1].id).toBe(1); // PhysicsRefs
    expect(result.schema.components[2].id).toBe(2); // Health
  });

  it('should auto-create PhysicsRefsFilter for physics2d', () => {
    const yaml = `
simulationType: physics2d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsFilter = result.schema.filters.find((f: FilterDefinition) => f.name === 'PhysicsRefsFilter');
    expect(physicsFilter).toBeDefined();
    expect(physicsFilter!.include.map((c: ComponentDefinition) => c.name)).toEqual(['PhysicsRefs', 'Transform2d']);
    expect(physicsFilter!.exclude).toEqual([]);
  });

  it('should not overwrite user-defined PhysicsRefsFilter (physics2d)', () => {
    const yaml = `
simulationType: physics2d
components:
  Health:
    hp: uint16
filters:
  PhysicsRefsFilter:
    include: [PhysicsRefs]
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsFilter = result.schema.filters.find((f: FilterDefinition) => f.name === 'PhysicsRefsFilter');
    expect(physicsFilter).toBeDefined();
    expect(physicsFilter!.include).toHaveLength(1);
    expect(physicsFilter!.include[0].name).toBe('PhysicsRefs');
  });

  it('should use float64 for PhysicsRefs handle fields (physics2d)', () => {
    const yaml = `
simulationType: physics2d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsRefs = result.schema.components.find((c: ComponentDefinition) => c.name === 'PhysicsRefs');
    expect(physicsRefs).toBeDefined();
    expect(physicsRefs!.fields['bodyHandle'].type).toBe('float64');
    expect(physicsRefs!.fields['colliderHandle'].type).toBe('float64');
    expect(physicsRefs!.fields['bodyType'].type).toBe('uint8');
    expect(physicsRefs!.fields['collisionLayer'].type).toBe('uint16');
  });

  it('should auto-prepend Transform2d with correct 6 fields (physics2d)', () => {
    const yaml = `
simulationType: physics2d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const transform = result.schema.components.find((c: ComponentDefinition) => c.name === 'Transform2d');
    expect(transform).toBeDefined();
    const fieldNames = Object.keys(transform!.fields);
    expect(fieldNames).toEqual([
      'positionX', 'positionY', 'rotation',
      'prevPositionX', 'prevPositionY', 'prevRotation',
    ]);
    for (const field of Object.values(transform!.fields) as FieldDefinition[]) {
      expect(field.type).toBe('float32');
      expect(field.isArray).toBe(false);
    }
  });

});
