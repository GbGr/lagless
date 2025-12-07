import { Controller, Get, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common';
import { SumoPlayerService } from './sumo-player.service';
import { type AuthenticatedRequest, AuthGuard } from '@lagless/player';

@Controller('sumo/player')
export class SumoPlayerController {
  constructor(
    private readonly _SumoPlayerService: SumoPlayerService
  ) {
  }

  @UseGuards(AuthGuard)
  @Put('onFtue/:skinId')
  public async onFtue(
    @Req() req: AuthenticatedRequest,
    @Param('skinId', ParseIntPipe) skinId: number
  ): Promise<void> {
    return this._SumoPlayerService.onFtue(req.authData.id, skinId);
  }

  @UseGuards(AuthGuard)
  @Get('getPlayerSkins')
  public async getPlayerSkins(
    @Req() req: AuthenticatedRequest
  ): Promise<number[]> {
    return this._SumoPlayerService.getPlayerSkins(req.authData.id);
  }

  @UseGuards(AuthGuard)
  @Put('spinForSkin')
  public async spinForSkin(
    @Req() req: AuthenticatedRequest,
  ): Promise<number> {
    return await this._SumoPlayerService.spinForSkin(req.authData.id);
  }

  @UseGuards(AuthGuard)
  @Put('equipSkin/:skinId')
  public async equipSkin(
    @Req() req: AuthenticatedRequest,
    @Param('skinId', ParseIntPipe) skinId: number
  ): Promise<void> {
    return this._SumoPlayerService.equipSkin(req.authData.id, skinId);
  }
}
