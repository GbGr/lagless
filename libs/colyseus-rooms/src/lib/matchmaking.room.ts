import { Room, Client, matchMaker } from 'colyseus';
import { MatchmakingConfig, MatchTicket, MatchGroup } from './matchmaking.types.js';
import { MatchmakingService } from './matchmaking.service.js';
import { MatchmakerState, SearchingPlayer } from './matchmaking.state.js';
import { ColyseusRelayRoomOptions } from '@lagless/net-wire';
import * as console from 'node:console';
import { verify } from 'jsonwebtoken';

interface FindMatchMessage {
  playerId: string;
  displayName: string;
  mmr: number;
  pingMs: number;
  matchmakingSessionId?: string;
}

export interface RoomAuthResult {
  id: string;
}

export abstract class BaseMatchmakerRoom extends Room<MatchmakerState> {
  protected _matchmaking!: MatchmakingService<Client>;
  protected _config!: MatchmakingConfig;

  private readonly _clientTickets: Map<string, MatchTicket<Client>> = new Map<string, MatchTicket<Client>>();

  /**
   * Subclasses must provide the secret used to verify auth tokens.
   */
  protected abstract _getAuthSecret(): string;

  /**
   * Subclasses must provide matchmaking configuration (per game/region).
   */
  protected abstract getMatchmakingConfig(): MatchmakingConfig;

  /**
   * Subclasses must provide the Colyseus game room name to create for matches.
   */
  protected abstract getGameRoomName(): string;

  /**
   * Subclasses must provide the frame length (in ms) for the game room.
   */
  protected abstract getFrameLength(): number;

  /**
   * Subclasses can override this to perform any actions before the game room is created.
   */
  protected abstract createGameId(group: MatchGroup<Client>): Promise<string>;

  /**
   * Subclasses must implement this to extract player data from auth info.
   */
  protected abstract getPlayerDataFromAuth(auth: RoomAuthResult): Promise<{ username: string, mmr: number }>;

  /**
   * Subclasses can override this to perform any actions before matchmaking starts for a player.
   */
  protected abstract onBeforeMatchmaking(auth: RoomAuthResult): Promise<string | undefined>;

  /**
   * Subclasses must implement this to perform any actions when a matchmaking session is cancelled.
   */
  protected abstract onCancelMatchmakingSession(ticket: MatchTicket<Client>): Promise<void>;

  /**
   * Subclasses can override this to add additional room options for the game.
   * By default, only bot-related options are set.
   */
  protected buildGameRoomOptions(group: MatchGroup<Client>): Omit<ColyseusRelayRoomOptions, 'gameId'> {
    return {
      maxPlayers: group.tickets.length,
      frameLength: this.getFrameLength(),
    };
  }

  public override onCreate(): void {
    this._config = this.getMatchmakingConfig();
    this._matchmaking = new MatchmakingService<Client>(this._config, this._handleMatchFound);

    this.state = new MatchmakerState();

    this.clock.setInterval(() => {
      this._matchmaking.tick(Date.now()).catch((err) => {
        console.error('Matchmaking tick error:', err);
      });
    }, 250);

    this.onMessage('cancel_match', this._onCancelMatch);
  }

  public override async onJoin(client: Client, options: unknown, auth: RoomAuthResult) {
    console.log(`Client ${client.sessionId} joined with player ID: ${auth.id}`);
    const [ playerData, matchmakingSessionId ] = await Promise.all([
      this.getPlayerDataFromAuth(auth),
      this.onBeforeMatchmaking(auth),
    ]);
    await this._onFindMatch(client, {
      playerId: auth.id,
      mmr: playerData.mmr,
      displayName: playerData.username,
      pingMs: 100,
      matchmakingSessionId,
    });
  }

  public override async onAuth(client: Client, options: { authToken: string }): Promise<RoomAuthResult> {
    try {
      return new Promise<RoomAuthResult>((resolve, reject) => {
        verify(options.authToken, this._getAuthSecret(), (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            console.error('Failed to authenticate client:', err);
            reject(err);
            return;
          }

          resolve(decoded as RoomAuthResult);
        });
      });
    } catch (e) {
      console.error('Failed to authenticate client:', e);
      throw e;
    }
  }

  public override async onLeave(client: Client) {
    const ticket = this._clientTickets.get(client.sessionId);
    if (ticket) {
      this._matchmaking.cancel(ticket.id);
      this._clientTickets.delete(client.sessionId);
      this._removeSearchingPlayer(ticket.id);
      await this.onCancelMatchmakingSession(ticket);
    }
  }

  private readonly _onFindMatch = async (client: Client, message: FindMatchMessage): Promise<void> => {
    const existing = this._clientTickets.get(client.sessionId);
    if (existing) {
      this._matchmaking.cancel(existing.id);
      this._clientTickets.delete(client.sessionId);
      this._removeSearchingPlayer(existing.id);
      await this.onCancelMatchmakingSession(existing);
    }

    const ticket = this._matchmaking.enqueue(client, {
      userId: message.playerId,
      displayName: message.displayName,
      mmr: message.mmr,
      pingMs: message.pingMs,
      matchmakingSessionId: message.matchmakingSessionId,
    });

    this._clientTickets.set(client.sessionId, ticket);
    this._addSearchingPlayer(ticket);

    client.send('match_search_started', {
      ticketId: ticket.id,
    });
  };

  private readonly _onCancelMatch = (client: Client): void => {
    const ticket = this._clientTickets.get(client.sessionId);
    if (!ticket) {
      return;
    }

    this._matchmaking.cancel(ticket.id);
    this._clientTickets.delete(client.sessionId);
    this._removeSearchingPlayer(ticket.id);

    client.send('match_search_cancelled');
  };

  private readonly _handleMatchFound = async (group: MatchGroup<Client>): Promise<void> => {
    const roomName = this.getGameRoomName();
    const roomOptions = this.buildGameRoomOptions(group);

    const gameId = await this.createGameId(group);

    const room = await matchMaker.createRoom(roomName, { ...roomOptions, gameId } as ColyseusRelayRoomOptions);

    for (const ticket of group.tickets) {
      try {
        const reservation = await matchMaker.reserveSeatFor(room, null, { playerId: ticket.playerId, displayName: ticket.displayName });

        ticket.session.send('match_found', reservation);
      } catch (err) {
        console.error('Failed to reserve seat:', err);
        ticket.session.send('match_error', {
          reason: 'reserve_failed',
        });
      }

      this._clientTickets.delete(ticket.session.sessionId);
      this._removeSearchingPlayer(ticket.id);
    }
  };

  private _addSearchingPlayer(ticket: MatchTicket<Client>): void {
    const player = new SearchingPlayer();
    player.ticketId = ticket.id;
    player.displayName = ticket.displayName;

    this.state.searchingPlayers.push(player);
    this.state.searchingCount = this.state.searchingPlayers.length;
  }

  private _removeSearchingPlayer(ticketId: string): void {
    const arr = this.state.searchingPlayers;
    const index = arr.findIndex((p) => p.ticketId === ticketId);
    if (index !== -1) {
      arr.splice(index, 1);
      this.state.searchingCount = this.state.searchingPlayers.length;
    }
  }
}
