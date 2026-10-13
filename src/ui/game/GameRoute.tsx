import { useMemo, useState } from 'react';
import { SqliteGameStore } from '../../db/repositories/game';
import { Game } from '../../game/Game';
import { useSession } from '../state/session';
import { DeskScene } from './DeskScene';
import { Bulletin, Ledger, NewCareer, Review } from './Paperwork';

/** #/desk: the game. Picks the screen for the current phase of the career. */
export function GameRoute() {
  const session = useSession();
  const [hiring, setHiring] = useState(false);
  // One Game per library; it re-reads its state from the database it lives in.
  const game = useMemo(() => Game.resume(session.library, new SqliteGameStore(session.db), session.clock), [session.library, session.db, session.clock]);

  const startCareer = () => {
    session.replace('sample', (opened) => {
      Game.start(opened.library, new SqliteGameStore(opened.db), opened.clock, Math.floor(Math.random() * 2 ** 31));
    });
    setHiring(false);
  };

  if (!game || hiring) return <NewCareer hasCareer={Boolean(game)} onStart={startCareer} />;

  switch (game.state.status) {
    case 'morning':
      return <Bulletin game={game} />;
    case 'open':
      return <DeskScene key={`${game.state.day}`} game={game} />;
    case 'evening':
      return <Ledger game={game} />;
    case 'review':
    case 'fired':
      return <Review game={game} onNewCareer={() => setHiring(true)} />;
  }
}
