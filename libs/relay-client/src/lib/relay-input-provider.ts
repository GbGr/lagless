import { AbstractInputProvider, RPC, type InputRegistry, type ECSConfig } from '@lagless/core';
// eslint-disable-next-line @nx/enforce-module-boundaries -- direct dep, used for input payload packing
import { InputBinarySchema } from '@lagless/binary';
import {
  ClockSync, InputDelayController,
  TickInputKind,
  type ServerHelloData, type StateResponseData,
  type FanoutData, type CancelInputData, type PongData, type TickInputData,
} from '@lagless/net-wire';
import { createLogger } from '@lagless/misc';
import type { RelayConnection } from './relay-connection.js';

const log = createLogger('RelayInputProvider');

/**
 * Input provider for relay-based multiplayer.
 *
 * Handles:
 * - Local input prediction (adds to history + sends to server)
 * - Remote input injection (from TickInputFanout)
 * - CancelInput rollback
 * - Clock synchronization
 * - Adaptive input delay
 * - State transfer for late-join
 */
export class RelayInputProvider extends AbstractInputProvider {
  public override playerSlot: number;

  private readonly _clockSync: ClockSync;
  private readonly _inputDelayController: InputDelayController;
  private readonly _serverHello: Promise<ServerHelloData>;
  private _resolveServerHello!: (data: ServerHelloData) => void;
  private _firstHelloReceived = false;
  private _connection: RelayConnection | null = null;
  private _rollbackCount = 0;
  private _maxReceivedServerTick = 0;

  /**
   * Minimum tick that needs rollback. Consumed (reset) each frame by
   * `getInvalidateRollbackTick()`.
   */
  private _invalidateRollbackTick: number | undefined = undefined;

  constructor(
    playerSlot: number,
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
  ) {
    super(ecsConfig, inputRegistry);
    this.playerSlot = playerSlot;
    this._clockSync = new ClockSync();
    this._inputDelayController = new InputDelayController(
      ecsConfig.minInputDelayTick,
      ecsConfig.maxInputDelayTick,
      ecsConfig.initialInputDelayTick,
    );
    this._serverHello = new Promise((resolve) => {
      this._resolveServerHello = resolve;
    });
  }

  // ─── Public Getters ─────────────────────────────────────

  public get clockSync(): ClockSync {
    return this._clockSync;
  }

  public get inputDelayController(): InputDelayController {
    return this._inputDelayController;
  }

  public get rollbackCount(): number {
    return this._rollbackCount;
  }

  public get maxReceivedServerTick(): number {
    return this._maxReceivedServerTick;
  }

  public override get verifiedTick(): number {
    return this._maxReceivedServerTick > 0 ? this._maxReceivedServerTick - 1 : -1;
  }

  /**
   * Resolves with the first ServerHello received from the server.
   * Await this before creating the ECSSimulation to ensure the
   * correct PRNG seed is available for ECSConfig.
   */
  public get serverHello(): Promise<ServerHelloData> {
    return this._serverHello;
  }

  // ─── Connection ─────────────────────────────────────────

  public get connection(): RelayConnection | null {
    return this._connection;
  }

  public setConnection(connection: RelayConnection): void {
    this._connection = connection;
  }

  // ─── AbstractInputProvider overrides ────────────────────

  public override getInvalidateRollbackTick(): number | undefined {
    const tick = this._invalidateRollbackTick;
    this._invalidateRollbackTick = undefined;
    return tick;
  }

  public override update(): void {
    super.update();
    this.sendBufferedInputs();
  }

  // ─── Network Event Handlers ─────────────────────────────
  // Called by RelayConnection (or directly in tests)

  /**
   * Handle ServerHello from server.
   *
   * First call: resolves the `serverHello` promise so the game client
   * can create ECSConfig with the correct seed before constructing the simulation.
   *
   * Subsequent calls (reconnect): syncs the simulation clock to the
   * server's tick so client inputs are not rejected as TooOld.
   */
  public handleServerHello(data: ServerHelloData): void {
    if (!this._firstHelloReceived) {
      this._firstHelloReceived = true;
      this._resolveServerHello(data);
      return;
    }

    // Reconnect: sync clock only (state transfer will overwrite everything)
    this._syncClockToServer(data);
  }

