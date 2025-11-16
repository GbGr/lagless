import { ISignalConstructor } from '@lagless/core';
import { PlayerFinishedGameSignal } from './player-finished-game.signal.js';
import { GameOverSignal } from './game-over.signal.js';

export * from './player-finished-game.signal.js';
export * from './game-over.signal.js';

export const CircleRaceSimulationSignals: ISignalConstructor[] = [
  PlayerFinishedGameSignal,
  GameOverSignal,
];
