import { Signal } from '@lagless/core';

export interface GoalData {
  scorerSlot: number;
  goalOwnerSlot: number;
  x: number;
  y: number;
}

export class GoalSignal extends Signal<GoalData> {}

export interface BallAbsorbedData {
  ownerSlot: number;
  x: number;
  y: number;
}

export class BallAbsorbedSignal extends Signal<BallAbsorbedData> {}

export interface RoundStartData {
  roundNumber: number;
}

export class RoundStartSignal extends Signal<RoundStartData> {}

export interface MatchOverData {
  winnerSlot: number;
  scoreP0: number;
  scoreP1: number;
}

export class MatchOverSignal extends Signal<MatchOverData> {}
