import { PlayerInfo, RelayColyseusRoom } from '@lagless/colyseus-rooms';
import { RPC } from '@lagless/core';
import { now, UUID } from '@lagless/misc';
import { Client } from 'colyseus';
import { CircleRaceSimulationInputRegistry, PlayerJoined, PlayerLeft } from '@lagless/circle-race-simulation';
import { NestDI } from '../nest-di';
import { GameService } from '@lagless/game';

export class CircleRaceRelayColyseusRoom extends RelayColyseusRoom {
  private readonly _GameService = NestDI.resolve(GameService);

  protected override async onPlayerJoined(gameId: string, playerInfo: PlayerInfo): Promise<void> {
    if (!playerInfo.playerId) throw new Error('InvalidPlayerId');
    await this._GameService.internalStartGameSession(playerInfo.playerId, playerInfo.playerSlot, gameId, playerInfo.connectedAt);
  }

  protected override async onPlayerFinishedGame(gameId: string, playerInfo: PlayerInfo): Promise<void> {
    console.log('onPlayerFinishedGame', gameId, playerInfo);
    if (!playerInfo.playerId) throw new Error('InvalidPlayerId');
    if (!playerInfo.finishedGameData) throw new Error('No finished game data');
    const { score, mmrChange } = playerInfo.finishedGameData.struct;
    await this._GameService.internalPlayerFinishedGameSession(
      playerInfo.playerId,
      gameId,
      score,
      mmrChange,
      playerInfo.finishedGameData.hash,
      playerInfo.finishedGameData.ts,
    );
  }

  protected override async onBeforeDispose(gameId: string, isDestroyed: boolean): Promise<void> {
    await this._GameService.internalGameOver(gameId, new Date(), isDestroyed)
  }

  protected override async onPlayerLeave(gameId: string, playerInfo: PlayerInfo): Promise<void> {
    if (!playerInfo.playerId) throw new Error('InvalidPlayerId');
    await this._GameService.internalPlayerLeaveGameSession(playerInfo.playerId, gameId, new Date());
  }

  public override maxClients = 6;

  public override async onJoin(client: Client) {
    super.onJoin(client);
    const tick = this._serverTick(now() + 1);
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) throw new Error('Invalid player slot');
    const rpc = new RPC<PlayerJoined>(
      PlayerJoined.id,
      { tick, playerSlot, ordinal: 0, seq: 0 },
      {
        playerId: UUID.generate().asUint8(),
      }
    );
    this.sendServerInputFanout(rpc, CircleRaceSimulationInputRegistry);
  }

  public override async onLeave(client: Client, consented: boolean) {
    console.log('onLeave', client.sessionId, consented);
    const tick = this._serverTick(now() + 2);
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) throw new Error('Invalid player slot');
    const rpc = new RPC<PlayerLeft>(
      PlayerLeft.id,
      { tick, playerSlot, ordinal: 0, seq: 0 },
      { reason: consented ? 0 : 1 }
    );
    this.sendServerInputFanout(rpc, CircleRaceSimulationInputRegistry);
    await super.onLeave(client, consented);
  }
}
