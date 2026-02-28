import type { IECSSystem, IAbstractInputConstructor, IPlayerResourceConstructor } from '../types/index.js';
import type { ECSConfig } from '../ecs-config.js';
import type { AbstractInputProvider } from '../input/abstract-input-provider.js';
import type { PlayerResources } from '../mem/managers/player-resources-manager.js';
import type { DivergenceSignal } from './divergence.signal.js';

/**
 * Minimum fields that a PlayerResource must expose for hash verification.
 */
interface HashPlayerResourceProxy {
  connected: number;
  lastReportedHash: number;
  lastReportedHashTick: number;
  hashMismatchCount: number;
}

/**
 * Abstract base class for ECS hash verification systems.
 *
 * Subclass this in your game simulation and provide the concrete
 * `_reportHashRpc` and `_playerResourceClass` from your codegen.
 *
 * The subclass must use `@ECSSystem()` decorator and declare constructor
 * params for DI injection matching the base constructor signature.
 */
export abstract class AbstractHashVerificationSystem implements IECSSystem {
  constructor(
    protected readonly _ECSConfig: ECSConfig,
    protected readonly _InputProvider: AbstractInputProvider,
    protected readonly _PlayerResources: PlayerResources,
    protected readonly _DivergenceSignal: DivergenceSignal,
  ) {}

  /**
   * The codegen-generated ReportHash input constructor.
   * Must have `{ readonly id: number }` and conform to `IAbstractInputConstructor`.
   */
  protected abstract readonly _reportHashRpc: IAbstractInputConstructor;

  /**
   * The codegen-generated PlayerResource class constructor.
   */
  protected abstract readonly _playerResourceClass: IPlayerResourceConstructor;

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, this._reportHashRpc) as unknown as Array<{ meta: { playerSlot: number }, data: { hash: number, atTick: number } }>;

    for (const rpc of rpcs) {
      const playerResource = this._PlayerResources.get(this._playerResourceClass, rpc.meta.playerSlot) as unknown as { safe: HashPlayerResourceProxy };
      const safe = playerResource.safe as HashPlayerResourceProxy;
      safe.lastReportedHash = rpc.data.hash;
      safe.lastReportedHashTick = rpc.data.atTick;
    }

    // Wait until reported hashes are "confirmed" — old enough that any
    // rollback for that tick has already happened and corrected the state.
    // Without this delay, a hash computed before rollback (stale timeline)
    // causes false-positive divergence when compared with a post-rollback hash.
    const confirmationDelay = this._ECSConfig.maxInputDelayTick * 2;

    const maxPlayers = this._ECSConfig.maxPlayers;
    for (let a = 0; a < maxPlayers; a++) {
      const pa = this._PlayerResources.get(this._playerResourceClass, a) as unknown as { safe: HashPlayerResourceProxy };
      const safeA = pa.safe as HashPlayerResourceProxy;
      if (safeA.connected === 0 || safeA.lastReportedHashTick === 0) continue;
      if (tick - safeA.lastReportedHashTick < confirmationDelay) continue;

      for (let b = a + 1; b < maxPlayers; b++) {
        const pb = this._PlayerResources.get(this._playerResourceClass, b) as unknown as { safe: HashPlayerResourceProxy };
        const safeB = pb.safe as HashPlayerResourceProxy;
        if (safeB.connected === 0 || safeB.lastReportedHashTick === 0) continue;
        if (tick - safeB.lastReportedHashTick < confirmationDelay) continue;

        if (safeA.lastReportedHashTick === safeB.lastReportedHashTick &&
          safeA.lastReportedHash !== safeB.lastReportedHash) {
          safeA.hashMismatchCount++;
          safeB.hashMismatchCount++;

          this._DivergenceSignal.emit(tick, {
            slotA: a,
            slotB: b,
            hashA: safeA.lastReportedHash,
            hashB: safeB.lastReportedHash,
            atTick: safeA.lastReportedHashTick,
          });
        }
      }
    }
  }
}
