import { useState } from 'react';
import TitleBoard from './assets/TitleBoard.png';
import NavBarArtwork from './assets/NavBar.png';
import ProfileArtwork from './assets/profile.png';
import ParchmentDisplay from './assets/ParchmentDisplay.png';

const navigationItems = ['Home', 'Trials', 'Agents', 'Archives'];

function App() {
  const [currentPage, setCurrentPage] = useState('Home');

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
        <div className="home-profile">
          <img alt="Profile nameplate with an empty portrait frame" src={ProfileArtwork} />
        </div>
      </header>
      {currentPage === 'Home' && (
        <section aria-label="Main display panel" className="main-display-panel">
          <img alt="" className="main-display-artwork" src={ParchmentDisplay} />
          <div className="main-display-content" />
        </section>
      )}
    </main>
  );
}

export default App;
