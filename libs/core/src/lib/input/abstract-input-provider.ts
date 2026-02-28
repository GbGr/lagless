import { sanitizeInputData } from '@lagless/binary';
import { ECSSimulation } from '../ecs-simulation.js';
import { IAbstractInputConstructor, InputData, InputMeta } from '../types/index.js';
import { ECSConfig } from '../ecs-config.js';
import { InputRegistry } from './input-registry.js';
import { RPCHistory } from './rpc-history.js';
import { RPC } from './rpc.js';
import { createLogger } from '@lagless/misc';

const log = createLogger('InputProvider');

export abstract class AbstractInputProvider {
  private _nextSeq = 1;
  private _nextOrdinal = 1;
  private readonly _inputDrainers: Set<InputDrainerFn> = new Set();
  protected _frameRPCBuffer: Array<RPC> = [];
  protected _frameLength: number;

  protected _disposed = false;
  protected _currentInputDelay: number;
  protected _simulation!: ECSSimulation;
  protected readonly _rpcHistory = new RPCHistory();

  public abstract playerSlot: number;

  public abstract getInvalidateRollbackTick(): void | number;

  constructor(
    public readonly ecsConfig: ECSConfig,
    protected readonly _inputRegistry: InputRegistry,
  ) {
    this._frameLength = this.ecsConfig.frameLength;
    this._currentInputDelay = this.ecsConfig.initialInputDelayTick;
  }

  // ─── Public Getters ─────────────────────────────────────

  public get currentInputDelay(): number {
    return this._currentInputDelay;
  }

  public get rpcHistory(): RPCHistory {
    return this._rpcHistory;
  }

  public get inputRegistry(): InputRegistry {
    return this._inputRegistry;
  }

  // ─── Lifecycle ──────────────────────────────────────────

  /** @internal — used only by addLocalRpc for ordinal assignment */
  private getNextOrdinal(): number {
    return this._nextOrdinal++;
  }

  public update(): void {
    this._frameRPCBuffer.length = 0;
    for (const drainFn of this._inputDrainers) {
      drainFn(this.addLocalRpc);
    }

    if (this._frameRPCBuffer.length > 0) this._nextSeq++;
  }

  public init(simulation: ECSSimulation): void {
    this._simulation = simulation;
  }

  public dispose(): void {
    this._disposed = true;
  }

  protected resetSequences(): void {
    this._nextSeq = 1;
    this._nextOrdinal = 1;
    this._frameRPCBuffer.length = 0;
  }

  // ─── Local Input (from drainers) ────────────────────────

  private addLocalRpc = <TInputCtor extends IAbstractInputConstructor>(
    InputCtor: TInputCtor,
    data: InputData<InstanceType<TInputCtor>>,
  ): void => {
    // Truncate numeric fields to their declared binary precision to prevent
    // desync between local (float64) and remote (float32-via-network) values.
    const inputInstance = this._inputRegistry.get(InputCtor.id);
    sanitizeInputData(inputInstance.fields, data as Record<string, number | ArrayLike<number>>);

    const newRPCMeta: InputMeta = {
      tick: this._simulation.tick + this._currentInputDelay,
      seq: this._nextSeq,
      ordinal: this.getNextOrdinal(),
      playerSlot: this.playerSlot,
    };
    const rpc = new RPC(InputCtor.id, newRPCMeta, data);
    this._frameRPCBuffer.push(rpc);
    this._rpcHistory.addRPC(rpc);
    log.debug(`Local RPC tick=${newRPCMeta.tick} delay=${this._currentInputDelay} seq=${newRPCMeta.seq} slot=${newRPCMeta.playerSlot} inputId=${InputCtor.id}`);
  };

  // ─── Remote Input (from network) ────────────────────────

  /**
   * Add an RPC received from a remote player via the network.
   * Used by RelayInputProvider when receiving TickInputFanout.
   */
  public addRemoteRpc(rpc: RPC): void {
    this._rpcHistory.addRPC(rpc);
    log.debug(`Remote RPC tick=${rpc.meta.tick} seq=${rpc.meta.seq} slot=${rpc.meta.playerSlot} inputId=${rpc.inputId}`);
  }

  /**
   * Add multiple remote RPCs at once (batch from fanout).
   */
  public addRemoteRpcBatch(rpcs: ReadonlyArray<RPC>): void {
    this._rpcHistory.addBatch(rpcs);
    log.debug(`Remote RPC batch: ${rpcs.length} RPCs`);
  }

  /**
   * Remove a specific RPC from history.
   * Used when server sends CancelInput.
   */
  public removeRpcAt(playerSlot: number, tick: number, seq: number): void {
    this._rpcHistory.removePlayerInputsAtTick(playerSlot, tick, seq);
    log.debug(`Removed RPC slot=${playerSlot} tick=${tick} seq=${seq}`);
  }

  // ─── Input Delay ────────────────────────────────────────

  /**
   * Dynamically change the input delay (in ticks).
   * Used by InputDelayController based on network conditions.
   */
  public setInputDelay(ticks: number): void {
    const clamped = Math.max(
      this.ecsConfig.minInputDelayTick,
      Math.min(ticks, this.ecsConfig.maxInputDelayTick),
    );
    if (clamped !== this._currentInputDelay) {
      log.debug(`Input delay changed: ${this._currentInputDelay} → ${clamped}`);
      this._currentInputDelay = clamped;
    }
  }

  // ─── Query ──────────────────────────────────────────────

  public drainInputs(fn: InputDrainerFn): () => void {
    this._inputDrainers.add(fn);

    return () => {
      this._inputDrainers.delete(fn);
    };
  }

  public collectTickRPCs<TInputCtor extends IAbstractInputConstructor>(
    tick: number,
    InputCtor: TInputCtor
  ): ReadonlyArray<RPC<InstanceType<TInputCtor>>> {
    return this._rpcHistory.collectTickRPCs(tick, InputCtor);
  }

  /**
   * Get the last buffered local RPCs from this frame.
   * Used by RelayInputProvider to send local inputs to the server.
   */
  public getFrameRPCBuffer(): ReadonlyArray<RPC> {
    return this._frameRPCBuffer;
  }
}

type InputDrainerFn = (addRPC: AbstractInputProvider['addLocalRpc']) => void;
