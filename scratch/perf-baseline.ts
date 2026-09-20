/**
 * Deployed-site performance capture. Does not modify the app.
 * Run: npx tsx --tsconfig tsconfig.json scratch/perf-baseline.ts
 */
import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'https://fragrance-ai.vercel.app';
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const OUT = path.join(__dirname, 'perf-baseline');

const STOREFRONTS = [
  { id: 'tm', path: '/tmperfumehouse' },
  { id: 'wop', path: '/worldofperfumers' },
  { id: 'almaham', path: '/almaham' },
] as const;

const VIEWPORTS = [
  { id: 'desktop', width: 1440, height: 900, isMobile: false },
  { id: 'mobile', width: 390, height: 844, isMobile: true },
] as const;

type Resource = {
  url: string;
  type: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
};

async function measure(context: BrowserContext, url: string, viewportId: string) {
  const page = await context.newPage();
  const longTasks: { duration: number; start: number }[] = [];
  page.on('console', () => undefined);

  await page.addInitScript(() => {
    (window as any).__perf = { lcp: null, cls: 0, fcp: null, longTasks: [] as any[] };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          (window as any).__perf.lcp = {
            startTime: e.startTime,
            size: (e as any).size,
            url: (e as any).url,
            tag: (e as any).element ? (e as any).element.tagName : null,
            id: (e as any).element ? (e as any).element.id : null,
            className: (e as any).element ? String((e as any).element.className).slice(0, 180) : null,
            text: (e as any).element ? String((e as any).element.textContent || '').slice(0, 80) : null,
          };
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any[]) {
          if (!e.hadRecentInput) (window as any).__perf.cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === 'first-contentful-paint') (window as any).__perf.fcp = e.startTime;
        }
      }).observe({ type: 'paint', buffered: true });
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            (window as any).__perf.longTasks.push({ duration: e.duration, start: e.startTime });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        /* not all browsers expose longtask */
      }
    } catch {
      /* ignore */
    }
  });

  const started = Date.now();
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2500);
  const navMs = Date.now() - started;

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const grouped: Record<string, { count: number; transfer: number; encoded: number }> = {};
    const list: Resource[] = resources.map((r) => {
      const type = r.initiatorType || 'other';
      if (!grouped[type]) grouped[type] = { count: 0, transfer: 0, encoded: 0 };
      grouped[type].count += 1;
      grouped[type].transfer += r.transferSize || 0;
      grouped[type].encoded += r.encodedBodySize || 0;
      return {
        url: r.name,
        type,
        transferSize: r.transferSize || 0,
        encodedBodySize: r.encodedBodySize || 0,
        decodedBodySize: r.decodedBodySize || 0,
      };
    });
    const totalTransfer = list.reduce((s, r) => s + r.transferSize, 0) + (nav?.transferSize || 0);
    const js = list.filter((r) => r.type === 'script' || /\.js(\?|$)/i.test(r.url));
    const css = list.filter((r) => r.type === 'css' || r.type === 'link' || /\.css(\?|$)/i.test(r.url));
    const img = list.filter((r) => r.type === 'img' || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(r.url));
    const font = list.filter((r) => r.type === 'css' && /font/i.test(r.url) || /\.woff2?/i.test(r.url) || r.type === 'font');
    const blocking = list.filter((r) => r.type === 'link' || r.type === 'script').slice(0, 30);
    return {
      title: document.title,
      h1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 120),
      imgCount: document.images.length,
      imgSrcs: Array.from(document.images).map((im) => ({
        src: im.currentSrc || im.src,
        w: im.naturalWidth,
        h: im.naturalHeight,
        displayW: im.clientWidth,
        displayH: im.clientHeight,
        loading: im.loading,
        alt: im.alt,
      })),
      perf: (window as any).__perf,
      nav: nav
        ? {
            ttfb: nav.responseStart - nav.requestStart,
            dcl: nav.domContentLoadedEventEnd - nav.startTime,
            load: nav.loadEventEnd - nav.startTime,
            transferSize: nav.transferSize,
            encodedBodySize: nav.encodedBodySize,
            decodedBodySize: nav.decodedBodySize,
          }
        : null,
      totals: {
        requests: list.length + 1,
        transfer: totalTransfer,
        jsBytes: js.reduce((s, r) => s + r.transferSize, 0),
        cssBytes: css.reduce((s, r) => s + r.transferSize, 0),
        imgBytes: img.reduce((s, r) => s + r.transferSize, 0),
        fontBytes: font.reduce((s, r) => s + r.transferSize, 0),
      },
      grouped,
      largest: [...list].sort((a, b) => b.transferSize - a.transferSize).slice(0, 15),
      jsFiles: js
        .map((r) => ({ url: r.url.split('?')[0].slice(-90), bytes: r.transferSize }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 20),
      blocking: blocking.map((r) => ({ url: r.url.slice(0, 140), type: r.type, bytes: r.transferSize })),
    };
  });

  const shot = path.join(OUT, `${url.replace(/https?:\/\/|[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}-${viewportId}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  const status = response?.status() ?? 0;
  await page.close();
  return { url, status, navMs, screenshot: shot, ...metrics, longTasks };
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const results: any[] = [];
  for (const vp of VIEWPORTS) {
    const context = await chromium.launchPersistentContext(
      fs.mkdtempSync(path.join(require('os').tmpdir(), `perf-${vp.id}-`)),
      {
        executablePath: fs.existsSync(BRAVE) ? BRAVE : undefined,
        headless: false,
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        deviceScaleFactor: vp.isMobile ? 3 : 1,
        args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
      }
    );
    for (const store of STOREFRONTS) {
      const url = `${BASE}${store.path}`;
      console.log(`Measuring ${store.id} ${vp.id} ${url}`);
      try {
        const m = await measure(context, url, vp.id);
        const row = { storefront: store.id, device: vp.id, ...m };
        results.push(row);
        console.log(
          JSON.stringify({
            storefront: store.id,
            device: vp.id,
            status: m.status,
            lcp: m.perf?.lcp,
            cls: m.perf?.cls,
            fcp: m.perf?.fcp,
            totals: m.totals,
            h1: m.h1,
            title: m.title,
          })
        );
      } catch (err: any) {
        console.error('FAIL', store.id, vp.id, err?.message || err);
        results.push({ storefront: store.id, device: vp.id, error: String(err?.message || err) });
      }
    }
    await context.close();
  }
  fs.writeFileSync(path.join(OUT, 'browser-metrics.json'), JSON.stringify(results, null, 2));
  console.log('\n===== BROWSER METRICS WRITTEN =====');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
