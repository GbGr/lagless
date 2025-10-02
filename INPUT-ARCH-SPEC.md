# INPUT / CODEGEN ARCH REWRITE — SPEC

## TL;DR / Goal

Переписать input-слой и codegen так, чтобы:

* типы/утилиты инпута отделены от core (нулевая «утечка» зависимостей);
* сетевой формат RPC **единообразен** и описан в одном месте (без дублирования «HEADER_SIZE» и прочего);
* codegen генерирует **inputs + input-registry + runner** с импортами из новых пакетов;
* есть строгая типизация (**никаких `any`/`ts-ignore`**), `strict: true`;
* покрыто тестами (unit + интеграционные) на **Vitest**;
* подготовлен **ColyseusRelayInputProvider** и базовый E2E.

## Monorepo context

Имя организации: `@lagless/*`
Монорепо на **Nx** + **Vite** + **Vitest**.
У нас уже есть `@lagless/types`, `@lagless/misc`, `@lagless/core`.
Сейчас нужно ввести новые пакеты и перенастроить codegen.

## Deliverables (что должно появиться/обновиться)

1. Новый пакет **`@lagless/input-types`**

  * Единый источник правды для типизации input:

    * `TypedArray`, `typedArrayConstructors`, `typeToArrayConstructor`
    * `FieldType` (enum), `FieldTypeReverse`
    * `typeStringToFieldType`
    * `getTypeSizeBytes(typeStr: string): number`
  * Без зависимостей от `@lagless/core`.

2. Новый пакет **`@lagless/input-core`**

  * Интерфейсы и базовые сущности input:

    ```ts
    // Сигнатуры (должны быть точно такими же или совместимыми)
    export type FieldType = import('@lagless/input-types').FieldType;

    export interface InputField {
      name: string;
      type: FieldType;
      isArray: boolean;
      arrayLength?: number;
      byteLength: number; // уже align8
    }

    export interface IAbstractInput {
      readonly id: number;
      readonly byteLength: number;
      readonly fields: ReadonlyArray<InputField>;
      // readonly schema (для TS-инференса допускается через "!" как в шаблоне)
    }

    export interface IAbstractInputConstructor {
      new (): IAbstractInput;
      readonly id: number;
    }

    export class InputRegistry {
      constructor(ctors: IAbstractInputConstructor[]);
      getById(id: number): IAbstractInput; // бросает, если нет
      has(id: number): boolean;
    }

    export interface InputMeta {
      tick: number;
      ts: number;
      playerSlot: number;
    }

    export enum PackageType { RPC = 1 } // зарезервировано
    ```
  * Абстрактный провайдер инпутов (под Runner):

    ```ts
    import { RPC } from '@lagless/input-wire'; // см. ниже

    export abstract class AbstractInputProvider {
      // запуск/остановка
      abstract start(): Promise<void> | void;
      abstract stop(): Promise<void> | void;

      // забрать все RPC для тика и очистить буфер
      abstract drain(tick: number): RPC[];
    }
    ```

3. Новый пакет **`@lagless/input-wire`**

  * **Единый сетевой формат** и бинари-кодеки (без дублирования в `net-wire`):

    ```ts
    // Константы и схема меты (единственный источник правды):
    export const META_SCHEMA = {
      packageType: 'uint8',
      tick: 'uint32',
      ts: 'float64',
      playerSlot: 'uint8',
    } as const;

    // Рассчитать META_SIZE с align8
    export const META_SIZE: number;

    // Размер ID инпута (uint32) с align8
    export const INPUT_ID_SIZE: number;

    export type RPCData<T = any> = Record<string, number | TypedArray>; // НЕТ any в итоговом коде: использовать дженерик с ограничениями
    export class RPC {
      constructor(public inputId: number, public meta: InputMeta, public data: RPCData);
    }

    // Низкоуровневые read/write для DataView (typed-value-accessors)
    export function writeTypedValue(view: DataView, offset: number, type: FieldType, value: number): void;
    export function readTypedValue(view: DataView, offset: number, type: FieldType): number;

    // Модель упаковки батча
    export class InputDataModel {
      constructor(private readonly registry: InputRegistry) {}

      packBatch(meta: InputMeta, rpcs: RPC[]): ArrayBuffer; // layout: META + N * (inputId + fields...)
      unpackBatch(buffer: ArrayBuffer): RPC[]; // читает META из буфера
      unpackBatchWithInjectedMeta(buffer: ArrayBuffer, injected: { tick: number; playerSlot: number }): RPC[]; // пропускает META
    }
    ```
  * **Важно:** все вычисления размеров через `align8`, использовать точные типы. Никаких `any`. Для `RPCData` использовать тип: `Record<string, number | import('@lagless/input-types').TypedArray>`.

