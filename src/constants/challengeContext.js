import { createContext, useContext, useState } from 'react';

const ChallengeContext = createContext();

export function ChallengeProvider({ children }) {
  const [challenge, setChallenge] = useState({
    match: null,
    pick: null,
    forfeit: null,
    opponent: null,
  });

  function updateChallenge(data) {
    setChallenge(prev => ({ ...prev, ...data }));
  }

  function resetChallenge() {
    setChallenge({ match: null, pick: null, forfeit: null, opponent: null });
  }

  return (
    <ChallengeContext.Provider value={{ challenge, updateChallenge, resetChallenge }}>
      {children}
    </ChallengeContext.Provider>
  );
}

export function useChallenge() {
  return useContext(ChallengeContext);
}
