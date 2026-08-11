// Hermes (React Native's JS engine on iOS/Android) does not implement the
// static AbortSignal.timeout(). Calling it throws "AbortSignal.timeout is not a
// function", which crashed the app on launch as soon as the first fetch ran.
// This is the AbortController-based equivalent, which Hermes does support.
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
