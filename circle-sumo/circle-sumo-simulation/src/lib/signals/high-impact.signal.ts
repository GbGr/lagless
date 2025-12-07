import { ECSSignal, Signal } from '@lagless/core';

interface HighImpactSignalData {
  power: number;
  x: number;
  y: number;
}

@ECSSignal()
export class HighImpactSignal extends Signal<HighImpactSignalData> {}
