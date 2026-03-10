/**
 * Critical test: does Rapier save/restore internal state drift cause
 * position divergence over thousands of ticks?
 *
 * World A: pure linear (never save/restore) — like Client 0 (no rollbacks)
 * World B: save/restore every N ticks — like Client 1 (with rollbacks)
 *
 * Both apply identical inputs. If they diverge, it means
 * save/restore is NOT byte-transparent and the internal state
 * difference eventually affects collision outcomes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import type { RapierModule2d, RapierWorld2d } from '../rapier-types-2d.js';

let rapier: RapierModule2d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule2d;
});

const TIMESTEP = 1 / 60;
const MOVE_SPEED = 100;

function createWorld(): RapierWorld2d {
  const world = new rapier.World({ x: 0, y: 0 });
  world.timestep = TIMESTEP;
  return world;
}

function setupBodies(world: RapierWorld2d) {
  for (let i = 0; i < 20; i++) {
    const bodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(100 + i * 40, 200 + (i % 5) * 30);
    const body = world.createRigidBody(bodyDesc);
    world.createCollider(rapier.ColliderDesc.ball(8), body);
  }

  const playerDesc = rapier.RigidBodyDesc.dynamic().setTranslation(200, 200);
  const player = world.createRigidBody(playerDesc);
  player.setLinearDamping(0.1);
  const cd = rapier.ColliderDesc.ball(20);
  cd.setFriction(0);
  cd.setRestitution(1);
  world.createCollider(cd, player);
  return player.handle;
}

function getInput(tick: number) {
  if (tick % 3 === 0 || tick % 3 === 1) {
    return {
      dirX: Math.fround(Math.sin(tick * 0.15) * 0.7),
      dirY: Math.fround(Math.cos(tick * 0.15) * 0.7),
    };
  }
  return null;
}

describe('Rapier save/restore drift over long simulation', () => {
  it('linear vs save/restore every 4 ticks for 4000 ticks', () => {
    const TOTAL_TICKS = 4000;
    const RESTORE_INTERVAL = 4;

    const worldA = createWorld();
    const handleA = setupBodies(worldA);

    let worldB = createWorld() as RapierWorld2d;
    const handleB = setupBodies(worldB);

    let firstFloat64Div = -1;
    let firstFloat32Div = -1;

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      const input = getInput(tick);
      if (input) {
        worldA.getRigidBody(handleA).setLinvel(
          { x: input.dirX * MOVE_SPEED, y: input.dirY * MOVE_SPEED }, true);
        worldB.getRigidBody(handleB).setLinvel(
          { x: input.dirX * MOVE_SPEED, y: input.dirY * MOVE_SPEED }, true);
      }

      worldA.step();
      worldB.step();

      // Save/restore on world B (simulates the effect of rollback cycles)
      if (tick % RESTORE_INTERVAL === 0) {
        const snap = worldB.takeSnapshot();
        worldB.free();
        worldB = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
      }

      const posA = worldA.getRigidBody(handleA).translation();
      const posB = worldB.getRigidBody(handleB).translation();

      if (firstFloat64Div < 0 && (posA.x !== posB.x || posA.y !== posB.y)) {
        firstFloat64Div = tick;
        console.log(`Float64 divergence at tick ${tick}:`);
        console.log(`  A: (${posA.x}, ${posA.y})`);
        console.log(`  B: (${posB.x}, ${posB.y})`);
        console.log(`  dx=${Math.abs(posA.x - posB.x)} dy=${Math.abs(posA.y - posB.y)}`);
      }

      const f32ax = Math.fround(posA.x), f32ay = Math.fround(posA.y);
      const f32bx = Math.fround(posB.x), f32by = Math.fround(posB.y);
      if (firstFloat32Div < 0 && (f32ax !== f32bx || f32ay !== f32by)) {
        firstFloat32Div = tick;
        console.log(`Float32 divergence at tick ${tick}:`);
        console.log(`  A f32: (${f32ax}, ${f32ay})`);
        console.log(`  B f32: (${f32bx}, ${f32by})`);
      }
    }

    const finalA = worldA.getRigidBody(handleA).translation();
    const finalB = worldB.getRigidBody(handleB).translation();
    console.log(`\nFirst float64 divergence: tick ${firstFloat64Div}`);
    console.log(`First float32 divergence: tick ${firstFloat32Div}`);
    console.log(`Final A: (${finalA.x}, ${finalA.y})`);
    console.log(`Final B: (${finalB.x}, ${finalB.y})`);

    expect(Math.fround(finalA.x)).toBe(Math.fround(finalB.x));
    expect(Math.fround(finalA.y)).toBe(Math.fround(finalB.y));

    worldA.free();
    worldB.free();
  });
});
