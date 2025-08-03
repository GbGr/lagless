import { ECSConfig, ECSSimulation, InputRegistry, LocalInputProvider, Mem, Prefab } from '@lagless/core';
import { toFP } from '@lagless/misc';
import {
  Position,
  Velocity,
  WorldSettings,
  Move,
  TestbedSimulationRunner,
  TestbedSimulationInputRegistry, TestbedSimulationCore
} from './schema/code-gen/index.js';
import { PositionFilter } from './schema/code-gen/PositionFilter.js';
import { MovableFilter } from './schema/code-gen/MovableFilter.js';
import { StaticFilter } from './schema/code-gen/StaticFilter.js';
import { PlayerResource } from './schema/code-gen/PlayerResource.js';
import { expect } from 'vitest';
import { TestSystem } from './systems/test.system.js';
import { Container } from '@lagless/di';
import { SYSTEMS_REGISTRY } from './systems/index.js';
import { FullTestSystem } from './systems/full-test-system.js';

const ecsConfig = new ECSConfig({
  maxEntities: 100,
});

describe('testbedSimulation', () => {
  describe('ECS Mem', () => {
    it('Raw tests', () => {
      const mem = new Mem(ecsConfig, TestbedSimulationCore);
      const position = mem.componentsManager.get(Position);
      expect(position).toBeDefined();
      const velocity = mem.componentsManager.get(Velocity);
      expect(velocity).toBeDefined();
      const worldSettings = mem.singletonsManager.get(WorldSettings);

      // fill components with data
      for (let i = 0; i < ecsConfig.maxEntities; i++) {
        position.unsafe.x[i] = i * 10;
        position.unsafe.y[i] = i * 20;
        velocity.unsafe.dx[i] = i * 1.5;
        velocity.unsafe.dy[i] = i * 2.5;
      }

      // fill worldSettings
      for (let i = 0; i < worldSettings.unsafe.resources.length; i++) {
        worldSettings.unsafe.resources[i] = 5;
      }

      worldSettings.unsafe.resourcesLeft[0] = 88;

      // check data
      for (let i = 0; i < ecsConfig.maxEntities; i++) {
        expect(position.unsafe.x[i]).toBe(toFP(i * 10));
        expect(position.unsafe.y[i]).toBe(toFP(i * 20));
        expect(velocity.unsafe.dx[i]).toBe(toFP(i * 1.5));
        expect(velocity.unsafe.dy[i]).toBe(toFP(i * 2.5));
      }

      for (let i = 0; i < worldSettings.unsafe.resources.length; i++) {
        expect(worldSettings.unsafe.resources[i]).toBe(5);
      }

      expect(worldSettings.unsafe.resourcesLeft[0]).toBe(88);

      const snapshot = mem.exportSnapshot();

      // try to corrupt the data in snapshot
      for (let i = 0; i < ecsConfig.maxEntities; i++) {
        position.unsafe.x[i] = 99999;
        position.unsafe.y[i] = 99999;
        velocity.unsafe.dx[i] = 99999;
        velocity.unsafe.dy[i] = 99999;
      }

      for (let i = 0; i < worldSettings.unsafe.resources.length; i++) {
        worldSettings.unsafe.resources[i] = 2;
      }

      worldSettings.unsafe.resourcesLeft[0] = 2;

      const newMem = new Mem(ecsConfig, TestbedSimulationCore);

      // check newPosition and newVelocity is empty
      const newPosition = newMem.componentsManager.get(Position);
      const newVelocity = newMem.componentsManager.get(Velocity);
      for (let i = 0; i < ecsConfig.maxEntities; i++) {
        expect(newPosition.unsafe.x[i]).toBe(0);
        expect(newPosition.unsafe.y[i]).toBe(0);
        expect(newVelocity.unsafe.dx[i]).toBe(0);
        expect(newVelocity.unsafe.dy[i]).toBe(0);
      }
      // check newWorldSettings is empty
      const newWorldSettings = newMem.singletonsManager.get(WorldSettings);
      for (let i = 0; i < newWorldSettings.unsafe.resources.length; i++) {
        expect(newWorldSettings.unsafe.resources[i]).toBe(0);
      }
      expect(newWorldSettings.unsafe.resourcesLeft[0]).toBe(0);
      // apply snapshot
      newMem.applySnapshot(snapshot);
      // check newPosition, newVelocity is filled with data and not corrupted
      for (let i = 0; i < ecsConfig.maxEntities; i++) {
        expect(newPosition.unsafe.x[i]).toBe(toFP(i * 10));
        expect(newPosition.unsafe.y[i]).toBe(toFP(i * 20));
        expect(newVelocity.unsafe.dx[i]).toBe(toFP(i * 1.5));
        expect(newVelocity.unsafe.dy[i]).toBe(toFP(i * 2.5));
      }
      // check newWorldSettings is filled with data and not corrupted
      for (let i = 0; i < newWorldSettings.unsafe.resources.length; i++) {
        expect(newWorldSettings.unsafe.resources[i]).toBe(5);
      }
      expect(newWorldSettings.unsafe.resourcesLeft[0]).toBe(88);
    });
  });
  describe('ECS Core', () => {
    it('PlayerResources', () => {
      const mem = new Mem(ecsConfig, TestbedSimulationCore);

      for (let i = 0; i < ecsConfig.maxPlayers; i++) {
        const playerResource = mem.playerResourcesManager.get(PlayerResource, i);
        playerResource.unsafe.id.set(new Uint8Array(16).fill(255));
        playerResource.unsafe.slot[0] = i;
        playerResource.unsafe.entityRef[0] = i + 1000;
      }

      // check data
      for (let i = 0; i < ecsConfig.maxPlayers; i++) {
        const playerResource = mem.playerResourcesManager.get(PlayerResource, i);
        expect(playerResource.unsafe.id).toEqual(new Uint8Array(16).fill(255));
        expect(playerResource.unsafe.slot[0]).toBe(i);
        expect(playerResource.unsafe.entityRef[0]).toBe(i + 1000);
      }

      const snapshot = mem.exportSnapshot();

      // try to corrupt the data in snapshot

      for (let i = 0; i < ecsConfig.maxPlayers; i++) {
        const playerResource = mem.playerResourcesManager.get(PlayerResource, i);
        playerResource.unsafe.id.fill(0);
        playerResource.unsafe.slot[0] = 0;
        playerResource.unsafe.entityRef[0] = 0;
      }

      const newMem = new Mem(ecsConfig, TestbedSimulationCore);
      // check newPlayerResource is empty
      for (let i = 0; i < ecsConfig.maxPlayers; i++) {
        const playerResource = newMem.playerResourcesManager.get(PlayerResource, i);
        expect(playerResource.unsafe.id).toEqual(new Uint8Array(16).fill(0));
        expect(playerResource.unsafe.slot[0]).toBe(0);
        expect(playerResource.unsafe.entityRef[0]).toBe(0);
      }

      // apply snapshot
      newMem.applySnapshot(snapshot);
      // check newPlayerResource is filled with data and not corrupted
      for (let i = 0; i < ecsConfig.maxPlayers; i++) {
        const playerResource = newMem.playerResourcesManager.get(PlayerResource, i);
        expect(playerResource.unsafe.id).toEqual(new Uint8Array(16).fill(255));
        expect(playerResource.unsafe.slot[0]).toBe(i);
        expect(playerResource.unsafe.entityRef[0]).toBe(i + 1000);
      }
    });
    it('should correctly manage entities, components, and filters', () => {
      const mem = new Mem(ecsConfig, TestbedSimulationCore);
      const position = mem.componentsManager.get(Position);
      const velocity = mem.componentsManager.get(Velocity);

      const positionFilter = mem.filtersManager.get(PositionFilter);
      const movableFilter = mem.filtersManager.get(MovableFilter);
      const staticFilter = mem.filtersManager.get(StaticFilter);

      const entities: {
        entity: number;
        hasPosition: boolean;
        hasVelocity: boolean;
        expectedPosition?: { x: number; y: number };
        expectedVelocity?: { dx: number; dy: number };
      }[] = [];

      // Entity with only Position
      const positionEntity = mem.entitiesManager.createEntity(Prefab.create().with(Position, { x: 100, y: 200 }));
      entities.push({
        entity: positionEntity,
        hasPosition: true,
        hasVelocity: false,
        expectedPosition: { x: 100, y: 200 },
      });

      // Entity with only Velocity
      const velocityEntity = mem.entitiesManager.createEntity(Prefab.create().with(Velocity, { dx: 1.5, dy: 2.5 }));
      entities.push({
        entity: velocityEntity,
        hasPosition: false,
        hasVelocity: true,
        expectedVelocity: { dx: 1.5, dy: 2.5 },
      });

      // Entity with both Position and Velocity
      const movableEntity = mem.entitiesManager.createEntity(
        Prefab.create().with(Position, { x: 50, y: 100 }).with(Velocity, { dx: 0.5, dy: 1.0 }),
      );
      entities.push({
        entity: movableEntity,
        hasPosition: true,
        hasVelocity: true,
        expectedPosition: { x: 50, y: 100 },
        expectedVelocity: { dx: 0.5, dy: 1.0 },
      });

      // Bulk entities
      const count = ecsConfig.maxEntities - entities.length;
      for (let i = 0; i < count; i++) {
        const entity = mem.entitiesManager.createEntity(Prefab.create().with(Position, {}).with(Velocity, {}));

        const pos = { x: i * 10, y: i * 20 };
        const vel = { dx: i * 1.5, dy: i * 2.5 };

        position.unsafe.x[entity] = pos.x;
        position.unsafe.y[entity] = pos.y;
        velocity.unsafe.dx[entity] = vel.dx;
        velocity.unsafe.dy[entity] = vel.dy;

        entities.push({
          entity,
          hasPosition: true,
          hasVelocity: true,
          expectedPosition: pos,
          expectedVelocity: vel,
        });
      }

      // Component data validation
      for (const { entity, hasPosition, hasVelocity, expectedPosition, expectedVelocity } of entities) {
        if (hasPosition) {
          expect(mem.entitiesManager.hasComponent(entity, Position)).toBe(true);
          expect(position.unsafe.x[entity]).toBe(expectedPosition!.x);
          expect(position.unsafe.y[entity]).toBe(expectedPosition!.y);
        } else {
          expect(mem.entitiesManager.hasComponent(entity, Position)).toBe(false);
        }

        if (hasVelocity) {
          expect(mem.entitiesManager.hasComponent(entity, Velocity)).toBe(true);
          expect(velocity.unsafe.dx[entity]).toBe(expectedVelocity!.dx);
          expect(velocity.unsafe.dy[entity]).toBe(expectedVelocity!.dy);
        } else {
          expect(mem.entitiesManager.hasComponent(entity, Velocity)).toBe(false);
        }
      }

      // Filter membership sets
      const entitiesInFilter = (filter: any): Set<number> => {
        const set = new Set<number>();
        for (const entity of filter) {
          set.add(entity);
        }
        return set;
      };

      const positionEntities = entitiesInFilter(positionFilter);
      const movableEntities = entitiesInFilter(movableFilter);
      const staticEntities = entitiesInFilter(staticFilter);

      // Filter correctness
      for (const { entity, hasPosition, hasVelocity } of entities) {
        expect(positionEntities.has(entity)).toBe(hasPosition);

        if (hasPosition && hasVelocity) {
          expect(movableEntities.has(entity)).toBe(true);
          expect(staticEntities.has(entity)).toBe(false);
        } else if (hasPosition && !hasVelocity) {
          expect(staticEntities.has(entity)).toBe(true);
          expect(movableEntities.has(entity)).toBe(false);
        } else {
          expect(movableEntities.has(entity)).toBe(false);
          expect(staticEntities.has(entity)).toBe(false);
        }
      }

      // Filter size verification
      expect(positionEntities.size).toBe(entities.filter((e) => e.hasPosition).length);
      expect(movableEntities.size).toBe(entities.filter((e) => e.hasPosition && e.hasVelocity).length);
      expect(staticEntities.size).toBe(entities.filter((e) => e.hasPosition && !e.hasVelocity).length);

      const snapshot = mem.exportSnapshot();
      const newMem = new Mem(ecsConfig, TestbedSimulationCore);
      newMem.applySnapshot(snapshot);

      const newPosition = newMem.componentsManager.get(Position);
      const newVelocity = newMem.componentsManager.get(Velocity);
      const newPositionFilter = newMem.filtersManager.get(PositionFilter);
      const newMovableFilter = newMem.filtersManager.get(MovableFilter);
      const newStaticFilter = newMem.filtersManager.get(StaticFilter);

      // Проверка компонентов после восстановления
      for (const { entity, hasPosition, hasVelocity, expectedPosition, expectedVelocity } of entities) {
        if (hasPosition) {
          expect(newMem.entitiesManager.hasComponent(entity, Position)).toBe(true);
          expect(newPosition.unsafe.x[entity]).toBe(expectedPosition!.x);
          expect(newPosition.unsafe.y[entity]).toBe(expectedPosition!.y);
        } else {
          expect(newMem.entitiesManager.hasComponent(entity, Position)).toBe(false);
        }

        if (hasVelocity) {
          expect(newMem.entitiesManager.hasComponent(entity, Velocity)).toBe(true);
          expect(newVelocity.unsafe.dx[entity]).toBe(expectedVelocity!.dx);
          expect(newVelocity.unsafe.dy[entity]).toBe(expectedVelocity!.dy);
        } else {
          expect(newMem.entitiesManager.hasComponent(entity, Velocity)).toBe(false);
        }
      }

      // Проверка фильтров после восстановления
      const newPositionEntities = entitiesInFilter(newPositionFilter);
      const newMovableEntities = entitiesInFilter(newMovableFilter);
      const newStaticEntities = entitiesInFilter(newStaticFilter);

      for (const { entity, hasPosition, hasVelocity } of entities) {
        expect(newPositionEntities.has(entity)).toBe(hasPosition);

        if (hasPosition && hasVelocity) {
          expect(newMovableEntities.has(entity)).toBe(true);
          expect(newStaticEntities.has(entity)).toBe(false);
        } else if (hasPosition && !hasVelocity) {
          expect(newStaticEntities.has(entity)).toBe(true);
          expect(newMovableEntities.has(entity)).toBe(false);
        } else {
          expect(newMovableEntities.has(entity)).toBe(false);
          expect(newStaticEntities.has(entity)).toBe(false);
        }
      }

      // Проверка размеров фильтров
      expect(newPositionEntities.size).toBe(entities.filter((e) => e.hasPosition).length);
      expect(newMovableEntities.size).toBe(entities.filter((e) => e.hasPosition && e.hasVelocity).length);
      expect(newStaticEntities.size).toBe(entities.filter((e) => e.hasPosition && !e.hasVelocity).length);
    });
  });
  describe('ECS Simulation', () => {
    it('Should works', () => {
      const diContainer = new Container();
      const inputRegistry = new InputRegistry(TestbedSimulationCore.inputs);
      const localInputProvider = new LocalInputProvider(ecsConfig, inputRegistry);
      const simulation = new ECSSimulation(ecsConfig, TestbedSimulationCore, localInputProvider);
      localInputProvider.init(simulation);
      diContainer.register(ECSConfig, ecsConfig);
      diContainer.register(Position, simulation.mem.componentsManager.get(Position));
      const testSystem = diContainer.resolve(TestSystem);
      simulation.registerSystems([testSystem]);

      simulation.throwIfSystemsNotRegistered();

      expect(simulation.mem.tickManager.tick).toBe(0);
      expect(testSystem.Position.unsafe.x[0]).toBe(0);
      expect(testSystem.Position.unsafe.y[0]).toBe(0);

      simulation.update(ecsConfig.frameLength);

      expect(simulation.mem.tickManager.tick).toBe(1);
      expect(testSystem.Position.unsafe.x[0]).toBe(1);
      expect(testSystem.Position.unsafe.y[0]).toBe(2);

      simulation.update(ecsConfig.frameLength);

      expect(simulation.mem.tickManager.tick).toBe(2);
      expect(testSystem.Position.unsafe.x[0]).toBe(2);
      expect(testSystem.Position.unsafe.y[0]).toBe(4);

      simulation['rollback'](0);

      expect(simulation.mem.tickManager.tick).toBe(0);
      expect(testSystem.Position.unsafe.x[0]).toBe(0);
      expect(testSystem.Position.unsafe.y[0]).toBe(0);

      simulation.update(ecsConfig.frameLength);

      expect(simulation.mem.tickManager.tick).toBe(3);
      expect(testSystem.Position.unsafe.x[0]).toBe(3);
      expect(testSystem.Position.unsafe.y[0]).toBe(6);
    });
  });

  describe('ECS Input', () => {
    it('should work basic input', () => {
      const inputRegistry = new InputRegistry(TestbedSimulationCore.inputs);
      const localInputProvider = new LocalInputProvider(ecsConfig, inputRegistry);
      const simulation = new ECSSimulation(ecsConfig, TestbedSimulationCore, localInputProvider);
      localInputProvider.init(simulation);

      localInputProvider.drainInputs((addRpc) => {
        addRpc(Move, { dx: 10, dy: 20 });
      });

      simulation.start();
      simulation.update(ecsConfig.frameLength);

      const firstTickPackage = localInputProvider.getTickRPCPackage();
      const firstTickRPCs = inputRegistry.dataModel.unpackBatch(firstTickPackage);
      expect(firstTickRPCs.length).toBe(0);

      simulation.update(ecsConfig.frameLength);
      const secondTickPackage = localInputProvider.getTickRPCPackage();
      const secondTickRPCs = inputRegistry.dataModel.unpackBatch(secondTickPackage);
      expect(secondTickRPCs.length).toBe(1);
      expect(secondTickRPCs[0].inputId).toBe(Move.id);
      expect(secondTickRPCs[0].data.dx).toBe(10);
      expect(secondTickRPCs[0].data.dy).toBe(20);
      expect(secondTickRPCs[0].meta.tick).toBe(2);
    });
  });
  describe('ECS', () => {
    it('should work as designed', () => {
      const ecsConfig = new ECSConfig({
        seed: 123456789,
        maxEntities: 1000,
      });
      const localInputProvider = new LocalInputProvider(ecsConfig, TestbedSimulationInputRegistry);
      const runner = new TestbedSimulationRunner(ecsConfig, localInputProvider, SYSTEMS_REGISTRY);
      const FullTestSystemInstance = runner.DIContainer.resolve(FullTestSystem);
      runner.start();

      expect(runner.Simulation.mem.tickManager.tick).toBe(0);

      expect(runner.Simulation.mem.prngManager.getFloat()).toBe(0.04119846015237272);

      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(0);

      runner.update(ecsConfig.frameLength);

      expect(runner.Simulation.mem.tickManager.tick).toBe(1);
      expect([
        runner.Simulation.mem.prngManager.getFloat(),
        runner.Simulation.mem.prngManager.getFloat(),
        runner.Simulation.mem.prngManager.getFloat(),
      ]).toEqual([0.04236399312503636, 0.192453948315233, 0.858548421645537]);
      expect(runner.Simulation.mem.entitiesManager.hasComponent(0, Position)).toBe(true);
      expect(runner.Simulation.mem.entitiesManager.hasComponent(0, Velocity)).toBe(false);
      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(1);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(0);

      runner.update(ecsConfig.frameLength);

      expect(runner.Simulation.mem.tickManager.tick).toBe(2);

      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(1);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(1);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(0);

      runner.update(ecsConfig.frameLength);

      expect(runner.Simulation.mem.tickManager.tick).toBe(3);
      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(1);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(1);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(1);

      runner.update(ecsConfig.frameLength);

      expect(runner.Simulation.mem.tickManager.tick).toBe(4);
      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(1);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(1);

      runner.update(ecsConfig.frameLength);
      expect(runner.Simulation.mem.tickManager.tick).toBe(5);
      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(1);

      runner.update(ecsConfig.frameLength);
      expect(runner.Simulation.mem.tickManager.tick).toBe(6);
      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(0);

      expect([
        runner.Simulation.mem.entitiesManager.createEntity(),
        runner.Simulation.mem.entitiesManager.createEntity(),
        runner.Simulation.mem.entitiesManager.createEntity(),
      ]).toEqual([2, 1, 0]);

      runner.Simulation['rollback'](2);
      expect(runner.Simulation.mem.tickManager.tick).toBe(1);
      expect([
        runner.Simulation.mem.prngManager.getFloat(),
        runner.Simulation.mem.prngManager.getFloat(),
        runner.Simulation.mem.prngManager.getFloat(),
      ]).toEqual([0.04236399312503636, 0.192453948315233, 0.858548421645537]);
      expect(runner.Simulation.mem.entitiesManager.hasComponent(0, Position)).toBe(true);
      expect(runner.Simulation.mem.entitiesManager.hasComponent(0, Velocity)).toBe(false);
      expect(FullTestSystemInstance.TestOnlyPositionFilter.length).toBe(1);
      expect(FullTestSystemInstance.TestOnlyVelocityFilter.length).toBe(0);
      expect(FullTestSystemInstance.TestPositionAndVelocityFilter.length).toBe(0);
      console.log(`State Size: ${runner.Simulation.mem['_arrayBuffer'].byteLength / 1024} KB`);
    });
  });
});
