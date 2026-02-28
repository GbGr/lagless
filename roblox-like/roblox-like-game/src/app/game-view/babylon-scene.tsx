import { FC, useEffect, useRef } from 'react';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
// Side-effect imports: register default shaders so BabylonJS doesn't try to fetch them via HTTP
import '@babylonjs/core/Shaders/default.vertex';
import '@babylonjs/core/Shaders/default.fragment';
import { CameraController } from './camera-controller';
import { CharacterMesh } from './character-renderer';
import { useRunnerContext } from './runner-provider';
import {
  Transform3d,
  AnimationState,
  CharacterFilter,
  PlayerResource,
} from '@lagless/roblox-like-simulation';
import { PlayerResources } from '@lagless/core';
import { ROBLOX_LIKE_CONFIG, OBSTACLES } from '@lagless/roblox-like-simulation';

interface BabylonSceneProps {
  cameraYawRef: React.MutableRefObject<number>;
}

export const BabylonScene: FC<BabylonSceneProps> = ({ cameraYawRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { runner } = useRunnerContext();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !runner) return;

    // BabylonJS setup
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

    // Lights
    const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.5;
    const dirLight = new DirectionalLight('dir', new Vector3(-1, -2, -1).normalize(), scene);
    dirLight.intensity = 0.8;
    dirLight.position = new Vector3(10, 20, 10);

    // Camera
    const camController = new CameraController(scene, canvas);

    // Ground
    const groundSize = ROBLOX_LIKE_CONFIG.groundSize;
    const ground = MeshBuilder.CreateGround('ground', { width: groundSize, height: groundSize }, scene);
    const groundMat = new StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new Color3(0.15, 0.4, 0.15);
    groundMat.specularColor = new Color3(0.05, 0.05, 0.05);
    ground.material = groundMat;
    ground.receiveShadows = true;

    // Obstacles — generated from shared config
    const obstacleMat = new StandardMaterial('obstacleMat', scene);
    obstacleMat.diffuseColor = new Color3(0.5, 0.5, 0.6);

    for (let i = 0; i < OBSTACLES.length; i++) {
      const obs = OBSTACLES[i];
      const mesh = MeshBuilder.CreateBox(`obstacle_${i}`, {
        width: obs.hx * 2, height: obs.hy * 2, depth: obs.hz * 2,
      }, scene);
      mesh.position.set(obs.x, obs.y, obs.z);
      if (obs.rotX) mesh.rotation.x = obs.rotX;
      mesh.material = obstacleMat;
    }

    // Character rendering
    const characterMeshes = new Map<number, CharacterMesh>();

    // Resolve ECS components
    const container = runner.DIContainer;
    const transform3d = container.resolve(Transform3d);
    const animState = container.resolve(AnimationState);
    const charFilter = container.resolve(CharacterFilter);
    const playerResources = container.resolve(PlayerResources);

    // Find local player slot
    const localSlot = runner.InputProviderInstance.playerSlot;

    // Render loop
    engine.runRenderLoop(() => {
      // Update runner
      runner.update(engine.getDeltaTime());

      // Update camera yaw ref for input
      cameraYawRef.current = camController.yaw;

      const interp = runner.Simulation.interpolationFactor;

      // Track which entities are alive this frame
      const aliveEntities = new Set<number>();

      for (const entity of charFilter) {
        aliveEntities.add(entity);

        let charMesh = characterMeshes.get(entity);
        if (!charMesh) {
          // Determine player slot for color
          let slot = 0;
          for (let s = 0; s < runner.Config.maxPlayers; s++) {
            const pr = playerResources.get(PlayerResource, s);
            if (pr.safe.entity === entity) { slot = s; break; }
          }
          charMesh = new CharacterMesh(scene, entity, slot);
          characterMeshes.set(entity, charMesh);
        }

        const t = transform3d.unsafe;
        const a = animState.unsafe;

        charMesh.updateVisuals(
          t.positionX[entity], t.positionY[entity], t.positionZ[entity],
          t.prevPositionX[entity], t.prevPositionY[entity], t.prevPositionZ[entity],
          t.rotationX[entity], t.rotationY[entity], t.rotationZ[entity], t.rotationW[entity],
          t.prevRotationX[entity], t.prevRotationY[entity], t.prevRotationZ[entity], t.prevRotationW[entity],
          a.animationId[entity],
          interp,
        );

        // Camera follows local player
        if (localSlot !== undefined) {
          const pr = playerResources.get(PlayerResource, localSlot);
          if (pr.safe.entity === entity) {
            camController.setTarget(
              charMesh.mesh.position.x,
              charMesh.mesh.position.y,
              charMesh.mesh.position.z,
            );
          }
        }
      }

      // Remove dead entities
      for (const [entity, mesh] of characterMeshes) {
        if (!aliveEntities.has(entity)) {
          mesh.dispose();
          characterMeshes.delete(entity);
        }
      }

      scene.render();
    });

    // Resize handling
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine.stopRenderLoop();
      for (const mesh of characterMeshes.values()) mesh.dispose();
      characterMeshes.clear();
      scene.dispose();
      engine.dispose();
    };
  }, [runner, cameraYawRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
};
