import { type RapierKinematicCharacterController } from '@lagless/physics3d';
import { type PhysicsWorldManager3d } from '@lagless/physics3d';
import { CharacterControllerConfig } from './character-controller-config.js';

/**
 * Manages Rapier KCC instances per entity.
 * After rollback (Rapier world is freed and restored), call `recreateAll()`.
 *
 * Supports deferred init: construct with just config, then call `init(worldManager)` later.
 * This is needed because the PhysicsWorldManager3d is created inside PhysicsRunner3d,
 * but KCCManager must be registered in DI before systems are resolved.
 */
export class CharacterControllerManager {
  private readonly _controllers = new Map<number, RapierKinematicCharacterController>();
  private _worldManager: PhysicsWorldManager3d | undefined;

  constructor(private readonly _config: CharacterControllerConfig) {}

  /**
   * Deferred initialization — set the world manager after construction.
   */
  public init(worldManager: PhysicsWorldManager3d): void {
    this._worldManager = worldManager;
  }

  private get worldManager(): PhysicsWorldManager3d {
    if (!this._worldManager) {
      throw new Error('CharacterControllerManager not initialized — call init(worldManager) first');
    }
    return this._worldManager;
  }

  public createForEntity(entity: number): RapierKinematicCharacterController {
    if (this._controllers.has(entity)) {
      this.removeForEntity(entity);
    }
    const kcc = this.worldManager.world.createCharacterController(this._config.kccOffset);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setMaxSlopeClimbAngle(this._config.maxSlopeClimbAngle);
    kcc.setMinSlopeSlideAngle(this._config.minSlopeSlideAngle);
    if (this._config.autostepMaxHeight > 0) {
      kcc.enableAutostep(this._config.autostepMaxHeight, this._config.autostepMinWidth, true);
    }
    if (this._config.snapToGroundDistance > 0) {
      kcc.enableSnapToGround(this._config.snapToGroundDistance);
    }
    kcc.setSlideEnabled(true);
    kcc.setApplyImpulsesToDynamicBodies(true);
    this._controllers.set(entity, kcc);
    return kcc;
  }

  public getForEntity(entity: number): RapierKinematicCharacterController | undefined {
    return this._controllers.get(entity);
  }

  public removeForEntity(entity: number): void {
    const kcc = this._controllers.get(entity);
    if (kcc) {
      kcc.free();
      this._controllers.delete(entity);
    }
  }

  /**
   * After rollback: old KCCs are invalid (Rapier world was freed).
   * Recreate all KCCs from scratch using current entity set.
   */
  public recreateAll(): void {
    const entities = Array.from(this._controllers.keys());
    // Clear without freeing — old world already freed
    this._controllers.clear();
    for (const entity of entities) {
      this.createForEntity(entity);
    }
  }

  /**
   * After state transfer: recreate KCCs for the given entity set.
   * Use this instead of recreateAll() when _controllers may not reflect
   * the correct entity set (e.g. after late-join state transfer).
   */
  public recreateFromEntities(entities: Iterable<number>): void {
    // Clear without freeing — old world already freed by restoreSnapshot
    this._controllers.clear();
    for (const entity of entities) {
      this.createForEntity(entity);
    }
  }

  public dispose(): void {
    for (const kcc of this._controllers.values()) {
      kcc.free();
    }
    this._controllers.clear();
  }
}
