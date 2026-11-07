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

type TrialSummary = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  actionCount: number;
  evaluation?: {
    outcome: 'success' | 'failure';
    failure_reason: string | null;
  };
};

function App() {
  const [currentPage, setCurrentPage] = useState('Home');
  const [goal, setGoal] = useState('Find the refund policy without purchasing anything.');
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

  useEffect(() => {
    let cancelled = false;
    async function loadAgents() {
      try {
        const response = await fetch('/api/agents');
        const body = await response.json() as { agents?: Agent[]; error?: { message?: string } };
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
        const response = await fetch(`/api/trials/${encodeURIComponent(activeTrialId)}`);
        const body = await response.json() as { trial?: TrialSummary; error?: { message?: string } };
        if (!response.ok || !body.trial) throw new Error(body.error?.message || 'Could not read trial status.');
        if (cancelled) return;
        if (body.trial.status === 'running') {
          setTrialMessage(`Trial running · ${body.trial.actionCount} actions taken`);
          timer = setTimeout(() => void pollTrial(), 1200);
          return;
        }

        setIsTrialRunning(false);
        if (body.trial.status === 'completed') {
          setTrialMessage(
            body.trial.evaluation?.outcome === 'success'
              ? `Trial complete · ${body.trial.actionCount} actions`
              : body.trial.evaluation?.failure_reason || 'Trial ended without completing the task.',
          );
        } else {
          const eventsResponse = await fetch(`/api/trials/${encodeURIComponent(activeTrialId)}/events`);
          const eventsBody = await eventsResponse.json() as {
            events?: Array<{ type: string; detail?: { message?: string } }>;
          };
          const errorMessage = [...(eventsBody.events ?? [])]
            .reverse()
            .find((event) => event.type === 'error')?.detail?.message;
          setTrialMessage(errorMessage || body.trial.evaluation?.failure_reason || 'The trial did not complete.');
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
      const body = await response.json() as { agent?: Agent; error?: { message?: string } };
      if (!response.ok || !body.agent) {
        throw new Error(body.error?.message || 'The agent could not be registered.');
      }
      const registeredAgent = body.agent;
      setAgents((currentAgents) => [...currentAgents, registeredAgent]);
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
    if (!selectedAgentId || isTrialRunning) {
      return;
    }

    setTrialMessage('');
    setActiveTrialId('');
    setIsTrialRunning(true);
    try {
      const response = await fetch('/api/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, goal, difficulty }),
      });
      const body = await response.json() as {
        trial?: { id: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.trial) {
        throw new Error(body.error?.message || 'The trial could not be started.');
      }
      setActiveTrialId(body.trial.id);
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
              <h2 className="configuration-heading agent-selection-heading">
                <img alt="" className="agent-selection-icon" src={AgentIcon} />
                <span>Choose Your Agent</span>
              </h2>
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
              <button
                className="add-agent-button"
                onClick={openAgentForm}
                type="button"
              >
                <span aria-hidden="true" className="add-agent-plus">+</span>
                <span>Add Dify Agent</span>
                <span aria-hidden="true" className="add-agent-arrow">›</span>
              </button>
            </section>
            <section aria-label="Labyrinth configuration" className="trial-configuration">
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
                  onChange={(event) => setGoal(event.currentTarget.value)}
                  placeholder="What should your agent accomplish?"
                  required
                  rows={4}
                  value={goal}
                />
              </div>
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
