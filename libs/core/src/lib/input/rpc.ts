import { IAbstractInput, InputData, InputMeta } from '../types/index.js';

export class RPC<TInput extends IAbstractInput = IAbstractInput> {
  constructor(
    public readonly inputId: IAbstractInput['id'],
    public readonly meta: InputMeta,
    public readonly data: InputData<TInput>,
  ) {
  }
}
