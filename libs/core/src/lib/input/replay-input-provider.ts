import { AbstractInputProvider } from './abstract-input-provider.js';
import { ECSConfig } from '../ecs-config.js';
import { InputRegistry } from './input-registry.js';
import { seedFrom2x64 } from '../mem/index.js';

const SEED0_OFFSET = 0;
const SEED1_OFFSET = SEED0_OFFSET + 8;
const PLAYER_SLOT_OFFSET = SEED1_OFFSET + 8;
const MAX_PLAYERS_OFFSET = PLAYER_SLOT_OFFSET + 1;
const REPLAY_DATA_OFFSET = MAX_PLAYERS_OFFSET + 1;

export class ReplayInputProvider extends AbstractInputProvider {
  public override getInvalidateRollbackTick() {
    return undefined;
  }

  constructor(
    public override playerSlot: number,
    public readonly replayData: ArrayBuffer,
    ecsConfig: ECSConfig,
    _inputRegistry: InputRegistry,
  ) {
    super(ecsConfig, _inputRegistry);
    this._rpcHistory.import(_inputRegistry, replayData);
  }

  public override update(): void {
    // do nothing, all inputs are pre-recorded
  }

  public static exportReplay(seed0: number, seed1: number, maxPlayers: number, replayData: ArrayBuffer): ArrayBuffer {
    const replay = new ArrayBuffer(REPLAY_DATA_OFFSET + replayData.byteLength);
    const replayView = new DataView(replay);
    replayView.setFloat64(SEED0_OFFSET, seed0, true);
    replayView.setFloat64(SEED1_OFFSET, seed1, true);
    replayView.setUint8(PLAYER_SLOT_OFFSET, 0); // Placeholder, not used in export
    replayView.setUint8(MAX_PLAYERS_OFFSET, maxPlayers);
    new Uint8Array(replay, REPLAY_DATA_OFFSET).set(new Uint8Array(replayData));
    return replay;
  }

  public static createFromReplay(replay: ArrayBuffer, inputRegistry: InputRegistry): ReplayInputProvider {
    const replayView = new DataView(replay);
    const seed0 = replayView.getFloat64(SEED0_OFFSET, true);
    const seed1 = replayView.getFloat64(SEED1_OFFSET, true);
    const playerSlot = replayView.getUint8(PLAYER_SLOT_OFFSET);
    const maxPlayers = replayView.getUint8(MAX_PLAYERS_OFFSET);
    const rpcData = replay.slice(REPLAY_DATA_OFFSET);
    const ecsConfig = new ECSConfig({
      maxPlayers,
      seed: seedFrom2x64(seed0, seed1),
    });
    return new ReplayInputProvider(playerSlot, rpcData, ecsConfig, inputRegistry);
  }
}
