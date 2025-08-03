import { Container } from '@lagless/di';
import { ECSDeps, IECSSystemConstructor } from '@lagless/types';
import { ECSConfig } from './ecs-config.js';
import { AbstractInputProvider, InputProvider } from './input/index.js';
import { ECSSimulation } from './ecs-simulation.js';
import { PlayerResources } from './mem/managers/player-resources-manager.js';
import { PRNG } from './mem/managers/prng-manager.js';
import { EntitiesManager } from './mem/managers/entities-manager.js';

export abstract class ECSRunner {
  public readonly DIContainer: Container;
  public readonly Simulation: ECSSimulation;

  protected constructor(
    public readonly Config: ECSConfig,
    public readonly InputProviderInstance: AbstractInputProvider,
    public readonly Systems: Array<IECSSystemConstructor>,
    public readonly Deps: ECSDeps,
  ) {
    this.DIContainer = new Container();
    this.Simulation = new ECSSimulation(this.Config, this.Deps, this.InputProviderInstance);
    this.InputProviderInstance.init(this.Simulation);

    const mem = this.Simulation.mem;

    this.DIContainer.register(ECSConfig, this.Config);
    this.DIContainer.register(InputProvider, this.InputProviderInstance);
    this.DIContainer.register(ECSSimulation, this.Simulation);
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
    this.Simulation.registerSystems(systemInstances);
  }

  public start(): void {
    this.Simulation.start();
  }

  public update(dt: number): void {
    this.Simulation.update(dt);
  }
}