4. Обновление **`@lagless/net-wire`**

  * Удалить или прокинуть реэкспорт `HEADER_SIZE`/любой «RPC header» — источником правды должен быть `@lagless/input-wire` (`META_SIZE`, `INPUT_ID_SIZE` и т.п.).
  * Если нужен `HEADER_SIZE` для обратной совместимости — сделать:

    ```ts
    export { META_SIZE as HEADER_SIZE } from '@lagless/input-wire';
    ```

    и пометить как deprecated в JSDoc.

5. Правки **codegen**

  * Весь текущий codegen остаётся, но:

    * `generator.ts`, `parser.ts` теперь импортируют утилиты типов из `@lagless/input-types` (а не из `@lagless/core`).
    * Шаблон **inputs** импортирует `FieldType` из `@lagless/input-types`.
    * Шаблон **input-registry** импортирует `InputRegistry` из `@lagless/input-core`.
    * Шаблон **runner** импортирует `AbstractInputProvider` из `@lagless/input-core`.
  * Никаких `any` в сгенерированных файлах. Сохранить ранее данную сигнатуру шаблонов (см. ниже в «Templates»).

6. Реализация **ColyseusRelayInputProvider**

  * Название пакета/библиотеки: `@lagless/relay-colyseus` (libs/relay-colyseus)
  * Класс:

    ```ts
    import { AbstractInputProvider, InputRegistry, InputMeta } from '@lagless/input-core';
    import { InputDataModel, RPC } from '@lagless/input-wire';

    export interface ColyseusRelayInputProviderOptions {
      ws: WebSocketLike; // совместимый с браузерным и 'ws' в Node
      registry: InputRegistry;
      // опционально:
      playerSlot: number; // по умолчанию 0
      injectMetaFromServer?: boolean; // если true — использовать unpackBatch, иначе unpackBatchWithInjectedMeta
    }

    export interface WebSocketLike {
      on(event: 'message', cb: (data: ArrayBufferLike | Buffer | ArrayBufferView | string) => void): void;
      off?(event: 'message', cb: (...args: any[]) => void): void;
      addEventListener?(type: 'message', cb: (ev: MessageEvent) => void): void;
      removeEventListener?(type: 'message', cb: (ev: MessageEvent) => void): void;
    }

    export class ColyseusRelayInputProvider extends AbstractInputProvider {
      constructor(opts: ColyseusRelayInputProviderOptions);

      start(): void;
      stop(): void;

      // собирает все RPC по тик-ключу
      drain(tick: number): RPC[];
    }
    ```
  * Поведение:

    * На входящие бинарные сообщения конвертировать payload в `ArrayBuffer`:

      * `Buffer` → `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)`
      * `ArrayBufferView` → аналогично через `.buffer.slice(...)`
      * `string` — игнорировать.
    * Если `injectMetaFromServer === true` → использовать `InputDataModel.unpackBatch(buffer)`; иначе `unpackBatchWithInjectedMeta(buffer, { tick: lastSeenTickOrInjected, playerSlot })`. Минимально: хранить `lastSeenTick` из meta сообщений, либо выставлять 0, если на клиенте мета не приходит.
    * Сохранять RPC в `Map<number /*tick*/, RPC[]>`.
    * `drain(tick)` возвращает массив и очищает bucket.

7. Тесты (Vitest)

  * Общие правила:

    * `environment: 'node'`, `pool: 'threads'`, `isolate: false` в проблемных E2E (чтобы избежать `process.send` issues).
    * Никаких моков `process.send`.
  * Unit:

    * `@lagless/input-types`: корректные размеры `getTypeSizeBytes`, маппинги `typeStringToFieldType`.
    * `@lagless/input-wire`:

      * `typed-value-accessors`: корректная запись/чтение всех `FieldType`.
      * `InputDataModel.packBatch/unpackBatch` — круговая проверка (N разных inputs, скалярные и массивные поля).
      * `unpackBatchWithInjectedMeta` — корректная инъекция meta.
    * `codegen/parser` — парсинг YAML (components, singletons, filters, inputs) и корректные `byteLength` с `align8`.
  * Integration:

    * Generate-кейс: берём sample YAML, запускаем CLI `lagless-codegen`, проверяем, что файлы сгенерировались, компилируются, соответствуют ожидаемым импортам.
    * `ColyseusRelayInputProvider`:

      * эмуляция `ws` (локальный WebSocket сервер из `ws`), отправка бинарного батча, проверка `drain(tick)`.

8. Build & Tooling

  * TypeScript: `strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`.
  * ESLint: запрет `any`, запрет `@ts-ignore`, включить `@typescript-eslint/no-explicit-any`.
  * Vite/Vitest:

    * Для библиотек — как в текущих конфигурациях; для проблемных интеграционных тестов — добавить:

      ```ts
      test: {
        environment: 'node',
        pool: 'threads',
        isolate: false,
      }
      ```
    * Репорт в `./test-output/vitest/**`.

9. Templates (обязательно соответствуют этим версиям)

