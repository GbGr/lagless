import { CollisionLayers } from '@lagless/physics-shared';

export function createRobloxLikeCollisionLayers(): CollisionLayers {
  const layers = new CollisionLayers();
  layers.layer('Default');   // static geometry (floor, obstacles)
  layers.layer('Character'); // player capsules

  // Characters collide with static geometry
  layers.pair('Character', 'Default');
  // Characters collide with each other
  layers.selfPair('Character');

  return layers;
}
