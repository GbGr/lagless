import { IECSSystemConstructor } from '@lagless/core';
import { SavePrevTransformSystem } from './save-prev-transform.system.js';
import { SceneInitSystem } from './scene-init.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';
import { ApplyCharacterInputSystem } from './apply-character-input.system.js';
import { CharacterMovementSystem } from './character-movement.system.js';
import { PhysicsStepSystem } from './physics-step.system.js';
import { AnimationSystem } from './animation.system.js';

export { SavePrevTransformSystem } from './save-prev-transform.system.js';
export { SceneInitSystem } from './scene-init.system.js';
export { PlayerConnectionSystem } from './player-connection.system.js';
export { PlayerLeaveSystem } from './player-leave.system.js';
export { ApplyCharacterInputSystem } from './apply-character-input.system.js';
export { CharacterMovementSystem } from './character-movement.system.js';
export { PhysicsStepSystem } from './physics-step.system.js';
export { AnimationSystem } from './animation.system.js';

export const RobloxLikeSystems: IECSSystemConstructor[] = [
  SavePrevTransformSystem,
  SceneInitSystem,
  PlayerConnectionSystem,
  PlayerLeaveSystem,
  ApplyCharacterInputSystem,
  CharacterMovementSystem,
  PhysicsStepSystem,
  AnimationSystem,
];
