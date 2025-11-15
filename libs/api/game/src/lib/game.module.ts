import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameSchema, GameSessionSchema, MatchmakingSessionSchema } from '@lagless/schemas';
import { GameService } from './game.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ GameSchema, GameSessionSchema, MatchmakingSessionSchema ]),
  ],
  controllers: [],
  providers: [GameService],
  exports: [GameService],
})
export class LaglessGameModule {}
