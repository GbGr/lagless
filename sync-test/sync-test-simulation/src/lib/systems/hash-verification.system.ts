import { ECSConfig, ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { PlayerResource, ReportHash } from '../schema/code-gen/index.js';
import { DivergenceSignal } from '../signals/index.js';

@ECSSystem()
export class HashVerificationSystem implements IECSSystem {
  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
    private readonly _DivergenceSignal: DivergenceSignal,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.getTickRPCs(tick, ReportHash);

    for (const rpc of rpcs) {
      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      playerResource.safe.lastReportedHash = rpc.data.hash;
      playerResource.safe.lastReportedHashTick = rpc.data.atTick;
    }

    // Compare hashes between players that reported for the same tick
    const maxPlayers = this._ECSConfig.maxPlayers;
    for (let a = 0; a < maxPlayers; a++) {
      const pa = this._PlayerResources.get(PlayerResource, a);
      if (pa.safe.connected === 0 || pa.safe.lastReportedHashTick === 0) continue;

      for (let b = a + 1; b < maxPlayers; b++) {
        const pb = this._PlayerResources.get(PlayerResource, b);
        if (pb.safe.connected === 0 || pb.safe.lastReportedHashTick === 0) continue;

        if (pa.safe.lastReportedHashTick === pb.safe.lastReportedHashTick &&
          pa.safe.lastReportedHash !== pb.safe.lastReportedHash) {
          pa.safe.hashMismatchCount++;
          pb.safe.hashMismatchCount++;

          this._DivergenceSignal.emit(tick, {
            slotA: a,
            slotB: b,
            hashA: pa.safe.lastReportedHash,
            hashB: pb.safe.lastReportedHash,
            atTick: pa.safe.lastReportedHashTick,
          });
        }
      }
    }
  }
}
