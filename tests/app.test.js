import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { normalize, createDataService } from '../server/data.js';
import { createApp } from '../server/app.js';
import { selectRows, summarize, status, toCsv } from '../public/model.js';
const fixture = JSON.parse(await readFile(new URL('../fixtures/demo.json', import.meta.url), 'utf8'));
const rows = normalize(fixture).rows;

test('normalizes numeric strings, zero capacity and timezone correctly', () => {
  assert.equal(rows.length, 7);
  assert.equal(rows[0].available, 125);
  assert.equal(rows[0].updatedAt, '2026-09-25T11:59:00+08:00');
  assert.equal(rows.at(-1).availability, null);
});
test('rejects malformed envelopes and excludes corrupt, duplicate and unsafe records', () => {
  assert.throws(() => normalize({ items: [] }));
  const data = structuredClone(fixture);
  const park = data.items[0].carpark_data[0];
  park.carpark_info.push({ lot_type: 'C', total_lots: '200', lots_available: '125' });
  park.carpark_info.push({ lot_type: 'H', total_lots: '10', lots_available: '11' });
  park.carpark_info.push({ lot_type: 'Y', total_lots: '10', lots_available: '-1' });
  data.items[0].carpark_data.push({ ...park, carpark_number: '=CMD()' });
  const parsed = normalize(data);
  assert.equal(parsed.rows.length, 7);
  assert.equal(parsed.excluded, 8);
});
test('filters, sorts, calculates weighted occupancy, handles empty results and CSV', () => {
  const cars = selectRows(rows);
  assert.equal(cars[0].id, 'HLM');
  assert.equal(selectRows(rows, { query: ' amk ' }).length, 1);
  assert.equal(selectRows(rows, { availability: 'full' })[0].id, 'HE12');
  assert.equal(selectRows(rows, { type: 'H' }).length, 1);
  assert.equal(status(rows.at(-1)), 'No capacity');
  assert.equal(status({ capacity: 100, available: 20, availability: .2 }), 'Available');
  const summary = summarize(cars);
  assert.equal(summary.available, 457);
  assert.equal(summary.capacity, 950);
  assert.equal(summary.occupancy, 493 / 950);
  assert.equal(summary.limited, 2);
  assert.equal(summarize([]).occupancy, null);
  assert.equal(toCsv(cars).split('\r\n').length, 6);
});
test('coalesces concurrent requests and refreshes after TTL', async () => {
  let calls = 0, clock = Date.parse(fixture.items[0].timestamp);
  const service = createDataService({ now: () => clock, ttl: 100, fetcher: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 10));
    return { ok: true, json: async () => fixture };
  } });
  await Promise.all([service.get(), service.get(), service.get()]);
  await service.get(); assert.equal(calls, 1);
  clock += 101; await service.get(); assert.equal(calls, 2);
});
test('demo mode is explicit, makes no network call, and preserves source timestamps', async () => {
  const service = createDataService({ demo: fixture,
    now: () => Date.parse(fixture.items[0].timestamp) + 3_600_000,
    fetcher: () => { throw new Error('Demo must not fetch'); } });
  const result = await service.get();
  assert.equal(result.mode, 'demo');
  assert.equal(result.timestamp, fixture.items[0].timestamp);
  assert.equal(result.stale, true);
  assert.equal(result.rows.length, 7);
});
test('serves bounded stale cache on failures and backs off before retry', async () => {
  let clock = Date.parse(fixture.items[0].timestamp), fails = false, calls = 0;
  const service = createDataService({ now: () => clock, ttl: 100, maxStale: 1000,
    fetcher: async () => { calls++; if (fails) throw new Error('offline'); return { ok: true, json: async () => fixture }; } });
  assert.equal((await service.get()).stale, false);
  fails = true; clock += 101;
  assert.equal((await service.get()).stale, true);
  await service.get(); assert.equal(calls, 2);
  clock += 1000; await assert.rejects(service.get(), /temporarily unavailable/);
});
test('upstream HTTP errors, invalid JSON and timeout fail without inventing data', async () => {
  for (const fetcher of [async () => ({ ok: false, status: 429 }),
    async () => ({ ok: true, json: async () => { throw new Error('Bad JSON'); } }),
    async (_url, { signal }) => new Promise((_resolve, reject) => {
      const hold = setTimeout(() => reject(new Error('Test did not abort')), 100);
      signal.addEventListener('abort', () => { clearTimeout(hold); reject(signal.reason); });
    })]) {
    await assert.rejects(createDataService({ fetcher, timeout: 5 }).get(), /temporarily unavailable/);
  }
});
test('HTTP routes expose data, errors, security headers, methods and static assets', async t => {
  let fail = false;
  const server = createApp({ service: { get: async () => { if (fail) throw new Error('secret'); return normalize(fixture); } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/carparks`);
  assert.equal((await response.json()).rows.length, 7);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.match(await (await fetch(base)).text(), /Explore carparks/);
  for (const file of ['app.js', 'model.js', 'style.css', 'favicon.svg']) assert.equal((await fetch(`${base}/${file}`)).status, 200);
  assert.equal((await fetch(`${base}/server/data.js`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
  fail = true;
  const error = await fetch(`${base}/api/carparks`);
  assert.equal(error.status, 503);
  assert.doesNotMatch(await error.text(), /secret/);
});
