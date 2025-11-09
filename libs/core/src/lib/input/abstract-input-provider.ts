import { ECSSimulation } from '../ecs-simulation.js';
import { IAbstractInputConstructor, InputData, InputMeta } from '../types/index.js';
import { ECSConfig } from '../ecs-config.js';
import { InputRegistry } from './input-registry.js';
import { RPCHistory } from './rpc-history.js';
import { RPC } from './rpc.js';

export abstract class AbstractInputProvider {
  private _nextOrdinal = 1;
  private readonly _inputDrainers: Set<InputDrainerFn> = new Set();
  protected _frameRPCBuffer: Array<RPC> = [];
  protected _frameLength: number;

  protected _currentInputDelay: number;
  protected _simulation!: ECSSimulation;
  protected readonly _rpcHistory = new RPCHistory();

  public abstract playerSlot: number;

  public abstract getInvalidateRollbackTick(): void | number;

  constructor(
    public readonly ecsConfig: ECSConfig,
    protected readonly _inputRegistry: InputRegistry,
  ) {
    this._frameLength = this.ecsConfig.frameLength;
    this._currentInputDelay = this.ecsConfig.inputDelay;
  }

  public getUpdateOrdinal(): number {
    return this._nextOrdinal++;
  }

  public update(): void {
    this._frameRPCBuffer.length = 0;
    this._inputDrainers.forEach((drainFn) => drainFn(this.addRpc));
  }

  public init(simulation: ECSSimulation): void {
    this._simulation = simulation;
  }

  private addRpc = <TInputCtor extends IAbstractInputConstructor>(
    InputCtor: TInputCtor,
    data: InputData<InstanceType<TInputCtor>>,
  ): void => {
    const newRPCMeta: InputMeta = {
      tick: this._simulation.tick + this._currentInputDelay,
      ordinal: this.getUpdateOrdinal(),
      playerSlot: this.playerSlot,
    };
    const rpc = new RPC(InputCtor.id, newRPCMeta, data);
    this._frameRPCBuffer.push(rpc);
    this._rpcHistory.addRPC(rpc);
    console.log(`Added RPC for tick ${newRPCMeta.tick}, slot ${newRPCMeta.playerSlot}, inputId ${InputCtor.id}`);
  };

  public drainInputs(fn: InputDrainerFn): () => void {
    this._inputDrainers.add(fn);

    return () => {
      this._inputDrainers.delete(fn);
    };
  }

  public dispose(): void {
  //
  }
}

type InputDrainerFn = (addRPC: AbstractInputProvider['addRpc']) => void;
