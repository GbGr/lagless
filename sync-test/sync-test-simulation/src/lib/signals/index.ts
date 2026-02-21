import { ISignalConstructor, DivergenceSignal } from '@lagless/core';
import { CollectSignal } from './collect.signal.js';

export * from './collect.signal.js';
export { DivergenceSignal, type DivergenceData } from '@lagless/core';

export const SyncTestSignals: ISignalConstructor[] = [CollectSignal, DivergenceSignal];
