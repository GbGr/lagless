import { Physics2dRunner } from '../lib/physics2d-runner.js';
import { Physics2dECSCore, Physics2dInputRegistry } from './schema/code-gen/index.js';
import { Physics2dConfig } from '../lib/physics2d-config.js';
import { LocalInputProvider } from '@lagless/core';
import { Physics2dSimulation } from '../lib/physics2d-simulation.js';

describe('Physics2d', () => {
  it('should works', async () => {
    await Physics2dSimulation.init();

    const config = new Physics2dConfig({
      gravity: { x: 0, y: -9.81 },
    });
    const localInputProvider = new LocalInputProvider(config, Physics2dInputRegistry);
    const runner = new Physics2dRunner(config, localInputProvider, [], Physics2dECSCore);

    expect(runner).toBeDefined();

    const colliderDesc = Physics2dSimulation.Rapier2d.ColliderDesc.ball(1);
    const bodyDesc = Physics2dSimulation.Rapier2d.RigidBodyDesc.dynamic().setTranslation(0, 0);
    let body = runner.Physics2dSimulation.physicsWorld.createRigidBody(bodyDesc);
    runner.Physics2dSimulation.physicsWorld.createCollider(colliderDesc, body);


    expect(body.translation().x).toBe(0);
    expect(body.translation().y).toBe(0);
    expect(body.linvel().x).toBe(0);
    expect(body.linvel().y).toBe(0);

    runner.start();
    runner.update(config.frameLength);

    expect(runner.Physics2dSimulation.tick).toBe(1);
    expect(body.translation().x).toBe(0);
    expect(body.translation().y).toBe(-0.0017031251918524504);
    expect(body.linvel().x).toBe(0);
    expect(body.linvel().y).toBe(-0.16350001096725464);

    runner.update(config.frameLength * 10);

    expect(runner.Physics2dSimulation.tick).toBe(11);
    expect(body.translation().x).toBe(0);
    expect(body.translation().y).toBe(-0.1686093956232071);
    expect(body.linvel().x).toBe(0);
    expect(body.linvel().y).toBe(-1.7984994649887085);

    runner.Physics2dSimulation['rollback'](2);

    // retrieve the body after rollback
    body = runner.Physics2dSimulation.physicsWorld.getRigidBody(body.handle);
    expect(runner.Physics2dSimulation.tick).toBe(1);
    expect(body.translation().x).toBe(0);
    expect(body.translation().y).toBe(-0.0017031251918524504);
    expect(body.linvel().x).toBe(0);
    expect(body.linvel().y).toBe(-0.16350001096725464);

    runner.update(0);

    expect(runner.Physics2dSimulation.tick).toBe(11);
    expect(body.translation().x).toBe(0);
    expect(body.translation().y).toBe(-0.1686093956232071);
    expect(body.linvel().x).toBe(0);
    expect(body.linvel().y).toBe(-1.7984994649887085);
  });
});
