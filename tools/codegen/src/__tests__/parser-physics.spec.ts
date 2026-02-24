import { describe, it, expect } from 'vitest';
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

  it('should auto-prepend Transform3d and PhysicsBody3d for physics3d', () => {
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
    expect(result.schema.components[1].name).toBe('PhysicsBody3d');
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
    // Transform3d is user-defined, PhysicsBody3d auto-prepended after it
    const names = result.schema.components.map((c) => c.name);
    expect(names.filter((n) => n === 'Transform3d')).toHaveLength(1);
    expect(names).toContain('PhysicsBody3d');
  });

  it('should assign correct component IDs after auto-prepend', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    // IDs should be powers of 2 in order
    expect(result.schema.components[0].id).toBe(1); // Transform3d
    expect(result.schema.components[1].id).toBe(2); // PhysicsBody3d
    expect(result.schema.components[2].id).toBe(4); // Health
  });

  it('should auto-create PhysicsBody3dFilter for physics3d', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsFilter = result.schema.filters.find((f) => f.name === 'PhysicsBody3dFilter');
    expect(physicsFilter).toBeDefined();
    expect(physicsFilter!.include.map((c) => c.name)).toEqual(['PhysicsBody3d', 'Transform3d']);
    expect(physicsFilter!.exclude).toEqual([]);
  });

  it('should not overwrite user-defined PhysicsBody3dFilter', () => {
    const yaml = `
simulationType: physics3d
components:
  Health:
    hp: uint16
filters:
  PhysicsBody3dFilter:
    include: [PhysicsBody3d]
`;
    const result = parseYamlConfig(yaml, 'my-game/my-game-simulation/src/lib/schema/ecs.yaml');
    const physicsFilter = result.schema.filters.find((f) => f.name === 'PhysicsBody3dFilter');
    expect(physicsFilter).toBeDefined();
    // User's filter only includes PhysicsBody3d (not Transform3d)
    expect(physicsFilter!.include).toHaveLength(1);
    expect(physicsFilter!.include[0].name).toBe('PhysicsBody3d');
  });
});
