export class PhysicsConfig2d {
  public readonly gravityX: number;
  public readonly gravityY: number;
  public readonly substeps: number;

  constructor(
    options?: Partial<Pick<PhysicsConfig2d, 'gravityX' | 'gravityY' | 'substeps'>>,
  ) {
    this.gravityX = options?.gravityX ?? 0;
    this.gravityY = options?.gravityY ?? -9.81;
    this.substeps = options?.substeps ?? 1;
  }
}
