import { describe, it, expect } from 'vitest';
import { parseYamlConfig } from '../parser.js';

describe('parseYamlConfig — bit index IDs', () => {
  it('should assign sequential bit indices starting from 0', () => {
    const yaml = `
projectName: Test
components:
  Foo:
    x: float32
  Bar:
    y: uint16
  Baz:
    z: int32
`;
    const { schema } = parseYamlConfig(yaml);
    expect(schema.components[0].id).toBe(0);
    expect(schema.components[1].id).toBe(1);
    expect(schema.components[2].id).toBe(2);
  });

  it('should reject more than 64 components', () => {
    const components = Array.from({ length: 65 }, (_, i) => `  C${i}:\n    x: uint8`).join('\n');
    const yaml = `projectName: Test\ncomponents:\n${components}`;
    expect(() => parseYamlConfig(yaml)).toThrow(/Too many components.*65.*Maximum.*64/);
  });

  it('should accept exactly 64 components', () => {
    const components = Array.from({ length: 64 }, (_, i) => `  C${i}:\n    x: uint8`).join('\n');
    const yaml = `projectName: Test\ncomponents:\n${components}`;
    const { schema } = parseYamlConfig(yaml);
    expect(schema.components).toHaveLength(64);
    expect(schema.components[63].id).toBe(63);
  });
});

describe('parseYamlConfig — tag components', () => {
  it('should detect tag component with empty object {}', () => {
    const yaml = `
projectName: Test
components:
  Frozen: {}
  Health:
    hp: uint16
`;
    const { schema } = parseYamlConfig(yaml);
    expect(schema.components[0].name).toBe('Frozen');
    expect(schema.components[0].isTag).toBe(true);
    expect(schema.components[0].fields).toEqual({});

    expect(schema.components[1].name).toBe('Health');
    expect(schema.components[1].isTag).toBe(false);
  });

  it('should detect tag component with null value (YAML key with no value)', () => {
    const yaml = `
projectName: Test
components:
  Dead:
  Health:
    hp: uint16
`;
    const { schema } = parseYamlConfig(yaml);
    expect(schema.components[0].name).toBe('Dead');
    expect(schema.components[0].isTag).toBe(true);
    expect(schema.components[0].fields).toEqual({});
  });

  it('should assign correct IDs to mix of tags and data components', () => {
    const yaml = `
projectName: Test
components:
  Transform:
    x: float32
    y: float32
  Frozen:
  Velocity:
    vx: float32
  Dead: {}
`;
    const { schema } = parseYamlConfig(yaml);
    expect(schema.components.map(c => ({ name: c.name, id: c.id, isTag: c.isTag }))).toEqual([
      { name: 'Transform', id: 0, isTag: false },
      { name: 'Frozen', id: 1, isTag: true },
      { name: 'Velocity', id: 2, isTag: false },
      { name: 'Dead', id: 3, isTag: true },
    ]);
  });

  it('should allow tag components in filters', () => {
    const yaml = `
projectName: Test
components:
  Frozen:
  Health:
    hp: uint16
filters:
  FrozenFilter:
    include:
      - Frozen
  AliveFilter:
    include:
      - Health
    exclude:
      - Frozen
`;
    const { schema } = parseYamlConfig(yaml);
    const frozenFilter = schema.filters.find(f => f.name === 'FrozenFilter')!;
    expect(frozenFilter.include[0].name).toBe('Frozen');
    expect(frozenFilter.include[0].isTag).toBe(true);

    const aliveFilter = schema.filters.find(f => f.name === 'AliveFilter')!;
    expect(aliveFilter.exclude[0].name).toBe('Frozen');
    expect(aliveFilter.exclude[0].isTag).toBe(true);
  });
});
