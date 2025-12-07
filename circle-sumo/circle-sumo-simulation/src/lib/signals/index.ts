import { ISignalConstructor } from '@lagless/core';
import { PlayerFinishedGameSignal } from './player-finished-game.signal.js';
import { GameOverSignal } from './game-over.signal.js';
import { HighImpactSignal } from './high-impact.signal.js';

export * from './player-finished-game.signal.js';
export * from './game-over.signal.js';
export * from './high-impact.signal.js';

export const CircleSumoSignals: ISignalConstructor[] = [PlayerFinishedGameSignal, GameOverSignal, HighImpactSignal];
