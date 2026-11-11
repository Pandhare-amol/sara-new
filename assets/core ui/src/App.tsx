import { useState } from 'react';
import { LiveCoreApp } from './sara-live-core';
import { ExistingSaraPlaceholder } from './ExistingSaraPlaceholder';

export default function App() {
  const [showExistingPlaceholder, setShowExistingPlaceholder] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('view') === 'existing';
    }
    return false;
  });

  if (showExistingPlaceholder) {
    return (
      <ExistingSaraPlaceholder
        onLaunchLiveCore={() => setShowExistingPlaceholder(false)}
      />
    );
  }

  return (
    <LiveCoreApp
      onSwitchToExistingShell={() => setShowExistingPlaceholder(true)}
    />
  );
}
