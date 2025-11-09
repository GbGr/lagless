import { InputBinarySchema } from '@lagless/binary';
import { describe, expect, it } from 'vitest';
import { MoveInput, MoveMultipleInput, TestbedInputRegistry } from './schema/code-gen/index.js';

describe('Input', () => {
  describe('InputBinarySchema', () => {
    it('should work empty', () => {
      const emptyFrameRPC = InputBinarySchema.packBatch(TestbedInputRegistry, []);
      expect(emptyFrameRPC).toBeInstanceOf(ArrayBuffer);
      expect(emptyFrameRPC.byteLength).toBe(0);

      // unpack should return empty array as well
      const unpacked = InputBinarySchema.unpackBatch(TestbedInputRegistry, emptyFrameRPC);
      expect(unpacked).toEqual([]);
    });

    it('should pack and unpack single input', () => {
      const src = [{ inputId: MoveInput.id, values: { direction: 0, speed: 0 } }];
      const frameRPC = InputBinarySchema.packBatch(TestbedInputRegistry, src);
      expect(frameRPC).toBeInstanceOf(ArrayBuffer);
      expect(frameRPC.byteLength).toBe(9); // 1 byte id + 2 * 4-byte fields

      const unpacked = InputBinarySchema.unpackBatch(TestbedInputRegistry, frameRPC);
      expect(unpacked.length).toBe(1);
      expect(unpacked[0].inputId).toBe(MoveInput.id);
      expect(unpacked[0].values).toEqual({ direction: 0, speed: 0 });
    });

    it('should pack and unpack multiple inputs sequentially', () => {
      const src = [
        { inputId: MoveInput.id, values: { direction: 1, speed: 3.5 } },
        { inputId: MoveInput.id, values: { direction: -1, speed: 0.25 } },
        { inputId: MoveMultipleInput.id, values: {
            direction: 0.5,
            speed: 2.75,
            entities: [1, 2, 3, 4, 5, ...Array.from({ length: 32 - 5 }, () => 0)],
            entitiesLength: 5,
          }
        },
      ] as const;

      const buf = InputBinarySchema.packBatch(TestbedInputRegistry, src);
      expect(buf).toBeInstanceOf(ArrayBuffer);

      const unpacked = InputBinarySchema.unpackBatch(TestbedInputRegistry, buf);
      expect(unpacked.length).toBe(src.length);

      // Compare item-by-item
      for (let i = 0; i < src.length; i++) {
        expect(unpacked[i].inputId).toBe(src[i].inputId);
        expect(unpacked[i].values).toEqual(src[i].values);
      }
    });

    it('should throw on truncated buffer', () => {
      const src = [{ inputId: MoveInput.id, values: { direction: 2, speed: 4 } }];
      const buf = InputBinarySchema.packBatch(TestbedInputRegistry, src);

      // Make a truncated copy (drop last 2 bytes)
      const truncated = buf.slice(0, buf.byteLength - 2);

      expect(() => InputBinarySchema.unpackBatch(TestbedInputRegistry, truncated)).toThrowError();
    });
  });
});
