import React from 'react';
import { DynamicIsland } from './components/DynamicIsland';

export const App: React.FC = () => {
  return (
    <main className="w-full h-full flex flex-col items-center justify-start pointer-events-none">
      <div className="pointer-events-auto mt-1">
        <DynamicIsland />
      </div>
    </main>
  );
};

export default App;
