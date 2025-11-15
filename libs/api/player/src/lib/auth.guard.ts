import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from './jwt.service';
import { AuthenticatedRequest } from './types';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly _JwtService: JwtService,
  ) {
  }

  public async canActivate(context: ExecutionContext) {
    try {
      const request = context.switchToHttp().getRequest() as AuthenticatedRequest;
      const maybeBearer = request.headers['authorization'];
      if (!maybeBearer || Array.isArray(maybeBearer)) {
        return false;
      }
      const token = maybeBearer.slice(BEARER_PREFIX.length);
      request.authData = await this._JwtService.verify(token);
      return true;

    } catch (e) {
      console.error('AuthGuard error:', e);
      return false;
    }
  }

}
