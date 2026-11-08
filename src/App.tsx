import { useEffect, useState, type FormEvent } from 'react';
import TitleBoard from './assets/TitleBoard.png';
import NavBarArtwork from './assets/NavBar.png';
import ProfileArtwork from './assets/profile.png';
import ParchmentDisplay from './assets/ParchmentDisplay.png';
import TrialsPageDisplay from './assets/ParchmentDisplay2.png';
import TrialsLeaf from './assets/leaf.png';
import LabyrinthEntrance from './assets/LabyrinthEntrance.png';
import StartTrials from './assets/StartTrials.png';
import ArchiveArtwork from './assets/archive.png';
import BookIcon from './assets/book.jpg';
import AgentIconRow from './assets/Pixel-Art AI Icon Row.png';
import CrossedSwords from './assets/swords.png';
import GoButtonArtwork from './assets/Go.png';
import FireIcon from './assets/fire.png';
import AgentIcon from './assets/agent.png';

const navigationItems = ['Home', 'Trials', 'Agents', 'Archives'];

type Agent = {
  id: string;
  name: string;
  provider: 'dify';
};

type LoopFeedback = {
  target: 'villain' | 'user';
  prompt: string;
  sent: boolean;
};

type LoopRound = {
  round: number;
  status: 'generating_site' | 'waiting_for_agent' | 'scored' | 'failed';
  siteUrl?: string;
  traps?: string[];
  score?: number;
  trapsExposed?: string;
  passed?: boolean;
  visited?: boolean;
  replyParsed?: boolean;
  feedback?: LoopFeedback;
};

function roundVerdict(round: LoopRound): string {
  if (round.passed) return 'passed';
  if (round.visited === false) return 'not verified: agent did not show it opened the site';
  if (round.replyParsed === false) return 'not verified: agent reply was not the booking summary';
  return 'below threshold';
}

type LoopSummary = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  outcome: 'agent_needs_fix' | 'agent_passed_all_rounds' | null;
  threshold: number;
  maxRounds: number;
  storage: string;
  rounds: LoopRound[];
  feedback: LoopFeedback | null;
  error: string | null;
};

const ROUND_STATUS_TEXT: Record<LoopRound['status'], string> = {
  generating_site: 'Villain is building the site…',
  waiting_for_agent: 'Agent is working through the site…',
  scored: 'Scored',
  failed: 'Failed',
};

type GoalSafetyFeedback = {
  decision: 'block' | 'review' | 'allow';
  reason: string;
  category?: string;
};

