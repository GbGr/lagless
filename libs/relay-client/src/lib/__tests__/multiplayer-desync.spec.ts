/**
 * Multiplayer desync reproduction test.
 *
 * Simulates two clients exchanging intensive MoveInput RPCs with
 * 500ms simulated network delay (~30 ticks at 60fps). Each frame both
 * clients generate an input; remote inputs arrive late, triggering rollbacks.
 *
 * A simple system consumes MoveInput RPCs and advances the deterministic
 * PRNG per input — so different input sets or ordering at any tick will
 * produce divergent ECS hashes.
 *
 * After all in-flight RPCs are delivered and both sims catch up, the ECS
 * hashes must be identical.
 */
import { describe, it, expect } from 'vitest';
import { RelayInputProvider } from '../relay-input-provider.js';
import {
  ECSConfig,
  ECSSimulation,
  InputRegistry,
  RPC,
  type ECSDeps,
  type IAbstractInputConstructor,
  type IECSSystem,
} from '@lagless/core';
import { TickInputKind, type FanoutData, type TickInputData } from '@lagless/net-wire';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { InputBinarySchema, FieldType } from '@lagless/binary';

// ─── Test Input Definitions ────────────────────────────────

class TestMoveInput {
  static readonly id = 1;
  readonly id = 1;
  readonly byteLength = 8;
  readonly fields = [
    { name: 'directionX', type: FieldType.Float32, isArray: false, byteLength: 4 },
    { name: 'directionY', type: FieldType.Float32, isArray: false, byteLength: 4 },
  ] as const;
  readonly schema!: { directionX: number; directionY: number };
}

const TestMoveInputCtor = TestMoveInput as unknown as IAbstractInputConstructor;
const inputRegistry = new InputRegistry([TestMoveInputCtor]);

// ─── Helpers ───────────────────────────────────────────────

const minimalDeps: ECSDeps = {
  components: [],
  singletons: [],
  filters: [],
  inputs: [],
  playerResources: [],
};

/** Pack an RPC's data into binary payload (mirrors RelayInputProvider.packRpcPayload). */
function packRpc(rpc: RPC): Uint8Array {
  const buffer = InputBinarySchema.packBatch(inputRegistry, [{
    inputId: rpc.inputId,
    ordinal: rpc.meta.ordinal,
    values: rpc.data as Record<string, number>,
  }]);
  return new Uint8Array(buffer);
}

/** Convert a local RPC to a TickInputData suitable for handleTickInputFanout. */
function rpcToTickInput(rpc: RPC): TickInputData {
  return {
    tick: rpc.meta.tick,
    playerSlot: rpc.meta.playerSlot,
    seq: rpc.meta.seq,
    kind: TickInputKind.Client,
    payload: packRpc(rpc),
  };
}

// ─── Client wrapper ────────────────────────────────────────

interface InFlightRpc {
  deliverAtFrame: number;
  tickInput: TickInputData;
  /** The server tick to report in the fanout. */
  serverTick: number;
}

class TestClient {
  readonly provider: RelayInputProvider;
  readonly sim: ECSSimulation;
  readonly config: ECSConfig;
  readonly slot: number;

  private _generateInputs = true;

  constructor(slot: number, config: ECSConfig) {
    this.slot = slot;
    this.config = config;
    this.provider = new RelayInputProvider(slot, config, inputRegistry);
    this.sim = new ECSSimulation(config, minimalDeps, this.provider);
    this.provider.init(this.sim);

    // System: consume MoveInput RPCs, advance PRNG per input.
    // Different input sets at a tick → different PRNG state → different hash.
    const sim = this.sim;
    const provider = this.provider;
    const system: IECSSystem = {
      update(tick: number) {
        const rpcs = provider.collectTickRPCs(tick, TestMoveInputCtor);
        for (let i = 0; i < rpcs.length; i++) {
          // Advance PRNG — state lives in ArrayBuffer, survives snapshot/rollback
          sim.mem.prngManager.getFloat();
        }
      },
    };
    sim.registerSystems([system]);

    // Drainer: generate MoveInput every frame with slot-dependent directions
    provider.drainInputs((addRPC) => {
      if (!this._generateInputs) return;
      const t = sim.tick;
      const dirX = Math.fround(Math.sin(t * 0.3 + slot * 100));
      const dirY = Math.fround(Math.cos(t * 0.3 + slot * 100));
      addRPC(TestMoveInputCtor as any, { directionX: dirX, directionY: dirY });
    });

    sim.start();
  }

