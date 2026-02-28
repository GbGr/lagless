export const AnimationId = {
  IDLE: 0,
  LOCOMOTION: 1,
  JUMP: 2,
  FALL: 3,
  LAND: 4,
} as const;

export type AnimationIdValue = (typeof AnimationId)[keyof typeof AnimationId];

export interface IAnimationStateComponent {
  animationId: { get(e: number): number; set(e: number, v: number): void };
  animationTime: { get(e: number): number; set(e: number, v: number): void };
  animationSpeed: { get(e: number): number; set(e: number, v: number): void };
  prevAnimationId: { get(e: number): number; set(e: number, v: number): void };
  transitionProgress: { get(e: number): number; set(e: number, v: number): void };
  transitionDuration: { get(e: number): number; set(e: number, v: number): void };
  locomotionAngle: { get(e: number): number; set(e: number, v: number): void };
  locomotionSpeed: { get(e: number): number; set(e: number, v: number): void };
}

export class AnimationStateMachine {
  public play(component: IAnimationStateComponent, entity: number, animId: number, crossfadeDuration = 0.2): void {
    const currentId = component.animationId.get(entity);
    if (currentId === animId) return;

    component.prevAnimationId.set(entity, currentId);
    component.animationId.set(entity, animId);
    component.animationTime.set(entity, 0);
    component.transitionProgress.set(entity, 0);
    component.transitionDuration.set(entity, crossfadeDuration);
  }

  public tick(component: IAnimationStateComponent, entity: number, dt: number): void {
    const speed = component.animationSpeed.get(entity);
    const time = component.animationTime.get(entity);
    component.animationTime.set(entity, time + dt * speed);

    const transitionDuration = component.transitionDuration.get(entity);
    if (transitionDuration > 0) {
      let progress = component.transitionProgress.get(entity);
      progress += dt / transitionDuration;
      if (progress >= 1) {
        progress = 1;
        component.transitionDuration.set(entity, 0);
      }
      component.transitionProgress.set(entity, progress);
    }
  }
}
