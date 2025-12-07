import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PlayerSchema } from '@lagless/schemas';
import { Raw, Repository } from 'typeorm';
import { SumoPlayerSkinsSchema } from './sumo-player-skins.schema';
import { getSpinCost, spinRandomSkinId, SumoPlayerData } from '@lagless/circle-sumo-simulation';

@Injectable()
export class SumoPlayerService {
  constructor(
    @InjectRepository(PlayerSchema)
    private readonly _playerRepository: Repository<PlayerSchema>,
    @InjectRepository(SumoPlayerSkinsSchema)
    private readonly _sumoPlayerSkinsRepository: Repository<SumoPlayerSkinsSchema>
  ) {}

  public async onFtue(playerId: PlayerSchema['id'], skinId: number): Promise<void> {
    await Promise.all([
      this._playerRepository.update(
        { id: playerId, data: Raw(alias => `${alias}->'selectedSkinId' IS NULL`) },
        { data: { selectedSkinId: skinId } as SumoPlayerData }
      ),
      this._sumoPlayerSkinsRepository.insert({ playerId, skinId }),
    ]);
  }

  public async getPlayerSkins(playerId: PlayerSchema['id']): Promise<number[]> {
    const schemas = await this._sumoPlayerSkinsRepository.find({
      where: { playerId },
    });

    return schemas.map(({ skinId }) => skinId);
  }

  public async spinForSkin(playerId: PlayerSchema['id']): Promise<number> {
    const [ playerSkins, player ] = await Promise.all([
      this._sumoPlayerSkinsRepository.find({
        where: { playerId },
        select: { playerId: true, skinId: true },
      }),
      this._playerRepository.findOneOrFail({ where: { id: playerId} }),
    ]);

    const playerSkinsCount = playerSkins.length;
    const spinCost = getSpinCost(playerSkinsCount);

    if (player.score < spinCost) throw new HttpException('NotEnoughScore', 400);

    const skinId = spinRandomSkinId(playerSkins.map(({ skinId }) => skinId));

    await this._playerRepository.manager.transaction(async manager => {
      await Promise.all([
        manager.insert(SumoPlayerSkinsSchema, { playerId, skinId }),
        manager.update(PlayerSchema, { id: playerId }, {
          score: () => `score - ${spinCost}`
        }),
      ])
    });

    return skinId;
  }

  public async equipSkin(playerId: PlayerSchema['id'], skinId: number) {
    const skinOwned = await this._sumoPlayerSkinsRepository.count({
      where: { playerId, skinId },
    });

    if (skinOwned === 0) throw new HttpException('SkinNotOwned', 400);

    await this._playerRepository.update(
      { id: playerId },
      { data: { selectedSkinId: skinId } as SumoPlayerData }
    );
  }
}
