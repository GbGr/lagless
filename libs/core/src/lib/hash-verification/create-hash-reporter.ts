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
    const verifiedTick = runner.Simulation.inputProvider.verifiedTick;
    const latestReportTick = Math.floor(verifiedTick / config.reportInterval) * config.reportInterval;
    if (latestReportTick > lastReportedTick && latestReportTick > 0) {
      const hash = runner.Simulation.getHashAtTick(latestReportTick);
      if (hash !== undefined) {
        lastReportedTick = latestReportTick;
        addRPC(config.reportHashRpc, { hash, atTick: latestReportTick });
      }
    }
  };
}
