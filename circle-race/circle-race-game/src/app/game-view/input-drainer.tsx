import { FC, useEffect } from 'react';
import { useVirtualJoystick } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { Move } from '@lagless/circle-race-simulation';

export const InputDrainer: FC = () => {
  const runner = useRunner();
  const joystickCtx = useVirtualJoystick();

  useEffect(() => {
    let prevPower = joystickCtx.power;
    let prevDirection = joystickCtx.direction;

    const unsubscribe = runner.InputProviderInstance.drainInputs((addRPC) => {
      if (joystickCtx.power !== prevPower || joystickCtx.direction !== prevDirection) {
        addRPC(Move, { direction: joystickCtx.direction, speed: joystickCtx.power });
        prevPower = joystickCtx.power;
        prevDirection = joystickCtx.direction;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [joystickCtx, runner]);

  return null;
};
