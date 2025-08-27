import { ECSConfig } from '@lagless/core';

export class Physics2dConfig extends ECSConfig {
  public readonly gravity: { x: number; y: number; };
  public readonly substeps: number;

  constructor(options?: Partial<Physics2dConfig>) {
    super(options);
    this.gravity = options?.gravity ?? { x: 0, y: 0 };
    this.substeps = options?.substeps ?? 1;
  }
}
