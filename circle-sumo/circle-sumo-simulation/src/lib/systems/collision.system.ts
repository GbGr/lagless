import { ECSSystem, IECSSystem, EntitiesManager } from '@lagless/core';
import {
  SumoCharacterFilter,
  Transform2d,
  Velocity2d,
  CircleBody,
  LastHit,
  LastAssist,
} from '../schema/code-gen/index.js';
import { HighImpactSignal } from '../signals/index.js';

// How aggressively we separate overlapping players (0..1).
// 0 = no positional fix, 1 = full separation in one step.
const COLLISION_POSITION_CORRECTION_FACTOR = 0.8;

// Default restitution (bounciness) for player vs player.
// 0 = perfectly inelastic (sticky), 1 = fully elastic (bouncy).
const COLLISION_DEFAULT_RESTITUTION = 0.25;

// Minimal distance to treat circles as "non-zero distance" and avoid div-by-zero.
const COLLISION_MIN_DISTANCE_EPSILON = 1e-4;

// Minimal absolute relative speed along the collision normal
// to treat the collision as a meaningful "hit".
const HIT_MIN_RELATIVE_SPEED = 0.05;

// Minimal impulse magnitude to register a hit (knockback strength threshold).
const HIT_MIN_IMPULSE = 0.03;

@ECSSystem()
export class CollisionSystem implements IECSSystem {
  constructor(
    private readonly _SumoCharacterFilter: SumoCharacterFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _Velocity2d: Velocity2d,
    private readonly _CircleBody: CircleBody,
    private readonly _LastHit: LastHit,
    private readonly _LastAssist: LastAssist,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _HighImpactSignal: HighImpactSignal,
  ) {}

  public update(tick: number): void {
    const entities: number[] = [];
    for (const entity of this._SumoCharacterFilter) {
      entities.push(entity);
    }

    const count = entities.length;
    if (count <= 1) {
      return;
    }

    const posX = this._Transform2d.unsafe.positionX;
    const posY = this._Transform2d.unsafe.positionY;

    const velX = this._Velocity2d.unsafe.velocityX;
    const velY = this._Velocity2d.unsafe.velocityY;

    const radius = this._CircleBody.unsafe.radius;
    const mass = this._CircleBody.unsafe.mass;

    for (let i = 0; i < count; i++) {
      const entityA = entities[i];

      const ax = posX[entityA];
      const ay = posY[entityA];
      const rA = radius[entityA];
      const mA = mass[entityA] > 0 ? mass[entityA] : 1;

      const vAxBefore = velX[entityA];
      const vAyBefore = velY[entityA];

      for (let j = i + 1; j < count; j++) {
        const entityB = entities[j];

        const bx = posX[entityB];
        const by = posY[entityB];
        const rB = radius[entityB];
        const mB = mass[entityB] > 0 ? mass[entityB] : 1;

        const dx = bx - ax;
        const dy = by - ay;

        const dist = Math.hypot(dx, dy);
        const sumR = rA + rB;

        if (dist >= sumR || dist < COLLISION_MIN_DISTANCE_EPSILON) {
          continue;
        }

        const nx = dx / dist;
        const ny = dy / dist;

        const penetration = sumR - dist;

        const invMassA = mA > 0 ? 1 / mA : 0;
        const invMassB = mB > 0 ? 1 / mB : 0;
        const invMassSum = invMassA + invMassB;

        if (invMassSum === 0) {
          continue;
        }

        const correction = penetration * COLLISION_POSITION_CORRECTION_FACTOR;
        const corrAx = -nx * correction * (invMassA / invMassSum);
        const corrAy = -ny * correction * (invMassA / invMassSum);
        const corrBx =  nx * correction * (invMassB / invMassSum);
        const corrBy =  ny * correction * (invMassB / invMassSum);

        posX[entityA] += corrAx;
        posY[entityA] += corrAy;
        posX[entityB] += corrBx;
        posY[entityB] += corrBy;

        const vBxBefore = velX[entityB];
        const vByBefore = velY[entityB];

        const rvx = vBxBefore - vAxBefore;
        const rvy = vByBefore - vAyBefore;

        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal > 0) {
          continue;
        }

        const jImpulse = -(1 + COLLISION_DEFAULT_RESTITUTION) * velAlongNormal / invMassSum;

        const impulseX = jImpulse * nx;
        const impulseY = jImpulse * ny;

        velX[entityA] -= impulseX * invMassA;
        velY[entityA] -= impulseY * invMassA;

        velX[entityB] += impulseX * invMassB;
        velY[entityB] += impulseY * invMassB;

        const impulseMagnitude = Math.abs(jImpulse);
        const relativeSpeedAbs = Math.abs(velAlongNormal);

        if (impulseMagnitude < HIT_MIN_IMPULSE || relativeSpeedAbs < HIT_MIN_RELATIVE_SPEED) {
          console.log(`hit ignored: impulse=${impulseMagnitude}, speed=${relativeSpeedAbs}, HIT_MIN_IMPULSE=${HIT_MIN_IMPULSE}, HIT_MIN_RELATIVE_SPEED=${HIT_MIN_RELATIVE_SPEED}`);
          continue;
        }

        const speedAAlongN = Math.abs(vAxBefore * nx + vAyBefore * ny);
        const speedBAlongN = Math.abs(vBxBefore * nx + vByBefore * ny);

        let attacker = entityA;
        let victim = entityB;

        if (speedBAlongN > speedAAlongN) {
          attacker = entityB;
          victim = entityA;
        }

        const contactCenterX = ax + nx * rA;
        const contactCenterY = ay + ny * rA;

        this._HighImpactSignal.emit(tick, {
          power:  Math.min(1, impulseMagnitude * 1.5),
          x: contactCenterX,
          y: contactCenterY,
        });


        this.registerHit(attacker, victim, impulseMagnitude, tick);
      }
    }
  }

  private registerHit(attacker: number, victim: number, impulseMagnitude: number, tick: number): void {
    let hadPreviousHit = false;
    let previousAttacker = 0;
    let previousAtTick = 0;

    if (this._EntitiesManager.hasComponent(victim, LastHit)) {
      const hitCursor = this._LastHit.getCursor(victim);
      hadPreviousHit = true;
      previousAttacker = hitCursor.attackerEntity;
      previousAtTick = hitCursor.atTick;
    }

    if (hadPreviousHit && previousAttacker !== attacker) {
      if (!this._EntitiesManager.hasComponent(victim, LastAssist)) {
        this._EntitiesManager.addComponent(victim, LastAssist);
      }
      const assistCursor = this._LastAssist.getCursor(victim);
      assistCursor.hasAssister = 1;
      assistCursor.assisterEntity = previousAttacker;
      assistCursor.atTick = previousAtTick;
    }

    if (!this._EntitiesManager.hasComponent(victim, LastHit)) {
      this._EntitiesManager.addComponent(victim, LastHit);
    }

    const lastHitCursor = this._LastHit.getCursor(victim);
    lastHitCursor.hasAttacker = 1;
    lastHitCursor.attackerEntity = attacker;
    lastHitCursor.atTick = tick;
    lastHitCursor.impulse = impulseMagnitude;
  }
}
