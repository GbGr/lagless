import '@abraham/reflection';
import { RPC } from '@lagless/core';
import { Client, Server } from 'colyseus';
import { now, UUID } from '@lagless/misc';
import { RelayColyseusRoom } from '@lagless/relay-colyseus-room';
import { CircleRaceSimulationInputRegistry, PlayerJoined, PlayerLeft } from '@lagless/circle-race-simulation';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const gameServer = new Server({
  // transport: new uWebSocketsTransport(),
  // driver: new RedisDriver(),
  // presence: new RedisPresence(),
});

// gameServer.simulateLatency(200);

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
    // const packedInputs = InputBinarySchema.packBatch(
    //   CircleRaceSimulationInputRegistry,
    //   [{ inputId: rpc.inputId, ordinal: rpc.meta.ordinal, values: rpc.data }],
    // );
    // const tickInputPipeline = new BinarySchemaPackPipeline();
    // tickInputPipeline.pack(TickInputStruct, {
    //   tick,
    //   seq: 0,
    //   playerSlot,
    //   kind: TickInputKind.Server,
    // });
    // tickInputPipeline.appendBuffer(packedInputs);
    //
    // this.sendServerInputFanout([tickInputPipeline.toUint8Array()]);
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
gameServer.listen(port).then(
  () => console.log(`ColyseusServer started at ws://${host}:${port}`),
  (e) => console.error(`ColyseusServer ERROR:`, e),
);