* `codegen/files/input-registry/__projectName__InputRegistry.ts.template`

  ```ts
  // Generated by @lagless/codegen. Do not edit manually.
  import { InputRegistry } from '@lagless/input-core';
  <% for (const input of inputs) { %>import { <%= input.name %> } from './<%= input.name %>.js';<% } %>
  export const <%= projectName %>InputRegistry = new InputRegistry([<% for (const input of inputs) { %><%= input.name %>,<% } %>]);
  ```
* `codegen/files/input/__name__.ts.template`

  ```ts
  // Generated by @lagless/codegen. Do not edit manually.
  import { FieldType } from '@lagless/input-types';

  export class <%= input.name %> {
    public static readonly id = <%= input.id %>;
    public readonly id = <%= input.id %>;
    public readonly byteLength = <%= input.fields.reduce((acc, f) => acc + f.byteLength, 0) %>;
    public readonly fields = [
      <% for (const f of input.fields) { %>
      <% if (f.isArray) { %>
      { name: '<%= f.name %>', type: FieldType.<%= FieldTypeReverse[f.type] %>, isArray: true, arrayLength: <%= f.arrayLength %>, byteLength: <%= f.byteLength %> },
      <% } else { %>
      { name: '<%= f.name %>', type: FieldType.<%= FieldTypeReverse[f.type] %>, isArray: false, byteLength: <%= f.byteLength %> },
      <% } %>
      <% } %>
    ] as const;

    public readonly schema!: {
      <% for (const f of input.fields) { %>
      <% if (f.isArray) { %>
      <%= f.name %>: <%= typedArrayConstructors[f.type].name %>,
      <% } else { %>
      <%= f.name %>: number,
      <% } %>
      <% } %>
    };
  }
  ```
* `codegen/files/runner/__projectName__.runner.ts.template`

  ```ts
  // Generated by @lagless/codegen. Do not edit manually.
  import { ECSConfig, ECSRunner } from '@lagless/core';
  import { AbstractInputProvider } from '@lagless/input-core';
  import { IECSSystemConstructor } from '@lagless/types';
  import { <%= projectName %>Core } from './<%= projectName %>.core.js';

  export class <%= projectName %>Runner extends ECSRunner {
    constructor(Config: ECSConfig, InputProviderInstance: AbstractInputProvider, Systems: Array<IECSSystemConstructor>) {
      super(Config, InputProviderInstance, Systems, <%= projectName %>Core);
    }
  }
  ```
* `codegen/src/generator.ts`/`parser.ts`: использовать импорты из `@lagless/input-types` как в разделе Deliverables/5.

10. Single source of truth для network header

* Удалить/заменить любые «HEADER_SIZE» разрозненные определения.
* Истина — **`@lagless/input-wire`**: `META_SIZE`, `INPUT_ID_SIZE`, `PackageType`, `META_SCHEMA`.
* Если `@lagless/net-wire` нужен для старого API — он *реэкспортит* эти константы и помечает deprecated.

11. Definition of Done (автотестируемые критерии)

* Внутри `@lagless/input-wire` round-trip тесты подтверждают корректность pack/unpack для смешанных инпутов (скаляр + массивы).
* `ColyseusRelayInputProvider` корректно принимает бинарь как `Buffer`, `ArrayBufferView` и `ArrayBuffer`.
* В репозитории нет `any`/`ts-ignore`. ESLint clean.
* Нет дублирования размеров заголовка (всё импортируется из `@lagless/input-wire`).

---

## Repo tasks / Steps (пошагово)

1. Создать пакеты:

  * `libs/input-types`
  * `libs/input-core`
  * `libs/input-wire`
  * `libs/relay-colyseus`
2. Перенести/реализовать API, описанные выше.
3. Обновить `@lagless/net-wire` (реэкспорт header-констант).
4. Обновить codegen импорты и шаблоны (см. Templates).
5. Написать тесты (unit + integration).
6. Прогнать codegen на sample YAML, убедиться в сборке.
7. Включить ESLint правила против `any`/`ts-ignore`.

---

## Sample YAML (для интеграционного теста)

```yaml
projectName: Demo
components:
  Transform:
    x: float32
    y: float32
singletons:
  Time:
    delta: float32
playerResources:
  PlayerState:
    hp: int32
filters:
  Movables:
    include: [Transform]
    exclude: []
inputs:
  Move:
    dx: float32
    dy: float32
  Shoot:
    dir[2]: float32
```

## Constraints / Quality bar

* **TypeScript strict**. Никаких `any`, `unknown` без сужения, `@ts-ignore`.
* Выравнивание структур — `align8`.
* В DataView **всегда** `littleEndian = true`.
* Никаких копий/дубликатов «header/meta» размеров по разным пакетам.
* Публичные API — JSDoc, понятные имена, чёткие границы зависимостей:

  * `input-wire` зависит только от `input-types` + `input-core` + `@lagless/misc`.
  * codegen не тянет ничего из `@lagless/core` ради типов инпута.
* Тесты читаемы, детерминированы, без завязки на случайность/таймеры (кроме явного E2E с `ws`).
