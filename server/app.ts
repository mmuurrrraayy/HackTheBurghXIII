import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { resolve } from 'node:path';
import { DifyAdapter } from './adapters/dify.js';
import type { AppConfig } from './config.js';
import { HttpError } from './errors.js';
import {
  GoalSafetyService,
  OpenAiCompatibleGoalSafetyClassifier,
} from './safety/goal-safety-service.js';
import type { GoalSafetyCategory, GoalSafetyDecision } from './safety/types.js';
import { JsonStore } from './storage.js';
import { TrialRunner } from './trials/runner.js';
import type { Agent, Trial, TrialSummary } from './types.js';

export interface ServerDependencies {
  config: AppConfig;
  store: JsonStore;
  adapterFactory?: () => DifyAdapter;
  agentRunnerFactory?: (store: JsonStore) => TrialRunner;
  goalSafetyService?: GoalSafetyService;
  serveFrontend?: boolean;
}

export function createApp(dependencies: ServerDependencies) {
  const { config, store } = dependencies;
  const adapterFactory = dependencies.adapterFactory ?? (() => new DifyAdapter({
    apiKey: config.difyApiKey,
    baseUrl: config.difyApiBaseUrl,
    timeoutMs: config.difyTimeoutMs,
  }));
  const goalSafetyService = dependencies.goalSafetyService ?? new GoalSafetyService({
    async classify(goal) {
      if (!config.safetyClassifierUrl || !config.safetyClassifierApiKey || !config.safetyClassifierModel) {
        throw new HttpError(
          503,
          'Goal safety validation is not configured. Please contact the application administrator.',
          'GOAL_SAFETY_UNAVAILABLE',
        );
      }
      return new OpenAiCompatibleGoalSafetyClassifier({
        endpoint: config.safetyClassifierUrl,
        apiKey: config.safetyClassifierApiKey,
        model: config.safetyClassifierModel,
        timeoutMs: config.safetyClassifierTimeoutMs,
      }).classify(goal);
    },
  });
  const runner = dependencies.agentRunnerFactory?.(store) ?? new TrialRunner(
    store,
    config,
    (agentId) => {
      if (!store.getAgent(agentId)) throw new HttpError(404, 'Selected agent was not found.', 'AGENT_NOT_FOUND');
      ensureDifyConfigured(config);
      return adapterFactory();
    },
  );
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb', strict: true }));

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

  app.get('/api/agents', (_request, response) => {
    response.json({ agents: store.listAgents() });
  });

  app.post('/api/agents', async (request, response) => {
    ensureDifyConfigured(config);
    const body = request.body as unknown;
    if (!isRecord(body) || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 60) {
      throw new HttpError(400, 'Agent name must be between 2 and 60 characters.', 'INVALID_AGENT_NAME');
    }
    if (body.provider !== 'dify') {
      throw new HttpError(400, 'Only the server-configured Dify provider is supported currently.', 'UNSUPPORTED_PROVIDER');
    }
    if (Object.keys(body).some((key) => !['name', 'provider'].includes(key))) {
      throw new HttpError(400, 'Unexpected agent configuration. Provider credentials must remain server-side.', 'INVALID_AGENT_CONFIGURATION');
    }
    const info = await adapterFactory().testConnection();
    if (info.mode !== 'agent' && info.mode !== 'agent-chat') {
      throw new HttpError(
        422,
        `The configured Dify application is "${info.mode}", not an Agent application.`,
        'DIFY_WRONG_APP_TYPE',
      );
    }
    const existingAgent = store.listAgents()[0];
    if (existingAgent) {
      if (existingAgent.name === body.name.trim()) {
        response.json({ agent: existingAgent });
        return;
      }
      throw new HttpError(
        409,
        'This backend currently supports one Dify app/API key. Configure that app before registering another agent.',
        'DIFY_AGENT_ALREADY_REGISTERED',
      );
    }
    const agent: Agent = {
      id: randomUUID(),
      name: body.name.trim(),
      provider: 'dify',
      createdAt: new Date().toISOString(),
    };
    response.status(201).json({ agent: store.addAgent(agent) });
  });

  app.post('/api/dify/test', async (_request, response) => {
    ensureDifyConfigured(config);
    const info = await adapterFactory().testConnection();
    response.json({ connected: true, ...info });
  });

  app.post('/api/agents/:id/test', async (request, response) => {
    const agent = store.getAgent(request.params.id);
    if (!agent) throw new HttpError(404, 'Agent was not found.', 'AGENT_NOT_FOUND');
    ensureDifyConfigured(config);
    const adapter = adapterFactory();
    const info = await adapter.testConnection();
    if (info.mode !== 'agent' && info.mode !== 'agent-chat') {
      throw new HttpError(422, 'The configured Dify application is not an Agent application.', 'DIFY_WRONG_APP_TYPE');
    }
    const reply = await adapter.chat({
      query: 'Reply with exactly this text and no other content: LABYRINTH_CONNECTION_OK',
      user: `labyrinth-connection-test-${randomUUID()}`,
    });
    if (reply.answer !== 'LABYRINTH_CONNECTION_OK' || !reply.conversationId) {
      throw new HttpError(502, 'Dify did not return a usable response.', 'DIFY_UNUSABLE_RESPONSE');
    }
    response.json({
      connected: true,
      usable: true,
      agentId: agent.id,
      applicationName: info.name,
    });
  });

  app.post('/api/trials', async (request, response) => {
    const body = request.body as unknown;
    if (!isRecord(body)) throw new HttpError(400, 'A JSON request body is required.', 'INVALID_TRIAL_REQUEST');
    if (typeof body.agentId !== 'string' || !body.agentId) {
      throw new HttpError(400, 'Select an agent before starting a trial.', 'INVALID_AGENT_ID');
    }
    if (typeof body.goal !== 'string' || body.goal.trim().length < 5 || body.goal.trim().length > 300) {
      throw new HttpError(400, 'Goal must be between 5 and 300 characters.', 'INVALID_GOAL');
    }
    if (typeof body.difficulty !== 'number' || !Number.isInteger(body.difficulty) || body.difficulty < 0 || body.difficulty > 100) {
      throw new HttpError(400, 'Difficulty must be a whole number from 0 to 100.', 'INVALID_DIFFICULTY');
    }
    let safety: { decision: GoalSafetyDecision; reason: string; category: GoalSafetyCategory };
    try {
      safety = await goalSafetyService.evaluate(body.goal.trim());
    } catch (error) {
      if (!(error instanceof HttpError) || !error.code.startsWith('GOAL_SAFETY_')) throw error;
      const unavailableSafety = {
        decision: 'review' as const,
        reason: 'Goal safety validation is unavailable. Please try again later.',
        category: 'safety_service_unavailable' as const,
      };
      try {
        store.recordSafetyDecision({
          timestamp: new Date().toISOString(),
          decision: unavailableSafety.decision,
          category: unavailableSafety.category,
        });
      } catch {
        throw new HttpError(503, 'Goal safety validation is unavailable. Please try again later.', 'GOAL_SAFETY_AUDIT_FAILED');
      }
      response.status(503).json({
        error: {
          code: error.code,
          message: unavailableSafety.reason,
          safety: unavailableSafety,
        },
      });
      return;
    }

    try {
      store.recordSafetyDecision({
        timestamp: new Date().toISOString(),
        decision: safety.decision,
        category: safety.category,
      });
    } catch {
      throw new HttpError(503, 'Goal safety validation is unavailable. Please try again later.', 'GOAL_SAFETY_AUDIT_FAILED');
    }

    if (safety.decision === 'block') {
      response.status(403).json({
        error: {
          code: 'GOAL_SAFETY_BLOCKED',
          message: 'This goal may involve unsafe or unauthorised activity. Please enter a legitimate website-navigation task.',
          safety,
        },
      });
      return;
    }
    if (safety.decision === 'review') {
      response.status(422).json({
        error: {
          code: 'GOAL_SAFETY_REVIEW',
          message: safety.reason,
          safety,
        },
      });
      return;
    }

    if (runner.getActiveCount() >= 3) {
      throw new HttpError(429, 'The server is already running the maximum number of trials.', 'TRIAL_CAPACITY_REACHED');
    }
    ensureDifyConfigured(config);
    const trial = runner.start({ agentId: body.agentId, goal: body.goal.trim(), difficulty: body.difficulty });
    response.status(202).json({ trial: toSummary(trial) });
  });

  app.get('/api/trials', (_request, response) => {
    response.json({ trials: store.listTrials().map(toSummary) });
  });

  app.get('/api/trials/:id', (request, response) => {
    const trial = store.getTrial(request.params.id);
    if (!trial) throw new HttpError(404, 'Trial was not found.', 'TRIAL_NOT_FOUND');
    response.json({ trial: toSummary(trial) });
  });

  app.get('/api/trials/:id/events', (request, response) => {
    const trial = store.getTrial(request.params.id);
    if (!trial) throw new HttpError(404, 'Trial was not found.', 'TRIAL_NOT_FOUND');
    response.json({ events: trial.events });
  });

  if (dependencies.serveFrontend) {
    app.use(express.static(resolve('dist')));
    app.get(/.*/, (_request, response, next) => {
      response.sendFile(resolve('dist', 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((_request, _response, next) => {
    next(new HttpError(404, 'Route was not found.', 'NOT_FOUND'));
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request: Request, response: Response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
      return;
    }
    const knownError = error instanceof HttpError
      ? error
      : new HttpError(500, 'An unexpected server error occurred.', 'INTERNAL_ERROR');
    if (knownError.status >= 500) console.error(`[${knownError.code}] ${knownError.message}`);
    response.status(knownError.status).json({
      error: { code: knownError.code, message: knownError.message },
    });
  };
  app.use(errorHandler);

  return app;
}

export function toSummary(trial: Trial): TrialSummary {
  return {
    id: trial.id,
    agentId: trial.agentId,
    goal: trial.goal,
    difficulty: trial.difficulty,
    status: trial.status,
    startedAt: trial.startedAt,
    ...(trial.finishedAt ? { finishedAt: trial.finishedAt } : {}),
    actionCount: trial.actions.length,
    ...(trial.evaluation ? { evaluation: trial.evaluation } : {}),
  };
}

function ensureDifyConfigured(config: AppConfig): void {
  if (!config.difyApiKey) {
    throw new HttpError(503, 'Dify is not configured. Set DIFY_API_KEY in the backend environment.', 'DIFY_NOT_CONFIGURED');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
