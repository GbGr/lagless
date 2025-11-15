import { Schema, type, ArraySchema } from '@colyseus/schema';

export class SearchingPlayer extends Schema {
  @type('string')
  public ticketId = '';

  @type('string')
  public displayName = '';
}

export class MatchmakerState extends Schema {
  @type([SearchingPlayer])
  public searchingPlayers: ArraySchema<SearchingPlayer> = new ArraySchema<SearchingPlayer>();

  @type('number')
  public searchingCount = 0;
}
