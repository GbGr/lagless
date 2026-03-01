import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

export class CameraController {
  public readonly camera: ArcRotateCamera;
  private _targetPosition = Vector3.Zero();

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 12, Vector3.Zero(), scene);
    this.camera.lowerRadiusLimit = 3;
    this.camera.upperRadiusLimit = 25;
    this.camera.lowerBetaLimit = 0.2;
    this.camera.upperBetaLimit = Math.PI / 2 - 0.1;
    this.camera.panningSensibility = 0; // Disable panning
    this.camera.attachControl(canvas, true);
  }

  /**
   * Camera yaw in radians. Suitable for the CharacterMove RPC.
   * alpha is the horizontal rotation angle of ArcRotateCamera.
   * We convert to yaw where 0 = looking along +Z.
   */
  public get yaw(): number {
    return -(this.camera.alpha + Math.PI / 2);
  }

  public setTarget(x: number, y: number, z: number): void {
    this._targetPosition.set(x, y, z);
    this.camera.target.copyFrom(this._targetPosition);
  }
}
