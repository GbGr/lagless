import { Injectable } from '@nestjs/common';
import { Repository, UpdateResult } from 'typeorm';
import { GameSchema, MatchmakingSessionSchema, PlayerSchema } from '@lagless/schemas';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class GameService {
  constructor(
    @InjectRepository(GameSchema)
    private readonly _GameSchemaRepository: Repository<GameSchema>,
    @InjectRepository(MatchmakingSessionSchema)
    private readonly _MatchmakingSessionSchemaRepository: Repository<MatchmakingSessionSchema>
  ) {}

  public async internalStartMatchmakingSession(
    playerId: PlayerSchema['id'],
    startedAt: Date
  ): Promise<MatchmakingSessionSchema> {
    return await this._MatchmakingSessionSchemaRepository.save({
      playerId,
      startedAt,
    });
  }

  public async internalCreateGame(
    sessions: Array<{ playerId: string; matchmakingSessionId: string | undefined }>
  ): Promise<GameSchema> {
    const gameSchema = await this._GameSchemaRepository.save({
      playersCount: sessions.length,
    });
    const promises = new Array<Promise<UpdateResult>>();

    for (const { matchmakingSessionId } of sessions) {
      if (!matchmakingSessionId) continue;

      promises.push(
        this._MatchmakingSessionSchemaRepository.update(
          { id: matchmakingSessionId },
          { gameId: gameSchema.id, matchedAt: new Date() }
        )
      );
    }

    Promise.all(promises).then((results) => {
      const totals = results.reduce((acc, result) => acc + (result.affected || 0), 0);
      console.log(`Updated ${totals} matchmaking sessions, linked to game ${gameSchema.id}`);
    }, console.error);

    return gameSchema;
  }

  public async internalCancelMatchmakingSession(matchmakingSessionId: MatchmakingSessionSchema['id']): Promise<void> {
    await this._MatchmakingSessionSchemaRepository.update({ id: matchmakingSessionId }, { cancelledAt: new Date() });
  }
}
