// Read-only launch audit: crawls same-site pages from the sitemap and links,
// then prints one JSON report. It never submits forms or calls checkout.
const root = (process.env.WM_SITE_URL || 'https://winkler-stripe-checkout-review.vercel.app').replace(/\/$/, '');
const host = new URL(root).host;
const headers = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const get = async (url) => {
  const r = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  return { status: r.status, location: r.headers.get('location'), type: r.headers.get('content-type') || '', mitigated: r.headers.get('x-vercel-mitigated'), body: (r.headers.get('content-type') || '').includes('html') || url.endsWith('.xml') || url.endsWith('.txt') ? await r.text() : '' };
};
const pick = (re, s) => (s.match(re) || [])[1] || null;
const all = (re, s) => [...s.matchAll(re)].map(m => m[1]);
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const queue = ['/', '/robots.txt', '/sitemap.xml'];
const seen = new Set();
const pages = [];
const external = new Set();
while (queue.length && seen.size < 120) {
  const p = queue.shift();
  if (seen.has(p)) continue;
  seen.add(p);
  let r;
  try { r = await get(root + p); } catch (e) { pages.push({ path: p, error: String(e) }); continue; }
  const page = { path: p, status: r.status, location: r.location, mitigated: r.mitigated };
  if (r.body && p.endsWith('.xml')) {
    for (const loc of all(/<loc>([^<]+)<\/loc>/g, r.body)) {
      const u = new URL(loc); page.sitemapHosts = [...new Set([...(page.sitemapHosts || []), u.host])];
      if (!seen.has(u.pathname)) queue.push(u.pathname);
    }
  }
  if (r.body && r.type.includes('html')) {
    const b = r.body;
    Object.assign(page, {
      lang: pick(/<html[^>]*\slang="([^"]+)"/i, b),
      title: pick(/<title>([\s\S]*?)<\/title>/i, b),
      description: pick(/<meta\s+name="description"\s+content="([^"]*)"/i, b),
      robots: pick(/<meta\s+name="robots"\s+content="([^"]*)"/i, b),
      canonical: pick(/<link\s+rel="canonical"\s+href="([^"]*)"/i, b),
      h1: all(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, b).map(text),
      imgsNoAlt: (b.match(/<img(?![^>]*\balt=)[^>]*>/gi) || []).length,
      doubleEscaped: /&amp;amp;|&amp;#/.test(b),
      jsonLd: all(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, b).map(s => s.slice(0, 600)),
      tel: [...new Set(all(/href="(tel:[^"]+)"/gi, b))],
      mailto: [...new Set(all(/href="(mailto:[^"]+)"/gi, b))],
      forms: all(/<form([^>]*)>/gi, b),
      inputs: all(/<(?:input|select|textarea)([^>]*)>/gi, b).map(s => s.replace(/\s+/g, ' ').slice(0, 160)),
      flags: ['lorem', 'TODO', 'example.com', '555-', 'placeholder', 'test mode', 'Master HVACR', 'licensed', 'Leonia', 'Garfield', 'Hackensack', 'guarantee', 'consent', 'STOP', 'Msg & data', 'stripe']
        .filter(w => b.toLowerCase().includes(w.toLowerCase())),
      words: text(b).split(' ').length,
      excerpt: text(b).slice(0, 2500)
    });
    for (const href of all(/(?:href|src)="([^"#]+)/gi, b)) {
      if (/^(tel|mailto|data|javascript):/i.test(href)) continue;
      let u; try { u = new URL(href, root + p); } catch { continue; }
      if (u.host === host) { if (!seen.has(u.pathname)) queue.push(u.pathname); }
      else external.add(u.origin + u.pathname);
    }
  }
  pages.push(page);
}
const broken = pages.filter(x => x.error || (x.status >= 400));
console.log(JSON.stringify({ root, crawled: pages.length, broken, external: [...external].sort(), pages }, null, 1));
