import { AbstractInputProvider } from './abstract-input-provider.js';

export class InputProvider extends AbstractInputProvider {
  public getInvalidateRollbackTick() {
    return undefined;
  }
}
