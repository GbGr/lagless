import { ECSSystem, EntitiesManager, IECSSystem, PlayerResources, Prefab, PRNG } from '@lagless/core';
import {
  Transform2d, Velocity2d, Ball, GravitySource, Goal,
  MatchState, PlayerResource,
} from '../schema/code-gen/index.js';
import { GravityPongArena } from '../arena.js';
import { generateMap } from '../map-generator.js';

@ECSSystem()
export class MapSetupSystem implements IECSSystem {
  private _initialized = false;

  private readonly _gravitySourcePrefab = Prefab.create()
    .with(Transform2d)
    .with(GravitySource);

  private readonly _goalPrefab = Prefab.create()
    .with(Transform2d)
    .with(Goal);

  private readonly _ballPrefab = Prefab.create()
    .with(Transform2d)
    .with(Velocity2d)
    .with(Ball);

  constructor(
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _Transform2d: Transform2d,
    private readonly _Ball: Ball,
    private readonly _GravitySource: GravitySource,
    private readonly _Goal: Goal,
    private readonly _MatchState: MatchState,
    private readonly _PlayerResources: PlayerResources,
    private readonly _PRNG: PRNG,
  ) {}

  public update(tick: number): void {
    if (this._initialized || tick !== 1) return;
    this._initialized = true;

    const A = GravityPongArena;
    const map = generateMap(this._PRNG);

    // Create gravity sources (planets & black holes)
    for (const src of map.sources) {
      const entity = this._EntitiesManager.createEntity(this._gravitySourcePrefab);
      this._Transform2d.unsafe.positionX[entity] = src.x;
      this._Transform2d.unsafe.positionY[entity] = src.y;
      this._Transform2d.unsafe.prevPositionX[entity] = src.x;
      this._Transform2d.unsafe.prevPositionY[entity] = src.y;
      this._GravitySource.unsafe.mass[entity] = src.mass;
      this._GravitySource.unsafe.radius[entity] = src.radius;
      this._GravitySource.unsafe.isBlackHole[entity] = src.isBlackHole ? 1 : 0;
    }

    // Create goals
    const goalBottom = this._EntitiesManager.createEntity(this._goalPrefab);
    this._Transform2d.unsafe.positionX[goalBottom] = A.width / 2;
    this._Transform2d.unsafe.positionY[goalBottom] = A.goalY0;
    this._Transform2d.unsafe.prevPositionX[goalBottom] = A.width / 2;
    this._Transform2d.unsafe.prevPositionY[goalBottom] = A.goalY0;
    this._Goal.unsafe.ownerSlot[goalBottom] = 0;
    this._Goal.unsafe.halfWidth[goalBottom] = A.goalHalfWidth;

    const goalTop = this._EntitiesManager.createEntity(this._goalPrefab);
    this._Transform2d.unsafe.positionX[goalTop] = A.width / 2;
    this._Transform2d.unsafe.positionY[goalTop] = A.goalY1;
    this._Transform2d.unsafe.prevPositionX[goalTop] = A.width / 2;
    this._Transform2d.unsafe.prevPositionY[goalTop] = A.goalY1;
    this._Goal.unsafe.ownerSlot[goalTop] = 1;
    this._Goal.unsafe.halfWidth[goalTop] = A.goalHalfWidth;

    // Create balls (inactive)
    const ball0 = this._EntitiesManager.createEntity(this._ballPrefab);
    this._Transform2d.unsafe.positionX[ball0] = A.ballLaunchX;
    this._Transform2d.unsafe.positionY[ball0] = A.ballLaunchY0;
    this._Transform2d.unsafe.prevPositionX[ball0] = A.ballLaunchX;
    this._Transform2d.unsafe.prevPositionY[ball0] = A.ballLaunchY0;
    this._Ball.unsafe.ownerSlot[ball0] = 0;
    this._Ball.unsafe.active[ball0] = 0;
    this._Ball.unsafe.radius[ball0] = A.ballRadius;

    const ball1 = this._EntitiesManager.createEntity(this._ballPrefab);
    this._Transform2d.unsafe.positionX[ball1] = A.ballLaunchX;
    this._Transform2d.unsafe.positionY[ball1] = A.ballLaunchY1;
    this._Transform2d.unsafe.prevPositionX[ball1] = A.ballLaunchX;
    this._Transform2d.unsafe.prevPositionY[ball1] = A.ballLaunchY1;
    this._Ball.unsafe.ownerSlot[ball1] = 1;
    this._Ball.unsafe.active[ball1] = 0;
    this._Ball.unsafe.radius[ball1] = A.ballRadius;

    // Store ball entity IDs in player resources
    const pr0 = this._PlayerResources.get(PlayerResource as any, 0);
    pr0!.safe.ballEntity = ball0;
    const pr1 = this._PlayerResources.get(PlayerResource as any, 1);
    pr1!.safe.ballEntity = ball1;

    // Set match state to aiming
    this._MatchState.safe.phase = 1;
    this._MatchState.safe.phaseStartTick = tick;
    this._MatchState.safe.roundNumber = 1;
  }
}
