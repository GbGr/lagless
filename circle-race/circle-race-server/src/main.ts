import '@abraham/reflection';
import { RPC } from '@lagless/core';
import { Client, matchMaker, RedisDriver, RedisPresence, Server } from 'colyseus';
import { now, UUID } from '@lagless/misc';
import { BaseMatchmakerRoom, MatchmakingConfig, RelayColyseusRoom } from '@lagless/colyseus';
import { CircleRaceSimulationInputRegistry, PlayerJoined, PlayerLeft } from '@lagless/circle-race-simulation';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const gameServer = new Server({
  greet: false,
  driver: new RedisDriver(),
  presence: new RedisPresence(),
  logger: console,
  selectProcessIdToCreateRoom: async function (roomName: string, clientOptions: any) {
    console.log(`selectProcessIdToCreateRoom: roomName=${roomName}`, clientOptions);
    return (await matchMaker.stats.fetchAll())
      .sort((p1, p2) => p1.roomCount > p2.roomCount ? 1 : -1)[0]
      .processId;
  },

});

// gameServer.simulateLatency(200);

class CircleRaceMatchmakingRoom extends BaseMatchmakerRoom {
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

class CircleRaceRelayColyseusRoom extends RelayColyseusRoom {
  public override async onJoin(client: Client) {
    super.onJoin(client);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const tick = this._serverTick(now() + 20);
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) throw new Error('Invalid player slot');
    const rpc = new RPC<PlayerJoined>(PlayerJoined.id, { tick, playerSlot, ordinal: 0, seq: 0 }, {
      playerId: UUID.generate().asUint8(),
    });
    this.sendServerInputFanout(rpc, CircleRaceSimulationInputRegistry);
  }

  public override onLeave(client: Client, consented: boolean) {
    console.log('onLeave', client.sessionId, consented);
    const tick = this._serverTick(now() + 2);
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) throw new Error('Invalid player slot');
    const rpc = new RPC<PlayerLeft>(PlayerLeft.id, { tick, playerSlot, ordinal: 0, seq: 0 }, { reason: consented ? 0 : 1 });
    this.sendServerInputFanout(rpc, CircleRaceSimulationInputRegistry);
    super.onLeave?.(client, consented);
  }
}

gameServer.define('relay', CircleRaceRelayColyseusRoom);
gameServer.define('matchmaking', CircleRaceMatchmakingRoom);
gameServer.listen(port).then(
  () => console.log(`ColyseusServer started at ws://${host}:${port}`),
  (e) => console.error(`ColyseusServer ERROR:`, e),
);
