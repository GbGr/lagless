import { ColliderEntityMap, UNMAPPED_ENTITY } from './collider-entity-map.js';

/** Minimal Rapier EventQueue interface (identical in 2D and 3D). */
export interface IRapierEventQueue {
  free(): void;
  drainCollisionEvents(f: (h1: number, h2: number, started: boolean) => void): void;
  drainContactForceEvents(f: (event: { collider1(): number; collider2(): number; totalForceMagnitude(): number; maxForceMagnitude(): number; maxForceDirection(): unknown }) => void): void;
  clear(): void;
}

/** Minimal world interface for checking sensor status during event drain. */
export interface IColliderSensorChecker {
  getCollider(handle: number): { isSensor(): boolean };
}

/** Factory interface for creating an EventQueue. */
export interface IEventQueueFactory {
  new (autoDrain: boolean): IRapierEventQueue;
}

const DEFAULT_CAPACITY = 64;

export class CollisionEventsBase {
  private readonly _eventQueue: IRapierEventQueue;

  // Pre-bound drain callbacks (zero allocation per tick)
  private readonly _drainCollisionCb: (h1: number, h2: number, started: boolean) => void;
  private readonly _drainForceCb: (event: { collider1(): number; collider2(): number; totalForceMagnitude(): number; maxForceMagnitude(): number; maxForceDirection(): unknown }) => void;

  // Transient references set during drain()
  private _currentEntityMap: ColliderEntityMap | null = null;
  private _currentWorld: IColliderSensorChecker | null = null;

  // Collision enter (solid bodies)
  private _collisionEnterA: Int32Array;
  private _collisionEnterB: Int32Array;
  private _collisionEnterCount = 0;

  // Collision exit (solid bodies)
  private _collisionExitA: Int32Array;
  private _collisionExitB: Int32Array;
  private _collisionExitCount = 0;

  // Sensor enter
  private _sensorEnterA: Int32Array;
  private _sensorEnterB: Int32Array;
  private _sensorEnterCount = 0;

  // Sensor exit
  private _sensorExitA: Int32Array;
  private _sensorExitB: Int32Array;
  private _sensorExitCount = 0;

  // Contact forces
  private _contactForceA: Int32Array;
  private _contactForceB: Int32Array;
  private _contactForceMagnitude: Float32Array;
  private _contactForceCount = 0;

  constructor(eventQueueFactory: IEventQueueFactory, initialCapacity: number = DEFAULT_CAPACITY) {
    this._eventQueue = new eventQueueFactory(false);

    this._collisionEnterA = new Int32Array(initialCapacity);
    this._collisionEnterB = new Int32Array(initialCapacity);
    this._collisionExitA = new Int32Array(initialCapacity);
    this._collisionExitB = new Int32Array(initialCapacity);
    this._sensorEnterA = new Int32Array(initialCapacity);
    this._sensorEnterB = new Int32Array(initialCapacity);
    this._sensorExitA = new Int32Array(initialCapacity);
    this._sensorExitB = new Int32Array(initialCapacity);
    this._contactForceA = new Int32Array(initialCapacity);
    this._contactForceB = new Int32Array(initialCapacity);
    this._contactForceMagnitude = new Float32Array(initialCapacity);

    // Pre-bind callbacks
    this._drainCollisionCb = (h1: number, h2: number, started: boolean): void => {
      const entityMap = this._currentEntityMap!;
      const world = this._currentWorld!;

      const e1 = entityMap.get(h1);
      const e2 = entityMap.get(h2);
      if (e1 === UNMAPPED_ENTITY || e2 === UNMAPPED_ENTITY) return;

      const c1 = world.getCollider(h1);
      const c2 = world.getCollider(h2);
      const c1Sensor = c1.isSensor();
      const c2Sensor = c2.isSensor();

      if (c1Sensor || c2Sensor) {
        // Convention: A = non-sensor entity, B = sensor entity
        const nonSensorE = c1Sensor ? e2 : e1;
        const sensorE = c1Sensor ? e1 : e2;
        if (started) {
          this._pushSensorEnter(nonSensorE, sensorE);
        } else {
          this._pushSensorExit(nonSensorE, sensorE);
        }
      } else {
        if (started) {
          this._pushCollisionEnter(e1, e2);
        } else {
          this._pushCollisionExit(e1, e2);
        }
      }
    };

    this._drainForceCb = (event: { collider1(): number; collider2(): number; totalForceMagnitude(): number; maxForceMagnitude(): number; maxForceDirection(): unknown }): void => {
      const entityMap = this._currentEntityMap!;
      const e1 = entityMap.get(event.collider1());
      const e2 = entityMap.get(event.collider2());
      if (e1 === UNMAPPED_ENTITY || e2 === UNMAPPED_ENTITY) return;
      this._pushContactForce(e1, e2, event.totalForceMagnitude());
    };
  }

