import { AbstractInputProvider } from './abstract-input-provider.js';

export class LocalInputProvider extends AbstractInputProvider {
  public override playerSlot = 0;

  public override getInvalidateRollbackTick(): number | void {
    return undefined;
  }

  public override getFinalizedTick(): number {
    return 0;
  }
}
