// react-native-google-mobile-ads is a native module with no web implementation.
// A `Platform.OS !== 'web'` check at the render site is not enough — the import
// itself still ends up in the web bundle. Metro picks this .web variant first
// when building for web, so the native module is never reached there.
export default function AdBanner() {
  return null;
}