  public get eventQueue(): IRapierEventQueue {
    return this._eventQueue;
  }

  /** Drain Rapier events into internal buffers. Clears previous events first. */
  public drain(entityMap: ColliderEntityMap, world: IColliderSensorChecker): void {
    this.clear();
    this._currentEntityMap = entityMap;
    this._currentWorld = world;

    this._eventQueue.drainCollisionEvents(this._drainCollisionCb);
    this._eventQueue.drainContactForceEvents(this._drainForceCb);

    this._currentEntityMap = null;
    this._currentWorld = null;
  }

  /** Clear all event buffers. */
  public clear(): void {
    this._collisionEnterCount = 0;
    this._collisionExitCount = 0;
    this._sensorEnterCount = 0;
    this._sensorExitCount = 0;
    this._contactForceCount = 0;
  }

  // --- Collision enter ---
  public get collisionEnterCount(): number { return this._collisionEnterCount; }
  public collisionEnterEntityA(index: number): number { return this._collisionEnterA[index]; }
  public collisionEnterEntityB(index: number): number { return this._collisionEnterB[index]; }

  // --- Collision exit ---
  public get collisionExitCount(): number { return this._collisionExitCount; }
  public collisionExitEntityA(index: number): number { return this._collisionExitA[index]; }
  public collisionExitEntityB(index: number): number { return this._collisionExitB[index]; }

  // --- Sensor enter ---
  public get sensorEnterCount(): number { return this._sensorEnterCount; }
  public sensorEnterEntityA(index: number): number { return this._sensorEnterA[index]; }
  public sensorEnterEntityB(index: number): number { return this._sensorEnterB[index]; }

  // --- Sensor exit ---
  public get sensorExitCount(): number { return this._sensorExitCount; }
  public sensorExitEntityA(index: number): number { return this._sensorExitA[index]; }
  public sensorExitEntityB(index: number): number { return this._sensorExitB[index]; }

  // --- Contact forces ---
  public get contactForceCount(): number { return this._contactForceCount; }
  public contactForceEntityA(index: number): number { return this._contactForceA[index]; }
  public contactForceEntityB(index: number): number { return this._contactForceB[index]; }
  public contactForceMagnitude(index: number): number { return this._contactForceMagnitude[index]; }

  public dispose(): void {
    this._eventQueue.free();
  }

  // --- Internal push methods with auto-grow ---

  private _pushCollisionEnter(a: number, b: number): void {
    const idx = this._collisionEnterCount++;
    if (idx >= this._collisionEnterA.length) {
      this._collisionEnterA = _grow(this._collisionEnterA);
      this._collisionEnterB = _grow(this._collisionEnterB);
    }
    this._collisionEnterA[idx] = a;
    this._collisionEnterB[idx] = b;
  }

  private _pushCollisionExit(a: number, b: number): void {
    const idx = this._collisionExitCount++;
    if (idx >= this._collisionExitA.length) {
      this._collisionExitA = _grow(this._collisionExitA);
      this._collisionExitB = _grow(this._collisionExitB);
    }
    this._collisionExitA[idx] = a;
    this._collisionExitB[idx] = b;
  }

  private _pushSensorEnter(nonSensor: number, sensor: number): void {
    const idx = this._sensorEnterCount++;
    if (idx >= this._sensorEnterA.length) {
      this._sensorEnterA = _grow(this._sensorEnterA);
      this._sensorEnterB = _grow(this._sensorEnterB);
    }
    this._sensorEnterA[idx] = nonSensor;
    this._sensorEnterB[idx] = sensor;
  }

  private _pushSensorExit(nonSensor: number, sensor: number): void {
    const idx = this._sensorExitCount++;
    if (idx >= this._sensorExitA.length) {
      this._sensorExitA = _grow(this._sensorExitA);
      this._sensorExitB = _grow(this._sensorExitB);
    }
    this._sensorExitA[idx] = nonSensor;
    this._sensorExitB[idx] = sensor;
  }

  private _pushContactForce(a: number, b: number, magnitude: number): void {
    const idx = this._contactForceCount++;
    if (idx >= this._contactForceA.length) {
      this._contactForceA = _grow(this._contactForceA);
      this._contactForceB = _grow(this._contactForceB);
      this._contactForceMagnitude = _growFloat(this._contactForceMagnitude);
    }
    this._contactForceA[idx] = a;
    this._contactForceB[idx] = b;
    this._contactForceMagnitude[idx] = magnitude;
  }
}

function _grow(arr: Int32Array): Int32Array {
  const next = new Int32Array(arr.length * 2);
  next.set(arr);
  return next;
}

function _growFloat(arr: Float32Array): Float32Array {
  const next = new Float32Array(arr.length * 2);
  next.set(arr);
  return next;
}
