import { RPC } from './rpc.js';
import { IAbstractInputConstructor } from '../types/index.js';
import { InputRegistry } from './input-registry.js';
import { InputBinarySchema, FieldType, fieldTypeSizeBytes, LE } from '@lagless/binary';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RPC_HISTORY_FORMAT_VERSION = 1;

/**
 * Binary format layout:
 *
 * [Header]
 *   version:   Uint8   (format version for forward compatibility)
 *   tickCount: Uint32  (number of unique ticks)
 *
 * [Per Tick Block] × tickCount
 *   tick:     Uint32  (tick number)
 *   rpcCount: Uint16  (number of RPCs for this tick)
 *
 * [Per RPC Entry] × rpcCount
 *   seq:        Uint32  (sequence number)
 *   playerSlot: Uint8   (player slot)
 *   dataLength: Uint16  (byte length of packed input data)
 *   data:       Uint8[] (InputBinarySchema packed data including inputId & ordinal)
 */

const HEADER_SIZE =
  fieldTypeSizeBytes[FieldType.Uint8] +   // version
  fieldTypeSizeBytes[FieldType.Uint32];   // tickCount

const TICK_HEADER_SIZE =
  fieldTypeSizeBytes[FieldType.Uint32] +  // tick
  fieldTypeSizeBytes[FieldType.Uint16];   // rpcCount

const RPC_HEADER_SIZE =
  fieldTypeSizeBytes[FieldType.Uint32] +  // seq
  fieldTypeSizeBytes[FieldType.Uint8] +   // playerSlot
  fieldTypeSizeBytes[FieldType.Uint16];   // dataLength

const compareRPCs = (a: RPC, b: RPC): number =>
  a.meta.playerSlot - b.meta.playerSlot
  || a.meta.ordinal - b.meta.ordinal
  || a.meta.seq - b.meta.seq;

// ─────────────────────────────────────────────────────────────────────────────
// RPCHistory
// ─────────────────────────────────────────────────────────────────────────────

export class RPCHistory {
  private readonly _history: Map<number, RPC[]> = new Map();

  // ─────────────────────────────────────────────────────────────────────────
  // Static utilities
  // ─────────────────────────────────────────────────────────────────────────

