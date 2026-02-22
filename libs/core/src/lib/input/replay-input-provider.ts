import { AbstractInputProvider } from './abstract-input-provider.js';
import { ECSConfig } from '../ecs-config.js';
import { InputRegistry } from './input-registry.js';

const SEED_OFFSET = 0;
const SEED_LENGTH = 16;
const PLAYER_SLOT_OFFSET = SEED_OFFSET + SEED_LENGTH;
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

  public static exportReplay(seed: Uint8Array, maxPlayers: number, replayData: ArrayBuffer): ArrayBuffer {
    const replay = new ArrayBuffer(REPLAY_DATA_OFFSET + replayData.byteLength);
    const replayUint8 = new Uint8Array(replay);
    replayUint8.set(seed, SEED_OFFSET);
    const replayView = new DataView(replay);
    replayView.setUint8(PLAYER_SLOT_OFFSET, 0); // Placeholder, not used in export
    replayView.setUint8(MAX_PLAYERS_OFFSET, maxPlayers);
    replayUint8.set(new Uint8Array(replayData), REPLAY_DATA_OFFSET);
    return replay;
  }

  public static createFromReplay(replay: ArrayBuffer, inputRegistry: InputRegistry): ReplayInputProvider {
    const replayUint8 = new Uint8Array(replay);
    const seed = replayUint8.slice(SEED_OFFSET, SEED_OFFSET + SEED_LENGTH);
    const replayView = new DataView(replay);
    const playerSlot = replayView.getUint8(PLAYER_SLOT_OFFSET);
    const maxPlayers = replayView.getUint8(MAX_PLAYERS_OFFSET);
    const rpcData = replay.slice(REPLAY_DATA_OFFSET);
    const ecsConfig = new ECSConfig({
      maxPlayers,
      seed,
    });
    return new ReplayInputProvider(playerSlot, rpcData, ecsConfig, inputRegistry);
  }
}
