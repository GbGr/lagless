import { defineConfig } from 'tsup';
import * as fs from 'node:fs';
import * as path from 'node:path';

export default defineConfig((override) => {
  // пытаемся найти package.json рядом с tsup.config.ts/в проекте
  const pkgPath =
    override?.env?.PKG_JSON ??
    path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const deps = Object.keys(pkg.dependencies || {});
  const peers = Object.keys(pkg.peerDependencies || {});
  const externals = Array.from(new Set([...deps, ...peers]));

  return {
    entry: ['src/index.ts'],       // при нужде добавь больше входов
    outDir: 'dist',
    clean: true,
    dts: false,                     // index.d.ts
    format: ['esm', 'cjs'],        // index.mjs + index.cjs
    sourcemap: true,
    target: 'es2020',
    minify: false,
    splitting: false,              // для либ это обычно лучше (один файл)
    treeshake: true,
    external: externals,           // не бандлим runtime deps
    shims: false,
    // если используешь TS 5 с "moduleResolution": "bundler" — tsup справится сам
    // для nodenext тоже ок
    tsconfig: 'tsconfig.lib.json', // тянем локальный tsconfig пакета
    skipNodeModulesBundle: true,
    // оставим исходные имена файлов (index мапится в index.(mjs|cjs))
    // esbuildOptions: (o) => { ... } // при желании можно ещё твикать
  };
});
