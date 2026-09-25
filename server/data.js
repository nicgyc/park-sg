export const SOURCE_URL = 'https://api.data.gov.sg/v1/transport/carpark-availability';

function count(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function normalize(payload) {
  const item = payload?.items?.[0];
  if (!item || !Number.isFinite(Date.parse(item.timestamp)) || !Array.isArray(item.carpark_data)) {
    throw new Error('Invalid upstream snapshot');
  }
  const rows = [];
  const seen = new Set();
  let excluded = 0;
  for (const park of item.carpark_data) {
    for (const info of park.carpark_info ?? []) {
      const available = count(info.lots_available);
      const capacity = count(info.total_lots);
      const key = `${park.carpark_number}:${info.lot_type}`;
      const updatedAt = /(?:Z|[+-]\d\d:\d\d)$/.test(park.update_datetime ?? '')
        ? park.update_datetime : `${park.update_datetime}+08:00`;
      if (!/^[A-Z0-9]+$/.test(park.carpark_number ?? '') || !['C', 'Y', 'H'].includes(info.lot_type)
          || available === null || capacity === null || available > capacity
          || !Number.isFinite(Date.parse(updatedAt)) || seen.has(key)) {
        excluded++;
        continue;
      }
      seen.add(key);
      rows.push({ id: park.carpark_number, type: info.lot_type, available, capacity, updatedAt,
        availability: capacity ? available / capacity : null });
    }
  }
  if (!rows.length) throw new Error('No valid carpark records');
  return { timestamp: item.timestamp, rows, excluded };
}

export function createDataService({ fetcher = fetch, now = Date.now, ttl = 60_000,
  maxStale = 15 * 60_000, timeout = 8_000, demo = null } = {}) {
  let cached;
  let fetchedAt = 0;
  let retryAfter = 0;
  let pending;
  const envelope = (stale = false) => ({ ...cached, fetchedAt: new Date(fetchedAt).toISOString(),
    mode: demo ? 'demo' : 'live', stale: stale || now() - Date.parse(cached.timestamp) > maxStale });
  async function refresh() {
    try {
      let payload = demo;
      if (!payload) {
        const response = await fetcher(SOURCE_URL, { signal: AbortSignal.timeout(timeout),
          headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Upstream status ${response.status}`);
        payload = await response.json();
      }
      cached = normalize(payload);
      fetchedAt = now();
      retryAfter = 0;
      return envelope();
    } catch (error) {
      retryAfter = now() + 30_000;
      console.warn(JSON.stringify({ event: 'upstream_failure', message: error.message }));
      if (cached && now() - fetchedAt <= maxStale) return envelope(true);
      throw new Error('Carpark data is temporarily unavailable. Please retry shortly.');
    }
  }
  return {
    async get() {
      if (cached && now() - fetchedAt < ttl) return envelope();
      if (now() < retryAfter) {
        if (cached && now() - fetchedAt <= maxStale) return envelope(true);
        throw new Error('Carpark data is temporarily unavailable. Please retry shortly.');
      }
      if (!pending) pending = refresh().finally(() => { pending = null; });
      return pending;
    }
  };
}
