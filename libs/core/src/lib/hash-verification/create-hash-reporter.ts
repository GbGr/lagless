import type { ECSRunner } from '../ecs-runner.js';
import type { IAbstractInputConstructor, InputData } from '../types/index.js';

type AddRPCFn = <TInputCtor extends IAbstractInputConstructor>(
  InputCtor: TInputCtor,
  data: InputData<InstanceType<TInputCtor>>,
) => void;

export interface HashReporterConfig {
  reportInterval: number;
  reportHashRpc: IAbstractInputConstructor;
}

/**
 * Creates a hash reporter function for use in `drainInputs`.
 *
 * The returned function should be called from your `drainInputs` callback.
 * It periodically reports the simulation state hash via the ReportHash RPC.
 */
export function createHashReporter(runner: ECSRunner, config: HashReporterConfig): (addRPC: AddRPCFn) => void {
  let lastReportedTick = -1;

  return (addRPC: AddRPCFn) => {
    const currentTick = runner.Simulation.tick;
    if (
      currentTick > 0 &&
      currentTick % config.reportInterval === 0 &&
      currentTick !== lastReportedTick
    ) {
      lastReportedTick = currentTick;
      const hash = runner.Simulation.mem.getHash();
      addRPC(config.reportHashRpc, { hash, atTick: currentTick });
    }
  };
}
