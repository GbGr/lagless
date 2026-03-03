export class PhysicsConfig3d {
  public readonly gravityX: number;
  public readonly gravityY: number;
  public readonly gravityZ: number;
  public readonly substeps: number;

  constructor(
    options?: Partial<Pick<PhysicsConfig3d, 'gravityX' | 'gravityY' | 'gravityZ' | 'substeps'>>,
  ) {
    this.gravityX = options?.gravityX ?? 0;
    this.gravityY = options?.gravityY ?? -9.81;
    this.gravityZ = options?.gravityZ ?? 0;
    this.substeps = options?.substeps ?? 1;
  }
}
