import {
  type StaticJourneyWorkerRequest,
  type StaticJourneyWorkerResponse,
  type StaticNetworkSnapshot,
  staticJourneyResponse,
  validateStaticSnapshot,
} from './static-journey';
import type { Catalog } from './types';

const context = self as unknown as {
  onmessage: (event: MessageEvent<StaticJourneyWorkerRequest>) => void;
  postMessage: (response: StaticJourneyWorkerResponse) => void;
};
let loaded:
  | {
      key: string;
      promise: Promise<{ catalog: Catalog; snapshot: StaticNetworkSnapshot }>;
    }
  | undefined;

async function load(request: StaticJourneyWorkerRequest) {
  const key = JSON.stringify([request.catalogUrl, request.networkUrl]);
  if (loaded?.key === key) return loaded.promise;
  const promise = Promise.all([fetch(request.catalogUrl), fetch(request.networkUrl)]).then(
    async ([catalogHttp, networkHttp]) => {
      if (!catalogHttp.ok || !networkHttp.ok)
        throw new Error('公開済みの駅・経路データを読み込めませんでした。再試行してください。');
      const [catalog, value] = await Promise.all([catalogHttp.json(), networkHttp.json()]);
      if (catalog.schemaVersion !== 3 || !Array.isArray(catalog.routes))
        throw new Error('路線一覧の形式を確認できませんでした。');
      return { catalog: catalog as Catalog, snapshot: validateStaticSnapshot(value, catalog) };
    },
  );
  loaded = { key, promise };
  try {
    return await promise;
  } catch (error) {
    if (loaded?.promise === promise) loaded = undefined;
    throw error;
  }
}

context.onmessage = async (event) => {
  try {
    const { catalog, snapshot } = await load(event.data);
    context.postMessage({
      ok: true,
      value: staticJourneyResponse(snapshot.network, catalog, event.data.query),
    });
  } catch (error) {
    context.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : '経路を計算できませんでした。',
    });
  }
};
