import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWTPayload } from './types';
import { sign, verify } from 'jsonwebtoken';

@Injectable()
export class JwtService {
  private readonly _JWT_SECRET: string;
  private readonly _JWT_EXPIRATION_TIME_SECONDS: number;

  constructor(
    private readonly _ConfigService: ConfigService,
  ) {
    this._JWT_SECRET = this._ConfigService.getOrThrow<string>('JWT_SECRET');
    this._JWT_EXPIRATION_TIME_SECONDS = parseInt(this._ConfigService.getOrThrow('JWT_EXPIRATION_TIME_SECONDS'), 10);
  }

  public async sign(payload: JWTPayload, expiresIn = this._JWT_EXPIRATION_TIME_SECONDS): Promise<string> {
    return new Promise((resolve, reject) => {
      sign(payload, this._JWT_SECRET, { expiresIn, }, (err, token) => {
        if (err || !token) {
          return reject(err);
        }
        resolve(token);
      });
    });
  }

  public async verify(token: string): Promise<JWTPayload> {
    return new Promise((resolve, reject) => {
      verify(token, this._JWT_SECRET, (err, decoded) => {
        if (err || !decoded) {
          return reject(err);
        }
        resolve(decoded as JWTPayload);
      })
    });
  }
}
