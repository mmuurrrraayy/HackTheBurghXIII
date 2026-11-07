import { useState } from 'react';
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

const navigationItems = ['Home', 'Trials', 'Agents', 'Archives'];

function App() {
  const [currentPage, setCurrentPage] = useState('Home');

  function startTrials() {
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
              Select an agent, configure the labyrinth, and begin the trial.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
