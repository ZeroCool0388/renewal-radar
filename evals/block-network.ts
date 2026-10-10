let requests = 0;

const blockedFetch: typeof fetch = async () => {
  requests += 1;
  throw new Error('Network access is blocked in the eval pack.');
};

globalThis.fetch = blockedFetch;

export function networkRequestCount() {
  return requests;
}
