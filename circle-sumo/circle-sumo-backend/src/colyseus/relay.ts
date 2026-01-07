// circle-sumo/circle-sumo-backend/src/colyseus/relay.ts

import {
  PlayerInfo,
  RelayColyseusRoomV2,
  RelayRoomV2Options,
} from '@lagless/colyseus-rooms';
import { RPC, ReplayInputProvider } from '@lagless/core';
import { UUID } from '@lagless/misc';
import { Client, Delayed } from 'colyseus';
import {
  CircleSumoInputRegistry,
  getRandomSkinId,
  PlayerJoined,
  PlayerLeft,
} from '@lagless/circle-sumo-simulation';
import { NestDI } from '../nest-di';
import { GameService } from '@lagless/game';
import fs from 'node:fs/promises';

const FULL_LOBBY_SIZE = 6;

/**
 * Circle Sumo relay room using V2 protocol.
 *
 * Supports:
 * - Late-join via snapshot voting
 * - Reconnection within grace period
 * - Room codes (via RoomCodeMatchmaker)
 */
export class CircleSumoRelayRoom extends RelayColyseusRoomV2 {
  private readonly _gameService = NestDI.resolve(GameService);
  private _allPlayersConnectedTimeout: Delayed | null = null;
  private _hasGameStarted = false;

  public override maxClients = FULL_LOBBY_SIZE;

  protected override _InputRegistry = CircleSumoInputRegistry;

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle overrides
  // ─────────────────────────────────────────────────────────────────────────

  public override async onCreate(options: RelayRoomV2Options): Promise<void> {
    await super.onCreate(options);

    // Schedule game start after seat reservation expires
    this._allPlayersConnectedTimeout = this.clock.setTimeout(
      () => this.startGame(),
      this.seatReservationTime * 1000
    );
  }

  public override onJoin(client: Client): void {
    super.onJoin(client);

    // Start game early if lobby is full
    if (this._sessionIdToPlayerSlot.size === this.maxClients) {
      this._allPlayersConnectedTimeout?.clear();
      this.startGame();
    }
  }

  public override async onLeave(client: Client, consented: boolean): Promise<void> {
    // Broadcast player leave event before calling super
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);

    if (playerSlot !== undefined && this._hasGameStarted) {
      const tick = this.serverTick + 2; // Small buffer for network delay
      const rpc = new RPC<PlayerLeft>(
        PlayerLeft.id,
        { tick, playerSlot, ordinal: 0, seq: 0 },
        { reason: consented ? 0 : 1 }
      );
      this.sendServerInputFanout([rpc], CircleSumoInputRegistry);
    }

    await super.onLeave(client, consented);
  }

  public override async onDispose(): Promise<void> {
    await super.onDispose?.();

    // TODO: Save rpc history locally
    const { seed0, seed1 } = this.getGameSeeds();
    const arrayBuffer = ReplayInputProvider.exportReplay(
      seed0,
      seed1,
      this.maxClients,
      this._RPCHistory.export(this._InputRegistry)
    );
    await fs.writeFile(`./circle-sumo-rpc-history-${this.gameId}.bin`, Buffer.from(arrayBuffer));
    await fs.writeFile(`./circle-sumo-rpc-history-${this.gameId}.json`, this._RPCHistory.debugExportAsJSON());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Abstract method implementations
  // ─────────────────────────────────────────────────────────────────────────

  protected override async onPlayerJoined(gameId: string, playerInfo: PlayerInfo): Promise<void> {
    if (!playerInfo.playerId) {
      throw new Error('Player ID is required');
    }

    await this._gameService.internalStartGameSession(
      playerInfo.playerId,
      playerInfo.playerSlot,
      gameId,
      playerInfo.connectedAt
    );
  }

  protected override async onPlayerFinishedGame(gameId: string, playerInfo: PlayerInfo): Promise<void> {
    if (!playerInfo.playerId || !playerInfo.finishedGameData) {
      throw new Error(`Invalid player finish data for player slot ${playerInfo.playerSlot}, ID ${playerInfo.playerId}`);
    }

    const { score, mmrChange } = playerInfo.finishedGameData.struct;

    console.warn(`[CircleSumo] Player ${playerInfo.playerId} finished game with score ${score} and mmr change ${mmrChange}`);

    await this._gameService.internalPlayerFinishedGameSession(
      playerInfo.playerId,
      gameId,
      score,
      mmrChange,
      playerInfo.finishedGameData.hash,
      playerInfo.finishedGameData.timestamp
    );
  }

  protected override async onBeforeDispose(gameId: string, wasForced: boolean): Promise<void> {
    await this._gameService.internalGameOver(gameId, new Date(), wasForced);
  }

  protected override async onPlayerLeave(gameId: string, playerInfo: PlayerInfo): Promise<void> {
    if (!playerInfo.playerId) {
      throw new Error('Player ID is required');
    }

    await this._gameService.internalPlayerLeaveGameSession(
      playerInfo.playerId,
      gameId,
      new Date()
    );
  }

  private startGame(): void {
    if (this._hasGameStarted) return;
    this._hasGameStarted = true;
    this.markGameStarted();

    const tick = this.serverTick + 10; // Give clients time to receive the message
    const rpcs: RPC<PlayerJoined>[] = [];

    // Create PlayerJoined RPCs for connected players
    for (const [, playerSlot] of this._sessionIdToPlayerSlot) {
      rpcs.push(this.createPlayerJoinedRpc(tick, playerSlot, false));
    }

    // Fill remaining slots with bots
    const botsNeeded = Math.max(FULL_LOBBY_SIZE - rpcs.length, 0);
    for (let i = 0; i < botsNeeded; i++) {
      const botSlot = this._nextPlayerSlot++;
      rpcs.push(this.createPlayerJoinedRpc(tick, botSlot, true));
    }

    console.log(`[CircleSumo] Starting game with ${rpcs.length} players (${botsNeeded} bots)`);

    this.sendServerInputFanout(rpcs, CircleSumoInputRegistry);
  }

  private createPlayerJoinedRpc(tick: number, playerSlot: number, isBot: boolean): RPC<PlayerJoined> {
    return new RPC<PlayerJoined>(
      PlayerJoined.id,
      { tick, playerSlot, ordinal: 0, seq: 0 },
      {
        playerId: isBot ? UUID.generateMasked().asUint8() : UUID.generate().asUint8(),
        mmr: isBot ? 1200 : 0,
        skinId: getRandomSkinId(),
      }
    );
  }
}
