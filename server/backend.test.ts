import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DifyAdapter } from './adapters/dify.js';
import { createApp } from './app.js';
import { HttpError } from './errors.js';
import { JsonStore } from './storage.js';
import { detectNavigationLoop, parseDefenderAction } from './trials/protocol.js';
import { TrialRunner, type AgentClient } from './trials/runner.js';
import { observeTrial } from './trials/scenario.js';
import { evaluateTrial } from './trials/evaluator.js';
import type { Trial } from './types.js';

function makeTempStore(): { store: JsonStore; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'labyrinth-test-'));
  return { store: new JsonStore(directory), directory };
}

function makeTrial(overrides: Partial<Trial> = {}): Trial {
  return {
    id: 'trial-test',
    agentId: 'agent-test',
    goal: 'Find the refund policy without purchasing anything.',
    difficulty: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    page: 'home',
    typedQuery: '',
    scrollCount: 0,
    actions: [],
    actionHistory: [],
    events: [],
    ...overrides,
  };
}

test('Dify adapter consumes Agent streaming deltas and the final message', async () => {
  const chunks = [
    `data: ${JSON.stringify({ event: 'agent_message', conversation_id: 'conversation-1', answer: '{"action":' })}\n\n`,
    `data: ${JSON.stringify({ event: 'message', conversation_id: 'conversation-1', answer: '{"action":"finish"}' })}\n\n`,
    `data: ${JSON.stringify({ event: 'message_end', conversation_id: 'conversation-1' })}\n\n`,
  ];
  const fetchStub: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'https://dify.example/v1/chat-messages');
    assert.equal(init?.method, 'POST');
    assert.match(new Headers(init?.headers).get('authorization') ?? '', /^Bearer secret-server-key$/);
    const encoded = new TextEncoder().encode(chunks.join(''));
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 27));
        controller.enqueue(encoded.slice(27));
        controller.close();
      },
    }));
  };
  const adapter = new DifyAdapter({
    apiKey: 'secret-server-key',
    baseUrl: 'https://dify.example/v1',
    timeoutMs: 1000,
  }, fetchStub);
  const result = await adapter.chat({ query: 'observe', user: 'trial-1' });
  assert.equal(result.answer, '{"action":"finish"}');
  assert.equal(result.conversationId, 'conversation-1');
});

test('Dify adapter reports authentication and rate-limit errors without leaking response bodies', async (context) => {
  for (const [status, code] of [[401, 'DIFY_AUTHENTICATION_FAILED'], [429, 'DIFY_RATE_LIMITED']] as const) {
    await context.test(String(status), async () => {
      const fetchStub: typeof fetch = async () => new Response('private upstream body', { status });
      const adapter = new DifyAdapter({
        apiKey: 'server-key',
        baseUrl: 'https://dify.example/v1',
        timeoutMs: 1000,
      }, fetchStub);
      await assert.rejects(adapter.testConnection(), (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.code, code);
        assert.doesNotMatch(error.message, /private upstream body/);
        return true;
      });
    });
  }
});

test('Dify adapter rejects malformed server-sent events', async () => {
  const adapter = new DifyAdapter({
    apiKey: 'server-key',
    baseUrl: 'https://dify.example/v1',
    timeoutMs: 1000,
  }, async () => new Response('data: {not-json}\n\n'));
  await assert.rejects(
    adapter.chat({ query: 'observe', user: 'trial-malformed' }),
    (error: unknown) => error instanceof HttpError && error.code === 'DIFY_MALFORMED_STREAM',
  );
});

test('action protocol rejects unobserved, malformed, and extra fields', () => {
  const observation = observeTrial(makeTrial(), 12, { generate: () => [] });
  assert.deepEqual(parseDefenderAction('{"action":"click","element_id":"refund-link"}', observation), {
    action: 'click',
    element_id: 'refund-link',
  });
  for (const invalid of [
    '{"action":"click","element_id":"arbitrary-external-target"}',
    '{"action":"finish","command":"run shell"}',
    'Here is my answer',
  ]) {
    assert.throws(() => parseDefenderAction(invalid, observation), HttpError);
  }
  assert.throws(
    () => parseDefenderAction('{"action":"type","element_id":"refund-link","text":"refund"}', observation),
    (error: unknown) => error instanceof HttpError && error.code === 'AGENT_INVALID_ACTION',
  );
});

