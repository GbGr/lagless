export class ECSConfig {
  public readonly seed: number;
  public readonly maxEntities: number;
  public readonly maxPlayers: number;
  public readonly inputDelay: number;
  public readonly fps: number;
  public readonly frameLength: number;
  public readonly snapshotRate: number;
  public readonly snapshotHistorySize: number;

  constructor(options?: Partial<ECSConfig>) {
    this.seed = options?.seed ?? 0;
    this.maxEntities = options?.maxEntities ?? 1000;
    this.maxPlayers = options?.maxPlayers ?? 6;
    this.inputDelay = options?.inputDelay ?? 1;
    this.fps = options?.fps ?? 60;
    this.frameLength = 1000 / this.fps;
    this.snapshotRate = options?.snapshotRate ?? 1;
    this.snapshotHistorySize = options?.snapshotHistorySize ?? 100;
  }
}