  /**
   * Handle TickInputFanout from server.
   * Adds remote inputs to history, triggers rollback if needed.
   */
  public handleTickInputFanout(data: FanoutData): void {
    this._maxReceivedServerTick = Math.max(this._maxReceivedServerTick, data.serverTick);
    const currentTick = this._simulation?.tick ?? 0;

    for (const input of data.inputs) {
      // Skip our own client inputs — already in history from prediction
      if (input.kind === TickInputKind.Client && input.playerSlot === this.playerSlot) {
        log.debug(`Fanout SKIP own: tick=${input.tick} slot=${input.playerSlot} seq=${input.seq}`);
        continue;
      }

      const rpc = this.tickInputToRPC(input);
      this.addRemoteRpc(rpc);
      const needsRollback = input.tick <= currentTick;
      log.debug(`Fanout REMOTE: inputId=${rpc.inputId} tick=${input.tick} slot=${input.playerSlot} kind=${input.kind} seq=${input.seq} localTick=${currentTick} rollback=${needsRollback}`);

      // If remote input is for a tick we already simulated → need rollback
      if (needsRollback) {
        this.requestRollback(input.tick);
      }
    }

    // NOTE: We intentionally do NOT feed PhaseNudger from fanout's serverTick.
    // The fanout serverTick is captured before any LatencySimulator delay,
    // making it stale by the full server→client latency. This creates a
    // systematic underestimate that conflicts with the more accurate Pong-based
    // hint (which has RTT measurement), causing periodic ~1Hz clock oscillation
    // visible as visual jitter. Pong-only nudging is sufficient — it fires
    // every 1s and converges within 3-5 samples.
  }

  /**
   * Handle CancelInput from server.
   * Removes the rejected input and triggers rollback.
   */
  public handleCancelInput(data: CancelInputData): void {
    const reasonNames = ['TooOld', 'TooFarFuture', 'InvalidSlot', 'Rejected'];
    log.warn(
      `CANCEL received: tick=${data.tick} seq=${data.seq} slot=${data.playerSlot} reason=${reasonNames[data.reason] ?? data.reason}`
    );

    this.removeRpcAt(data.playerSlot, data.tick, data.seq);
    this.requestRollback(data.tick);
  }

  /**
   * Handle Pong from server.
   * Updates clock sync, corrects clock drift, and adjusts input delay.
   */
  public handlePong(data: PongData): void {
    this._maxReceivedServerTick = Math.max(this._maxReceivedServerTick, data.sTick);
    const clientReceiveMs = performance.now();
    const becameReady = this._clockSync.updateFromPong(clientReceiveMs, data);

    if (becameReady && this._simulation) {
      this._simulation.clock.phaseNudger.activate();
    }

    // Correct clock drift using server tick from Pong
    if (this._simulation) {
      const rtt = clientReceiveMs - data.cSend;
      const oneWayTicks = Math.round((rtt / 2) / this._frameLength);
      const estimatedServerTick = data.sTick + oneWayTicks;
      const localTargetTick = Math.floor(this._simulation.clock.accumulatedTime / this._frameLength);
      const drift = estimatedServerTick - localTargetTick;

      if (this._simulation.clock.phaseNudger.isActive) {
        // PhaseNudger active: feed it server tick hints from Pong
        // (breaks deadlock where rejected inputs → no fanout → no hints)
        this._simulation.clock.phaseNudger.onServerTickHint(
          estimatedServerTick,
          this._simulation.tick,
        );
      } else if (Math.abs(drift) > 1) {
        // PhaseNudger not yet active: hard sync if drifted more than 1 tick
        const correctionMs = drift * this._frameLength;
        log.info(`Pong clock correction: drift=${drift} ticks, localTarget=${localTargetTick} estServer=${estimatedServerTick} rtt=${rtt.toFixed(1)}ms`);
        this._simulation.clock.setAccumulatedTime(
          this._simulation.clock.accumulatedTime + correctionMs,
        );
      }
    }

    // Recompute input delay based on network conditions
    if (this._clockSync.isReady) {
      const newDelay = this._inputDelayController.recompute(
        this._frameLength,
        this._clockSync.rttEwmaMs,
        this._clockSync.jitterEwmaMs,
      );
      this.setInputDelay(newDelay);
    }
  }

  /**
   * Handle StateRequest from server (for late-join state transfer).
   * Exports current simulation state and sends to server.
   */
  public handleStateRequest(requestId: number): void {
    if (!this._simulation) {
      log.warn('StateRequest received but simulation not initialized');
      return;
    }

    const state = this._simulation.exportStateForTransfer();
    const tick = this._simulation.tick;
    const hash = this._simulation.mem.getHash();

    log.info(`Responding to StateRequest #${requestId}: tick=${tick}, hash=0x${hash.toString(16)}, size=${state.byteLength}`);

    this._connection?.sendStateResponse({
      requestId,
      tick,
      hash,
      state,
    });
  }

