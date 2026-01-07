// libs/relay-input-provider/src/lib/snapshot-responder.ts

import {
  BinarySchemaPackPipeline,
  getFastHash,
  type InferBinarySchemaValues,
} from '@lagless/binary';
import {
  HeaderStruct,
  MsgType,
  SnapshotRequestStruct,
  SnapshotResponseStruct,
  WireVersion,
} from '@lagless/net-wire';

/**
 * Interface for snapshot source (typically ECSSimulation)
 */
export interface SnapshotSource {
  /**
   * Get snapshot at a specific tick if available
   * Returns null if no snapshot exists at or near the requested tick
   */
  getSnapshotInRange(minTick: number, maxTick: number): { tick: number; snapshot: ArrayBuffer } | null;

  /**
   * Get current simulation tick
   */
  get tick(): number;
}

/**
 * Function type for sending data to server
 */
export type SendFn = (data: Uint8Array) => void;

/**
 * Handles snapshot requests from the server and sends responses
 *
 * When the server needs a snapshot for a late joiner:
 * 1. Server sends SnapshotRequest with tick range
 * 2. Client finds best snapshot in range
 * 3. Client sends SnapshotResponse with snapshot data + hash
 */
export class SnapshotResponder {
  private readonly _snapshotSource: SnapshotSource;
  private readonly _sendFn: SendFn;

  constructor(snapshotSource: SnapshotSource, sendFn: SendFn) {
    this._snapshotSource = snapshotSource;
    this._sendFn = sendFn;
  }

  /**
   * Handle a snapshot request from the server
   *
   * @param request - Unpacked SnapshotRequestStruct values
   */
  public handleRequest(request: InferBinarySchemaValues<typeof SnapshotRequestStruct>): void {
    const { requestId, targetTickMin, targetTickMax } = request;

    // Try to find a snapshot in the requested range
    const result = this._snapshotSource.getSnapshotInRange(targetTickMin, targetTickMax);

    if (!result) {
      console.warn(
        `[SnapshotResponder] No snapshot available in range [${targetTickMin}, ${targetTickMax}]`
      );
      // Don't send response - server will timeout and use fallback
      return;
    }

    const { tick, snapshot } = result;

    // Compute hash of snapshot
    const hash32 = getFastHash(snapshot);

    // Send response
    this.sendResponse(requestId, tick, hash32, snapshot);

    console.log(
      `[SnapshotResponder] Sent snapshot for request ${requestId}: ` +
      `tick=${tick}, size=${snapshot.byteLength}, hash=${hash32}`
    );
  }

  /**
   * Send a snapshot response to the server
   */
  private sendResponse(
    requestId: number,
    snapshotTick: number,
    hash32: number,
    snapshotBytes: ArrayBuffer
  ): void {
    const pipeline = new BinarySchemaPackPipeline();

    // Pack header
    pipeline.pack(HeaderStruct, {
      version: WireVersion.V2,
      type: MsgType.SnapshotResponse,
    });

    // Pack response metadata
    pipeline.pack(SnapshotResponseStruct, {
      requestId,
      snapshotTick,
      hash32,
      snapshotSize: snapshotBytes.byteLength,
    });

    // Append snapshot bytes
    pipeline.appendBuffer(snapshotBytes);

    this._sendFn(pipeline.toUint8Array());
  }

  /**
   * Update snapshot source (e.g., after simulation changes)
   * This is a no-op since we store a reference
   */
  public setSnapshotSource(source: SnapshotSource): void {
    // No-op - we use the reference directly
    // This method exists for potential future use
  }
}

/**
 * Create a snapshot source adapter from ECSSimulation
 *
 * @param simulation - The ECS simulation instance
 * @returns SnapshotSource adapter
 */
export function createSnapshotSourceFromSimulation(simulation: {
  tick: number;
  snapshotHistory?: {
    getLatestInRange?(minTick: number, maxTick: number): { tick: number; snapshot: ArrayBuffer } | null;
  };
  mem?: {
    exportSnapshot(): ArrayBuffer;
  };
}): SnapshotSource {
  return {
    get tick(): number {
      return simulation.tick;
    },

    getSnapshotInRange(minTick: number, maxTick: number): { tick: number; snapshot: ArrayBuffer } | null {
      // Try to use snapshot history if available
      if (simulation.snapshotHistory?.getLatestInRange) {
        return simulation.snapshotHistory.getLatestInRange(minTick, maxTick);
      }

      // Fallback: export current state if tick is in range
      const currentTick = simulation.tick;
      if (currentTick >= minTick && currentTick <= maxTick && simulation.mem) {
        return {
          tick: currentTick,
          snapshot: simulation.mem.exportSnapshot(),
        };
      }

      return null;
    },
  };
}