  public static excludeLocalRPCs(rpcs: ReadonlyArray<RPC>, localPlayerSlot: number): RPC[] {
    return rpcs.filter((rpc) => rpc.meta.playerSlot !== localPlayerSlot);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public read/write methods
  // ─────────────────────────────────────────────────────────────────────────

  public addRPC(rpc: RPC): void {
    let tickRPCs = this._history.get(rpc.meta.tick);
    if (!tickRPCs) {
      tickRPCs = [];
      this._history.set(rpc.meta.tick, tickRPCs);
    }
    this.insertSorted(tickRPCs, rpc);
  }

  public addBatch(rpcs: ReadonlyArray<RPC>): void {
    if (rpcs.length === 0) return;

    // Group incoming RPCs by tick to minimize Map lookups and sorts
    const perTick = new Map<number, RPC[]>();

    for (const rpc of rpcs) {
      let group = perTick.get(rpc.meta.tick);
      if (!group) {
        group = [];
        perTick.set(rpc.meta.tick, group);
      }
      group.push(rpc);
    }

    // Merge per-tick groups into history and sort once per tick
    for (const [tick, newRPCs] of perTick) {
      const existing = this._history.get(tick);

      if (!existing) {
        newRPCs.sort(compareRPCs);
        this._history.set(tick, newRPCs);
      } else {
        existing.push(...newRPCs);
        existing.sort(compareRPCs);
      }
    }
  }

  /**
   * Returns a new array of RPCs matching the given input type at the specified tick.
   * Each call allocates a fresh array — safe to store and use across multiple calls.
   */
  public collectTickRPCs<TInputCtor extends IAbstractInputConstructor>(
    tick: number,
    InputCtor: TInputCtor
  ): ReadonlyArray<RPC<InstanceType<TInputCtor>>> {
    const rpcs = this._history.get(tick);
    if (!rpcs) return [];

    const result: RPC<InstanceType<TInputCtor>>[] = [];
    for (const rpc of rpcs) {
      if (rpc.inputId === InputCtor.id) {
        result.push(rpc as RPC<InstanceType<TInputCtor>>);
      }
    }
    return result;
  }

  public removePlayerInputsAtTick(playerSlot: number, tick: number, seq: number): void {
    const tickRPCs = this._history.get(tick);
    if (!tickRPCs || tickRPCs.length === 0) return;

    let writeIndex = 0;
    for (let readIndex = 0; readIndex < tickRPCs.length; readIndex++) {
      const rpc = tickRPCs[readIndex];
      if (!(rpc.meta.playerSlot === playerSlot && rpc.meta.seq === seq)) {
        tickRPCs[writeIndex++] = rpc;
      }
    }

    tickRPCs.length = writeIndex;

    if (writeIndex === 0) {
      this._history.delete(tick);
    }
  }

  public clear(): void {
    this._history.clear();
  }

  public get size(): number {
    return this._history.size;
  }

  public get totalRPCCount(): number {
    let count = 0;
    for (const rpcs of this._history.values()) {
      count += rpcs.length;
    }
    return count;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────────────────────

  public debugExportAsJSON(): string {
    const exportObj: Record<number, Array<{
      inputId: number;
      seq: number;
      playerSlot: number;
      ordinal: number;
      data: unknown;
    }>> = {};

    for (const [tick, rpcs] of this._history) {
      exportObj[tick] = rpcs.map((rpc) => ({
        inputId: rpc.inputId,
        seq: rpc.meta.seq,
        playerSlot: rpc.meta.playerSlot,
        ordinal: rpc.meta.ordinal,
        data: rpc.data,
      }));
    }

    return JSON.stringify(exportObj, null, 2);
  }

  /**
   * Exports entire history to a compact binary format.
   * @param registry - InputRegistry for serializing input data
   * @returns ArrayBuffer containing serialized history
   */
  public export(registry: InputRegistry): ArrayBuffer {
    // First pass: pack all RPC data and calculate total size
    const tickEntries = this.prepareExportData(registry);
    const totalSize = this.calculateExportSize(tickEntries);

    // Second pass: write to buffer
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    const offset = this.writeHeader(view, tickEntries.length);
    this.writeTickEntries(view, uint8View, offset, tickEntries);

    return buffer;
  }

  /**
   * Imports history from binary format, replacing current content.
   * @param registry - InputRegistry for deserializing input data
   * @param buffer - ArrayBuffer containing serialized history
   */
  public import(registry: InputRegistry, buffer: ArrayBuffer): void {
    const view = new DataView(buffer);
    let offset = 0;

    // Validate and read header
    const { version, tickCount } = this.readHeader(view, offset);
    offset += HEADER_SIZE;

    if (version !== RPC_HISTORY_FORMAT_VERSION) {
      throw new Error(
        `Unsupported RPCHistory format version: ${version} (expected ${RPC_HISTORY_FORMAT_VERSION})`
      );
    }

    // Clear existing data and read all ticks
    this._history.clear();

    for (let i = 0; i < tickCount; i++) {
      const result = this.readTickEntry(view, buffer, offset, registry);
      offset = result.nextOffset;

      if (result.rpcs.length > 0) {
        result.rpcs.sort(compareRPCs);
        this._history.set(result.tick, result.rpcs);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Export helpers
  // ─────────────────────────────────────────────────────────────────────────

  private prepareExportData(registry: InputRegistry): ExportTickEntry[] {
    const entries: ExportTickEntry[] = [];

    for (const [tick, rpcs] of this._history) {
      const rpcEntries: ExportRPCEntry[] = [];

      for (const rpc of rpcs) {
        const packedData = InputBinarySchema.packBatch(registry, [{
          inputId: rpc.inputId,
          ordinal: rpc.meta.ordinal,
          values: rpc.data,
        }]);

        rpcEntries.push({
          seq: rpc.meta.seq,
          playerSlot: rpc.meta.playerSlot,
          packedData,
        });
      }

      entries.push({ tick, rpcs: rpcEntries });
    }

    // Sort by tick for deterministic output
    entries.sort((a, b) => a.tick - b.tick);

    return entries;
  }

  private calculateExportSize(tickEntries: ExportTickEntry[]): number {
    let size = HEADER_SIZE;

    for (const entry of tickEntries) {
      size += TICK_HEADER_SIZE;
      for (const rpc of entry.rpcs) {
        size += RPC_HEADER_SIZE + rpc.packedData.byteLength;
      }
    }

    return size;
  }

  private writeHeader(view: DataView, tickCount: number): number {
    let offset = 0;

    view.setUint8(offset, RPC_HISTORY_FORMAT_VERSION);
    offset += fieldTypeSizeBytes[FieldType.Uint8];

    view.setUint32(offset, tickCount, LE);
    offset += fieldTypeSizeBytes[FieldType.Uint32];

    return offset;
  }

  private writeTickEntries(
    view: DataView,
    uint8View: Uint8Array,
    startOffset: number,
    tickEntries: ExportTickEntry[]
  ): number {
    let offset = startOffset;

    for (const entry of tickEntries) {
      // Write tick header
      view.setUint32(offset, entry.tick, LE);
      offset += fieldTypeSizeBytes[FieldType.Uint32];

      view.setUint16(offset, entry.rpcs.length, LE);
      offset += fieldTypeSizeBytes[FieldType.Uint16];

      // Write RPC entries
      for (const rpc of entry.rpcs) {
        view.setUint32(offset, rpc.seq, LE);
        offset += fieldTypeSizeBytes[FieldType.Uint32];

        view.setUint8(offset, rpc.playerSlot);
        offset += fieldTypeSizeBytes[FieldType.Uint8];

        view.setUint16(offset, rpc.packedData.byteLength, LE);
        offset += fieldTypeSizeBytes[FieldType.Uint16];

        // Copy packed data
        uint8View.set(new Uint8Array(rpc.packedData), offset);
        offset += rpc.packedData.byteLength;
      }
    }

    return offset;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Import helpers
  // ─────────────────────────────────────────────────────────────────────────

  private readHeader(view: DataView, offset: number): { version: number; tickCount: number } {
    const version = view.getUint8(offset);
    const tickCount = view.getUint32(offset + fieldTypeSizeBytes[FieldType.Uint8], LE);
    return { version, tickCount };
  }

  private readTickEntry(
    view: DataView,
    buffer: ArrayBuffer,
    startOffset: number,
    registry: InputRegistry
  ): { tick: number; rpcs: RPC[]; nextOffset: number } {
    let offset = startOffset;

    // Read tick header
    const tick = view.getUint32(offset, LE);
    offset += fieldTypeSizeBytes[FieldType.Uint32];

    const rpcCount = view.getUint16(offset, LE);
    offset += fieldTypeSizeBytes[FieldType.Uint16];

    const rpcs: RPC[] = [];

    // Read RPC entries
    for (let j = 0; j < rpcCount; j++) {
      const seq = view.getUint32(offset, LE);
      offset += fieldTypeSizeBytes[FieldType.Uint32];

      const playerSlot = view.getUint8(offset);
      offset += fieldTypeSizeBytes[FieldType.Uint8];

      const dataLength = view.getUint16(offset, LE);
      offset += fieldTypeSizeBytes[FieldType.Uint16];

      // Extract and unpack input data
      const dataSlice = buffer.slice(offset, offset + dataLength);
      offset += dataLength;

      const unpacked = InputBinarySchema.unpackBatch(registry, dataSlice);

      if (unpacked.length !== 1) {
        throw new Error(
          `Invalid RPC data: expected 1 input, got ${unpacked.length} at tick ${tick}`
        );
      }

      const { inputId, ordinal, values } = unpacked[0];
      rpcs.push(new RPC(inputId, { tick, seq, ordinal, playerSlot }, values));
    }

    return { tick, rpcs, nextOffset: offset };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Sorting
  // ─────────────────────────────────────────────────────────────────────────

  /** Insert rpc into arr maintaining sorted order by (playerSlot, ordinal). */
  private insertSorted(arr: RPC[], rpc: RPC): void {
    let i = arr.length;
    while (i > 0 && compareRPCs(arr[i - 1], rpc) > 0) {
      i--;
    }
    arr.splice(i, 0, rpc);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface ExportRPCEntry {
  readonly seq: number;
  readonly playerSlot: number;
  readonly packedData: ArrayBuffer;
}

interface ExportTickEntry {
  readonly tick: number;
  readonly rpcs: ExportRPCEntry[];
}
