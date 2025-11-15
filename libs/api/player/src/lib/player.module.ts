import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoginLogSchema, PlayerSchema } from '@lagless/schemas';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from './jwt.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PlayerSchema, LoginLogSchema])],
  controllers: [PlayerController],
  providers: [PlayerService, JwtService, AuthGuard],
  exports: [AuthGuard, PlayerService],
})
export class LaglessPlayerModule {}
