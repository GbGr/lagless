import { ECSDeps, IAbstractInput, IAbstractInputConstructor } from '@lagless/types';
import { InputDataModel } from './input-data-model.js';

export class InputRegistry {
  public readonly dataModel = new InputDataModel(this);

  private readonly _inputInstances = new Map<IAbstractInputConstructor, IAbstractInput>();
  private readonly _inputIdInstances = new Map<number, IAbstractInput>();

  constructor(
    public readonly _inputs: ECSDeps['inputs'],
  ) {
    for (const InputConstructor of this._inputs) {
      const inputInstance = new InputConstructor();
      this._inputInstances.set(InputConstructor, inputInstance);
      this._inputIdInstances.set(inputInstance.id, inputInstance);
    }
  }

  public get<IInputCtor extends IAbstractInputConstructor>(inputCtor: IInputCtor): InstanceType<IInputCtor> {
    return this._inputInstances.get(inputCtor) as InstanceType<IInputCtor>;
  }

  public getById(inputId: number): IAbstractInput {
    const instance = this._inputIdInstances.get(inputId);
    if (!instance) {
      throw new Error(`Input with id ${inputId} not found`);
    }

    return instance;
  }

  public [Symbol.iterator](): IterableIterator<IAbstractInput> {
    return this._inputInstances.values();
  }
}
