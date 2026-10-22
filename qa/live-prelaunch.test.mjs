import test from 'node:test';
import assert from 'node:assert/strict';

const root = (process.env.WM_SITE_URL || 'https://winkler-stripe-checkout-review.vercel.app').replace(/\/$/, '');
const req = (p, options = {}) =>
  fetch(root + p, { signal: AbortSignal.timeout(18000), redirect: 'manual', ...options });

test('Critical marketing and legal routes load', async () => {
  for (const p of ['/', '/residential', '/commercial', '/gallery', '/garfield', '/bergen-county', '/privacy', '/terms', '/privacy-choices', '/sitemap.xml', '/robots.txt', '/favicon.svg']) {
    const r = await req(p);
    assert.equal(r.status, 200, p + ': HTTP ' + r.status);
  }
});

test('Deprecated QA pages are not publicly served', async () => {
  for (const p of ['/book.html', '/owner-test.html', '/owner-secondary-test.html', '/booking-diagnostics.html', '/email-setup.html', '/schedule-preview.html', '/commercial-request.html', '/api/wm-gallery-import', '/api/wm-thumbnail-migrate']) {
    const r = await req(p);
    assert.equal(r.status, 404, p);
  }
});

test('Internal files are not public', async () => {
  for (const p of ['/lib/db.js', '/package.json', '/scripts/seed-stripe.mjs']) {
    const r = await req(p);
    assert.equal(r.status, 404, p);
  }
});

test('Core response hardening headers exist', async () => {
  const r = await req('/');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('strict-transport-security') || '', /max-age=/);
  assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors/);
});

test('Gallery is completely independent of Squarespace CDN', async () => {
  for (const p of ['/gallery', '/garfield', '/bergen-county']) {
    const r = await req(p);
    const html = await r.text();
    assert.doesNotMatch(html, /images\.squarespace-cdn\.com/i, p);
    assert.match(html, /nebvlw1lflqxbokf\.public\.blob\.vercel-storage\.com/, p);
  }
  const html = await (await req('/gallery')).text();
  assert.equal((html.match(/class="photo-card"/g) || []).length, 31);
});

test('All gallery thumbnails return valid, optimized WebP files', async () => {
  const problems = [];
  for (let start = 1; start <= 31; start += 6) {
    await Promise.all(Array.from({ length: Math.min(6, 32 - start) }, async (_, offset) => {
      const i = start + offset;
      try {
        const r = await req('/api/gallery-thumb?i=' + i + '&w=400', { redirect: 'follow' });
        const raw = Buffer.from(await r.arrayBuffer());
        if (r.status !== 200 || r.headers.get('content-type') !== 'image/webp' ||
            raw.subarray(8, 12).toString('ascii') !== 'WEBP' || raw.length >= 650_000)
          problems.push({ i, status: r.status, bytes: raw.length });
      } catch (e) { problems.push({ i, error: String(e) }); }
    }));
  }
  assert.deepEqual(problems, []);
});

test('Thumbnail endpoint enforces numeric allowlist', async () => {
  for (const p of ['/api/gallery-thumb?i=0&w=400', '/api/gallery-thumb?i=32&w=400',
     '/api/gallery-thumb?i=1&w=9999', '/api/gallery-thumb?i=../1&w=400']) {
    const r = await req(p);
    assert.equal(r.status, 404, p);
  }
});

test('Origin checks block forged service-request submissions', async () => {
  const r = await req('/api/service-request', {
    method: 'POST',
    headers: { origin: 'https://untrusted.example.invalid', 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(r.status, 403);
});

test('Validation rejects incomplete requests without creating a booking', async () => {
  const r = await req('/api/service-request', {
    method: 'POST',
    headers: { origin: root, 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(r.status, 400);
});

test('Live checkout does not accept charges before launch approval', async () => {
  const r = await req('/api/create-checkout', {
    method: 'POST', headers: { origin: root, 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(r.status, 503);
});

test('Public diagnostics are healthy but launch flags remain off', async () => {
  const r = await req('/api/diagnostics');
  assert.equal(r.status, 200);
  const j = await r.json();
  for (const key of ['database', 'googleCalendar', 'smsGateway'])
    assert.equal(j.checks[key], 'ok', key);
  assert.equal(j.liveBookingEnabled, false);
  assert.equal(j.livePaymentsActive, false);
  assert.equal(j.brokerSalesActive, false);
});

test('Prelaunch pages are not yet indexed by search engines', async () => {
  for (const p of ['/', '/residential', '/commercial', '/gallery']) {
    const body = await (await req(p)).text();
    assert.match(body, /noindex/i, p);
  }
});
