import { SKINS_COUNT } from './players.js';

export const BASE_PARTICIPATION = 10;

export const KILL_VALUE   = 15;
export const ASSIST_VALUE = 8;

export const FIRST_PLACE_COST = 40;
export const SECOND_PLACE_COST = 25;
export const THIRD_PLACE_COST = 15;

export const getSpinCost = (ownedSkinsCount: number) => {
  return 50 + Math.floor(Math.pow(ownedSkinsCount / SKINS_COUNT * 100, 2));
};

export const calculateScore = (kills: number, assists: number, topPosition: number): number => {
  let score = BASE_PARTICIPATION;
  score += kills * KILL_VALUE;
  score += assists * ASSIST_VALUE;

  switch (topPosition) {
    case 1:
      score += FIRST_PLACE_COST;
      break;
    case 2:
      score += SECOND_PLACE_COST;
      break;
    case 3:
      score += THIRD_PLACE_COST;
      break;
  }

  return score;
};
