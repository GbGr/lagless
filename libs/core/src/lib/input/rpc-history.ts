import { type RPC } from './rpc.js';
import { IAbstractInputConstructor } from '../types/index.js';

export class RPCHistory {
  private readonly RESULT_BUFFER = new Array<RPC>();
  private readonly _history = new Map<number, Array<RPC>>();

  public static filterLocalRPCs(rpcs: Array<RPC>, localPlayerSlot: number): Array<RPC> {
    return rpcs.filter((rpc) => rpc.meta.playerSlot !== localPlayerSlot);
  }

  public addRPC = (rpc: RPC): void => {
    if (!this._history.has(rpc.meta.tick)) this._history.set(rpc.meta.tick, []);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tickRPCs = this._history.get(rpc.meta.tick)!;
    tickRPCs.push(rpc);
    tickRPCs.sort(this.orderBySlotAndOrdinal);
  };

  public getTickRPCs<TInputCtor extends IAbstractInputConstructor>(
    tick: number,
    InputCtor: TInputCtor
  ): Array<RPC<InstanceType<TInputCtor>>> {
    this.RESULT_BUFFER.length = 0;

    const rpcs = this._history.get(tick);
    if (rpcs) {
      for (let i = 0; i < rpcs.length; i++) {
        const rpc = rpcs[i];
        if (rpc.inputId === InputCtor.id) {
          this.RESULT_BUFFER.push(rpc as RPC<InstanceType<TInputCtor>>);
        }
      }
    }

    return this.RESULT_BUFFER as Array<RPC<InstanceType<TInputCtor>>>;
  }

  public addBatch(rpcs: Array<RPC>): void {
    if (rpcs.length === 0) return;

    // Group incoming RPCs by tick to minimize Map lookups and sorts
    const perTick = new Map<number, RPC[]>();

    for (let i = 0; i < rpcs.length; i++) {
      const rpc = rpcs[i];
      const tick = rpc.meta.tick;

      let group = perTick.get(tick);
      if (group === undefined) {
        group = [];
        perTick.set(tick, group);
      }
      group.push(rpc);
    }

    // Merge per-tick groups into history and sort once per tick
    for (const [tick, newRPCs] of perTick) {
      const tickRPCs = this._history.get(tick);

      if (!tickRPCs) {
        // No existing RPCs for this tick, just sort and store this batch
        newRPCs.sort(this.orderBySlotAndOrdinal);
        this._history.set(tick, newRPCs);
      } else {
        // Append new ones and sort once
        tickRPCs.push(...newRPCs);
        tickRPCs.sort(this.orderBySlotAndOrdinal);
      }
    }
  }

  public removePlayerInputsAtTick(playerSlot: number, tick: number, seq: number): void {
    const tickRPCs = this._history.get(tick);
    if (!tickRPCs || tickRPCs.length === 0) return;

    let writeIndex = 0;

    for (let readIndex = 0; readIndex < tickRPCs.length; readIndex++) {
      const rpc = tickRPCs[readIndex];

      // Keep only RPCs that do not belong to this playerSlot
      if (!(rpc.meta.playerSlot === playerSlot && rpc.meta.ordinal === seq)) {
        tickRPCs[writeIndex++] = rpc;
      }
    }

    tickRPCs.length = writeIndex;

    if (writeIndex === 0) {
      this._history.delete(tick);
    }
  }

  private orderBySlotAndOrdinal(a: RPC, b: RPC): number {
    return a.meta.playerSlot - b.meta.playerSlot || a.meta.ordinal - b.meta.ordinal;
  }
}
