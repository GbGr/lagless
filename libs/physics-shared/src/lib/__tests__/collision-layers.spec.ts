import { describe, it, expect } from 'vitest';
import { CollisionLayers } from '../collision-layers.js';

describe('CollisionLayers', () => {
  it('should assign sequential bit indices starting from 0', () => {
    const layers = new CollisionLayers();
    expect(layers.layer('a')).toBe(0);
    expect(layers.layer('b')).toBe(1);
    expect(layers.layer('c')).toBe(2);
  });

  it('should throw on duplicate layer name', () => {
    const layers = new CollisionLayers();
    layers.layer('player');
    expect(() => layers.layer('player')).toThrow('already exists');
  });

  it('should throw when exceeding 16 layers', () => {
    const layers = new CollisionLayers();
    for (let i = 0; i < 16; i++) {
      layers.layer(`layer${i}`);
    }
    expect(() => layers.layer('overflow')).toThrow('maximum 16 layers exceeded');
  });

  it('should set bidirectional filter bits with pair()', () => {
    const layers = new CollisionLayers();
    layers.layer('player');  // bit 0
    layers.layer('ground');  // bit 1
    layers.pair('player', 'ground');

    const playerGroups = layers.groups('player');
    const groundGroups = layers.groups('ground');

    // player membership = 0x0001, filter = 0x0002 (ground bit)
    const playerMembership = playerGroups & 0xFFFF;
    const playerFilter = (playerGroups >>> 16) & 0xFFFF;
    expect(playerMembership).toBe(1 << 0);
    expect(playerFilter).toBe(1 << 1);

    // ground membership = 0x0002, filter = 0x0001 (player bit)
    const groundMembership = groundGroups & 0xFFFF;
    const groundFilter = (groundGroups >>> 16) & 0xFFFF;
    expect(groundMembership).toBe(1 << 1);
    expect(groundFilter).toBe(1 << 0);
  });

  it('should set self-interaction with selfPair()', () => {
    const layers = new CollisionLayers();
    layers.layer('projectile'); // bit 0
    layers.selfPair('projectile');

    const groups = layers.groups('projectile');
    const membership = groups & 0xFFFF;
    const filter = (groups >>> 16) & 0xFFFF;

    expect(membership).toBe(1 << 0);
    expect(filter).toBe(1 << 0); // self
  });

  it('should combine multiple pairs', () => {
    const layers = new CollisionLayers();
    layers.layer('player');     // bit 0
    layers.layer('ground');     // bit 1
    layers.layer('projectile'); // bit 2
    layers.pair('player', 'ground');
    layers.pair('player', 'projectile');

    const playerGroups = layers.groups('player');
    const playerFilter = (playerGroups >>> 16) & 0xFFFF;

    // player filter should include both ground (bit 1) and projectile (bit 2)
    expect(playerFilter).toBe((1 << 1) | (1 << 2));
  });

  it('should return correct u32 from groups()', () => {
    const layers = new CollisionLayers();
    layers.layer('a'); // bit 0
    layers.layer('b'); // bit 1
    layers.pair('a', 'b');

    // a: membership = 0x0001, filter = 0x0002
    // groups = (0x0002 << 16) | 0x0001 = 0x00020001
    expect(layers.groups('a')).toBe(0x00020001);
  });

  it('should return correct bit index via bit()', () => {
    const layers = new CollisionLayers();
    layers.layer('first');
    layers.layer('second');
    layers.layer('third');

    expect(layers.bit('first')).toBe(0);
    expect(layers.bit('second')).toBe(1);
    expect(layers.bit('third')).toBe(2);
  });

  it('should produce zero filter for unpaired layers', () => {
    const layers = new CollisionLayers();
    layers.layer('isolated');

    const groups = layers.groups('isolated');
    const filter = (groups >>> 16) & 0xFFFF;

    expect(filter).toBe(0); // no interactions
  });

  it('should throw on unknown layer name in pair()', () => {
    const layers = new CollisionLayers();
    layers.layer('a');
    expect(() => layers.pair('a', 'unknown')).toThrow('unknown layer');
  });

  it('should throw on unknown layer name in groups()', () => {
    const layers = new CollisionLayers();
    expect(() => layers.groups('missing')).toThrow('unknown layer');
  });

  it('should support chaining with pair() and selfPair()', () => {
    const layers = new CollisionLayers();
    layers.layer('a');
    layers.layer('b');
    const result = layers.pair('a', 'b').selfPair('a');
    expect(result).toBe(layers);

    // a's filter should include both b (bit 1) and self (bit 0)
    const filter = (layers.groups('a') >>> 16) & 0xFFFF;
    expect(filter).toBe((1 << 0) | (1 << 1));
  });
});
