import '@abraham/reflection';
import { Client, Server } from 'colyseus';
import { RelayColyseusRoom } from '@lagless/relay-colyseus-room';
import { BinarySchemaPackPipeline, InputBinarySchema } from '@lagless/binary';
import { TickInputKind, TickInputStruct } from '@lagless/net-wire';
import { now, UUID } from '@lagless/misc';
import { CircleRaceSimulationInputRegistry, PlayerJoined } from '@lagless/circle-race-simulation';
import { RPC } from '@lagless/core';

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
    const packedInputs = InputBinarySchema.packBatch(
      CircleRaceSimulationInputRegistry,
      [{ inputId: rpc.inputId, ordinal: rpc.meta.ordinal, values: rpc.data }],
    );
    const tickInputPipeline = new BinarySchemaPackPipeline();
    tickInputPipeline.pack(TickInputStruct, {
      tick,
      seq: 0,
      playerSlot,
      kind: TickInputKind.Server,
    });
    tickInputPipeline.appendBuffer(packedInputs);

    this.sendServerInputFanout([tickInputPipeline.toUint8Array()]);
  }
}

gameServer.define('relay', CircleRaceRelayColyseusRoom);
gameServer.listen(port).then(
  () => console.log(`ColyseusServer started at ws://${host}:${port}`),
  (e) => console.error(`ColyseusServer ERROR:`, e),
);
