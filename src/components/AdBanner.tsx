import React from 'react';

// Ads temporarily removed: the Google Mobile Ads native module throws an
// uncatchable NSException at launch on iOS 26 under the New Architecture
// (React Native issue #54859 / google-mobile-ads issue #803), which aborts
// the app on startup. The real fix has to land in React Native itself.
// Until then we ship without the banner so the app opens. Restore this
// component (and the dependency + config plugin) once RN patches the
// TurboModule void-method exception handling.
export default function AdBanner() {
  return null;
}
