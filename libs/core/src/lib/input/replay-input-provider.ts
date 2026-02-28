import { AbstractInputProvider } from './abstract-input-provider.js';
import { ECSConfig } from '../ecs-config.js';
import { InputRegistry } from './input-registry.js';

const SEED_OFFSET = 0;
const SEED_LENGTH = 16;
const MAX_PLAYERS_OFFSET = SEED_OFFSET + SEED_LENGTH;
const FPS_OFFSET = MAX_PLAYERS_OFFSET + 1;
const REPLAY_DATA_OFFSET = FPS_OFFSET + 1;

export class ReplayInputProvider extends AbstractInputProvider {
  public override playerSlot = 0;

  public override get verifiedTick(): number {
    return this._simulation?.tick ?? -1;
  }

  public override getInvalidateRollbackTick() {
    return undefined;
  }

  constructor(
    replayData: ArrayBuffer,
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
  ) {
    super(ecsConfig, inputRegistry);
    this._rpcHistory.import(inputRegistry, replayData);
  }

  public override update(): void {
    // do nothing, all inputs are pre-recorded
  }

  public static exportReplay(seed: Uint8Array, maxPlayers: number, fps: number, replayData: ArrayBuffer): ArrayBuffer {
    const replay = new ArrayBuffer(REPLAY_DATA_OFFSET + replayData.byteLength);
    const replayUint8 = new Uint8Array(replay);
    replayUint8.set(seed, SEED_OFFSET);
    const replayView = new DataView(replay);
    replayView.setUint8(MAX_PLAYERS_OFFSET, maxPlayers);
    replayView.setUint8(FPS_OFFSET, fps);
    replayUint8.set(new Uint8Array(replayData), REPLAY_DATA_OFFSET);
    return replay;
  }

  public static createFromReplay(replay: ArrayBuffer, inputRegistry: InputRegistry): ReplayInputProvider {
    const replayUint8 = new Uint8Array(replay);
    const seed = replayUint8.slice(SEED_OFFSET, SEED_OFFSET + SEED_LENGTH);
    const replayView = new DataView(replay);
    const maxPlayers = replayView.getUint8(MAX_PLAYERS_OFFSET);
    const fps = replayView.getUint8(FPS_OFFSET);
    const rpcData = replay.slice(REPLAY_DATA_OFFSET);
    const ecsConfig = new ECSConfig({ maxPlayers, seed, fps });
    return new ReplayInputProvider(rpcData, ecsConfig, inputRegistry);
  }
}
