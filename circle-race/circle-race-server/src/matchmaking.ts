import { BaseMatchmakerRoom, MatchmakingConfig } from '@lagless/colyseus-rooms';

export class CircleRaceMatchmakingRoom extends BaseMatchmakerRoom {
  protected override _getAuthSecret(): string {
    return 'secret';
  }
  protected override getFrameLength(): number {
    return 1000 / 60;
  }
  protected override getMatchmakingConfig(): MatchmakingConfig {
    return {
      virtualCapacity: 4,
      maxHumans: 4,

      softMinHumans: 2,
      hardMinHumans: 1,

      startDelayByHumans: {
        1: 5000,
        2: 3000,
        3: 2000,
        4: 1000,
        default: 2000,
      },

      baseMmrWindow: 100,
      maxMmrWindow: 600,

      baseMaxPing: 50,
      maxMaxPing: 200,

      loadTargetQueueSize: 10,
    };
  }

  protected override getGameRoomName(): string {
    return 'relay';
  }
}
