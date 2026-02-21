import { ISignalConstructor } from '@lagless/core';
import { CollectSignal } from './collect.signal.js';
import { DivergenceSignal } from './divergence.signal.js';

export * from './collect.signal.js';
export * from './divergence.signal.js';

export const SyncTestSignals: ISignalConstructor[] = [CollectSignal, DivergenceSignal];
