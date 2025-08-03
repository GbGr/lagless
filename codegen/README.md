# @lagless/codegen

ECS код генератор с интеграцией NX и CLI поддержкой.

## Возможности

- 🎯 **Единый пакет**: Один набор EJS шаблонов для всех способов использования
- 🔧 **NX интеграция**: Встроенный генератор для NX workspace
- ⚡ **CLI инструмент**: Независимый CLI для использования вне NX
- 📝 **EJS шаблоны**: Мощная система шаблонов с поддержкой условий и циклов
- 🎨 **Гибкий projectName**: Можно задать в конфиге или автоматически из пути

## Установка

```bash
npm install @lagless/codegen
```

## Использование

### 1. NX Generator

```bash
nx g ./codegen:ecs --configPath=./config/ecs.yaml
```

### 2. CLI

```bash
# Локально
node ./codegen/dist/cli.js -c ./config/ecs.yaml

# Глобальная установка
npm install -g @lagless/codegen
lagless-codegen -c ./config/ecs.yaml -o ./src/generated
```

### 3. Программно

```typescript
import { parseYamlConfig, generateCode } from './codegen';
import * as fs from 'fs';
import * as path from 'path';

const configContent = fs.readFileSync('./config.yaml', 'utf-8');
const { schema, projectName } = parseYamlConfig(configContent, './config.yaml');

await generateCode({
  schema,
  projectName,
  outputDir: './generated',
  templateDir: './codegen/files',
  fileOperations: {
    readFile: (path) => fs.readFileSync(path, 'utf-8'),
    writeFile: (path, content) => {
      fs.mkdirSync(path.dirname(path), { recursive: true });
      fs.writeFileSync(path, content, 'utf-8');
    },
    joinPath: (...segments) => path.join(...segments),
    exists: (path) => fs.existsSync(path),
    readDir: (path) => fs.readdirSync(path),
    isDirectory: (path) => fs.statSync(path).isDirectory(),
  }
});
```

## Конфигурация YAML

### С указанием projectName

```yaml
projectName: MyAwesomeGame

components:
  Position:
    x: f32
    y: f32
    z: f32
  
  Velocity:
    dx: f32
    dy: f32
    dz: f32

  Health:
    current: f32
    maximum: f32

singletons:
  GameState:
    currentLevel: u32
    score: u64
    isPaused: bool

playerResources:
  PlayerStats:
    experience: u64
    level: u32

inputs:
  PlayerInput:
    moveX: f32
    moveY: f32
    jump: bool
    attack: bool

filters:
  MovableEntities:
    include: [Position, Velocity]
  
  LivingEntities:
    include: [Health]
    exclude: []
```

### Без projectName (автоматически из пути)

```yaml
components:
  Position:
    x: f32
    y: f32
    z: f32
```

При пути `./my-game/config/ecs.yaml` → projectName будет `MyGame`

## Поддерживаемые типы

- `f32`, `f64` - числа с плавающей точкой
- `i8`, `i16`, `i32` - знаковые целые числа
- `u8`, `u16`, `u32` - беззнаковые целые числа
- `bool` - булево значение
- Массивы: `f32[10]`, `u32[5]` и т.д.

## Структура сгенерированного кода

```
code-gen/
├── index.ts                    # Barrel file со всеми экспортами
├── Position.ts                 # Компоненты
├── Velocity.ts
├── Health.ts
├── GameState.ts               # Синглтоны
├── PlayerStats.ts             # Player Resources
├── PlayerInput.ts             # Инпуты
├── MovableEntities.ts         # Фильтры
├── LivingEntities.ts
├── MyAwesomeGameInputRegistry.ts  # Реестр инпутов
├── ECSCore.ts                 # Основной ECS класс
└── ECSRunner.ts               # Runner для игрового цикла
```

## Опции CLI

```bash
lagless-codegen [options]

Options:
  -c, --config <path>     Path to YAML configuration file (required)
  -o, --output <path>     Output directory (default: config_dir/../code-gen)
  -t, --templates <path>  Custom templates directory
  -h, --help              Display help
  -V, --version           Display version
```

## Кастомные шаблоны

Вы можете создать свои шаблоны, скопировав структуру из `files/`:

```bash
cp -r ./codegen/files ./my-templates
# Отредактируйте шаблоны
lagless-codegen -c config.yaml -t ./my-templates
```

### Переменные в шаблонах

- `name` - имя элемента (компонента, синглтона и т.д.)
- `projectName` - имя проекта
- `fields` - поля элемента
- `schema` - полная схема
- `typeToArrayConstructor` - маппинг типов
- Специфичные для каждого типа переменные

## Разработка

```bash
# Установка зависимостей
npm install

# Сборка
npm run build

# Разработка с watch режимом
npm run dev
```
