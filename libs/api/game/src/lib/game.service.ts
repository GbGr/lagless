import { Injectable } from '@nestjs/common';
import { Repository, UpdateResult } from 'typeorm';
import { GameSchema, GameSessionSchema, MatchmakingSessionSchema, PlayerSchema } from '@lagless/schemas';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class GameService {
  constructor(
    @InjectRepository(GameSchema)
    private readonly _GameSchemaRepository: Repository<GameSchema>,
    @InjectRepository(GameSessionSchema)
    private readonly _GameSessionSchemaRepository: Repository<GameSessionSchema>,
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

  public async internalStartGameSession(
    playerId: PlayerSchema['id'],
    playerSlot: number,
    gameId: GameSchema['id'],
    connectedAt: number,
  ) {
    await this._GameSessionSchemaRepository.insert(
      this._GameSessionSchemaRepository.create({
        gameId,
        playerId,
        slot: playerSlot,
        joinedAt: new Date(connectedAt),
      })
    );
  }

  public async internalPlayerLeaveGameSession(
    playerId: PlayerSchema['id'],
    gameId: GameSchema['id'],
    leavedAt: Date,
  ) {
    await this._GameSessionSchemaRepository.update(
      { playerId, gameId },
      { gameLeavedAt: leavedAt }
    )
  }

  public async internalGameOver(
    gameId: GameSchema['id'],
    gameOverAt: Date,
    isDestroyed: boolean,
  ) {
    await this._GameSchemaRepository.update(
      { id: gameId },
      isDestroyed ? { destroyedAt: gameOverAt } : { finishedAt: gameOverAt }
    );
  }

  public async internalPlayerFinishedGameSession(
    playerId: PlayerSchema['id'],
    gameId: GameSchema['id'],
    score: number,
    mmrChange: number,
    hash: number,
    ts: number,
  ) {
    await this._GameSchemaRepository.manager.transaction(async (manager) => {
      const [ player, gameSession ] = await Promise.all([
        manager.findOneOrFail(PlayerSchema, { where: { id: playerId } }),
        manager.findOneOrFail(GameSessionSchema, { where: { playerId, gameId } }),
      ]);

      player.mmr = Math.max(0, player.mmr + mmrChange);
      player.score += score;

      gameSession.hash = hash;
      gameSession.score = score;
      gameSession.mmrChange = mmrChange;
      gameSession.gameFinishedAt = new Date(ts);

      await Promise.all([
        manager.save(player),
        manager.save(gameSession),
      ]);
    });
  }
}
