import { type Request } from 'express';

export interface JWTPayload {
  id: string;
}

export interface AuthenticatedRequest extends Request {
  authData: JWTPayload;
}
