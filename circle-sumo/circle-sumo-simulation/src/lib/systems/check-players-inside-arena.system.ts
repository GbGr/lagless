import { ECSSystem, EntitiesManager, IECSSystem, PlayerResources } from '@lagless/core';
import {
  CircleBody,
  PlayerResource,
  SumoCharacterFilter,
  Transform2d,
  Velocity2d,
  LastHit,
  LastAssist,
} from '../schema/code-gen/index.js';
import { MathOps } from '@lagless/math';
import { CircleSumoArena } from '../map.js';

// Max number of ticks between the last hit and KO
// for the hit to still be credited as a kill.
const KNOCKOUT_HIT_TICKS_WINDOW = 150; // e.g. 150 ticks at 60 FPS ≈ 2.5 seconds

// Minimal impulse from LastHit to credit a kill.
// If lower, treat as self-KO / environment KO.
const KNOCKOUT_MIN_IMPULSE_FOR_KILL = 0.1;

@ECSSystem()
export class CheckPlayersInsideArenaSystem implements IECSSystem {
  constructor(
    private readonly _SumoCharacterFilter: SumoCharacterFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _CircleBody: CircleBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _LastHit: LastHit,
    private readonly _LastAssist: LastAssist,
  ) {}

  public update(tick: number): void {
    for (const entity of this._SumoCharacterFilter) {
      const x = this._Transform2d.unsafe.positionX[entity];
      const y = this._Transform2d.unsafe.positionY[entity];
      const radius = this._CircleBody.unsafe.radius[entity];

      const distanceFromCenter = MathOps.sqrt(x * x + y * y);
      const effectiveArenaRadius = CircleSumoArena.radius - CircleSumoArena.dangerStrokeWidth;

      const playerSlot = this._CircleBody.unsafe.playerSlot[entity];
      const playerResource = this._PlayerResources.get(PlayerResource, playerSlot);

      // --- Player fully outside arena: elimination / KO ---
      if (distanceFromCenter > CircleSumoArena.radius) {
        let killerEntity: number | null = null;
        let assisterEntity: number | null = null;

        // Check if there is a valid recent hit that should be credited
        if (this._EntitiesManager.hasComponent(entity, LastHit)) {
          const lastHit = this._LastHit.getCursor(entity);
          const dtTicks = tick - lastHit.atTick;

          if (
            dtTicks >= 0 &&
            lastHit.hasAttacker === 1 &&
            dtTicks <= KNOCKOUT_HIT_TICKS_WINDOW &&
            lastHit.impulse >= KNOCKOUT_MIN_IMPULSE_FOR_KILL
          ) {
            killerEntity = lastHit.attackerEntity;

            if (this._EntitiesManager.hasComponent(entity, LastAssist)) {
              const assist = this._LastAssist.getCursor(entity);
              const dtAssist = tick - assist.atTick;
              if (
                dtAssist >= 0 &&
                dtAssist <= KNOCKOUT_HIT_TICKS_WINDOW &&
                assist.hasAssister === 1
              ) {
                assisterEntity = assist.assisterEntity;
              }
            }
          }
        }

        // Debug logging for KO attribution
        if (killerEntity === null) {
          console.log(
            `Player entity=${entity} eliminated (self-KO or no recent hit) ` +
            `(distanceFromCenter=${distanceFromCenter.toFixed(2)})`
          );
        } else {
          console.log(
            `Player entity=${entity} eliminated by killer=${killerEntity}` +
            (assisterEntity !== null ? ` (assist=${assisterEntity})` : '') +
            ` (distanceFromCenter=${distanceFromCenter.toFixed(2)})`
          );

          const killerPlayerSlot = this._CircleBody.unsafe.playerSlot[killerEntity];
          const killerPlayerResource = this._PlayerResources.get(PlayerResource, killerPlayerSlot);
          killerPlayerResource.safe.kills += 1;
        }

        if (assisterEntity !== null) {
          const assisterPlayerSlot = this._CircleBody.unsafe.playerSlot[assisterEntity];
          const assisterPlayerResource = this._PlayerResources.get(PlayerResource, assisterPlayerSlot);
          assisterPlayerResource.safe.assists += 1;
        }

        // Remove physics components so the player stops interacting with the arena.
        this._EntitiesManager.removeComponent(entity, Velocity2d);
        this._EntitiesManager.removeComponent(entity, CircleBody);

        // Clear hit/assist metadata for this entity (not strictly required, but cleaner).
        if (this._EntitiesManager.hasComponent(entity, LastHit)) {
          this._EntitiesManager.removeComponent(entity, LastHit);
        }
        if (this._EntitiesManager.hasComponent(entity, LastAssist)) {
          this._EntitiesManager.removeComponent(entity, LastAssist);
        }

        // Mark player as finished in this match (for ranking / placement)
        playerResource.safe.finishedAtTick = tick;

        console.log(`Player entity=${entity} finished in this match (tick=${tick}) Kills=${playerResource.safe.kills} Assists=${playerResource.safe.assists}`);

        continue;
      }

      // --- Player in danger zone (close to edge) ---
      if (distanceFromCenter + radius > effectiveArenaRadius) {
        if (playerResource.safe.isInDangerZone === 0) {
          playerResource.safe.isInDangerZone = 1;
          playerResource.safe.wasInDangerZoneTimes += 1;
        }
      } else {
        playerResource.safe.isInDangerZone = 0;
      }
    }
  }
}

