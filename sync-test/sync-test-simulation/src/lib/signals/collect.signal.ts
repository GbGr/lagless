import { Signal } from '@lagless/core';

export interface CollectData {
  playerSlot: number;
  x: number;
  y: number;
  value: number;
}

export class CollectSignal extends Signal<CollectData> {}