  stopGenerating() {
    this._generateInputs = false;
  }

  /** Advance simulation by one frame. */
  step() {
    this.sim.update(this.config.frameLength);
  }

  /** Collect locally-generated RPCs from this frame (call right after step()). */
  collectSentRpcs(): ReadonlyArray<RPC> {
    return this.provider.getFrameRPCBuffer();
  }
}

// ─── Network simulation ───────────────────────────────────

class NetworkSim {
  private _queue: InFlightRpc[] = [];
  private _frame = 0;

  constructor(private readonly _delayFrames: number) {}

  get frame() { return this._frame; }

  /** Queue an RPC for delayed delivery to a target client. */
  enqueue(rpc: RPC, serverTick: number) {
    this._queue.push({
      deliverAtFrame: this._frame + this._delayFrames,
      tickInput: rpcToTickInput(rpc),
      serverTick,
    });
  }

  /** Deliver all RPCs that have matured to the target client. */
  deliver(target: TestClient) {
    const due: InFlightRpc[] = [];
    const remaining: InFlightRpc[] = [];

    for (const item of this._queue) {
      if (item.deliverAtFrame <= this._frame) {
        due.push(item);
      } else {
        remaining.push(item);
      }
    }
    this._queue = remaining;

    if (due.length === 0) return;

    // Group by serverTick to batch into fanouts (like real server does)
    const byServerTick = new Map<number, TickInputData[]>();
    for (const item of due) {
      let arr = byServerTick.get(item.serverTick);
      if (!arr) {
        arr = [];
        byServerTick.set(item.serverTick, arr);
      }
      arr.push(item.tickInput);
    }

    for (const [serverTick, inputs] of byServerTick) {
      const fanout: FanoutData = { serverTick, inputs };
      target.provider.handleTickInputFanout(fanout);
    }
  }

  tick() {
    this._frame++;
  }

  get pending() {
    return this._queue.length;
  }
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe('Multiplayer desync reproduction', () => {
  it('two clients with intensive input and 500ms delay should converge', () => {
    const config = new ECSConfig({
      snapshotRate: 1,
      snapshotHistorySize: 200,
      initialInputDelayTick: 3,
      minInputDelayTick: 1,
      maxInputDelayTick: 12,
    });

    const clientA = new TestClient(0, config);
    const clientB = new TestClient(1, config);

    // 500ms delay ≈ 30 frames at 60fps
    const DELAY_FRAMES = 30;
    const netAtoB = new NetworkSim(DELAY_FRAMES); // A's inputs → B
    const netBtoA = new NetworkSim(DELAY_FRAMES); // B's inputs → A

    const ACTIVE_FRAMES = 120; // frames with input generation
    const DRAIN_FRAMES = 60;   // extra frames to drain in-flight RPCs

    // ── Phase 1: Active input generation ──
    for (let frame = 0; frame < ACTIVE_FRAMES; frame++) {
      // Deliver any matured RPCs
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);

      // Both clients step one frame
      clientA.step();
      clientB.step();

      // Collect sent RPCs and queue for delayed delivery
      const serverTick = Math.max(clientA.sim.tick, clientB.sim.tick);

      for (const rpc of clientA.collectSentRpcs()) {
        netAtoB.enqueue(rpc, serverTick);
      }
      for (const rpc of clientB.collectSentRpcs()) {
        netBtoA.enqueue(rpc, serverTick);
      }

      netAtoB.tick();
      netBtoA.tick();
    }

    // ── Phase 2: Stop generating, drain in-flight RPCs ──
    clientA.stopGenerating();
    clientB.stopGenerating();

    for (let frame = 0; frame < DRAIN_FRAMES; frame++) {
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);

      clientA.step();
      clientB.step();

      // No new inputs, but still tick the network
      netAtoB.tick();
      netBtoA.tick();
    }

    // All in-flight RPCs should be delivered
    expect(netAtoB.pending).toBe(0);
    expect(netBtoA.pending).toBe(0);

    // ── Phase 3: A few more frames to let re-simulation settle ──
    for (let i = 0; i < 10; i++) {
      clientA.step();
      clientB.step();
    }

    // ── Verify convergence ──
    expect(clientA.sim.tick).toBe(clientB.sim.tick);
    expect(clientA.sim.mem.getHash()).toBe(clientB.sim.mem.getHash());
  });

