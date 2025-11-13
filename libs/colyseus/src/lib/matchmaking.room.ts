import { Room, Client, matchMaker } from 'colyseus';
import { MatchmakingConfig, MatchTicket, MatchGroup } from './matchmaking.types.js';
import { MatchmakingService } from './matchmaking.service.js';
import { MatchmakerState, SearchingPlayer } from './matchmaking.state.js';

export interface FindMatchMessage {
  userId: string;
  displayName: string;
  mmr: number;
  pingMs: number;
}

export abstract class BaseMatchmakerRoom extends Room<MatchmakerState> {
  protected _matchmaking!: MatchmakingService<Client>;
  protected _config!: MatchmakingConfig;

  private readonly _clientTickets: Map<string, MatchTicket<Client>> = new Map<string, MatchTicket<Client>>();

  public override onCreate(): void {
    this._config = this.getMatchmakingConfig();
    this._matchmaking = new MatchmakingService<Client>(this._config, this._handleMatchFound);

    this.state = new MatchmakerState();

    this.clock.setInterval(() => {
      this._matchmaking.tick(Date.now()).catch((err) => {
        console.error('Matchmaking tick error:', err);
      });
    }, 250);

    this.onMessage('find_match', this._onFindMatch);
    this.onMessage('cancel_match', this._onCancelMatch);
  }

  public override onLeave(client: Client): void {
    const ticket = this._clientTickets.get(client.sessionId);
    if (ticket) {
      this._matchmaking.cancel(ticket.id);
      this._clientTickets.delete(client.sessionId);
      this._removeSearchingPlayer(ticket.id);
    }
  }

  /**
   * Subclasses must provide matchmaking configuration (per game/region).
   */
  protected abstract getMatchmakingConfig(): MatchmakingConfig;

  /**
   * Subclasses must provide the Colyseus game room name to create for matches.
   */
  protected abstract getGameRoomName(): string;

  /**
   * Subclasses can override this to add additional room options for the game.
   * By default, only bot-related options are set.
   */
  protected buildGameRoomOptions(group: MatchGroup<Client>): Record<string, unknown> {
    const humans = group.tickets.length;

    return {
      initialHumanCount: humans,
      virtualCapacity: this._config.virtualCapacity,
    };
  }

  private readonly _onFindMatch = (client: Client, message: FindMatchMessage): void => {
    const existing = this._clientTickets.get(client.sessionId);
    if (existing) {
      this._matchmaking.cancel(existing.id);
      this._clientTickets.delete(client.sessionId);
      this._removeSearchingPlayer(existing.id);
    }

    const ticket = this._matchmaking.enqueue(client, {
      userId: message.userId,
      displayName: message.displayName,
      mmr: message.mmr,
      pingMs: message.pingMs,
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

    const stats = await matchMaker.stats.fetchAll();

    console.log(stats);

    console.log(`[${Date.now()}] Matchmaking: found match for ${group.tickets.length} players.`);

    const room = await matchMaker.createRoom(roomName, roomOptions);

    console.log(`[${Date.now()}] Matchmaking: created room ${room.roomId} for ${group.tickets.length} players.`);

    for (const ticket of group.tickets) {
      try {
        const reservation = await matchMaker.reserveSeatFor(room, {
          userId: ticket.userId,
        });

        ticket.session.send('match_found', {
          roomId: room.roomId,
          reservation,
          virtualCapacity: this._config.virtualCapacity,
          botSeed: (roomOptions as { botSeed?: number }).botSeed,
        });
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
