import { IAbstractInput, IAbstractInputConstructor } from '../types/index.js';

export class InputRegistry {
  // private readonly _inputCtorToIdMap = new Map<IAbstractInputConstructor, number>();
  // private readonly _idToInputCtorMap = new Map<number, IAbstractInputConstructor>();
  // private readonly _inputToIdMap = new Map<IAbstractInput, number>();
  private readonly _idToInputMap = new Map<number, IAbstractInput>();

  constructor(
    private readonly _inputs: IAbstractInputConstructor[],
  ) {
    for (const InputCtor of this._inputs) {
      const InputInstance = new InputCtor();
      const id = InputInstance.id;
      this._idToInputMap.set(id, InputInstance);
      // this._inputToIdMap.set(InputInstance, id);
      // this._inputCtorToIdMap.set(InputCtor, id);
      // this._idToInputCtorMap.set(id, InputCtor);
    }
  }

  public get(inputId: number): IAbstractInput {
    const input = this._idToInputMap.get(inputId);
    if (!input) throw new Error(`Input with id ${inputId} not found`);

    return input;
  }
}
