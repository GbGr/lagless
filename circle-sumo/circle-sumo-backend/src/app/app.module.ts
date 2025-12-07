import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import {
  GameSchema, GameSessionSchema, LoginLogSchema, MatchmakingSessionSchema, PlayerSchema
} from '@lagless/schemas';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LaglessPlayerModule } from '@lagless/player';
import { LaglessGameModule } from '@lagless/game';
import { SumoPlayerSkinsSchema } from './sumo-player-skins.schema';
import { SumoPlayerController } from './sumo-player.controller';
import { SumoPlayerService } from './sumo-player.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        type: 'postgres',
        synchronize: true,
        logging: true,
        url: config.getOrThrow('DB_CONNECTION_STRING'),
        entities: [
          PlayerSchema,
          LoginLogSchema,
          GameSchema,
          GameSessionSchema,
          MatchmakingSessionSchema,
          SumoPlayerSkinsSchema,
        ],
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([
      PlayerSchema,
      SumoPlayerSkinsSchema,
    ]),

    LaglessPlayerModule,
    LaglessGameModule,
  ],
  controllers: [AppController, SumoPlayerController],
  providers: [SumoPlayerService],
})
export class AppModule {}
