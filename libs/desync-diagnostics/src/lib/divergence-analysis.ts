import type { DiagnosticsReport } from './report-generator.js';

export interface CheckpointComparison {
  tick: number;
  ecsHashes: Record<number, number>;
  physicsHashes: Record<number, number>;
  ecsMatch: boolean;
  physicsMatch: boolean;
}

export interface RollbackOverlapWindow {
  startTick: number;
  endTick: number;
  affectedSlots: number[];
}

export interface DivergenceAnalysis {
  firstEcsDivergenceTick: number | null;
  firstPhysicsDivergenceTick: number | null;
  checkpointComparison: CheckpointComparison[];
  rollbackOverlapWindows: RollbackOverlapWindow[];
}

interface FinalHashEntry {
  hash: number;
  physicsHash: number;
}

/**
 * Build a map of tick → final hash for a client's timeline.
 * For ticks that appear multiple times (rollback resimulation),
 * the LAST occurrence is the correct "final" state.
 */
function buildFinalHashMap(report: DiagnosticsReport): Map<number, FinalHashEntry> {
  const map = new Map<number, FinalHashEntry>();
  for (const record of report.timeline) {
    map.set(record.tick, { hash: record.hash, physicsHash: record.physicsHash });
  }
  return map;
}

const DEFAULT_CHECKPOINT_INTERVAL = 60;

export function analyzeDivergence(
  clients: DiagnosticsReport[],
  checkpointInterval = DEFAULT_CHECKPOINT_INTERVAL,
): DivergenceAnalysis {
  if (clients.length < 2) {
    return {
      firstEcsDivergenceTick: null,
      firstPhysicsDivergenceTick: null,
      checkpointComparison: [],
      rollbackOverlapWindows: [],
    };
  }

  const finalHashMaps = clients.map((c) => buildFinalHashMap(c));

  // Collect all ticks present in ALL clients
  const allTicks = new Set<number>();
  for (const [tick] of finalHashMaps[0]) {
    if (finalHashMaps.every((m) => m.has(tick))) {
      allTicks.add(tick);
    }
  }

  const sortedTicks = [...allTicks].sort((a, b) => a - b);

  // Find first divergence ticks
  let firstEcsDivergenceTick: number | null = null;
  let firstPhysicsDivergenceTick: number | null = null;

  for (const tick of sortedTicks) {
    if (firstEcsDivergenceTick === null) {
      const ecsHashes = finalHashMaps.map((m) => m.get(tick)!.hash);
      if (!ecsHashes.every((h) => h === ecsHashes[0])) {
        firstEcsDivergenceTick = tick;
      }
    }
    if (firstPhysicsDivergenceTick === null) {
      const physicsHashes = finalHashMaps.map((m) => m.get(tick)!.physicsHash);
      if (!physicsHashes.every((h) => h === physicsHashes[0])) {
        firstPhysicsDivergenceTick = tick;
      }
    }
    if (firstEcsDivergenceTick !== null && firstPhysicsDivergenceTick !== null) {
      break;
    }
  }

  // Build checkpoint comparison at interval
  const checkpointComparison: CheckpointComparison[] = [];
  for (const tick of sortedTicks) {
    if (tick % checkpointInterval !== 0) continue;

    const ecsHashes: Record<number, number> = {};
    const physicsHashes: Record<number, number> = {};
    for (let i = 0; i < clients.length; i++) {
      const entry = finalHashMaps[i].get(tick)!;
      ecsHashes[clients[i].playerSlot] = entry.hash;
      physicsHashes[clients[i].playerSlot] = entry.physicsHash;
    }

    const ecsValues = Object.values(ecsHashes);
    const physicsValues = Object.values(physicsHashes);

    checkpointComparison.push({
      tick,
      ecsHashes,
      physicsHashes,
      ecsMatch: ecsValues.every((h) => h === ecsValues[0]),
      physicsMatch: physicsValues.every((h) => h === physicsValues[0]),
    });
  }

  // Find rollback overlap windows
  const rollbackOverlapWindows = findRollbackOverlaps(clients);

  return {
    firstEcsDivergenceTick,
    firstPhysicsDivergenceTick,
    checkpointComparison,
    rollbackOverlapWindows,
  };
}

interface RollbackRange {
  slot: number;
  startTick: number;
  endTick: number;
}

function findRollbackOverlaps(clients: DiagnosticsReport[]): RollbackOverlapWindow[] {
  // Collect all rollback ranges from all clients
  const ranges: RollbackRange[] = [];
  for (const client of clients) {
    for (const rb of client.rollbacks) {
      ranges.push({
        slot: client.playerSlot,
        startTick: rb.rollbackToTick,
        endTick: rb.atSimTick,
      });
    }
  }

  // Find overlapping ranges between different slots
  const windows: RollbackOverlapWindow[] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (ranges[i].slot === ranges[j].slot) continue;

      const overlapStart = Math.max(ranges[i].startTick, ranges[j].startTick);
      const overlapEnd = Math.min(ranges[i].endTick, ranges[j].endTick);

      if (overlapStart < overlapEnd) {
        // Check if this window is already covered
        const existing = windows.find(
          (w) => w.startTick === overlapStart && w.endTick === overlapEnd,
        );
        if (existing) {
          if (!existing.affectedSlots.includes(ranges[i].slot)) {
            existing.affectedSlots.push(ranges[i].slot);
          }
          if (!existing.affectedSlots.includes(ranges[j].slot)) {
            existing.affectedSlots.push(ranges[j].slot);
          }
        } else {
          windows.push({
            startTick: overlapStart,
            endTick: overlapEnd,
            affectedSlots: [ranges[i].slot, ranges[j].slot],
          });
        }
      }
    }
  }

  return windows.sort((a, b) => a.startTick - b.startTick);
}
