import type { ECSRunner } from '@lagless/core';
import { DiagnosticsCollector } from './diagnostics-collector.js';
import type { DiagnosticsConfig } from './types.js';

export function attachDesyncDiagnostics(
  runner: ECSRunner,
  config?: DiagnosticsConfig,
): DiagnosticsCollector {
  return new DiagnosticsCollector(runner, config);
}
