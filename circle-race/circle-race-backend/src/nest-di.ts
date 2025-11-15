import { INestApplication } from '@nestjs/common';

export class NestDI {
  private static _nestApp: INestApplication;

  public static resolve<T>(type: new (...args: any[]) => T): T {
    return this._nestApp.get(type);
  }

  public static setApp(nestApp: INestApplication) {
    this._nestApp = nestApp;
  }
}
