import {
  FieldType,
  IAbstractInput,
  InputData,
  InputMeta,
  TypedArray,
  TypedArrayConstructor,
} from '@lagless/types';
import { InputRegistry } from './input-registry.js';
import { align8, MemoryTracker } from '@lagless/misc';
import {
  fieldTypeSizeBytes, readTypedValue, typedArrayConstructors, writeTypedValue,
} from '../mem/typed-value-accessors.js';
import { RPC } from './rpc.js';
import { PackageType } from './package-type.js';

const INPUT_ID_SIZE = align8(fieldTypeSizeBytes[FieldType.Uint32]); // size of inputId in bytes
const META_SIZE = align8(
  fieldTypeSizeBytes[FieldType.Uint8] + // packageType
  fieldTypeSizeBytes[FieldType.Uint32] + // tick
  fieldTypeSizeBytes[FieldType.Float64] + // ts
  fieldTypeSizeBytes[FieldType.Uint8]    // playerSlot
);
const META_SHEMA: { [key in keyof InputMeta]: FieldType } & { packageType: FieldType } = {
  packageType: FieldType.Uint8,
  tick: FieldType.Uint32,
  ts: FieldType.Float64,
  playerSlot: FieldType.Uint8,
};

export class InputDataModel {
  constructor(private readonly _inputRegistry: InputRegistry) {}

  public packBatch(
    meta: InputMeta,
    rpcs: Array<RPC>
  ): ArrayBuffer {
    const packItems = rpcs.map((rpc) => {
      const inputInstance = this._inputRegistry.getById(rpc.inputId);

      return {
        rpc,
        input: inputInstance,
      };
    });

    const inputsSize = packItems.reduce((acc, item) => {
      return acc + INPUT_ID_SIZE + item.input.byteLength;
    }, 0);
    const totalSize = META_SIZE + inputsSize;
    const buffer = new ArrayBuffer(totalSize);
    const dataView = new DataView(buffer);
    const tracker = new MemoryTracker();

    this.writeMeta(dataView, tracker, meta);

    for (const { rpc, input } of packItems) {
      writeTypedValue(dataView, tracker.ptr, FieldType.Uint32, rpc.inputId);
      tracker.add(INPUT_ID_SIZE);

      for (const fieldDefinition of input.fields) {
        if (fieldDefinition.isArray) {
          const typedArray = new ((rpc.data[fieldDefinition.name] as TypedArray).constructor as TypedArrayConstructor)(
            dataView.buffer,
            tracker.ptr,
            fieldDefinition.arrayLength,
          );
          typedArray.set(rpc.data[fieldDefinition.name] as TypedArray);
        } else {
          writeTypedValue(dataView, tracker.ptr, fieldDefinition.type, rpc.data[fieldDefinition.name] as number);
        }

        tracker.add(fieldDefinition.byteLength);
      }
    }

    if (tracker.ptr !== totalSize) {
      throw new Error(`Packed data size mismatch: expected ${totalSize}, got ${tracker.ptr}`);
    }

    return buffer;
  }

  public unpackBatch(buffer: ArrayBuffer): Array<RPC> {
    const dataView = new DataView(buffer);
    const tracker = new MemoryTracker();
    const meta = this.readMeta(dataView, tracker);
    const rpcs: Array<RPC> = [];

    while (tracker.ptr < buffer.byteLength) {
      const inputId = dataView.getUint32(tracker.ptr, true);
      tracker.add(INPUT_ID_SIZE);

      const inputInstance = this._inputRegistry.getById(inputId);
      if (!inputInstance) {
        throw new Error(`Input with id ${inputId} not found`);
      }

      const rpcData = {} as InputData<IAbstractInput>;
      for (const fieldDefinition of inputInstance.fields) {
        if (fieldDefinition.isArray) {
          const typedArray = new (typedArrayConstructors[fieldDefinition.type])(
            buffer,
            tracker.ptr,
            fieldDefinition.arrayLength,
          );
          const typedArrayToSave = new (typedArrayConstructors[fieldDefinition.type])(typedArray.length);
          typedArrayToSave.set(typedArray);

          rpcData[fieldDefinition.name] = typedArrayToSave;
        } else {
          rpcData[fieldDefinition.name] = readTypedValue(dataView, tracker.ptr, fieldDefinition.type);
        }
        tracker.add(fieldDefinition.byteLength);
      }

      rpcs.push(new RPC(inputId, meta, rpcData));
    }

    return rpcs;
  }

  private writeMeta(
    dataView: DataView,
    tracker: MemoryTracker,
    meta: InputMeta
  ): void {
    let offset = tracker.ptr;

    // Write package type
    writeTypedValue(dataView, offset, META_SHEMA.packageType, PackageType.RPC);
    offset += fieldTypeSizeBytes[META_SHEMA.packageType];
    writeTypedValue(dataView, offset, META_SHEMA.tick, meta.tick);
    offset += fieldTypeSizeBytes[META_SHEMA.tick];
    writeTypedValue(dataView, offset, META_SHEMA.ts, meta.ts);
    offset += fieldTypeSizeBytes[META_SHEMA.ts];
    writeTypedValue(dataView, offset, META_SHEMA.playerSlot, meta.playerSlot);

    tracker.add(META_SIZE);
  }

  private readMeta(
    dataView: DataView,
    tracker: MemoryTracker
  ): InputMeta {
    let offset = tracker.ptr;

    const packageType = readTypedValue(dataView, offset, META_SHEMA.packageType);
    offset += fieldTypeSizeBytes[META_SHEMA.packageType];
    if (packageType !== PackageType.RPC) {
      throw new Error(`Unsupported package type: ${packageType}`);
    }

    const meta = {} as InputMeta;

    meta.tick = readTypedValue(dataView, offset, META_SHEMA.tick);
    offset += fieldTypeSizeBytes[META_SHEMA.tick];
    meta.ts = readTypedValue(dataView, offset, META_SHEMA.ts);
    offset += fieldTypeSizeBytes[META_SHEMA.ts];
    meta.playerSlot = readTypedValue(dataView, offset, META_SHEMA.playerSlot);

    tracker.add(META_SIZE);
    return meta;
  }
}
