import { ISignalConstructor } from '@lagless/core';
import { CollectSignal } from './collect.signal.js';

export * from './collect.signal.js';

export const SyncTestSignals: ISignalConstructor[] = [CollectSignal];
