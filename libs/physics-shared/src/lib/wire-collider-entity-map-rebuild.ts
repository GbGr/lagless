import { ECSDeps } from '@lagless/core';
import { createLogger } from '@lagless/misc';
import { PhysicsSimulationBase } from './physics-simulation-base.js';
import { ColliderEntityMap } from './collider-entity-map.js';

const log = createLogger('wireColliderEntityMapRebuild');

/**
 * Auto-wire ColliderEntityMap rebuild from ECS state after rollback / state transfer.
 * Finds PhysicsRefs component by its unique schema shape (colliderHandle + bodyHandle as Float64Array)
 * and wires up a rebuild callback on the simulation.
 */
export function wireColliderEntityMapRebuild(
  deps: ECSDeps,
  simulation: PhysicsSimulationBase,
  colliderEntityMap: ColliderEntityMap,
): void {
  // Find PhysicsRefs component by its unique schema shape
  const physicsRefsCtor = deps.components.find(
    (c) => {
      const schema = (c as unknown as { schema?: Record<string, unknown> }).schema;
      return schema?.colliderHandle === Float64Array && schema?.bodyHandle === Float64Array;
    },
  );
  if (!physicsRefsCtor) {
    log.warn('PhysicsRefs component not found in ECSDeps — ColliderEntityMap rebuild will not be wired. ' +
      'This is expected if the simulation does not use physics.');
    return;
  }

  // Find filter that includes PhysicsRefs
  const physicsRefsFilterCtor = deps.filters.find(
    (f) => {
      const include = (f as unknown as { include?: unknown[] }).include;
      return include?.includes(physicsRefsCtor);
    },
  );
  if (!physicsRefsFilterCtor) {
    log.warn('PhysicsRefsFilter not found in ECSDeps — ColliderEntityMap rebuild will not be wired.');
    return;
  }

  const refsInstance = simulation.mem.componentsManager.get(physicsRefsCtor);
  const filterInstance = simulation.mem.filtersManager.get(physicsRefsFilterCtor);
  const colliderHandles = (refsInstance as unknown as { unsafe: { colliderHandle: Float64Array } }).unsafe.colliderHandle;

  simulation.setColliderEntityMapRebuild(() => {
    colliderEntityMap.clear();
    for (const entity of filterInstance) {
      colliderEntityMap.set(colliderHandles[entity], entity);
    }
  });
}
