import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { GoalSafetyCategory, GoalSafetyDecision } from './safety/types.js';
import { DEFAULT_TRIAL_GOAL, type Agent, type Trial } from './types.js';

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw new Error(`Could not read persistent data file "${filePath}".`, { cause: error });
  }
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

export class JsonStore {
  private readonly agentsPath: string;
  private readonly trialsPath: string;
  private readonly safetyAuditPath: string;
  private agents: Agent[];
  private trials: Trial[];
  private safetyAudit: Array<{
    timestamp: string;
    decision: GoalSafetyDecision;
    category: GoalSafetyCategory;
  }>;

  constructor(dataDirectory: string) {
    const root = resolve(dataDirectory);
    this.agentsPath = resolve(root, 'agents.json');
    this.trialsPath = resolve(root, 'trials.json');
    this.safetyAuditPath = resolve(root, 'safety-decisions.json');
    this.agents = readJson(this.agentsPath, []);
    this.safetyAudit = readJson(this.safetyAuditPath, []);
    const savedTrials = readJson<Trial[]>(this.trialsPath, []);
    this.trials = savedTrials.map((trial) => ({
      ...trial,
      goal: typeof trial.goal === 'string' ? trial.goal : DEFAULT_TRIAL_GOAL,
      actionHistory: Array.isArray(trial.actionHistory) ? trial.actionHistory : [],
    }));
  }

  listAgents(): Agent[] {
    return this.agents.map((agent) => ({ ...agent }));
  }

  getAgent(id: string): Agent | undefined {
    const agent = this.agents.find((entry) => entry.id === id);
    return agent ? { ...agent } : undefined;
  }

  addAgent(agent: Agent): Agent {
    this.agents.push(agent);
    writeJson(this.agentsPath, this.agents);
    return { ...agent };
  }

  listTrials(): Trial[] {
    return this.trials.map((trial) => structuredClone(trial));
  }

  getTrial(id: string): Trial | undefined {
    const trial = this.trials.find((entry) => entry.id === id);
    return trial ? structuredClone(trial) : undefined;
  }

  saveTrial(trial: Trial): void {
    const index = this.trials.findIndex((entry) => entry.id === trial.id);
    if (index === -1) {
      this.trials.push(structuredClone(trial));
    } else {
      this.trials[index] = structuredClone(trial);
    }
    writeJson(this.trialsPath, this.trials);
  }

  recordSafetyDecision(entry: {
    timestamp: string;
    decision: GoalSafetyDecision;
    category: GoalSafetyCategory;
  }): void {
    this.safetyAudit.push(entry);
    if (this.safetyAudit.length > 10_000) {
      this.safetyAudit.splice(0, this.safetyAudit.length - 10_000);
    }
    writeJson(this.safetyAuditPath, this.safetyAudit);
  }
}
