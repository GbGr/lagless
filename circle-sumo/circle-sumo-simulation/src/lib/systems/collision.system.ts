import { ECSSystem, IECSSystem, EntitiesManager } from '@lagless/core';
import {
  SumoCharacterFilter,
  Transform2d,
  Velocity2d,
  CircleBody,
  LastHit,
  LastAssist,
} from '../schema/code-gen/index.js';

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
  ) {}

  public update(tick: number): void {
    // Collect entities into an array so we can do i/j loops with i < j
    const entities: number[] = [];
    for (const entity of this._SumoCharacterFilter) {
      entities.push(entity);
    }

    const count = entities.length;
    if (count <= 1) {
      return;
    }

    // Unsafe arrays for fast access without creating multiple cursors
    const posX = this._Transform2d.unsafe.positionX;
    const posY = this._Transform2d.unsafe.positionY;

    const velX = this._Velocity2d.unsafe.velocityX;
    const velY = this._Velocity2d.unsafe.velocityY;

    const radius = this._CircleBody.unsafe.radius;
    const mass = this._CircleBody.unsafe.mass;

    // Simple O(N^2) collision for small N (<= 8)
    for (let i = 0; i < count; i++) {
      const entityA = entities[i];

      const ax = posX[entityA];
      const ay = posY[entityA];
      const rA = radius[entityA];
      const mA = mass[entityA] > 0 ? mass[entityA] : 1;

      // Cache pre-collision velocities for A
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

        // No collision or perfectly overlapping centers (skip if too close to zero)
        if (dist >= sumR || dist < COLLISION_MIN_DISTANCE_EPSILON) {
          continue;
        }

        // Normal from A to B
        const nx = dx / dist;
        const ny = dy / dist;

        const penetration = sumR - dist;

        const invMassA = mA > 0 ? 1 / mA : 0;
        const invMassB = mB > 0 ? 1 / mB : 0;
        const invMassSum = invMassA + invMassB;

        if (invMassSum === 0) {
          continue;
        }

        // --- 1) Positional correction to resolve overlap ---
        // This prevents players from getting stuck deeply inside each other.
        const correction = penetration * COLLISION_POSITION_CORRECTION_FACTOR;
        const corrAx = -nx * correction * (invMassA / invMassSum);
        const corrAy = -ny * correction * (invMassA / invMassSum);
        const corrBx =  nx * correction * (invMassB / invMassSum);
        const corrBy =  ny * correction * (invMassB / invMassSum);

        posX[entityA] += corrAx;
        posY[entityA] += corrAy;
        posX[entityB] += corrBx;
        posY[entityB] += corrBy;

        // --- 2) Velocity impulse along the collision normal ---

        // Relative velocity: B - A (using *current* velocities, still pre-impulse)
        const vBxBefore = velX[entityB];
        const vByBefore = velY[entityB];

        const rvx = vBxBefore - vAxBefore;
        const rvy = vByBefore - vAyBefore;

        const velAlongNormal = rvx * nx + rvy * ny;

        // Already separating along the normal, no impulse needed
        if (velAlongNormal > 0) {
          continue;
        }

        // Scalar impulse magnitude along the normal
        const jImpulse = -(1 + COLLISION_DEFAULT_RESTITUTION) * velAlongNormal / invMassSum;

        const impulseX = jImpulse * nx;
        const impulseY = jImpulse * ny;

        // Apply impulses to velocities
        velX[entityA] -= impulseX * invMassA;
        velY[entityA] -= impulseY * invMassA;

        velX[entityB] += impulseX * invMassB;
        velY[entityB] += impulseY * invMassB;

        // --- 3) Register hit info (for KO attribution) ---

        // Compute magnitude of impulse and relative speed
        const impulseMagnitude = Math.abs(jImpulse);
        const relativeSpeedAbs = Math.abs(velAlongNormal);

        if (impulseMagnitude < HIT_MIN_IMPULSE || relativeSpeedAbs < HIT_MIN_RELATIVE_SPEED) {
          // Too weak or too soft collision to count as a "real hit"
          console.log(`hit ignored: impulse=${impulseMagnitude}, speed=${relativeSpeedAbs}, HIT_MIN_IMPULSE=${HIT_MIN_IMPULSE}, HIT_MIN_RELATIVE_SPEED=${HIT_MIN_RELATIVE_SPEED}`);
          continue;
        }

        // Compute per-player speed along the contact normal BEFORE collision
        const speedAAlongN = Math.abs(vAxBefore * nx + vAyBefore * ny);
        const speedBAlongN = Math.abs(vBxBefore * nx + vByBefore * ny);

        // Attacker is the one who had higher speed along the collision line
        let attacker = entityA;
        let victim = entityB;

        if (speedBAlongN > speedAAlongN) {
          attacker = entityB;
          victim = entityA;
        }

        this.registerHit(attacker, victim, impulseMagnitude, tick);
      }
    }
  }

  // Record hit data on victim: LastHit (and LastAssist if needed).
  private registerHit(attacker: number, victim: number, impulseMagnitude: number, tick: number): void {
    console.log(`registerHit(${attacker}, ${victim}, ${impulseMagnitude}, ${tick})`);
    // If victim already had a LastHit, we may turn that into LastAssist.
    let hadPreviousHit = false;
    let previousAttacker = 0;
    let previousAtTick = 0;

    if (this._EntitiesManager.hasComponent(victim, LastHit)) {
      const hitCursor = this._LastHit.getCursor(victim);
      hadPreviousHit = true;
      previousAttacker = hitCursor.attackerEntity;
      previousAtTick = hitCursor.atTick;
    }

    // If previous attacker exists and is different from the new one,
    // store it as LastAssist.
    if (hadPreviousHit && previousAttacker !== attacker) {
      if (!this._EntitiesManager.hasComponent(victim, LastAssist)) {
        this._EntitiesManager.addComponent(victim, LastAssist);
      }
      const assistCursor = this._LastAssist.getCursor(victim);
      assistCursor.hasAssister = 1;
      assistCursor.assisterEntity = previousAttacker;
      assistCursor.atTick = previousAtTick;
    }

    // Ensure victim has LastHit, then update with new attacker.
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

// import { ECSSystem, IECSSystem } from '@lagless/core';
// import {
//   SumoCharacterFilter,
//   Transform2d,
//   Velocity2d,
//   CircleBody,
// } from '../schema/code-gen/index.js';
//
// // How aggressively we separate overlapping players (0..1).
// // 0 = no positional fix, 1 = full separation in one step.
// const COLLISION_POSITION_CORRECTION_FACTOR = 0.8;
//
// // Default restitution (bounciness) for player vs player.
// // 0 = perfectly inelastic (sticky), 1 = fully elastic (bouncy).
// const COLLISION_DEFAULT_RESTITUTION = 0.25;
//
// // Minimal distance to treat circles as "non-zero distance" and avoid div-by-zero.
// const COLLISION_MIN_DISTANCE_EPSILON = 1e-4;
//
// @ECSSystem()
// export class CollisionSystem implements IECSSystem {
//   constructor(
//     private readonly _SumoCharacterFilter: SumoCharacterFilter,
//     private readonly _Transform2d: Transform2d,
//     private readonly _Velocity2d: Velocity2d,
//     private readonly _CircleBody: CircleBody,
//   ) {}
//
//   public update(): void {
//     // Collect entities into an array so we can do i/j loops with i < j
//     const entities: number[] = [];
//     for (const entity of this._SumoCharacterFilter) {
//       entities.push(entity);
//     }
//
//     const count = entities.length;
//     if (count <= 1) {
//       return;
//     }
//
//     // Unsafe arrays for fast access without creating multiple cursors
//     const posX = this._Transform2d.unsafe.positionX;
//     const posY = this._Transform2d.unsafe.positionY;
//
//     const velX = this._Velocity2d.unsafe.velocityX;
//     const velY = this._Velocity2d.unsafe.velocityY;
//
//     const radius = this._CircleBody.unsafe.radius;
//     const mass = this._CircleBody.unsafe.mass;
//     // If you later add restitution to CircleBody, you can also grab:
//     // const restitutionArr = (this._CircleBody.unsafe as any).restitution as number[] | undefined;
//
//     // Simple O(N^2) collision for small N (<= 8)
//     for (let i = 0; i < count; i++) {
//       const entityA = entities[i];
//
//       const ax = posX[entityA];
//       const ay = posY[entityA];
//       const rA = radius[entityA];
//       const mA = mass[entityA] > 0 ? mass[entityA] : 1;
//
//       for (let j = i + 1; j < count; j++) {
//         const entityB = entities[j];
//
//         const bx = posX[entityB];
//         const by = posY[entityB];
//         const rB = radius[entityB];
//         const mB = mass[entityB] > 0 ? mass[entityB] : 1;
//
//         const dx = bx - ax;
//         const dy = by - ay;
//
//         const dist = Math.hypot(dx, dy);
//         const sumR = rA + rB;
//
//         // No collision or perfectly overlapping centers (skip if too close to zero)
//         if (dist >= sumR || dist < COLLISION_MIN_DISTANCE_EPSILON) {
//           continue;
//         }
//
//         // Normal from A to B
//         const nx = dx / dist;
//         const ny = dy / dist;
//
//         const penetration = sumR - dist;
//
//         const invMassA = mA > 0 ? 1 / mA : 0;
//         const invMassB = mB > 0 ? 1 / mB : 0;
//         const invMassSum = invMassA + invMassB;
//
//         if (invMassSum === 0) {
//           continue;
//         }
//
//         // --- 1) Positional correction to resolve overlap ---
//         // This prevents players from getting stuck deeply inside each other.
//         const correction = penetration * COLLISION_POSITION_CORRECTION_FACTOR;
//         const corrAx = -nx * correction * (invMassA / invMassSum);
//         const corrAy = -ny * correction * (invMassA / invMassSum);
//         const corrBx =  nx * correction * (invMassB / invMassSum);
//         const corrBy =  ny * correction * (invMassB / invMassSum);
//
//         posX[entityA] += corrAx;
//         posY[entityA] += corrAy;
//         posX[entityB] += corrBx;
//         posY[entityB] += corrBy;
//
//         // --- 2) Velocity impulse along the collision normal ---
//
//         // Relative velocity: B - A
//         const rvx = velX[entityB] - velX[entityA];
//         const rvy = velY[entityB] - velY[entityA];
//
//         const velAlongNormal = rvx * nx + rvy * ny;
//
//         // Already separating along the normal, no impulse needed
//         if (velAlongNormal > 0) {
//           continue;
//         }
//
//         // Scalar impulse magnitude
//         const jImpulse = -(1 + COLLISION_DEFAULT_RESTITUTION) * velAlongNormal / invMassSum;
//
//         const impulseX = jImpulse * nx;
//         const impulseY = jImpulse * ny;
//
//         // Apply impulses to velocities
//         velX[entityA] -= impulseX * invMassA;
//         velY[entityA] -= impulseY * invMassA;
//
//         velX[entityB] += impulseX * invMassB;
//         velY[entityB] += impulseY * invMassB;
//       }
//     }
//   }
// }
