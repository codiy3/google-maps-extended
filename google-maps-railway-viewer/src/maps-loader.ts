import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

let loading: Promise<void> | undefined = import.meta.hot?.data.mapsLoading;
export function loadMaps(key: string): Promise<void> {
  if (!loading) {
    // HMRや既存のGoogleローダーがあっても、キーを含む設定を再送しない。
    const initialized = Boolean(globalThis.google?.maps?.importLibrary);
    if (!initialized) setOptions({ key, v: 'quarterly', language: 'ja', region: 'JP' });
    const load = (name: 'maps' | 'marker') =>
      initialized ? google.maps.importLibrary(name) : importLibrary(name);
    loading = Promise.all([load('maps'), load('marker')]).then(() => {});
    if (import.meta.hot) import.meta.hot.data.mapsLoading = loading;
  }
  return loading;
}
