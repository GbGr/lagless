# Dev-Player: Hash Display & Timeline Fix

## Context

Текущий dashboard в dev-player имеет две проблемы:
1. **Hash отображается неинформативно** — в таблице показывается только текущий hash одним значением. Нет возможности сравнить хеши по тикам между инстансами.
2. **Timeline перестаёт обновляться после заполнения** — баг: rAF draw-функция захватывает `state` в замыкании при создании эффекта (`useEffect(..., [state.instances.size])`). Эффект перезапускается только при изменении количества инстансов, а `minVerifiedTick` и `totalInstances` в draw остаются устаревшими.

## Changes

**Один файл:** `tools/dev-player/src/app/components/dashboard.tsx`

### 1. Fix Timeline (stale closure bug)

- Добавить рефы `totalInstancesRef` и `minVerifiedTickRef`
- Обновлять их на каждом рендере (вне эффекта)
- В `draw` функции читать из рефов вместо замыкания на `state`
- Изменить зависимости rAF эффекта с `[state.instances.size]` на `[]`

### 2. Hash Comparison Table

Новая секция между таблицей статистики и timeline canvas:

```
+--------+------+------+------+
|  Tick  |  #0  |  #1  |  #2  |
+--------+------+------+------+
|   120  | a3f2 | a3f2 | a3f2 |  ← зелёный (совпадает)
|   126  | a3f2 | b1c4 | a3f2 |  ← красный для b1c4
|   132  | a3f2 |  --  | a3f2 |  ← серый для отсутствующих
+--------+------+------+------+
```

- Данные из `hashBufferRef.current` (уже содержит всё нужное)
- Показываем последние 30 записей из ring buffer
- Скроллируемый контейнер с `maxHeight: 160px`, sticky header
- Цвета ячеек: зелёный (все совпадают + verified), красный (расхождение), серый (pending/missing)
- Хеш укорочен до 4 hex-символов, полный — в `title` (hover)
- Авто-скролл к последним записям

### 3. Увеличить maxHeight контейнера

`maxHeight: 240` → `maxHeight: '40vh'` для accommodating новой таблицы.

## Verification

1. `pnpm exec nx serve @lagless/sync-test-server` + `pnpm exec nx serve @lagless/sync-test-game`
2. `pnpm exec nx serve @lagless/dev-player`
3. Запустить 2-3 инстанса — убедиться:
   - Hash comparison table появляется и обновляется
   - Timeline не замерзает после заполнения
   - При дивергенции красные ячейки видны
