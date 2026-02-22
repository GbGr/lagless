export type RawSeed = Uint8Array; // 128-bit (16-byte) seed for PRNG

const ZERO_SEED: RawSeed = new Uint8Array(16);

export class ECSConfig {
  public readonly seed: RawSeed;
  public readonly maxEntities: number;
  public readonly maxPlayers: number;
  public readonly initialInputDelayTick: number;
  public readonly minInputDelayTick: number;
  public readonly maxInputDelayTick: number;
  public readonly fps: number;
  public readonly frameLength: number;
  public readonly snapshotRate: number;
  public readonly snapshotHistorySize: number;
  public readonly maxNudgePerFrame: number;

  constructor(options?: Partial<ECSConfig>) {
    this.seed = options?.seed ?? ZERO_SEED;
    this.maxEntities = options?.maxEntities ?? 1000;
    this.maxPlayers = options?.maxPlayers ?? 6;
    this.initialInputDelayTick = options?.initialInputDelayTick ?? 2;
    this.minInputDelayTick = options?.minInputDelayTick ?? 1;
    this.maxInputDelayTick = options?.maxInputDelayTick ?? 12;
    this.fps = options?.fps ?? 60;
    this.frameLength = 1000 / this.fps;
    this.snapshotRate = options?.snapshotRate ?? 1;
    this.snapshotHistorySize = options?.snapshotHistorySize ?? 100;
    this.maxNudgePerFrame = options?.maxNudgePerFrame ?? this.frameLength / 4;
  }
}
