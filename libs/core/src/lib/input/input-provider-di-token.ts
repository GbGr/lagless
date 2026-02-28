import { AbstractInputProvider } from './abstract-input-provider.js';

export class InputProvider extends AbstractInputProvider {
  public override playerSlot = -1;

  public get verifiedTick(): number {
    return -1;
  }

  public getInvalidateRollbackTick() {
    return undefined;
  }
}
