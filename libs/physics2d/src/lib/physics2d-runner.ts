import { Container } from '@lagless/di';
import { ECSDeps, IECSSystemConstructor } from '@lagless/types';
import { Physics2dConfig } from './physics2d-config.js';
import { AbstractInputProvider, EntitiesManager, InputProvider, PlayerResources, PRNG } from '@lagless/core';
import { Physics2dSimulation } from './physics2d-simulation.js';

export class Physics2dRunner {
  public readonly DIContainer: Container;
  public readonly Physics2dSimulation: Physics2dSimulation<never>;

  constructor(
    public readonly Config: Physics2dConfig,
    public readonly InputProviderInstance: AbstractInputProvider,
    public readonly Systems: Array<IECSSystemConstructor>,
    public readonly Deps: ECSDeps,
  ) {
    this.DIContainer = new Container();
    this.Physics2dSimulation = new Physics2dSimulation(this.Config, this.Deps, this.InputProviderInstance);
    this.InputProviderInstance.init(this.Physics2dSimulation);

    const mem = this.Physics2dSimulation.mem;

    this.DIContainer.register(Physics2dConfig, this.Config);
    this.DIContainer.register(InputProvider, this.InputProviderInstance);
    this.DIContainer.register(Physics2dSimulation, this.Physics2dSimulation);
    this.DIContainer.register(EntitiesManager, mem.entitiesManager);
    this.DIContainer.register(PRNG, mem.prngManager.prng);

    // components
    for (const [ ComponentConstructor, ComponentInstance ] of mem.componentsManager) {
      this.DIContainer.register(ComponentConstructor, ComponentInstance);
    }
    // singletons
    for (const [ SingletonConstructor, SingletonInstance ] of mem.singletonsManager) {
      this.DIContainer.register(SingletonConstructor, SingletonInstance);
    }
    // filters
    for (const [ FilterConstructor, FilterInstance ] of mem.filtersManager) {
      this.DIContainer.register(FilterConstructor, FilterInstance);
    }
    // player resources
    this.DIContainer.register(PlayerResources, mem.playerResourcesManager.PlayerResources);

    // systems
    const systemInstances = this.Systems.map((SystemConstructor) => {
      return this.DIContainer.resolve(SystemConstructor);
    });

    this.Physics2dSimulation.registerSystems(systemInstances);
  }

  public start(): void {
    this.Physics2dSimulation.start();
  }

  public update(dt: number): void {
    this.Physics2dSimulation.update(dt);
  }
}
