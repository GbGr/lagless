import { toFloat32 } from '@lagless/binary';

export type VJDirectionListener = (direction: number) => void;
export type VJUnsubscribe = () => void;

export class VirtualJoystickCtx {
  private _direction = 0;
  private _axisX = 0;
  private _axisY = 0;
  private _power = 0;
  private readonly _directionListeners = new Set<VJDirectionListener>();

  public get direction(): number {
    return this._direction;
  }

  public get axisX(): number {
    return this._axisX;
  }

  public get axisY(): number {
    return this._axisY;
  }

  public get power(): number {
    return this._power;
  }

  public setPower(power: number): void {
    this._power = toFloat32(power);
  }

  public setAxis(x: number, y: number): void {
    this._axisX = toFloat32(x);
    this._axisY = toFloat32(y);
  }

  public setDirection(direction: number): void {
    this._direction = toFloat32(direction);
    this._directionListeners.forEach((listener) => listener(this._direction));
  }

  public addDirectionChangeListener(handler: VJDirectionListener): VJUnsubscribe {
    this._directionListeners.add(handler);
    return () => {
      this._directionListeners.delete(handler);
    };
  }
}
