import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { type Request } from 'express';
import { PlayerService } from './player.service';
import { AuthGuard } from './auth.guard';
import { type AuthenticatedRequest } from './types';

@Controller('player')
export class PlayerController {
  constructor(
    private readonly _PlayerService: PlayerService,
  ) {
  }

  @Post('auth/instant')
  public async instantAuth(
    @Req() req: Request,
  ) {
    const ipAddress = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    return await this._PlayerService.instantAuth(ipAddress as string || void 0);
  }

  @UseGuards(AuthGuard)
  @Post('login')
  public async login(
    @Req() req: AuthenticatedRequest,
  ) {
    const ipAddress = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    return await this._PlayerService.login(req.authData, ipAddress as string || void 0);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  public async me(
    @Req() req: AuthenticatedRequest,
  ) {
    return await this._PlayerService.getById(req.authData.id);
  }
}
