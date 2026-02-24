export class PhysicsConfig3d {
  public readonly gravityX: number;
  public readonly gravityY: number;
  public readonly gravityZ: number;
  public readonly substeps: number;
  /** Per-substep dt in seconds, derived from frameDt / substeps */
  public readonly substepDt: number;

  constructor(
    options?: Partial<Pick<PhysicsConfig3d, 'gravityX' | 'gravityY' | 'gravityZ' | 'substeps'>>,
    frameDt: number = 1 / 60,
  ) {
    this.gravityX = options?.gravityX ?? 0;
    this.gravityY = options?.gravityY ?? -9.81;
    this.gravityZ = options?.gravityZ ?? 0;
    this.substeps = options?.substeps ?? 1;
    this.substepDt = frameDt / this.substeps;
  }
}
