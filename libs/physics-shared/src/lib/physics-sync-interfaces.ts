export interface IPhysicsRefsComponent {
  bodyHandle: { get(entity: number): number; set(entity: number, v: number): void };
  bodyType: { get(entity: number): number; set(entity: number, v: number): void };
  colliderHandle: { get(entity: number): number; set(entity: number, v: number): void };
  collisionLayer: { get(entity: number): number; set(entity: number, v: number): void };
}

export interface IFilter {
  readonly length: number;
  entities(index: number): number;
}
