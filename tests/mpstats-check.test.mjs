import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { frequencyPoints } from '../lib/mpstats-check.ts';
const dir = mkdtempSync(join(tmpdir(), 'mpstats-check-'));
let saved = '', calls = 0;
globalThis.__mpCheckBucket = {
  async put(_key, data) { saved = data; },
  async get() { return saved ? { json: async () => JSON.parse(saved) } : null; },
};
await build({ entryPoints: [new URL('../app/api/mpstats-check/route.ts', import.meta.url).pathname], outfile: join(dir, 'route.mjs'),
  bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'env', setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const env = { BUCKET: globalThis.__mpCheckBucket };', loader: 'js' }));
  } }] });
const api = await import(pathToFileURL(join(dir, 'route.mjs')).href);
const token = 'test-only-token-1234567890';
const request = (body = { token, query: 'кофемашина' }, owner = 'korotcha@yandex.ru', origin = 'https://app.test') => new Request('https://app.test/api/mpstats-check', {
  method: 'POST', headers: { 'Content-Type': 'application/json', origin, 'oai-authenticated-user-email': owner }, body: JSON.stringify(body),
});
test('access checks and invalid input cannot transmit a credential', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('must not send'); };
  try {
    assert.equal((await api.POST(request(undefined, 'manager@example.test'))).status, 403);
    assert.equal((await api.POST(request(undefined, undefined, 'https://other.test'))).status, 403);
    assert.equal((await api.POST(request({ token, query: token }))).status, 400);
    assert.equal((await api.POST(request({ token: 'bad\r\nkey', query: 'кофемашина' }))).status, 400);
    assert.equal((await api.GET(new Request('https://app.test/api/mpstats-check'))).status, 403);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
test('credential goes only to the fixed endpoint header; saved result drops all upstream extras', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url.origin, 'https://mpstats.io');
    assert.equal(url.pathname, '/api/analytics/v1/wb/keywords/frequency');
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.body, undefined);
    assert.equal(url.searchParams.get('keyword'), 'кофемашина');
    assert.equal(url.href.includes(token), false);
    assert.equal(options.headers['X-Mpstats-TOKEN'], token);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.cache, undefined);
    return Response.json([{ date: '2026-09-01', frequency: 12, echo: token }, { date: '2024-01-01', frequency: 0 }]);
  };
  try {
    const response = await api.POST(request()), result = await response.json();
    assert.equal(result.report.status, 'ok'); assert.equal(result.report.firstDate, '2024-01-01');
    assert.equal(result.report.rows, 2); assert.equal(result.saved, true);
    assert.equal(saved.includes(token), false); assert.equal(JSON.stringify(result).includes(token), false);
  } finally { globalThis.fetch = original; }
});
test('upstream errors never echo a token or claim data is unavailable forever', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(token, { status: 403 });
  try {
    const result = await (await api.POST(request())).json();
    assert.equal(result.report.status, 'error'); assert.equal(result.report.httpStatus, 403);
    assert.equal(JSON.stringify(result).includes(token), false); assert.equal(saved.includes(token), false);
  } finally { globalThis.fetch = original; }
});
test('invalid dates, non-numeric values and unexpected formats are not treated as a history', () => {
  assert.equal(frequencyPoints([{ date: '2026-02-30', frequency: 20 }]), null);
  assert.equal(frequencyPoints([{ date: '2026-01-01', frequency: '20' }]), null);
  assert.equal(frequencyPoints({ error: 'unauthorized' }), null);
  assert.deepEqual(frequencyPoints([]), []);
});

test('diagnostics distinguish failures without leaking exception text or following redirects', async () => {
  const original = globalThis.fetch;
  try {
    for (const [mock, code, http] of [
      [async () => { throw new TypeError(token); }, 'CONNECTION_FAILED', null],
      [async () => { throw new DOMException(token, 'TimeoutError'); }, 'TIMEOUT', null],
      [async () => new Response(token, { status: 302, headers: { Location: 'https://other.test' } }), 'HTTP_302', 302],
      [async () => new Response('<html>' + token), 'INVALID_JSON', 200],
      [async () => new Response('x'.repeat(2_000_001)), 'RESPONSE_TOO_LARGE', 200],
    ]) {
      let count = 0;
      globalThis.fetch = async (...args) => { count++; return mock(...args); };
      const result = await (await api.POST(request())).json();
      assert.equal(result.report.errorCode, code);
      assert.equal(result.report.httpStatus, http);
      assert.equal(result.report.diagnosticVersion, 4);
      assert.equal(count, 1);
      assert.equal(JSON.stringify(result).includes(token), false);
      assert.equal(saved.includes(token), false);
    }
  } finally { globalThis.fetch = original; }
});


test('support report preserves actual error text and request metadata but scrubs echoed credentials', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({message: 'Access to method denied', token, encoded: btoa(token)}), {
    status: 403, headers: {'content-type': 'application/json', 'set-cookie': 'session=private', 'x-request-id': 'req-123'},
  });
  try {
    const result = await (await api.POST(request())).json();
    assert.equal(result.report.request.method, 'GET');
    assert.equal(result.report.request.body, null);
    assert.equal(result.report.request.headers['X-Mpstats-TOKEN'], '[СКРЫТО]');
    assert.match(result.report.responseBody, /Access to method denied/);
    assert.equal(result.report.responseHeaders['x-request-id'], 'req-123');
    assert.equal(result.report.responseHeaders['set-cookie'], undefined);
    assert.equal(saved.includes(token), false);
    assert.equal(saved.includes(btoa(token)), false);
  } finally { globalThis.fetch = original; }
});

test('oversized error body preserves HTTP diagnosis without returning a partial secret', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('x'.repeat(70_000) + token, {status:403});
  try {
    const result = await (await api.POST(request())).json();
    assert.equal(result.report.httpStatus, 403);
    assert.equal(result.report.errorCode, 'HTTP_403');
    assert.equal(result.report.responseBody, undefined);
    assert.match(result.report.responseBodyNote, /64 КБ/);
  } finally { globalThis.fetch = original; }
});