// import { ECSSystem, EntitiesManager, IECSSystem, PlayerResources } from '@lagless/core';
// import { CircleBody, PlayerResource, SumoCharacterFilter, Transform2d, Velocity2d } from '../schema/code-gen/index.js';
// import { MathOps } from '@lagless/math';
// import { CircleSumoArena } from '../map.js';
//
// @ECSSystem()
// export class CheckPlayersInsideArenaSystem implements IECSSystem {
//   constructor(
//     private readonly _SumoCharacterFilter: SumoCharacterFilter,
//     private readonly _Transform2d: Transform2d,
//     private readonly _CircleBody: CircleBody,
//     private readonly _EntitiesManager: EntitiesManager,
//     private readonly _PlayerResources: PlayerResources,
//   ) {}
//
//   public update(tick: number): void {
//     for (const entity of this._SumoCharacterFilter) {
//       const x = this._Transform2d.unsafe.positionX[entity];
//       const y = this._Transform2d.unsafe.positionY[entity];
//       const radius = this._CircleBody.unsafe.radius[entity];
//       const distanceFromCenter = MathOps.sqrt(x * x + y * y);
//       const effectiveArenaRadius = CircleSumoArena.radius - CircleSumoArena.dangerStrokeWidth;
//       const playerResource = this._PlayerResources.get(PlayerResource, this._CircleBody.unsafe.playerSlot[entity]);
//
//       if (distanceFromCenter > CircleSumoArena.radius) {
//         // Player is outside the arena, eliminate them
//         console.log(
//           `Eliminating player entity=${entity} for leaving arena (distanceFromCenter=${distanceFromCenter.toFixed(
//             2
//           )}, effectiveArenaRadius=${effectiveArenaRadius.toFixed(2)})`
//         );
//         this._EntitiesManager.removeComponent(entity, Velocity2d);
//         this._EntitiesManager.removeComponent(entity, CircleBody);
//         playerResource.safe.finishedAtTick = tick;
//       } else if (distanceFromCenter + radius > effectiveArenaRadius) {
//         if (playerResource.safe.isInDangerZone === 0) {
//           playerResource.safe.isInDangerZone = 1;
//           playerResource.safe.wasInDangerZoneTimes += 1;
//         }
//
//         // Player is in the danger zone, could add visual effects here
//         console.log(
//           `Player entity=${entity} is in the danger zone (distanceFromCenter=${distanceFromCenter.toFixed(
//             2
//           )}, effectiveArenaRadius=${effectiveArenaRadius.toFixed(2)})`
//         );
//       } else {
//         playerResource.safe.isInDangerZone = 0;
//       }
//     }
//   }
// }
