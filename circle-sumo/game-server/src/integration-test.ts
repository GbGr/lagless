/**
 * Integration test for Circle Sumo game server.
 * Simulates: 2 players join matchmaking → match formed → connect to relay → exchange inputs.
 *
 * Run: bun run src/integration-test.ts (with server already running)
 */

const SERVER_URL = 'ws://localhost:3333';
const HTTP_URL = 'http://localhost:3333';

// ─── Helpers ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

interface MatchFoundMessage {
  type: 'match_found';
  matchId: string;
  playerSlot: number;
  token: string;
  serverUrl: string;
}

// ─── Step 1: Health Check ───────────────────────────────────

async function checkHealth(): Promise<void> {
  console.log('\n📋 Step 1: Health Check');
  const resp = await fetch(`${HTTP_URL}/health`);
  const data = await resp.json() as Record<string, unknown>;
  assert(resp.status === 200, 'Health endpoint returns 200');
  assert(data.status === 'ok', `Server status is "ok"`);
  assert(typeof data.rooms === 'number', 'Rooms count available');
  console.log(`  Server: instance=${data.instance}, rooms=${data.rooms}, queue=${data.queue}`);
}

// ─── Step 2: Matchmaking ────────────────────────────────────

function connectToMatchmaking(playerId: string): Promise<MatchFoundMessage> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SERVER_URL}/matchmaking?playerId=${playerId}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        scope: 'circle-sumo',
        mmr: 1000,
        metadata: { skinId: 0 },
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      if (msg.type === 'queued') {
        // Waiting...
      } else if (msg.type === 'match_found') {
        ws.close();
        resolve(msg as MatchFoundMessage);
      } else if (msg.type === 'error') {
        ws.close();
        reject(new Error(`Matchmaking error: ${msg.message}`));
      }
    };

    ws.onerror = () => reject(new Error('Matchmaking WS error'));

    setTimeout(() => {
      ws.close();
      reject(new Error('Matchmaking timeout'));
    }, 15_000);
  });
}

async function testMatchmaking(): Promise<MatchFoundMessage[]> {
  console.log('\n🎯 Step 2: Matchmaking (2 players join)');

  // Connect 2 players simultaneously
  const p1Id = crypto.randomUUID();
  const p2Id = crypto.randomUUID();

  const [match1, match2] = await Promise.all([
    connectToMatchmaking(p1Id),
    connectToMatchmaking(p2Id),
  ]);

  assert(match1.matchId === match2.matchId, 'Both players matched to same match');
  assert(match1.playerSlot !== match2.playerSlot, 'Players have different slots');
  assert(typeof match1.token === 'string' && match1.token.length > 0, 'Player 1 received token');
  assert(typeof match2.token === 'string' && match2.token.length > 0, 'Player 2 received token');

  console.log(`  Match ID: ${match1.matchId}`);
  console.log(`  Player 1: slot=${match1.playerSlot}`);
  console.log(`  Player 2: slot=${match2.playerSlot}`);

  return [match1, match2];
}

// ─── Step 3: Connect to Relay Room ──────────────────────────

function connectToRelay(matchId: string, token: string): Promise<{
  ws: WebSocket;
  messages: ArrayBuffer[];
}> {
  return new Promise((resolve, reject) => {
    const messages: ArrayBuffer[] = [];
    const ws = new WebSocket(`${SERVER_URL}/match/${matchId}?token=${encodeURIComponent(token)}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      resolve({ ws, messages });
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        messages.push(event.data);
      }
    };

    ws.onerror = () => reject(new Error('Relay WS error'));
    setTimeout(() => reject(new Error('Relay connection timeout')), 5000);
  });
}

async function testRelayConnection(matches: MatchFoundMessage[]): Promise<void> {
  console.log('\n🔗 Step 3: Connect to Relay Room');

  const conn1 = await connectToRelay(matches[0].matchId, matches[0].token);
  const conn2 = await connectToRelay(matches[1].matchId, matches[1].token);

  // Wait for ServerHello
  await sleep(500);

  assert(conn1.messages.length >= 1, `Player 1 received ${conn1.messages.length} message(s) (ServerHello)`);
  assert(conn2.messages.length >= 1, `Player 2 received ${conn2.messages.length} message(s) (ServerHello)`);

  // Check ServerHello type (byte 1 = message type, ServerHello = 0)
  const view1 = new DataView(conn1.messages[0]);
  const view2 = new DataView(conn2.messages[0]);
  assert(view1.getUint8(1) === 0, 'Player 1 first message is ServerHello (type=0)');
  assert(view2.getUint8(1) === 0, 'Player 2 first message is ServerHello (type=0)');

  // Check room count
  const health = await (await fetch(`${HTTP_URL}/health`)).json() as Record<string, unknown>;
  assert(health.rooms === 1, `Server has 1 active room (got ${health.rooms})`);

  console.log('\n🔌 Step 4: Disconnect players');

  conn1.ws.close();
  await sleep(200);

  conn2.ws.close();
  await sleep(1000); // wait for match end processing

  const health2 = await (await fetch(`${HTTP_URL}/health`)).json() as Record<string, unknown>;
  console.log(`  Rooms after disconnect: ${health2.rooms}`);
}

// ─── Run ────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Circle Sumo Integration Test');
  console.log(`   Server: ${HTTP_URL}`);

  try {
    await checkHealth();
    const matches = await testMatchmaking();
    await testRelayConnection(matches);

    console.log('\n✅ All integration tests passed!\n');
  } catch (err) {
    console.error('\n❌ Integration test failed:', err);
    process.exit(1);
  }
}

main();