  it('should converge with asymmetric delay (10 vs 50 frames)', () => {
    const config = new ECSConfig({
      snapshotRate: 1,
      snapshotHistorySize: 200,
      initialInputDelayTick: 3,
      minInputDelayTick: 1,
      maxInputDelayTick: 12,
    });

    const clientA = new TestClient(0, config);
    const clientB = new TestClient(1, config);

    const netAtoB = new NetworkSim(10);
    const netBtoA = new NetworkSim(50);

    const ACTIVE_FRAMES = 100;
    const DRAIN_FRAMES = 80;

    for (let frame = 0; frame < ACTIVE_FRAMES; frame++) {
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);

      clientA.step();
      clientB.step();

      const serverTick = Math.max(clientA.sim.tick, clientB.sim.tick);

      for (const rpc of clientA.collectSentRpcs()) {
        netAtoB.enqueue(rpc, serverTick);
      }
      for (const rpc of clientB.collectSentRpcs()) {
        netBtoA.enqueue(rpc, serverTick);
      }

      netAtoB.tick();
      netBtoA.tick();
    }

    clientA.stopGenerating();
    clientB.stopGenerating();

    for (let frame = 0; frame < DRAIN_FRAMES; frame++) {
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);
      clientA.step();
      clientB.step();
      netAtoB.tick();
      netBtoA.tick();
    }

    expect(netAtoB.pending).toBe(0);
    expect(netBtoA.pending).toBe(0);

    for (let i = 0; i < 10; i++) {
      clientA.step();
      clientB.step();
    }

