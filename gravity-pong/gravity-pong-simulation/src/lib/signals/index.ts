import { ISignalConstructor, DivergenceSignal } from '@lagless/core';
import { GoalSignal, BallAbsorbedSignal, RoundStartSignal, MatchOverSignal } from './goal.signal.js';

export * from './goal.signal.js';
export { DivergenceSignal, type DivergenceData } from '@lagless/core';

export const GravityPongSignals: ISignalConstructor[] = [
  GoalSignal,
  BallAbsorbedSignal,
  RoundStartSignal,
  MatchOverSignal,
  DivergenceSignal,
];
