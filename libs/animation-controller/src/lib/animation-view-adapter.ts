import { LocomotionBlendCalculator, LocomotionBlendWeights } from './locomotion-blend.js';
import { AnimationId, IAnimationStateComponent } from './animation-state.js';

export interface AnimationViewState {
  currentAnimation: number;
  previousAnimation: number;
  transitionWeight: number;
  locomotionBlend: LocomotionBlendWeights | null;
  walkRunBlend: number;
  time: number;
}

export class AnimationViewAdapter {
  private readonly _state: AnimationViewState = {
    currentAnimation: AnimationId.IDLE,
    previousAnimation: AnimationId.IDLE,
    transitionWeight: 1,
    locomotionBlend: null,
    walkRunBlend: 0,
    time: 0,
  };

  constructor(private readonly _runSpeed: number) {}

  public getViewState(component: IAnimationStateComponent, entity: number): AnimationViewState {
    const state = this._state;
    state.currentAnimation = component.animationId.get(entity);
    state.previousAnimation = component.prevAnimationId.get(entity);
    state.time = component.animationTime.get(entity);

    const transitionDuration = component.transitionDuration.get(entity);
    if (transitionDuration > 0) {
      state.transitionWeight = component.transitionProgress.get(entity);
    } else {
      state.transitionWeight = 1;
    }

    if (state.currentAnimation === AnimationId.LOCOMOTION) {
      const angle = component.locomotionAngle.get(entity);
      const speed = component.locomotionSpeed.get(entity);
      state.locomotionBlend = LocomotionBlendCalculator.compute(angle, speed, this._runSpeed);
      state.walkRunBlend = Math.min(speed / this._runSpeed, 1);
    } else {
      state.locomotionBlend = null;
      state.walkRunBlend = 0;
    }

    return state;
  }
}