    expect(clientA.sim.tick).toBe(clientB.sim.tick);
    expect(clientA.sim.mem.getHash()).toBe(clientB.sim.mem.getHash());
  });

  it('should converge with multiple inputs per frame', () => {
    const config = new ECSConfig({
      snapshotRate: 1,
      snapshotHistorySize: 200,
      initialInputDelayTick: 3,
      minInputDelayTick: 1,
      maxInputDelayTick: 12,
    });

    const clientA = new TestClient(0, config);
    const clientB = new TestClient(1, config);

    // Override drainer — add TWO RPCs per frame
    // First, remove the default drainer by creating new clients...
    // Actually, we can just add another drainer on top
    clientA.provider.drainInputs((addRPC) => {
      const t = clientA.sim.tick;
      const dirX = Math.fround(Math.cos(t * 0.7));
      const dirY = Math.fround(Math.sin(t * 0.7));
      addRPC(TestMoveInputCtor as any, { directionX: dirX, directionY: dirY });
    });
    clientB.provider.drainInputs((addRPC) => {
      const t = clientB.sim.tick;
      const dirX = Math.fround(Math.cos(t * 0.7 + 50));
      const dirY = Math.fround(Math.sin(t * 0.7 + 50));
      addRPC(TestMoveInputCtor as any, { directionX: dirX, directionY: dirY });
    });

    const DELAY = 30;
    const netAtoB = new NetworkSim(DELAY);
    const netBtoA = new NetworkSim(DELAY);

    const ACTIVE_FRAMES = 80;
    const DRAIN_FRAMES = 60;

    for (let frame = 0; frame < ACTIVE_FRAMES; frame++) {
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);
      clientA.step();
      clientB.step();

      const serverTick = Math.max(clientA.sim.tick, clientB.sim.tick);
      for (const rpc of clientA.collectSentRpcs()) {
        netAtoB.enqueue(rpc, serverTick);
      }
      for (const rpc of clientB.collectSentRpcs()) {
        netBtoA.enqueue(rpc, serverTick);
      }
      netAtoB.tick();
      netBtoA.tick();
    }

    clientA.stopGenerating();
    clientB.stopGenerating();

    for (let frame = 0; frame < DRAIN_FRAMES; frame++) {
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);
      clientA.step();
      clientB.step();
      netAtoB.tick();
      netBtoA.tick();
    }

    expect(netAtoB.pending).toBe(0);
    expect(netBtoA.pending).toBe(0);

    for (let i = 0; i < 10; i++) {
      clientA.step();
      clientB.step();
    }

    expect(clientA.sim.tick).toBe(clientB.sim.tick);
    expect(clientA.sim.mem.getHash()).toBe(clientB.sim.mem.getHash());
  });

  it('should converge with staggered start (player B joins late)', () => {
    const config = new ECSConfig({
      snapshotRate: 1,
      snapshotHistorySize: 200,
      initialInputDelayTick: 3,
      minInputDelayTick: 1,
      maxInputDelayTick: 12,
    });

    const clientA = new TestClient(0, config);

    const DELAY = 30;
    const netAtoB = new NetworkSim(DELAY);
    const netBtoA = new NetworkSim(DELAY);

    // Client A runs alone for 40 frames
    const SOLO_FRAMES = 40;
    const soloRpcs: Array<{ rpc: RPC; serverTick: number }> = [];

    for (let frame = 0; frame < SOLO_FRAMES; frame++) {
      clientA.step();
      const serverTick = clientA.sim.tick;
      for (const rpc of clientA.collectSentRpcs()) {
        soloRpcs.push({ rpc, serverTick });
      }
      netAtoB.tick();
      netBtoA.tick();
    }

    // Client B joins — starts at tick 0 and will eventually catch up
    const clientB = new TestClient(1, config);

    // Queue all of A's solo RPCs for delivery to B (as if they arrived now)
    for (const { rpc, serverTick } of soloRpcs) {
      netAtoB.enqueue(rpc, serverTick);
    }

    // Continue with both clients
    const ACTIVE_FRAMES = 80;
    const DRAIN_FRAMES = 80;

    for (let frame = 0; frame < ACTIVE_FRAMES; frame++) {
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);

      clientA.step();
      clientB.step();

      const serverTick = Math.max(clientA.sim.tick, clientB.sim.tick);
      for (const rpc of clientA.collectSentRpcs()) {
        netAtoB.enqueue(rpc, serverTick);
      }
      for (const rpc of clientB.collectSentRpcs()) {
        netBtoA.enqueue(rpc, serverTick);
      }
      netAtoB.tick();
      netBtoA.tick();
    }

    clientA.stopGenerating();
    clientB.stopGenerating();

    for (let frame = 0; frame < DRAIN_FRAMES; frame++) {
      netBtoA.deliver(clientA);
      netAtoB.deliver(clientB);
      clientA.step();
      clientB.step();
      netAtoB.tick();
      netBtoA.tick();
    }

    expect(netAtoB.pending).toBe(0);
    expect(netBtoA.pending).toBe(0);

    // Sync clocks: advance the behind client to match
    while (clientB.sim.tick < clientA.sim.tick) {
      clientB.step();
    }
    while (clientA.sim.tick < clientB.sim.tick) {
      clientA.step();
    }

    // A few more frames to settle
    for (let i = 0; i < 10; i++) {
      clientA.step();
      clientB.step();
    }

    expect(clientA.sim.tick).toBe(clientB.sim.tick);
    expect(clientA.sim.mem.getHash()).toBe(clientB.sim.mem.getHash());
  });
});