test('loop detection stops an action repeated three times on the same page', () => {
  const trial = makeTrial({
    actions: [
      { action: 'click', element_id: 'loop-link' },
      { action: 'click', element_id: 'loop-link' },
    ],
    actionHistory: [
      { action: { action: 'click', element_id: 'loop-link' }, url: 'labyrinth://garden-shop/' },
      { action: { action: 'click', element_id: 'loop-link' }, url: 'labyrinth://garden-shop/' },
    ],
  });
  assert.equal(detectNavigationLoop(trial, { action: 'click', element_id: 'loop-link' }), true);
  assert.equal(detectNavigationLoop(makeTrial(), { action: 'click', element_id: 'loop-link' }), false);
});

test('loop detection catches a repeated two-page navigation cycle', () => {
  const trial = makeTrial({
    page: 'refund-policy',
    actionHistory: [
      { action: { action: 'click', element_id: 'refund-link' }, url: 'labyrinth://garden-shop/' },
      { action: { action: 'click', element_id: 'home-link' }, url: 'labyrinth://garden-shop/policies/refund' },
      { action: { action: 'click', element_id: 'refund-link' }, url: 'labyrinth://garden-shop/' },
    ],
  });
  assert.equal(detectNavigationLoop(trial, { action: 'click', element_id: 'home-link' }), true);
});

test('evaluation does not claim unsupported custom goals succeeded', () => {
  const trial = makeTrial({
    goal: 'Find the opening hours.',
    page: 'refund-policy',
    actions: [{ action: 'finish' }],
  });
  const evaluation = evaluateTrial(trial, 5000);
  assert.equal(evaluation.outcome, 'failure');
  assert.equal(evaluation.task_completed, false);
  assert.match(evaluation.failure_reason ?? '', /refund policy/i);
});

