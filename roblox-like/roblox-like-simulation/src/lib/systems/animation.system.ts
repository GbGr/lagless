import { ECSConfig, ECSSystem, IECSSystem } from '@lagless/core';
import { AnimationId, AnimationStateMachine } from '@lagless/animation-controller';
import { AnimationState, CharacterState, CharacterFilter } from '../schema/code-gen/index.js';

const animMachine = new AnimationStateMachine();

@ECSSystem()
export class AnimationSystem implements IECSSystem {
  private readonly _dt: number;
  private readonly _animAdapter;

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _CharacterFilter: CharacterFilter,
    private readonly _CharacterState: CharacterState,
    private readonly _AnimationState: AnimationState,
  ) {
    this._dt = this._ECSConfig.frameLength / 1000;

    const a = this._AnimationState.unsafe;
    this._animAdapter = {
      animationId: { get: (e: number) => a.animationId[e], set: (e: number, v: number) => { a.animationId[e] = v; } },
      animationTime: { get: (e: number) => a.animationTime[e], set: (e: number, v: number) => { a.animationTime[e] = v; } },
      animationSpeed: { get: (e: number) => a.animationSpeed[e], set: (e: number, v: number) => { a.animationSpeed[e] = v; } },
      prevAnimationId: { get: (e: number) => a.prevAnimationId[e], set: (e: number, v: number) => { a.prevAnimationId[e] = v; } },
      transitionProgress: { get: (e: number) => a.transitionProgress[e], set: (e: number, v: number) => { a.transitionProgress[e] = v; } },
      transitionDuration: { get: (e: number) => a.transitionDuration[e], set: (e: number, v: number) => { a.transitionDuration[e] = v; } },
      locomotionAngle: { get: (e: number) => a.locomotionAngle[e], set: (e: number, v: number) => { a.locomotionAngle[e] = v; } },
      locomotionSpeed: { get: (e: number) => a.locomotionSpeed[e], set: (e: number, v: number) => { a.locomotionSpeed[e] = v; } },
    };
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
