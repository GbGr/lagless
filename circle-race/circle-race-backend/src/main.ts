import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

import config, { listen } from '@colyseus/tools';
import { monitor } from '@colyseus/monitor';
import { playground } from '@colyseus/playground';
import { matchMaker, LocalDriver, LocalPresence } from 'colyseus';
import { CircleRaceMatchmakingRoom } from './colyseus/matchmaking';
import { CircleRaceRelayColyseusRoom } from './colyseus/relay';
import { NestDI } from './nest-di';

const port = Number(process.env.PORT || 3000);

const colyseusApp = config({
  options: {
    presence: new LocalPresence(),
    driver: new LocalDriver(),
    selectProcessIdToCreateRoom: async function (roomName: string, clientOptions: any) {
      console.log('selectProcessIdToCreateRoom', roomName, clientOptions);
      try {
        return (await matchMaker.stats.fetchAll()).sort((p1, p2) => (p1.ccu > p2.ccu ? 1 : -1))[0].processId;
      } catch (e) {
        console.error('Error fetching process stats:', e);
        throw e;
      }
    },
  },

  initializeGameServer: (gameServer) => {
    gameServer.define('matchmaking', CircleRaceMatchmakingRoom);
    gameServer.define('relay', CircleRaceRelayColyseusRoom);
  },

  initializeExpress: async (app) => {
    const nestAppInstance = await bootstrap();
    app.use('/api', nestAppInstance);

    if (process.env.NODE_ENV !== 'production') {
      app.use('/', playground());
    }

    app.use('/monitor', monitor());
  },

  beforeListen: () => {
    /**
     * Before before gameServer.listen() is called.
     */
  },
});

// Create and listen on 2567 (or PORT environment variable.)
listen(colyseusApp, port).then(
  () => console.log(`Colyseus server is listening on http://localhost:${port}`),
  console.error
);


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  NestDI.setApp(app);
  await app.init();
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  return app.getHttpAdapter().getInstance();
}
