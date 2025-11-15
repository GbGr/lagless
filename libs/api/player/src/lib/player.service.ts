import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LoginLogSchema, PlayerSchema } from '@lagless/schemas';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from './jwt.service';
import { JWTPayload } from './types';

@Injectable()
export class PlayerService {
  constructor(
    private readonly _JwtService: JwtService,
    @InjectRepository(PlayerSchema)
    private readonly _PlayerRepository: Repository<PlayerSchema>,
    @InjectRepository(LoginLogSchema)
    private readonly _LoginLogRepository: Repository<LoginLogSchema>
  ) {}

  public async instantAuth(ipAddress?: string) {
    const player = await this._PlayerRepository.save({
      username: `Player_${generateBeautifulSuffix()}`,
    });
    await this._LoginLogRepository.insert({
      playerId: player.id,
      ipAddress,
    });

    const token = await this._JwtService.sign(
      { id: player.id, },
      60 * 60 * 24 * 30
    );

    return {
      player,
      token,
    };
  }

  public async login(authData: JWTPayload, ipAddress?: string) {
    const player = await this._PlayerRepository.findOneByOrFail({ id: authData.id });
    await this._LoginLogRepository.insert({
      playerId: player.id,
      ipAddress,
    });

    const token = await this._JwtService.sign(
      { id: player.id, },
      60 * 60 * 24 * 30
    );

    return {
      player,
      token,
    };
  }

  public async getById(playerId: PlayerSchema['id']) {
    return await this._PlayerRepository.findOneByOrFail({ id: playerId });
  }
}

const adjectives = [
  'Swift',
  'Brave',
  'Clever',
  'Mighty',
  'Fierce',
  'Nimble',
  'Bold',
  'Wise',
  'Loyal',
  'Valiant',
  'Fearless',
  'Gallant',
];
const nouns = [
  'Lion',
  'Eagle',
  'Wolf',
  'Tiger',
  'Falcon',
  'Bear',
  'Shark',
  'Panther',
  'Dragon',
  'Phoenix',
  'Leopard',
  'Cheetah',
  'EggPlant',
];

function generateBeautifulSuffix() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}_${noun}_${Math.floor(Math.random() * 1000)}`;
}