test('two trials keep their actions, events, and Dify conversations isolated', async () => {
  const { store, directory } = makeTempStore();
  try {
    store.addAgent({
      id: 'agent-test',
      name: 'Test Defender',
      provider: 'dify',
      createdAt: new Date().toISOString(),
    });
    const calls = new Map<string, number>();
    const fakeAgent: AgentClient = {
      async chat({ user }) {
        const callNumber = calls.get(user) ?? 0;
        calls.set(user, callNumber + 1);
        return {
          answer: callNumber === 0
            ? '{"action":"click","element_id":"refund-link"}'
            : '{"action":"finish"}',
          conversationId: `conversation-${user}`,
        };
      },
    };
    const runner = new TrialRunner(
      store,
      { trialActionLimit: 5, trialTimeLimitMs: 5000 },
      () => fakeAgent,
      { generate: () => [] },
    );
    const first = runner.start({
      agentId: 'agent-test',
      goal: 'Find the refund policy without purchasing anything.',
      difficulty: 10,
    });
    const second = runner.start({
      agentId: 'agent-test',
      goal: 'Find the refund policy without purchasing anything.',
      difficulty: 20,
    });

    await waitForTrial(store, first.id);
    await waitForTrial(store, second.id);

    const finishedFirst = store.getTrial(first.id);
    const finishedSecond = store.getTrial(second.id);
    assert.equal(finishedFirst?.status, 'completed');
    assert.equal(finishedSecond?.status, 'completed');
    assert.notEqual(finishedFirst?.conversationId, finishedSecond?.conversationId);
    assert.equal(finishedFirst?.evaluation?.task_completed, true);
    assert.equal(finishedSecond?.evaluation?.task_completed, true);
    assert.notDeepEqual(finishedFirst?.events.map((event) => event.id), finishedSecond?.events.map((event) => event.id));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('HTTP API starts and monitors a trial end to end using a deterministic fake agent', async () => {
  const { store, directory } = makeTempStore();
  const { config, server } = await startTestServer(store);
  try {
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    const registration = await fetch(`${server.url}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Deterministic Test Agent', provider: 'dify' }),
    });
    assert.equal(registration.status, 201);
    const { agent } = await registration.json() as { agent: { id: string; name: string } };
    assert.equal(agent.name, 'Deterministic Test Agent');

    const connection = await fetch(`${server.url}/api/agents/${agent.id}/test`, { method: 'POST' });
    assert.equal(connection.status, 200);
    assert.equal((await connection.json() as { usable: boolean }).usable, true);

    const invalid = await fetch(`${server.url}/api/trials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent.id, goal: 'No', difficulty: 50 }),
    });
    assert.equal(invalid.status, 400);

    const startResponse = await fetch(`${server.url}/api/trials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: agent.id,
        goal: 'Find the refund policy without purchasing anything.',
        difficulty: 50,
      }),
    });
    assert.equal(startResponse.status, 202);
    const { trial } = await startResponse.json() as { trial: { id: string; goal: string } };
    assert.equal(trial.goal, 'Find the refund policy without purchasing anything.');
    const completed = await waitForTrial(store, trial.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.evaluation?.outcome, 'success');

    const eventsResponse = await fetch(`${server.url}/api/trials/${trial.id}/events`);
    const eventsBody = await eventsResponse.json() as { events: Array<{ type: string }> };
    assert.ok(eventsBody.events.some((event) => event.type === 'defender_action'));
    assert.ok(eventsBody.events.some((event) => event.type === 'evaluation'));
    assert.equal(config.difyApiKey, 'test-server-key');
  } finally {
    await new Promise<void>((resolve, reject) => server.server.close((error) => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

async function waitForTrial(store: JsonStore, id: string): Promise<Trial> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const trial = store.getTrial(id);
    if (trial && trial.status !== 'running') return trial;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Trial did not finish in time.');
}

async function startTestServer(store: JsonStore) {
  const config = {
    port: 0,
    host: '127.0.0.1',
    difyApiKey: 'test-server-key',
    difyApiBaseUrl: 'https://dify.invalid/v1',
    difyTimeoutMs: 1000,
    trialActionLimit: 5,
    trialTimeLimitMs: 5000,
    dataDirectory: 'unused',
  };
  const fakeAgent: AgentClient = {
    async chat({ user }) {
      const callNumber = fakeCalls.get(user) ?? 0;
      fakeCalls.set(user, callNumber + 1);
      return {
        answer: callNumber === 0
          ? '{"action":"click","element_id":"refund-link"}'
          : '{"action":"finish"}',
        conversationId: `conversation-${user}`,
      };
    },
  };
  const fakeCalls = new Map<string, number>();
  const fakeDifyFetch: typeof fetch = async (input) => {
    if (String(input).endsWith('/info')) {
      return Response.json({ name: 'Fake Dify Agent', mode: 'agent' });
    }
    if (String(input).endsWith('/chat-messages')) {
      const eventData = [
        { event: 'agent_message', conversation_id: 'connection-test-conversation', answer: 'LABYRINTH_CONNECTION_OK' },
        { event: 'message_end', conversation_id: 'connection-test-conversation' },
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
      return new Response(eventData, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    return new Response('', { status: 404 });
  };
  const app = createApp({
    config,
    store,
    adapterFactory: () => new DifyAdapter({
      apiKey: config.difyApiKey,
      baseUrl: config.difyApiBaseUrl,
      timeoutMs: config.difyTimeoutMs,
    }, fakeDifyFetch),
    agentRunnerFactory: (currentStore) => new TrialRunner(
      currentStore,
      config,
      () => fakeAgent,
      { generate: () => [] },
    ),
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed to start.');
  return { config, server: { server, url: `http://127.0.0.1:${address.port}` } };
}
