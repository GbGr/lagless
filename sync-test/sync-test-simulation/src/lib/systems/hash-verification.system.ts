import { ECSConfig, ECSSystem, InputProvider, PlayerResources, AbstractHashVerificationSystem, DivergenceSignal } from '@lagless/core';
import { PlayerResource, ReportHash } from '../schema/code-gen/index.js';

@ECSSystem()
export class HashVerificationSystem extends AbstractHashVerificationSystem {
  protected readonly _reportHashRpc = ReportHash;
  protected readonly _playerResourceClass = PlayerResource;

  constructor(
    ecsConfig: ECSConfig,
    inputProvider: InputProvider,
    playerResources: PlayerResources,
    divergenceSignal: DivergenceSignal,
  ) {
    super(ecsConfig, inputProvider, playerResources, divergenceSignal);
  }
}
