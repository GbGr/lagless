import { Server } from 'colyseus';
import { RelayColyseusRoom } from '@lagless/colyseus-rooms';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const gameServer = new Server({
  // transport: new uWebSocketsTransport(),
  // driver: new RedisDriver(),
  // presence: new RedisPresence(),
});

// gameServer.simulateLatency(200);

gameServer.define('relay', RelayColyseusRoom);
gameServer.listen(port).then(
  () => console.log(`ColyseusServer started at ws://${host}:${port}`),
  (e) => console.error(`ColyseusServer ERROR:`, e),
);
