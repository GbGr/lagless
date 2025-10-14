export type RawSeed = [
  number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
]; // 128-bit seed for PRNG

const ZERO_SEED: RawSeed = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
];

export class ECSConfig {
  public readonly seed: RawSeed;
  public readonly maxEntities: number;
  public readonly maxPlayers: number;
  public readonly inputDelay: number;
  public readonly fps: number;
  public readonly frameLength: number;
  public readonly snapshotRate: number;
  public readonly snapshotHistorySize: number;

  constructor(options?: Partial<ECSConfig>) {
    this.seed = options?.seed ?? ZERO_SEED;
    this.maxEntities = options?.maxEntities ?? 1000;
    this.maxPlayers = options?.maxPlayers ?? 6;
    this.inputDelay = options?.inputDelay ?? 1;
    this.fps = options?.fps ?? 60;
    this.frameLength = 1000 / this.fps;
    this.snapshotRate = options?.snapshotRate ?? 1;
    this.snapshotHistorySize = options?.snapshotHistorySize ?? 100;
  }
}