  /**
   * Handle StateResponse from server (reconnect state transfer).
   * Applies the received state to the simulation and resets all provider state.
   */
  public handleStateResponse(data: StateResponseData): void {
    if (!this._simulation) {
      log.warn('StateResponse received but simulation not initialized');
      return;
    }

    log.info(`State transfer: tick=${data.tick}, hash=0x${data.hash.toString(16)}, size=${data.state.byteLength}`);

    this._simulation.applyStateFromTransfer(data.state, data.tick);
    this._rpcHistory.clear();
    this._invalidateRollbackTick = undefined;
    this._maxReceivedServerTick = 0;
    this._clockSync.reset();
    this._currentInputDelay = this.ecsConfig.initialInputDelayTick;
    this.resetSequences();
  }

  // ─── Private ──────────────────────────────────────────

  /**
   * Sync the simulation clock to the server's tick.
   * Used on reconnect — the state transfer will overwrite everything else.
   */
  private _syncClockToServer(data: ServerHelloData): void {
    if (!this._simulation) return;

    const beforeTick = this._simulation.tick;
    this._simulation.clock.setAccumulatedTime(data.serverTick * this._frameLength);
    log.info(`Clock synced: beforeTick=${beforeTick} → serverTick=${data.serverTick} (${(data.serverTick * this._frameLength).toFixed(0)}ms) playerSlot=${this.playerSlot}`);
  }

  /**
   * Send this frame's local inputs to the server as a single batch.
   */
  private sendBufferedInputs(): void {
    if (!this._connection) return;

    const buffer = this.getFrameRPCBuffer();
    if (buffer.length === 0) return;

    const inputs: TickInputData[] = [];
    for (const rpc of buffer) {
      log.debug(`SEND: inputId=${rpc.inputId} tick=${rpc.meta.tick} slot=${rpc.meta.playerSlot} seq=${rpc.meta.seq} simTick=${this._simulation?.tick ?? '?'}`);
      inputs.push({
        tick: rpc.meta.tick,
        playerSlot: rpc.meta.playerSlot,
        seq: rpc.meta.seq,
        kind: TickInputKind.Client,
        payload: this.packRpcPayload(rpc),
      });
    }

    log.debug(`SEND BATCH: ${inputs.length} inputs, wsOpen=${this._connection.isConnected}`);
    this._connection.sendTickInputBatch(inputs);
  }

  /**
   * Convert a TickInputData (from network) to an RPC (for history).
   */
  private tickInputToRPC(input: TickInputData): RPC {
    // Unpack the payload to get inputId, ordinal, and values
    // The payload is an InputBinarySchema-packed batch
    const unpacked = this.unpackInputPayload(input.payload);

    return new RPC(
      unpacked.inputId,
      {
        tick: input.tick,
        seq: input.seq,
        ordinal: unpacked.ordinal,
        playerSlot: input.playerSlot,
      },
      unpacked.values,
    );
  }

  /**
   * Pack an RPC's data into binary payload for network transmission.
   */
  private packRpcPayload(rpc: RPC): Uint8Array {
    const buffer = InputBinarySchema.packBatch(this.inputRegistry, [{
      inputId: rpc.inputId,
      ordinal: rpc.meta.ordinal,
      values: rpc.data as Record<string, number | ArrayLike<number>>,
    }]);
    return new Uint8Array(buffer);
  }

  /**
   * Unpack binary payload into input data.
   */
  private unpackInputPayload(payload: Uint8Array): {
    inputId: number;
    ordinal: number;
    values: Record<string, number | import('@lagless/binary').TypedArray>;
  } {
    const unpacked = InputBinarySchema.unpackBatch(this.inputRegistry, payload.buffer as ArrayBuffer);

    if (unpacked.length !== 1) {
      throw new Error(`Expected 1 input in payload, got ${unpacked.length}`);
    }

    return unpacked[0];
  }

  /**
   * Request a rollback to a specific tick.
   * Keeps the minimum (earliest) tick that needs rollback.
   */
  private requestRollback(tick: number): void {
    this._rollbackCount++;
    if (this._invalidateRollbackTick === undefined || tick < this._invalidateRollbackTick) {
      this._invalidateRollbackTick = tick;
    }
  }
}
