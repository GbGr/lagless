import { IAbstractInput, InputData, InputMeta } from '@lagless/types';

export class RPC<TInput extends IAbstractInput = IAbstractInput> {
  constructor(
    public readonly inputId: IAbstractInput['id'],
    public readonly meta: InputMeta,
    public readonly data: InputData<TInput>,
  ) {
  }
}
