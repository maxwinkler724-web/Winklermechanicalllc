import test from 'node:test';
import assert from 'node:assert/strict';

const host = (process.env.WM_SITE_URL || 'https://winkler-stripe-checkout-review.vercel.app').replace(/\/$/, '');
const fetchSafe = async path => {
  const headers = new Headers();
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers.set('x-vercel-protection-bypass', process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  }
  const response = await fetch(host + path, {redirect: 'manual',signal: AbortSignal.timeout(12000),headers});
  if (response.status === 403 && response.headers.get('x-vercel-mitigated') === 'challenge') {
    throw new Error('Vercel WAF challenge: PHP exposure could not be evaluated by this runner.');
  }
  return response;
};

test('Known PHP paths do not run or expose PHP scripts', async () => {
  for (const path of ['/index.php', '/wp-login.php', '/phpinfo.php', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php']) {
    const r = await fetchSafe(path);
    assert.ok([403, 404].includes(r.status), path + ': HTTP ' + r.status);
  }
});

test('No PHP runtime signature is disclosed', async () => {
  const r = await fetchSafe('/');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.headers.get('x-powered-by') || '', /php/i);
});

test('Common sensitive application paths are inaccessible', async () => {
  for (const path of ['/.env', '/.git/config', '/lib/db.js', '/package.json']) {
    const r = await fetchSafe(path);
    assert.ok([403,404].includes(r.status), path + ': HTTP ' + r.status);
  }
});
