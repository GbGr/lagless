/** Body type constants matching the auto-generated PhysicsRefs.bodyType field. */
export const BodyType = {
  DYNAMIC: 0,
  FIXED: 1,
  KINEMATIC_POSITION: 2,
  KINEMATIC_VELOCITY: 3,
} as const;

export type BodyTypeValue = typeof BodyType[keyof typeof BodyType];
