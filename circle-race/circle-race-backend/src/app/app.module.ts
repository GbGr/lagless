import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  GameSchema, GameSessionSchema, LoginLogSchema, MatchmakingSessionSchema, PlayerSchema
} from '@lagless/schemas';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LaglessPlayerModule } from '@lagless/player';
import { LaglessGameModule } from '@lagless/game';

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
        ],
      }),
      inject: [ConfigService],
    }),

    LaglessPlayerModule,
    LaglessGameModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
