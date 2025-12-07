import { Context, ContextOptions } from 'neutrinoparticles.pixi';

const contextOptions: ContextOptions = {
  texturesBasePath: '/neutrino/textures/',
  trimmedExtensionsLookupFirst: true,
};

// Создаём Context без Renderer (он там не используется)
export const neutrinoContext = new Context(null as any, contextOptions);

// Генерируем шум синхронно (один раз)
neutrinoContext.generateNoise();

// Экспортируем loadData для использования в Assets
export const neutrinoLoadData = neutrinoContext.loadData;
