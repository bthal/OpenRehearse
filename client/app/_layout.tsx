import '../global.css';
import '../src/i18n';

import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { startPracticeTracking } from '@state/practiceTracker';

export default function RootLayout() {
  // One tracker for every play surface: it watches the playback stores, so the
  // play view, routines, and warm-ups all record practice time without their
  // own bookkeeping.
  useEffect(() => startPracticeTracking(), []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