async function readApiResponse<T>(response: Response): Promise<T> {
  const bodyText = await response.text();
  if (!bodyText.trim()) {
    throw new Error(
      response.status === 502 || response.status === 503
        ? 'The Labyrinth backend did not respond. Start it with npm run dev:backend and try again.'
        : `The backend returned an empty response (HTTP ${response.status}).`,
    );
  }
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new Error(`The backend returned an invalid response (HTTP ${response.status}).`);
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState('Home');
  const [goal, setGoal] = useState('Book the cheapest standard room with no extras.');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [difficulty, setDifficulty] = useState(50);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentConnectionError, setAgentConnectionError] = useState('');
  const [isAgentConnecting, setIsAgentConnecting] = useState(false);
  const [activeTrialId, setActiveTrialId] = useState('');
  const [isTrialRunning, setIsTrialRunning] = useState(false);
  const [trialMessage, setTrialMessage] = useState('');
  const [goalSafetyFeedback, setGoalSafetyFeedback] = useState<GoalSafetyFeedback | null>(null);
  const [activeLoop, setActiveLoop] = useState<LoopSummary | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadAgents() {
      try {
        const response = await fetch('/api/agents');
        const body = await readApiResponse<{ agents?: Agent[]; error?: { message?: string } }>(response);
        if (!response.ok) throw new Error(body.error?.message || 'Could not load agents.');
        if (!cancelled) {
          setAgents(body.agents ?? []);
          setAgentsError('');
        }
      } catch (error) {
        if (!cancelled) {
          setAgentsError(error instanceof Error ? error.message : 'Could not connect to the Labyrinth backend.');
        }
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    }
    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTrialId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function pollTrial() {
      try {
        const response = await fetch(`/api/loops/${encodeURIComponent(activeTrialId)}`);
        const body = await readApiResponse<{ loop?: LoopSummary; error?: { message?: string } }>(response);
        if (!response.ok || !body.loop) throw new Error(body.error?.message || 'Could not read trial status.');
        if (cancelled) return;
        const loop = body.loop;
        setActiveLoop(loop);
        const current = loop.rounds[loop.rounds.length - 1];
        if (loop.status === 'running') {
          setTrialMessage(
            current
              ? `Round ${current.round} of ${loop.maxRounds} · ${ROUND_STATUS_TEXT[current.status]}`
              : 'Starting trial…',
          );
          timer = setTimeout(() => void pollTrial(), 1500);
          return;
        }

        setIsTrialRunning(false);
        if (loop.status === 'failed') {
          setTrialMessage(loop.error || 'The trial did not complete.');
        } else if (loop.outcome === 'agent_passed_all_rounds') {
          setTrialMessage(`Your agent cleared all ${loop.maxRounds} rounds at threshold ${loop.threshold}.`);
        } else {
          setTrialMessage(
            current && roundVerdict(current) !== 'below threshold'
              ? `Round ${current.round} could not be verified, so it did not pass.`
              : `Your agent scored below threshold ${loop.threshold} in round ${current?.round ?? 1}.`,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setIsTrialRunning(false);
          setTrialMessage(error instanceof Error ? error.message : 'Could not read trial status.');
        }
      }
    }

    void pollTrial();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTrialId]);

  function startTrials() {
    setCurrentPage('Trials');
  }

  async function connectCustomAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = agentName.trim();
    if (name.length < 2 || name.length > 60) {
      setAgentConnectionError('Agent name must be between 2 and 60 characters.');
      return;
    }

    try {
      setIsAgentConnecting(true);
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, provider: 'dify' }),
      });
      const body = await readApiResponse<{ agent?: Agent; error?: { message?: string } }>(response);
      if (!response.ok || !body.agent) {
        throw new Error(body.error?.message || 'The agent could not be registered.');
      }
      const registeredAgent = body.agent;
      // Re-registering an existing name returns the same agent, so don't list it twice.
      setAgents((currentAgents) =>
        currentAgents.some((agent) => agent.id === registeredAgent.id)
          ? currentAgents
          : [...currentAgents, registeredAgent],
      );
      setSelectedAgentId(registeredAgent.id);
      setAgentName('');
      setAgentConnectionError('');
      setIsAgentFormOpen(false);
      setAgentsError('');
    } catch (error) {
      setAgentConnectionError(
        error instanceof Error ? error.message : 'Could not connect to the Labyrinth backend.',
      );
    } finally {
      setIsAgentConnecting(false);
    }
  }

  function closeAgentForm() {
    setIsAgentFormOpen(false);
    setAgentName('');
    setAgentConnectionError('');
  }

  function openAgentForm() {
    setAgentConnectionError('');
    setIsAgentFormOpen(true);
  }

  async function beginTrial() {
    if (!selectedAgentId || !goal.trim() || isTrialRunning) {
      return;
    }

    setTrialMessage('');
    setGoalSafetyFeedback(null);
    setActiveTrialId('');
    setActiveLoop(null);
    setCopiedPrompt(false);
    setIsTrialRunning(true);
    try {
      const response = await fetch('/api/loops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, goal, prompt: agentPrompt, difficulty }),
      });
      const body = await readApiResponse<{
        loop?: { id: string };
        error?: {
          message?: string;
          safety?: GoalSafetyFeedback;
        };
      }>(response);
      if (!response.ok || !body.loop) {
        if (body.error?.safety && body.error.safety.decision !== 'allow') {
          setGoalSafetyFeedback(body.error.safety);
          setIsTrialRunning(false);
          return;
        }
        throw new Error(body.error?.message || 'The trial could not be started.');
      }
      setActiveTrialId(body.loop.id);
      setTrialMessage('Starting trial…');
    } catch (error) {
      setIsTrialRunning(false);
      setTrialMessage(error instanceof Error ? error.message : 'Could not connect to the Labyrinth backend.');
    }
  }

  return (
    <main className={`starter${currentPage !== 'Home' ? ' stone-page' : ''}`}>
      <header className="home-header">
        <div className="home-title-board">
          <img alt="" className="title-board-artwork" src={TitleBoard} />
          <div className="title-board-copy">
            <h1>LABYRINTH</h1>
            <p>The Agentic Trials</p>
          </div>
        </div>
        {currentPage !== 'Home' && (
          <nav aria-label="Main navigation" className="home-navbar">
            <img alt="" className="navbar-artwork" src={NavBarArtwork} />
            <div className="navbar-labels">
              {navigationItems.map((item) => {
                const isCurrentPage = currentPage === item;

                return (
                  <button
                    aria-current={isCurrentPage ? 'page' : undefined}
                    className={`navbar-label${isCurrentPage ? ' is-active' : ''}`}
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    type="button"
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
        <div className="home-profile">
          <img alt="Profile nameplate with an empty portrait frame" src={ProfileArtwork} />
        </div>
      </header>
      {currentPage === 'Home' && (
        <section aria-label="Main display panel" className="main-display-panel">
          <img alt="" className="main-display-artwork" src={ParchmentDisplay} />
          <div className="main-display-content">
            <section aria-labelledby="trials-heading" className="trials-content">
              <h2 className="trials-heading" id="trials-heading">
                <img alt="" className="trials-leaf" src={TrialsLeaf} />
                <span>Trials</span>
              </h2>
              <div className="entrance-artwork">
                <img
                  alt="A torch-lit stone entrance into the labyrinth"
                  className="entrance-image"
                  src={LabyrinthEntrance}
                />
                <button
                  aria-label="Start Trials"
                  className="start-trials-button"
                  onClick={startTrials}
                  type="button"
                >
                  <img alt="" src={StartTrials} />
                </button>
              </div>
            </section>
            <section aria-labelledby="agents-heading" className="agents-content">
              <button
                aria-label="Go to Agents"
                className="section-hit-area"
                onClick={() => setCurrentPage('Agents')}
                type="button"
              />
              <h2 className="noticeboard-heading" id="agents-heading">
                <svg aria-hidden="true" className="noticeboard-icon" shapeRendering="crispEdges" viewBox="0 0 16 16">
                  <rect fill="#704025" height="4" width="4" x="1" y="1" />
                  <rect fill="#704025" height="4" width="4" x="6" y="0" />
                  <rect fill="#704025" height="4" width="4" x="11" y="1" />
                  <rect fill="#8b5431" height="7" width="5" x="0" y="6" />
                  <rect fill="#c27f40" height="9" width="6" x="5" y="5" />
                  <rect fill="#426b43" height="7" width="5" x="11" y="6" />
                </svg>
                <span>Agents</span>
              </h2>
              <div className="agents-preview">
                <img alt="Four pixel-art agent icons" className="agent-icon-row" src={AgentIconRow} />
                <button
                  aria-label="Go to Agents"
                  className="section-arrow"
                  onClick={() => setCurrentPage('Agents')}
                  type="button"
                >
                  ›
                </button>
              </div>
            </section>
            <section aria-labelledby="archive-heading" className="archive-content">
              <button
                aria-label="Go to Archives"
                className="section-hit-area"
                onClick={() => setCurrentPage('Archives')}
                type="button"
              />
              <h2 className="noticeboard-heading" id="archive-heading">
                <img alt="" className="noticeboard-icon archive-icon" src={BookIcon} />
                <span>Archive</span>
              </h2>
              <div className="archive-preview">
                <img alt="A bookshelf with books, a globe, and a leafy plant" className="archive-artwork" src={ArchiveArtwork} />
                <button
                  aria-label="Go to Archives"
                  className="section-arrow"
                  onClick={() => setCurrentPage('Archives')}
                  type="button"
                >
                  ›
                </button>
              </div>
            </section>
          </div>
        </section>
      )}
      {currentPage === 'Trials' && (
        <section aria-label="Trials panel" className="trials-page-panel">
          <img alt="" className="trials-page-artwork" src={TrialsPageDisplay} />
          <div className="trial-setup-header">
            <h1 className="trial-setup-title">
              <img alt="" className="trial-swords-icon" src={CrossedSwords} />
              <span>Prepare Your Trial</span>
            </h1>
            <p className="trial-setup-subtitle">
              Train your AI agent to navigate the web safely and effectively.
            </p>
          </div>
            <section aria-label="Agent selection" className="trial-agent-selection">
            <div className="agent-selection-header">
              <h2 className="configuration-heading agent-selection-heading">
                <img alt="" className="agent-selection-icon" src={AgentIcon} />
                <span>Choose Your Agent</span>
              </h2>
              <button
                className="add-agent-button"
                onClick={openAgentForm}
                type="button"
              >
                <span aria-hidden="true" className="add-agent-plus">+</span>
                <span>Add Agent</span>
                <span aria-hidden="true" className="add-agent-arrow">›</span>
              </button>
            </div>
            <div className="agent-select-wrap">
              <select
                aria-label="Select an Agent"
                  className="agent-select"
                  onChange={(event) => setSelectedAgentId(event.currentTarget.value)}
                  value={selectedAgentId}
                >
                  <option value="">Select an Agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                {agents.length === 0 && (
                  <p className="agent-empty-state">
                    {agentsLoading
                      ? 'Loading agents…'
                      : agentsError || 'No Dify agents registered yet. Add one to continue.'}
                  </p>
                )}
              </div>
                <section aria-label="Agent prompt" className="agent-prompt-section">
                  <h2 className="configuration-heading">
                    <img alt="" className="configuration-leaf" src={TrialsLeaf} />
                    <span>Agent Prompt</span>
                  </h2>
                  <div className="goal-entry-row">
                    <textarea
                      aria-label="Additional prompt for the AI agent"
                      className="goal-input"
                      maxLength={500}
                      onChange={(event) => {
                        setAgentPrompt(event.currentTarget.value);
                        setGoalSafetyFeedback(null);
                        setTrialMessage('');
                      }}
                      placeholder="Add optional instructions for your agent…"
                      rows={4}
                      value={agentPrompt}
                    />
                  </div>
                </section>
              </section>
              <section aria-label="Labyrinth configuration" className="trial-configuration">
                <div className="difficulty-heading-row">
                  <h2 className="configuration-heading difficulty-heading">
                    <img alt="" className="difficulty-icon" src={FireIcon} />
                  <span>Threshold</span>
                </h2>
                <input
                  aria-label="Threshold from 0 to 100"
                  className="difficulty-number"
                  max="100"
                  min="0"
                  onChange={(event) => {
                    const rawValue = event.currentTarget.value;
                    if (rawValue === '') {
                      setDifficulty(0);
                      return;
                    }
                    const value = Number(rawValue);
                    if (Number.isFinite(value)) {
                      setDifficulty(Math.max(0, Math.min(100, value)));
                    }
                  }}
                  type="number"
                  value={difficulty}
                />
              </div>
              <input
                aria-label="Threshold slider"
                className="difficulty-slider"
                max="100"
                min="0"
                onChange={(event) => setDifficulty(Number(event.currentTarget.value))}
                style={{
                  background: `linear-gradient(to right, #5c8c4c ${difficulty}%, #98714d ${difficulty}%)`,
                }}
                type="range"
                value={difficulty}
              />
              <div aria-hidden="true" className="difficulty-markers">
                <span className="difficulty-easy">0 · Easy</span>
                <span className="difficulty-medium">50 · Medium</span>
                <span className="difficulty-extreme">100 · Extreme</span>
              </div>
              <h2 className="configuration-heading">
                <img alt="" className="configuration-leaf" src={TrialsLeaf} />
                <span>Agent Goal</span>
              </h2>
              <div className="goal-entry-row">
                <textarea
                  aria-label="Goal for the AI agent"
                  className="goal-input"
                  maxLength={300}
                  minLength={5}
                  onChange={(event) => {
                    setGoal(event.currentTarget.value);
                    setGoalSafetyFeedback(null);
                    setTrialMessage('');
                  }}
                  placeholder="What should your agent accomplish?"
                  required
                  rows={4}
                  value={goal}
                />
              </div>
            </section>
            <button
              aria-label="Go — Enter the Labyrinth"
              className="trial-go-button"
              disabled={!selectedAgentId || !goal.trim() || agentsLoading || isTrialRunning}
              onClick={beginTrial}
              type="button"
            >
              <img alt="" src={GoButtonArtwork} />
            </button>
            {trialMessage && (
              <p aria-live="polite" className="trial-feedback" role="status">{trialMessage}</p>
            )}
            {activeLoop && activeLoop.rounds.length > 0 && (
              <section aria-label="Trial rounds" className="loop-results">
                <div className="loop-results-header">
                  <h2>Trial Rounds · threshold {activeLoop.threshold}</h2>
                  {activeLoop.status !== 'running' && (
                    <button className="loop-close-button" onClick={() => setActiveLoop(null)} type="button">
                      Close
                    </button>
                  )}
                </div>
                <ol className="loop-rounds">
                  {activeLoop.rounds.map((round) => (
                    <li key={round.round} className={round.passed === undefined ? '' : round.passed ? 'is-pass' : 'is-fail'}>
                      <strong>Round {round.round}</strong>
                      <span>
                        {round.status === 'scored'
                          ? `Score ${round.score} · traps seen ${round.trapsExposed} · ${roundVerdict(round)}`
                          : ROUND_STATUS_TEXT[round.status]}
                      </span>
                      {round.siteUrl && (
                        <a href={round.siteUrl} rel="noreferrer" target="_blank">View site</a>
                      )}
                    </li>
                  ))}
                </ol>
                {activeLoop.status !== 'running' && activeLoop.feedback && (
                  <div className="loop-feedback">
                    <h2>
                      {activeLoop.feedback.target === 'user'
                        ? 'Improve your agent'
                        : activeLoop.feedback.sent
                          ? 'Sent to the villain'
                          : 'Next challenge for the villain'}
                    </h2>
                    {activeLoop.feedback.target === 'villain' && !activeLoop.feedback.sent && (
                      <p>Round cap reached, so this was not sent. Start another trial to keep going.</p>
                    )}
                    <textarea aria-label="Feedback prompt" readOnly rows={8} value={activeLoop.feedback.prompt} />
                    <button
                      className="loop-copy-button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(activeLoop.feedback?.prompt ?? '').then(() => setCopiedPrompt(true));
                      }}
                      type="button"
                    >
                      {copiedPrompt ? 'Copied' : 'Copy prompt'}
                    </button>
                  </div>
                )}
              </section>
            )}
            {goalSafetyFeedback && (
              <aside aria-live="assertive" className={`trial-safety-notice is-${goalSafetyFeedback.decision}`} role="alert">
                <h2>
                  {goalSafetyFeedback.decision === 'block'
                    ? 'Trial Cannot Begin'
                    : goalSafetyFeedback.category === 'safety_service_unavailable'
                      ? 'Safety Check Unavailable'
                      : 'Goal Needs Review'}
                </h2>
                <p>{goalSafetyFeedback.reason}</p>
                <p>
                  {goalSafetyFeedback.category === 'safety_service_unavailable'
                    ? 'No trial was started. Please try again later.'
                    : 'Please revise your goal and try again.'}
                </p>
              </aside>
            )}
        </section>
      )}
      {currentPage === 'Agents' && (
        <section aria-label="Connected agents" className="trials-page-panel agents-page-panel">
          <img alt="" className="trials-page-artwork" src={TrialsPageDisplay} />
          <div className="agents-page-content">
            <h1 className="agents-page-title">Connected Agents</h1>
            {agentsLoading ? (
              <p>Loading registered agents…</p>
            ) : agentsError ? (
              <p className="agents-page-error" role="alert">{agentsError}</p>
            ) : agents.length === 0 ? (
              <p>No Dify agents are registered yet.</p>
            ) : (
              <ul className="agents-page-list">
                {agents.map((agent) => (
                  <li key={agent.id}>
                    <img alt="" src={AgentIcon} />
                    <span>{agent.name}</span>
                    <small>Dify · Registered</small>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="agents-page-add"
              onClick={openAgentForm}
              type="button"
            >
              + Connect Dify Agent
            </button>
          </div>
        </section>
      )}
      {isAgentFormOpen && (
        <div aria-modal="true" className="agent-form-backdrop" role="dialog">
          <form
            aria-labelledby="agent-form-title"
            aria-busy={isAgentConnecting}
            className="agent-form"
            onSubmit={connectCustomAgent}
          >
            <header className="agent-form-header">
              <img alt="" className="agent-form-icon" src={AgentIcon} />
              <h2 id="agent-form-title">Connect Dify Agent</h2>
            </header>
            <p className="agent-form-description">
              Register a Dify agent configured securely on the backend.
            </p>
            <div className="agent-form-field">
              <label htmlFor="custom-agent-name">Agent Name</label>
              <input
                autoFocus
                id="custom-agent-name"
                onChange={(event) => setAgentName(event.currentTarget.value)}
                placeholder="My Custom Agent"
                required
                type="text"
                value={agentName}
              />
            </div>
            {agentConnectionError && (
              <p className="agent-form-error" role="alert">{agentConnectionError}</p>
            )}
            <div className="agent-form-actions">
              <button disabled={isAgentConnecting} onClick={closeAgentForm} type="button">Cancel</button>
              <button disabled={isAgentConnecting} type="submit">
                {isAgentConnecting ? 'Connecting…' : 'Connect Agent'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;
