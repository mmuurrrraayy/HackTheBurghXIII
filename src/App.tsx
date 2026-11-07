import { useState, type FormEvent } from 'react';
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
import RandomButtonArtwork from './assets/random.png';
import GoButtonArtwork from './assets/Go.png';
import FireIcon from './assets/fire.png';
import AgentIcon from './assets/agent.png';

const navigationItems = ['Home', 'Trials', 'Agents', 'Archives'];

type Agent = {
  id: string;
  name: string;
};

function App() {
  const [currentPage, setCurrentPage] = useState('Home');
  const [seed, setSeed] = useState('LAB-48291');
  const [difficulty, setDifficulty] = useState(50);
  const [agents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentEndpoint, setAgentEndpoint] = useState('');
  const [agentConnectionError, setAgentConnectionError] = useState('');

  function startTrials() {
    setCurrentPage('Trials');
  }

  function randomizeSeed() {
    let nextSeed: string;
    do {
      nextSeed = `LAB-${Math.floor(10000 + Math.random() * 90000)}`;
    } while (nextSeed === seed);
    setSeed(nextSeed);
  }

  function connectCustomAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!agentName.trim()) {
      setAgentConnectionError('Enter a name for your agent.');
      return;
    }

    let endpoint: URL;
    try {
      endpoint = new URL(agentEndpoint.trim());
    } catch {
      setAgentConnectionError('Enter a valid HTTPS endpoint URL.');
      return;
    }

    if (endpoint.protocol !== 'https:' || !endpoint.hostname) {
      setAgentConnectionError('The agent endpoint must use HTTPS.');
      return;
    }

    setAgentConnectionError(
      'Agent connection is unavailable because this frontend has no backend integration configured. No agent was saved.',
    );
  }

  function closeAgentForm() {
    setIsAgentFormOpen(false);
    setAgentName('');
    setAgentEndpoint('');
    setAgentConnectionError('');
  }

  function openAgentForm() {
    setAgentConnectionError('');
    setIsAgentFormOpen(true);
  }

  function beginTrial() {
    if (!selectedAgentId) {
      return;
    }

    setCurrentPage('Trials');
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
                    No connected agents yet. Agent connections require backend support.
                  </p>
                )}
              </div>
              <button
                className="add-agent-button"
                onClick={openAgentForm}
                type="button"
              >
                <span aria-hidden="true" className="add-agent-plus">+</span>
                <span>Add Custom Agent</span>
                <span aria-hidden="true" className="add-agent-arrow">›</span>
              </button>
            </section>
            <section aria-label="Labyrinth configuration" className="trial-configuration">
              <h2 className="configuration-heading seed-heading">
                <img alt="" className="configuration-leaf" src={TrialsLeaf} />
                <span>Labyrinth Seed</span>
              </h2>
              <div className="seed-entry-row">
                <input
                  aria-label="Labyrinth seed"
                  className="seed-input"
                  onChange={(event) => setSeed(event.currentTarget.value)}
                  type="text"
                  value={seed}
                />
                <button
                  aria-label="Generate a random labyrinth seed"
                  className="random-seed-button"
                  onClick={randomizeSeed}
                  type="button"
                >
                  <img alt="" src={RandomButtonArtwork} />
                </button>
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
              disabled={!selectedAgentId}
              onClick={beginTrial}
              type="button"
            >
              <img alt="" src={GoButtonArtwork} />
            </button>
        </section>
      )}
      {isAgentFormOpen && (
        <div aria-modal="true" className="agent-form-backdrop" role="dialog">
          <form aria-labelledby="agent-form-title" className="agent-form" onSubmit={connectCustomAgent}>
            <header className="agent-form-header">
              <img alt="" className="agent-form-icon" src={AgentIcon} />
              <h2 id="agent-form-title">Connect Custom Agent</h2>
            </header>
            <p className="agent-form-description">Bring your own AI agent into the labyrinth.</p>
            <div className="agent-form-field">
              <label htmlFor="custom-agent-name">Agent Name</label>
              <input
                autoFocus
                id="custom-agent-name"
                onChange={(event) => {
                  setAgentName(event.currentTarget.value);
                  setAgentConnectionError('');
                }}
                placeholder="My Custom Agent"
                required
                type="text"
                value={agentName}
              />
            </div>
            <div className="agent-form-field">
              <label htmlFor="custom-agent-endpoint">Agent API Endpoint</label>
              <input
                aria-describedby="agent-endpoint-help"
                id="custom-agent-endpoint"
                onChange={(event) => {
                  setAgentEndpoint(event.currentTarget.value);
                  setAgentConnectionError('');
                }}
                placeholder="https://my-agent.example.com/run"
                required
                type="url"
                value={agentEndpoint}
              />
              <p className="agent-endpoint-help" id="agent-endpoint-help">
                Enter the HTTPS endpoint where your agent receives trial requests.
              </p>
            </div>
            {agentConnectionError && (
              <p className="agent-form-error" role="alert">{agentConnectionError}</p>
            )}
            <div className="agent-form-actions">
              <button onClick={closeAgentForm} type="button">Cancel</button>
              <button type="submit">Connect Agent</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;
