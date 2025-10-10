# Lagless Networking — Glossary & Quick Math

Короткие определения «нишевых» терминов нашего протокола + мини-формулы и примеры. Термины приведены в оригинале (EN), пояснения — по-русски.  

---

## Ack / InputAck

**Ack** (acknowledgement) — общее: подтверждение получения сообщения.

**InputAck** — наш пакет ответа сервера на `InputFrame`:
- **Назначение:** подтвердить принятие кадра (tick) в дедлайн и сообщить временные метрики.
- **Поля (суть):** `tick`, `seq`, `status=Accepted|Late`, `serverNowMs`, `headroomMs`.
- **Пример:** клиент шлёт `InputFrame{ tick=105, seq=42 }` → сервер отвечает  
  `InputAck{ tick=105, seq=42, status=Accepted, headroomMs=+1.8 }`.

**Мини-формула:**  
`headroomMs = deadlineMs(tick) - arriveNowMs`

---

## EWMA (Exponentially Weighted Moving Average)

Экспоненциально взвешенное скользящее среднее — сглаживает шумные измерения (напр. `offset`, `headroom`, `OWD`).

**Формула:**  
`EWMA ← (1 - α) * EWMA + α * x`, где `0 < α ≤ 1`.

**Пример:** `α = 0.1`, было `EWMA = 2.0`, новое `x = -1.0` → `EWMA = 1.7`.

---

## headroom

Сколько времени осталось до дедлайна тика в момент фактического прихода кадра на сервер.

**Формулы:**
- `tickStartMs(t) = roomStartMs + t * frameLengthMs`
- `deadlineMs(t)  = tickStartMs(t) + safetyMs`
- `headroomMs     = deadlineMs(t) - arriveNowMs`

**Интерпретация:**  
`headroomMs > 0` → успели (**Accepted**), `headroomMs ≤ 0` → опоздали (**Cancel**).

**Пример (60 FPS, frame ~ 16.67 ms, safety = 3 ms):**  
приход в `tickStart + 1 ms` ⇒ `headroom ≈ +2 ms` (OK);  
приход в `tickStart + 5 ms` ⇒ `headroom ≈ -2 ms` (Cancel).

---

## skew

Дрейф частоты часов клиента относительно сервера (насколько «быстрее/медленнее» идёт локальный таймер).

**Оценка (через наклон):**  
`skew ≈ slope(localNowMs → serverNowOnClientMs) - 1` (доля, безразмерно)  
часто выражают в ppm: `ppm = skew * 1e6`.

**Пример:** `skew = +120e-6` (120 ppm, клиент спешит) → без коррекции через 60 сек накопится ≈ `+7.2 ms` рассинхрона.

---

## kP (proportional gain)

Коэффициент пропорциональной ветви в управлении «скоростью времени» (slew). Помогает быстрее гасить фазовую ошибку (`offset`).

**Вклад в скорость:**  
`corr = kP * (offsetMs / frameLengthMs)` (далее ограничиваем по `corrMax`).

**Пример:** `frameLen=16.67`, `offset=+3 ms`, `kP=0.1` → `corr ≈ +0.018` (≈ +1.8% временного ускорения).

---

## ppmMax

Ограничение по модулю для «частотной» части коррекции из `skew`:
- `|baseFromSkew| ≤ ppmMax / 1e6`.

**Пример:** `ppmMax = 800` ⇒ `|baseFromSkew| ≤ 0.0008` (±0.08%).

---

## corrMax

Ограничение по модулю для пропорциональной (P) коррекции от `offset`:
- `|corr| = |kP * (offset / frameLen)| ≤ corrMax`.

**Пример:** `corrMax = 0.005` ⇒ вклад P-ветви не превысит ±0.5% к скорости.

---

## Fanout

Рассылка сервером принятого `InputFrame` (по `tick`) всем другим клиентам комнаты.

**Назначение:** у всех участников на один и тот же `tick` одинаковый набор RPC — детерминированная симуляция.

**Пример:** сервер принял кадр игрока A для `tick=210` → рассылает `InputFrameFanout{ tick=210, payload... }` игрокам B, C, …; у всех в `RPCHistory` под ключом `210` лежит одно и то же.

---

## Связанные термины (для контекста)

- **InputFrame:** пакет «rpc-батча» за один тик. Клиент отправляет **каждый тик**.
- **CancelInput:** ответ сервера при опоздании кадра: `CancelInput{ tick, seq }`. Клиент помечает этот тик как «tombstone» и выполняет rollback, если нужно.
- **DelayAdjust:** команда сервера изменить `inputDelay` (адаптация к сети): `DelayAdjust{ newDelay }`.
- **inputDelay (ticks):** смещение, на сколько тиков вперёд клиент планирует `targetTick = clientTick + inputDelay`.
- **frameLengthMs:** `1000 / fps` — длительность одного тика в миллисекундах.
- **safetyMs:** бюджет «после начала тика», до которого сервер принимает кадр (`deadline = tickStart + safetyMs`).
- **OWD↓ (one-way downlink):** оценка односторонней задержки «клиент → сервер», получаем из `ackSeqEcho` (часть RTT), сглаживаем EWMA.

---

## Slew (единая шкала тиков) — быстрая памятка

**Цель:** удерживать `clientTick == serverTick` без «прыжков по времени», меняя только скорость локальных часов.

1) **Измерение на ACK:**  
   `serverNowOnClient ≈ serverNowMs + owdDownMs`  
   `offsetMs = serverNowOnClient - localNowMs` (сгладить EWMA)

2) **Оценка `skew`:** линейная регрессия на окне или Калман.

3) **Скорость:**  
   `speedFactor = 1 + clamp(skew, ±ppmMax/1e6) + clamp(kP * (offsetMs / frameLenMs), ±corrMax)`  
   `|speedFactor - 1| ≤ totalMax` (например, 1%)

4) **Применение:**  
   в игровом цикле `clock.update(dt * speedFactor)`

---

## Мини-формулы (в одном месте)

```txt
frameLengthMs = 1000 / fps

serverTick(now)     = floor((now - roomStartMs) / frameLengthMs)
tickStartMs(t)      = roomStartMs + t * frameLengthMs
deadlineMs(t)       = tickStartMs(t) + safetyMs
headroomMs          = deadlineMs(t) - arriveNowMs

targetTick (client) = clientTick + inputDelay   // единая шкала = serverTick

EWMA ← (1 - α) * EWMA + α * x

speedFactor = 1
            + clamp(skew, ±ppmMax/1e6)
            + clamp(kP * (offsetMs / frameLengthMs), ±corrMax)
|speedFactor - 1| ≤ totalMax
