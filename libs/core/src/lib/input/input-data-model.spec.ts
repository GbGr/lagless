import { align8 } from '@lagless/misc';
import { FieldType, InputFieldDefinition, InputMeta } from '@lagless/types';
import { InputRegistry } from './input-registry.js';
import { RPC } from './rpc.js';

export class Move {
  public static readonly id = 1;
  public readonly id = 1;

  public readonly byteLength = align8(4) + align8(4) + align8(32);

  public readonly fields = [
    { name: 'directionX', type: FieldType.Float32, isArray: false, byteLength: align8(4) } as InputFieldDefinition,
    { name: 'directionY', type: FieldType.Float32, isArray: false, byteLength: align8(4) } as InputFieldDefinition,
    {
      name: 'entities',
      type: FieldType.Uint32,
      isArray: true,
      arrayLength: 8,
      byteLength: align8(4 * 8),
    } as InputFieldDefinition,
  ];

  public readonly schema!: {
    directionX: number;
    directionY: number;
    entities: Uint32Array;
  };
}

export class Shoot {
  public static readonly id = 2;
  public readonly id = 2;

  public readonly byteLength = align8(4) + align8(4) + align8(1);

  public readonly fields = [
    { name: 'directionX', type: FieldType.Float32, isArray: false, byteLength: align8(4) } as InputFieldDefinition,
    { name: 'directionY', type: FieldType.Float32, isArray: false, byteLength: align8(4) } as InputFieldDefinition,
    { name: 'weapon', type: FieldType.Uint8, isArray: false, byteLength: align8(1) } as InputFieldDefinition,
  ];

  public readonly schema!: {
    directionX: number;
    directionY: number;
    weapon: number;
  };
}

export class Drive {
  public static readonly id = 3;
  public readonly id = 3;

  public readonly byteLength = align8(4) + align8(4);

  public readonly fields = [
    { name: 'directionX', type: FieldType.Float32, isArray: false, byteLength: align8(4) } as InputFieldDefinition,
    { name: 'directionY', type: FieldType.Float32, isArray: false, byteLength: align8(4) } as InputFieldDefinition,
  ];

  public readonly schema!: {
    directionX: number;
    directionY: number;
  };
}

describe('InputDataModel', () => {
  it('should pack and unpack RPCs correctly', () => {
    const inputRegistry = new InputRegistry([Move, Shoot, Drive]);

    const inputMeta: InputMeta = { tick: 1, ts: Date.now(), playerSlot: 0 };

    const rpcs = [
      new RPC<Move>(Move.id, inputMeta, {
        directionX: 99,
        directionY: 100,
        entities: new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]),
      }),
      new RPC<Shoot>(Shoot.id, inputMeta, { directionX: 0.5, directionY: 0.5, weapon: 1 }),
    ];

    const pkg = inputRegistry.dataModel.packBatch(inputMeta, rpcs);

    // log pkg bytes for debugging
    console.log(`KB: ${pkg.byteLength / 1024}`, new Uint8Array(pkg));

    const restoredRPCs = inputRegistry.dataModel.unpackBatch(pkg);

    expect(restoredRPCs.length).toBe(2);
    expect(restoredRPCs[0].inputId).toBe(Move.id);
    expect(restoredRPCs[0].data.directionX).toBe(99);
    expect(restoredRPCs[0].data.directionY).toBe(100);
    expect(restoredRPCs[0].data.entities).toEqual(new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(restoredRPCs[1].inputId).toBe(Shoot.id);
    expect(restoredRPCs[1].data.directionX).toBe(0.5);
    expect(restoredRPCs[1].data.directionY).toBe(0.5);
    expect(restoredRPCs[1].data.weapon).toBe(1);
    expect(restoredRPCs[1].meta.tick).toBe(inputMeta.tick);
    expect(restoredRPCs[1].meta.ts).toBe(inputMeta.ts);
    expect(restoredRPCs[1].meta.playerSlot).toBe(inputMeta.playerSlot);

    // try to restore corrupted data
    const tmp = new Uint8Array(pkg);
    const corruptedPkg = new Uint8Array(tmp.length + 4);
    corruptedPkg.set(tmp);

    corruptedPkg[tmp.length] = 1; // corrupt the data by adding an extra byte

    expect(() => inputRegistry.dataModel.unpackBatch(corruptedPkg.buffer)).toThrowError();

    // small package
    const smallRPCs = [
      new RPC<Drive>(Drive.id, inputMeta, {
        directionX: 1,
        directionY: 2,
      }),
    ];

    const smallPkg = inputRegistry.dataModel.packBatch(inputMeta, smallRPCs);

    console.log(`Small KB: ${smallPkg.byteLength / 1024}`, new Uint8Array(smallPkg));

    const restoredSmallRPCs = inputRegistry.dataModel.unpackBatch(smallPkg);
    expect(restoredSmallRPCs.length).toBe(1);
    expect(restoredSmallRPCs[0].inputId).toBe(Drive.id);
    expect(restoredSmallRPCs[0].data.directionX).toBe(1);
    expect(restoredSmallRPCs[0].data.directionY).toBe(2);
    expect(restoredSmallRPCs[0].meta.tick).toBe(inputMeta.tick);
    expect(restoredSmallRPCs[0].meta.ts).toBe(inputMeta.ts);
    expect(restoredSmallRPCs[0].meta.playerSlot).toBe(inputMeta.playerSlot);

    // empty package
    const emptyPkg = inputRegistry.dataModel.packBatch(inputMeta, []);
    console.log(`Empty KB: ${emptyPkg.byteLength / 1024}`, new Uint8Array(emptyPkg));
  });
});
