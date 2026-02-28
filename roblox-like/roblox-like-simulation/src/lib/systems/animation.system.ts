import { ECSConfig, ECSSystem, IECSSystem } from '@lagless/core';
import { AnimationId, AnimationStateMachine } from '@lagless/animation-controller';
import { AnimationState, CharacterState, CharacterFilter } from '../schema/code-gen/index.js';

const animMachine = new AnimationStateMachine();

@ECSSystem()
export class AnimationSystem implements IECSSystem {
  private readonly _dt: number;
  private readonly _animAdapter = {
    animationId: { get: (e: number) => 0, set: (e: number, v: number) => {} },
    animationTime: { get: (e: number) => 0, set: (e: number, v: number) => {} },
    animationSpeed: { get: (e: number) => 0, set: (e: number, v: number) => {} },
    prevAnimationId: { get: (e: number) => 0, set: (e: number, v: number) => {} },
    transitionProgress: { get: (e: number) => 0, set: (e: number, v: number) => {} },
    transitionDuration: { get: (e: number) => 0, set: (e: number, v: number) => {} },
    locomotionAngle: { get: (e: number) => 0, set: (e: number, v: number) => {} },
    locomotionSpeed: { get: (e: number) => 0, set: (e: number, v: number) => {} },
  };

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _CharacterFilter: CharacterFilter,
    private readonly _CharacterState: CharacterState,
    private readonly _AnimationState: AnimationState,
  ) {
    this._dt = this._ECSConfig.frameLength / 1000;

    // Create adapter from codegen unsafe arrays to IAnimationStateComponent interface
    const a = this._AnimationState.unsafe;
    const adapter = this._animAdapter;
    adapter.animationId = { get: (e) => a.animationId[e], set: (e, v) => { a.animationId[e] = v; } };
    adapter.animationTime = { get: (e) => a.animationTime[e], set: (e, v) => { a.animationTime[e] = v; } };
    adapter.animationSpeed = { get: (e) => a.animationSpeed[e], set: (e, v) => { a.animationSpeed[e] = v; } };
    adapter.prevAnimationId = { get: (e) => a.prevAnimationId[e], set: (e, v) => { a.prevAnimationId[e] = v; } };
    adapter.transitionProgress = { get: (e) => a.transitionProgress[e], set: (e, v) => { a.transitionProgress[e] = v; } };
    adapter.transitionDuration = { get: (e) => a.transitionDuration[e], set: (e, v) => { a.transitionDuration[e] = v; } };
    adapter.locomotionAngle = { get: (e) => a.locomotionAngle[e], set: (e, v) => { a.locomotionAngle[e] = v; } };
    adapter.locomotionSpeed = { get: (e) => a.locomotionSpeed[e], set: (e, v) => { a.locomotionSpeed[e] = v; } };
  }

  public update(): void {
    const dt = this._dt;
    const cs = this._CharacterState.unsafe;
    const anim = this._AnimationState.unsafe;
    const adapter = this._animAdapter;

    for (const entity of this._CharacterFilter) {
      const grounded = cs.grounded[entity] !== 0;
      const speed = cs.currentSpeed[entity];
      const vertVel = cs.verticalVelocity[entity];
      const currentAnimId = anim.animationId[entity];

      // Determine target animation
      let targetAnim: number;
      if (!grounded && vertVel > 0.5) {
        targetAnim = AnimationId.JUMP;
      } else if (!grounded && vertVel < -0.5) {
        targetAnim = AnimationId.FALL;
      } else if (grounded && currentAnimId === AnimationId.FALL) {
        targetAnim = AnimationId.LAND;
      } else if (grounded && speed > 0.1) {
        targetAnim = AnimationId.LOCOMOTION;
      } else if (grounded) {
        // Stay in LAND briefly, then go to IDLE
        if (currentAnimId === AnimationId.LAND && anim.animationTime[entity] < 0.3) {
          targetAnim = AnimationId.LAND;
        } else {
          targetAnim = AnimationId.IDLE;
        }
      } else {
        targetAnim = currentAnimId;
      }

      // Play if changed
      if (targetAnim !== currentAnimId) {
        animMachine.play(adapter, entity, targetAnim, 0.15);
      }

      // Tick animation
      animMachine.tick(adapter, entity, dt);

      // Update locomotion blend data
      anim.locomotionAngle[entity] = cs.locomotionAngle[entity];
      anim.locomotionSpeed[entity] = speed;
    }
  }
}
