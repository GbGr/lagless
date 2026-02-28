import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VisualSmoother3d } from '@lagless/misc';
import { AnimationId } from '@lagless/animation-controller';

const ANIM_COLORS: Record<number, Color3> = {
  [AnimationId.IDLE]: new Color3(0.2, 0.6, 1.0),
  [AnimationId.LOCOMOTION]: new Color3(0.2, 1.0, 0.4),
  [AnimationId.JUMP]: new Color3(1.0, 1.0, 0.2),
  [AnimationId.FALL]: new Color3(1.0, 0.5, 0.2),
  [AnimationId.LAND]: new Color3(0.8, 0.3, 1.0),
};

const PLAYER_COLORS = [
  new Color3(0.2, 0.6, 1.0),
  new Color3(1.0, 0.3, 0.3),
  new Color3(0.3, 1.0, 0.3),
  new Color3(1.0, 1.0, 0.3),
];

export class CharacterMesh {
  public readonly mesh: Mesh;
  public readonly material: StandardMaterial;
  public readonly smoother: VisualSmoother3d;
  private _lastAnimId = -1;

  constructor(scene: Scene, public readonly entity: number, playerSlot: number) {
    this.mesh = MeshBuilder.CreateCapsule(`character_${entity}`, {
      height: 2,
      radius: 0.3,
    }, scene);
    this.mesh.position.y = 1;

    this.material = new StandardMaterial(`charMat_${entity}`, scene);
    this.material.diffuseColor = PLAYER_COLORS[playerSlot % PLAYER_COLORS.length];
    this.mesh.material = this.material;

    this.smoother = new VisualSmoother3d();
  }

  public updateVisuals(
    posX: number, posY: number, posZ: number,
    prevPosX: number, prevPosY: number, prevPosZ: number,
    rotX: number, rotY: number, rotZ: number, rotW: number,
    prevRotX: number, prevRotY: number, prevRotZ: number, prevRotW: number,
    animId: number,
    interpolationFactor: number,
  ): void {
    // VisualSmoother3d.update(prevPos, pos, prevRot, rot, interpolationFactor)
    this.smoother.update(
      prevPosX, prevPosY, prevPosZ,
      posX, posY, posZ,
      prevRotX, prevRotY, prevRotZ, prevRotW,
      rotX, rotY, rotZ, rotW,
      interpolationFactor,
    );

    this.mesh.position.set(this.smoother.x, this.smoother.y, this.smoother.z);
    if (!this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion = new Quaternion();
    }
    this.mesh.rotationQuaternion.set(this.smoother.rotX, this.smoother.rotY, this.smoother.rotZ, this.smoother.rotW);

    // Color change based on animation state
    if (animId !== this._lastAnimId) {
      this._lastAnimId = animId;
      const color = ANIM_COLORS[animId];
      if (color) {
        this.material.emissiveColor = color.scale(0.3);
      }
    }
  }

  public dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
  }
}
