import '../global.css';
import '../src/i18n';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { startPracticeTracking } from '@state/practiceTracker';

export default function RootLayout() {
  // Outfit SemiBold backs `font-brand` (the wordmark on the dashboard and about
  // screens). Only the one weight ships, registered under the bare family name
  // 'Outfit' -- see tailwind.config.js.
  //
  // Rendering is not gated on the load: the wordmark is two text nodes, so the
  // worst case is a brief fallback face on those two, which beats holding the
  // whole app behind a font. If loading fails outright, `error` is surfaced in
  // dev and the fallback simply stays.
  const [, fontError] = useFonts({
    Outfit: require('../assets/fonts/Outfit-SemiBold.ttf'),
  });

  useEffect(() => {
    if (fontError) console.warn('Brand font failed to load:', fontError);
  }, [fontError]);

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
