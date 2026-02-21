import { Signal } from '../signals/signal.js';

export interface DivergenceData {
  slotA: number;
  slotB: number;
  hashA: number;
  hashB: number;
  atTick: number;
}

export class DivergenceSignal extends Signal<DivergenceData> {}
