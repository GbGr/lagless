import { IAbstractInputConstructor } from '@lagless/types';
import { RPC } from "./rpc.js";

const EMPTY_ARRAY: RPC[] = [];

export class RPCHistory {
  private readonly history: Map<number, Map<number, RPC[]>> = new Map();

  public add(rpc: RPC): void {
    const tick = rpc.meta.tick;
    const slot = rpc.meta.playerSlot;

    let tickMap = this.history.get(tick);
    if (!tickMap) {
      tickMap = new Map();
      this.history.set(tick, tickMap);
    }

    let slotList = tickMap.get(slot);
    if (!slotList) {
      slotList = [];
      tickMap.set(slot, slotList);
    }

    slotList.push(rpc);
  }

  public getSlotRPCs(tick: number, slot: number): RPC[] {
    return (this.history.get(tick)?.get(slot) ?? EMPTY_ARRAY);
  }

  public findRPCs<TInputCtor extends IAbstractInputConstructor>(
    tick: number,
    slot: number,
    factory: TInputCtor
  ): RPC<InstanceType<TInputCtor>>[] {
    return this.getSlotRPCs(tick, slot)
      .filter(rpc => rpc.inputId === factory.id) as RPC<InstanceType<TInputCtor>>[];
  }

  public clear(): void {
    this.history.clear();
  }

  public export(): IterableIterator<[number, Record<number, RPC[]>]> {
    return (function* (this: RPCHistory) {
      for (const [tick, tickMap] of this.history) {
        yield [tick, convertTickMap(tickMap)];
      }
    }).call(this) as IterableIterator<[number, Record<number, RPC[]>]>;
  }
}

function convertTickMap(tickMap: Map<number, RPC[]>): Record<number, RPC[]> {
  const obj: Record<number, RPC[]> = {};
  for (const [slot, list] of tickMap) {
    obj[slot] = list;
  }
  return obj;
}
