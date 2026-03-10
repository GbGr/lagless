import { AbstractInputProvider, ECSConfig, PRNG } from '@lagless/core';
import { PhysicsConfig2d, PhysicsWorldManager2d, type RapierModule2d, RapierRigidBody2d } from '@lagless/physics2d';
import {
  SpatialGridCollisionProvider,
  ObjectPlacementFeature,
  createMapColliders,
  CANOPY_SENSOR_TAG,
} from '@lagless/2d-map-generator';
import { createStandardGenerator } from './map-config/create-map-generator.js';
import { STANDARD_OBJECT_REGISTRY } from './map-config/objects.js';
import type { ObjectPlacementOutput, MapPhysicsProvider } from '@lagless/2d-map-generator';
import { MapTestRunner } from './schema/code-gen/MapTest.runner.js';
import { MapTestSystems } from './systems/index.js';
import { MapTestSignals } from './signals/index.js';
import { MapData } from './map-data.js';

function createPhysicsAdapter(wm: PhysicsWorldManager2d, rapier: RapierModule2d): MapPhysicsProvider {
  return {
    createFixedBody(x, y, rotation) {
      const desc = rapier.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(rotation);
      return wm.createBodyFromDesc(desc);
    },
    createCircleCollider(body, radius, ox, oy, isSensor, _tag, collisionGroup) {
      let desc = rapier.ColliderDesc.ball(radius).setTranslation(ox, oy).setSensor(isSensor);
      if (collisionGroup != null) desc = desc.setCollisionGroups(collisionGroup);
      wm.createColliderFromDesc(desc, body as RapierRigidBody2d);
    },
    createCuboidCollider(body, hw, hh, ox, oy, isSensor, _tag, collisionGroup) {
      let desc = rapier.ColliderDesc.cuboid(hw, hh).setTranslation(ox, oy).setSensor(isSensor);
      if (collisionGroup != null) desc = desc.setCollisionGroups(collisionGroup);
      wm.createColliderFromDesc(desc, body as RapierRigidBody2d);
    },
  };
}

export class MapTestRunnerWithMap extends MapTestRunner {
  constructor(
    config: ECSConfig,
    inputProvider: AbstractInputProvider,
    rapier: RapierModule2d,
    physicsConfig?: PhysicsConfig2d,
  ) {
    // Register empty MapData so DI can resolve systems that depend on it
    const mapData = new MapData();

    super(
      config,
      inputProvider,
      MapTestSystems,
      MapTestSignals,
      rapier,
      physicsConfig,
      undefined,
      [[MapData, mapData]],
    );

    // Now generate map using ECS PRNG (available after super)
    const prng = this.DIContainer.resolve(PRNG);
    const generator = createStandardGenerator();
    const collision = new SpatialGridCollisionProvider(1024, 1024, 64);
    const map = generator.generate(prng, collision);
    mapData.map = map;
    mapData.registry = STANDARD_OBJECT_REGISTRY;

    const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    if (placement) {
      const physics = createPhysicsAdapter(this.PhysicsWorldManager, rapier);
      createMapColliders(physics, placement.objects, mapData.registry, { skipTags: [CANOPY_SENSOR_TAG] });
    }

    this.Simulation.capturePreStartState();
  }
}
