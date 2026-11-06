import React from 'react';
import { DynamicIsland } from './components/DynamicIsland';
import { ErrorBoundary } from './components/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <main className="w-full h-full flex flex-col items-center justify-start pointer-events-none">
      <div className="pointer-events-auto w-fit">
        <ErrorBoundary fallbackTitle="Hovera Dynamic Island">
          <DynamicIsland />
        </ErrorBoundary>
      </div>
    </main>
  );
};

export default App;
