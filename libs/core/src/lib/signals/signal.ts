import { EventEmitter } from './event-emitter.js';
import { ECSConfig } from '../ecs-config.js';
import { ECSSignal } from '../di/index.js';

export interface SignalEvent<TData> {
  tick: number;
  data: TData;
}

export interface ISignalConstructor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): Signal<any>;
}

@ECSSignal()
export abstract class Signal<TData = unknown> {
  public readonly Predicted = new EventEmitter<SignalEvent<TData>>();
  public readonly Verified = new EventEmitter<SignalEvent<TData>>();
  public readonly Cancelled = new EventEmitter<SignalEvent<TData>>();

  private readonly _pending = new Map<number, TData[]>();
  private readonly _awaitingVerification = new Map<number, TData[]>();
  private _lastVerifiedTick = -1;

  constructor(protected readonly _ECSConfig: ECSConfig) {}

  public emit(tick: number, data: TData): void {
    // 1. Добавляем в pending (текущее состояние симуляции)
    let pending = this._pending.get(tick);
    if (!pending) {
      pending = [];
      this._pending.set(tick, pending);
    }
    pending.push(data);

    // 2. Проверяем — уже был Predicted для такого tick+data?
    //    (случается при rollback + пересимуляции с теми же данными)
    const awaiting = this._awaitingVerification.get(tick);
    const alreadyPredicted = awaiting?.some((a) => this._dataEquals(a, data));

    if (!alreadyPredicted) {
      // Первый раз видим это событие — Predicted
      this.Predicted.emit({ tick, data });

      // Добавляем в awaiting для будущей verification
      let aw = this._awaitingVerification.get(tick);
      if (!aw) {
        aw = [];
        this._awaitingVerification.set(tick, aw);
      }
      aw.push(data);
    }
  }

  /**
   * Verify/cancel signals for ticks up to verifiedTick.
   * Called each simulation tick from SignalsRegistry.
   * @internal
   */
  public _onTick(verifiedTick: number): void {
    while (this._lastVerifiedTick < verifiedTick) {
      const nextTick = this._lastVerifiedTick + 1;

      const awaiting = this._awaitingVerification.get(nextTick);
      if (awaiting && awaiting.length > 0) {
        const pending = this._pending.get(nextTick) ?? [];
        const pendingMatched = new Array(pending.length).fill(false);

        for (const awaitingData of awaiting) {
          let matchIdx = -1;
          for (let i = 0; i < pending.length; i++) {
            if (!pendingMatched[i] && this._dataEquals(pending[i], awaitingData)) {
              matchIdx = i;
              break;
            }
          }

          if (matchIdx >= 0) {
            pendingMatched[matchIdx] = true;
            this.Verified.emit({ tick: nextTick, data: awaitingData });
          } else {
            this.Cancelled.emit({ tick: nextTick, data: awaitingData });
          }
        }
      }

      this._cleanupTick(nextTick);
      this._lastVerifiedTick = nextTick;
    }
  }

  /**
   * Перед rollback — очищаем pending для тиков которые будут пересимулированы
   * @internal
   */
  public _onBeforeRollback(toTick: number): void {
    for (const tick of this._pending.keys()) {
      if (tick > toTick) {
        this._pending.delete(tick);
      }
    }
    // _awaitingVerification НЕ очищаем — проверим при verification
  }

  /**
   * Очистка данных для тика после verification
   */
  private _cleanupTick(tick: number): void {
    this._awaitingVerification.delete(tick);
    this._pending.delete(tick);
  }

  /**
   * Shallow comparison данных. Override для custom сравнения.
   */
  protected _dataEquals(a: TData, b: TData): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (a === null || b === null) return false;

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (objA[key] !== objB[key]) {
        return false;
      }
    }
    return true;
  }

  public dispose(): void {
    this._pending.clear();
    this._awaitingVerification.clear();
    this._lastVerifiedTick = -1;
    this.Predicted.clear();
    this.Verified.clear();
    this.Cancelled.clear();
  }
}
