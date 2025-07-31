import { RPCHistory } from '../rpc-history.js';
import { InputRegistry } from '../input-registry.js';
import { RPC } from '../rpc.js';
import { IAbstractInputConstructor, InputData, InputMeta } from '@lagless/types';
import { ECSSimulation } from '../../ecs-simulation.js';
import { SimulationClock } from '@lagless/misc';
import { ECSConfig } from '../../ecs-config.js';

const INPUT_META_BUFFER: InputMeta = { tick: 0, ts: 0, playerSlot: 0 };

export abstract class AbstractInputProvider {
  private readonly _inputDrainers = new Set<InputDrainerFn>();
  private readonly _inputDelay: number;

  public readonly rpcHistory = new RPCHistory();

  public abstract playerSlot: number;

  public abstract getInvalidateRollbackTick(): number | void;

  public abstract getFinalizedTick(): number;

  private _simulation!: ECSSimulation;
  private _clock!: SimulationClock;

  constructor(private readonly _ecsConfig: ECSConfig, private readonly _inputRegistry: InputRegistry) {
    this._inputDelay = this._ecsConfig.inputDelay;
  }

  public drainInputs(drainFn: InputDrainerFn): () => void {
    this._inputDrainers.add(drainFn);

    return () => {
      this._inputDrainers.delete(drainFn);
    };
  }

  public update(): void {
    this._inputDrainers.forEach((drainFn) => drainFn(this.addRpc));
  }

  public init(simulation: ECSSimulation): void {
    this._simulation = simulation;
    this._clock = simulation.clock;
  }

  public getTickRPCPackage(): ArrayBuffer {
    const tick = (INPUT_META_BUFFER.tick = this._simulation.tick);
    INPUT_META_BUFFER.playerSlot = this.playerSlot;
    INPUT_META_BUFFER.ts = this._clock.getElapsedTime();

    return this._inputRegistry.dataModel.packBatch(
      INPUT_META_BUFFER,
      this.rpcHistory.getSlotRPCs(tick, this.playerSlot),
    );
  }

  public addRpc = <TInputCtor extends IAbstractInputConstructor>(
    InputCtor: TInputCtor,
    data: InputData<InstanceType<TInputCtor>>,
  ): void => {
    const newRPCMeta: InputMeta = {
      tick: this._simulation.tick + this._inputDelay,
      ts: this._clock.getElapsedTime(),
      playerSlot: this.playerSlot,
    };
    this.rpcHistory.add(new RPC(InputCtor.id, newRPCMeta, data));
    console.log(`Added RPC for tick ${newRPCMeta.tick}, slot ${newRPCMeta.playerSlot}, inputId ${InputCtor.id}`);
  };

  public getSlotRPCs(tick: number, slot: number): Array<RPC> {
    return this.rpcHistory.getSlotRPCs(tick, slot) as Array<RPC>;
  }

  public findRPCs<TInputCtor extends IAbstractInputConstructor>(
    tick: number,
    slot: number,
    factory: TInputCtor,
  ): RPC<InstanceType<TInputCtor>>[] {
    return this.rpcHistory.findRPCs(tick, slot, factory);
  }
}

export class InputProvider extends AbstractInputProvider {
  // Fake implementation for DI ONLY!!!
  public playerSlot = 0;

  public getInvalidateRollbackTick(): number | void {
    return undefined
  }

  public getFinalizedTick(): number {
    return 0;
  }
}

type InputDrainerFn = (addRPC: AbstractInputProvider['addRpc']) => void;
