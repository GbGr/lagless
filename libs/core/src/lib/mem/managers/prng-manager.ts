import { MemoryTracker } from '@lagless/misc';
import { ECSConfig } from '../../ecs-config.js';
import { IAbstractMemory } from '../abstract-memory.interface.js';

const STATE_TYPED_ARRAY_LENGTH = 4;

export class PRNG {
  constructor(private readonly _PRNGManager: PRNGManager) {}

  public getFloat(): number {
    return this._PRNGManager.getFloat();
  }

  public getRandomInt(from: number, to: number): number {
    return this._PRNGManager.getRandomInt(from, to);
  }

  public getRandomIntInclusive(from: number, to: number): number {
    return this._PRNGManager.getRandomIntInclusive(from, to);
  }
}

export class PRNGManager implements IAbstractMemory {
  private _state!: Uint32Array;
  public readonly prng: PRNG;

  constructor(
    private readonly _ECSConfig: ECSConfig,
  ) {
    this.prng = new PRNG(this);
  }

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    this._state = new Uint32Array(arrayBuffer, tracker.ptr, STATE_TYPED_ARRAY_LENGTH);
    tracker.add(this._state.byteLength);

    this.seed(this._ECSConfig.seed);
  }

  public calculateSize(tracker: MemoryTracker): void {
    tracker.add(Uint32Array.BYTES_PER_ELEMENT * STATE_TYPED_ARRAY_LENGTH);
  }

  public getFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  public getRandomInt(from: number, to: number): number {
    if (to <= from) throw new Error(`Invalid range: from (${from}) >= to (${to})`);
    return Math.floor(this.getFloat() * (to - from)) + from;
  }

  public getRandomIntInclusive(from: number, to: number): number {
    if (to < from) throw new Error(`Invalid range: from (${from}) > to (${to})`);
    return Math.floor(this.getFloat() * (to - from + 1)) + from;
  }

  private seed(seed: number) {
    let z = seed >>> 0;
    for (let i = 0; i < STATE_TYPED_ARRAY_LENGTH; i++) {
      z = (z + 0x9E3779B9) >>> 0;
      let t = z;
      t ^= t >>> 16;
      t = Math.imul(t, 0x85ebca6b);
      t ^= t >>> 13;
      t = Math.imul(t, 0xc2b2ae35);
      t ^= t >>> 16;
      this._state[i] = t >>> 0;
    }
  }

  private nextUint32(): number {
    const s = this._state;

    const result = ((s[0] + s[3]) >>> 0) + s[0];

    const t = (s[1] << 9) >>> 0;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = (s[3] << 11 | s[3] >>> (32 - 11)) >>> 0;

    return result >>> 0;
  }
}
