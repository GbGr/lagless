Задача: Исправить Hash Timeline в Dev Player

Контекст

Dev Player (tools/dev-player/) — утилита для мультиплеер-тестирования. Открывает N iframe с игрой, показывает stats dashboard и hash timeline для детекции дивергенции между клиентами.

Две проблемы:

1. Stale hashes → ложные красные точки при latency. Dev-bridge отправляет sim.mem.getHash() на текущем sim.tick. После rollback хэш для того же тика меняется, но dev-bridge его не переотправляет. Dashboard
   хранит stale хэш и при сравнении показывает ложную дивергенцию.
2. Точки становятся серыми со временем. В dashboard.tsx есть HASH_TIMEOUT_MS = 3000 — entries старше 3с считаются "timed out" и рисуются серым. Но timestamp ставится при создании entry, не обновляется при
   получении новых данных. Через 3с ВСЕ точки неизбежно становятся серыми, даже verified ones. Логика timedOut конфликтует с verified — verified entry с timestamp > 3s рисуется серой, а не зелёной (timedOut
   проверяется в else if после complete && verified, но incomplete verified entries попадают в timedOut).

Решение

Для проблемы 1: Использовать verified hash вместо текущего. В кодовой базе уже есть инфраструктура:
- ECSSimulation.enableHashTracking(interval) — сохраняет mem.getHash() каждые N тиков в _hashHistory: Map<tick, hash>. При rollback вызывается _hashHistory.clear(), пересимуляция записывает правильные
  пост-rollback хэши.
- ECSSimulation.getHashAtTick(tick): number | undefined — возвращает хэш из истории.
- RelayInputProvider.verifiedTick = maxReceivedServerTick - 1 — тик, до которого rollback невозможен.
- createHashReporter (libs/core/src/lib/hash-verification/create-hash-reporter.ts) уже делает это: вычисляет latestReportTick = floor(verifiedTick / interval) * interval и берёт
  getHashAtTick(latestReportTick).

Нужно сделать то же самое в useDevBridge: помимо текущего tick/hash (для таблицы), отправлять verifiedHashTick и verifiedHash — хэш из _hashHistory на последнем verified interval tick. Dashboard timeline
должен группировать и сравнивать по verifiedHashTick/verifiedHash вместо tick/hash.

Для этого useDevBridge должен знать hashTrackingInterval. Передавать параметром: useDevBridge(runner, { hashTrackingInterval: 10 }). Игры уже вызывают enableHashTracking(interval) — тот же interval.

Для проблемы 2: Убрать HASH_TIMEOUT_MS / timedOut логику полностью. Она не нужна — verified check через minVerifiedTick уже корректно определяет когда можно сравнивать. Точки должны быть:
- Зелёная: complete && verified && allSame
- Красная: complete && verified && !allSame
- Серая (pending): !complete || !verified

Проверка

1. Запустить sync-test server + game + dev-player
2. Start 2+ instances
3. Без latency: timeline должна быть зелёной
4. С global latency 200ms: timeline должна быть зелёной (rollback'и не вызывают ложных красных), pending (серые) точки на конце — это нормально (ждём verified)
5. Со временем (>3с) точки НЕ должны становиться серыми — зелёные остаются зелёными
6. Только реальная дивергенция (баг в детерминизме) даёт красные точки
