import { matchMaker, Room } from 'colyseus';

const DEFAULT_CODE_LENGTH = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomCodeService {
  private readonly _codeToRoomId = new Map<string, string>();
  private readonly _roomIdToCode = new Map<string, string>();

  public createCode(roomId: string, length = DEFAULT_CODE_LENGTH): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = this.generateCode(length);
      if (this._codeToRoomId.has(code)) continue;

      this._codeToRoomId.set(code, roomId);
      this._roomIdToCode.set(roomId, code);
      return code;
    }

    throw new Error('Failed to generate unique room code');
  }

  public getRoomId(code: string): string | undefined {
    return this._codeToRoomId.get(code.toUpperCase());
  }

  public removeByRoomId(roomId: string): void {
    const code = this._roomIdToCode.get(roomId);
    if (!code) return;
    this._roomIdToCode.delete(roomId);
    this._codeToRoomId.delete(code);
  }

  public async resolveRoom(roomId: string): Promise<Room | null> {
    const mm = matchMaker as unknown as { getRoomById?: (id: string) => Promise<Room>; _rooms?: Map<string, Room> };
    if (mm.getRoomById) {
      return await mm.getRoomById(roomId);
    }

    if (mm._rooms && mm._rooms.has(roomId)) {
      return mm._rooms.get(roomId) ?? null;
    }

    return null;
  }

  private generateCode(length: number): string {
    let result = '';
    for (let i = 0; i < length; i += 1) {
      const index = Math.floor(Math.random() * CODE_ALPHABET.length);
      result += CODE_ALPHABET[index];
    }
    return result;
  }
}
