import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const pageUrl = process.argv[2];
const chromePath = process.env.CHROME_PATH;
const outputDir = process.env.VERIFY_OUTPUT_DIR || 'verification-artifacts';

if (!pageUrl) throw new Error('Published page URL is required.');
if (!chromePath) throw new Error('CHROME_PATH is required.');

fs.mkdirSync(outputDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const reports = [];
try {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 }
  ]) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      isMobile: viewport.name === 'mobile',
      hasTouch: viewport.name === 'mobile'
    });
    await page.setUserAgent(
      viewport.name === 'mobile'
        ? 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.7' });

    const imageNetworkIssues = [];
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'image') {
        imageNetworkIssues.push({
          url: request.url(),
          error: request.failure()?.errorText || 'request failed'
        });
      }
    });
    page.on('response', (response) => {
      if (response.request().resourceType() === 'image' && response.status() >= 400) {
        imageNetworkIssues.push({
          url: response.url(),
          error: `HTTP ${response.status()}`
        });
      }
    });

    const url = new URL(pageUrl);
    url.searchParams.set('verify', `${Date.now()}-${viewport.name}`);
    await page.goto(url.href, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForSelector('body[data-version="v0.3"]', { timeout: 30000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.js === 'ready',
      { timeout: 30000 }
    );

    await page.evaluate(async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let y = 0; y < document.documentElement.scrollHeight; y += 520) {
        window.scrollTo(0, y);
        await delay(90);
      }
      window.scrollTo(0, 0);
      await delay(600);
    });
    await page.waitForFunction(
      () => [...document.images].every((image) => image.complete),
      { timeout: 30000 }
    ).catch(() => {});

    const report = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const images = [...document.querySelectorAll('img[data-external]')].filter(visible);
      const imageSources = images.map((image) => image.currentSrc || image.src);
      const duplicateSources = imageSources.filter((source, index) => imageSources.indexOf(source) !== index);
      const brokenImages = images
        .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
        .map((image) => ({ alt: image.alt, src: image.src }));
      const galleries = [...document.querySelectorAll('.shop-card .gallery')];
      const galleryCounts = galleries.map((gallery) => gallery.querySelectorAll('figure').length);
      const captionsWithoutSource = [...document.querySelectorAll('.gallery figcaption')]
        .filter((caption) => !caption.querySelector('a[href]'))
        .map((caption) => caption.textContent.trim());
      const invalidLinks = [...document.querySelectorAll('a')]
        .filter((anchor) => !anchor.getAttribute('href') || anchor.getAttribute('href') === '#')
        .map((anchor) => anchor.textContent.trim());
      const unsafeBlankLinks = [...document.querySelectorAll('a[target="_blank"]')]
        .filter((anchor) => !anchor.relList.contains('noopener'))
        .map((anchor) => anchor.href);
      const overlaps = [...document.querySelectorAll('.shop-card')].filter((card) => {
        const gallery = card.querySelector('.gallery');
        const body = card.querySelector('.shop-body');
        if (!gallery || !body) return false;
        return body.getBoundingClientRect().top < gallery.getBoundingClientRect().bottom - 1;
      }).length;
      const overflowingElements = [...document.body.querySelectorAll('*')]
        .filter((element) => !element.closest('.gallery') && !element.matches('.skip-link'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right > window.innerWidth + 1 || rect.left < -1;
        })
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right)
        }));

      return {
        title: document.title,
        version: document.body.dataset.version,
        jsReady: document.documentElement.dataset.js,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        shopCards: document.querySelectorAll('.shop-card').length,
        visibleExternalImages: images.length,
        galleryCounts,
        brokenImages,
        duplicateSources: [...new Set(duplicateSources)],
        captionsWithoutSource,
        invalidLinks,
        unsafeBlankLinks,
        cardGalleryOverlaps: overlaps,
        overflowingElements,
        hasConfirmedElBethel: document.body.innerText.includes('9/21 営業告知済み'),
        hasUnconfirmedProductLabels: document.body.innerText.includes('9/21在庫・価格は未確認'),
        cssCacheBuster: document.querySelector('link[rel="stylesheet"]')?.href.includes('v=20260915-02') || false,
        jsCacheBuster: document.querySelector('script[src]')?.src.includes('v=20260915-02') || false
      };
    });

    report.viewport = viewport.name;
    report.pageErrors = pageErrors;
    report.imageNetworkIssues = imageNetworkIssues;
    reports.push(report);

    if (viewport.name === 'mobile') {
      await page.screenshot({
        path: path.join(outputDir, 'mobile-page.png'),
        fullPage: true
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const failures = [];
for (const report of reports) {
  if (report.version !== 'v0.3') failures.push(`${report.viewport}: stale version`);
  if (report.jsReady !== 'ready') failures.push(`${report.viewport}: JavaScript not ready`);
  if (report.documentWidth > report.viewportWidth + 1 || report.bodyWidth > report.viewportWidth + 1) failures.push(`${report.viewport}: horizontal page overflow`);
  if (report.shopCards !== 3) failures.push(`${report.viewport}: expected 3 shop cards`);
  if (report.visibleExternalImages < 7) failures.push(`${report.viewport}: fewer than 7 visible photos`);
  if (report.galleryCounts.length !== 3 || report.galleryCounts.some((count) => count < 2)) failures.push(`${report.viewport}: a shop has fewer than 2 visible photos`);
  if (report.brokenImages.length) failures.push(`${report.viewport}: broken visible images`);
  if (report.duplicateSources.length) failures.push(`${report.viewport}: duplicate image sources`);
  if (report.captionsWithoutSource.length) failures.push(`${report.viewport}: photo without source link`);
  if (report.invalidLinks.length || report.unsafeBlankLinks.length) failures.push(`${report.viewport}: invalid or unsafe links`);
  if (report.cardGalleryOverlaps) failures.push(`${report.viewport}: text overlaps gallery`);
  if (report.overflowingElements.length) failures.push(`${report.viewport}: overflowing elements detected`);
  if (!report.hasConfirmedElBethel || !report.hasUnconfirmedProductLabels) failures.push(`${report.viewport}: availability labels missing`);
  if (!report.cssCacheBuster || !report.jsCacheBuster) failures.push(`${report.viewport}: cache buster mismatch`);
  if (report.pageErrors.length) failures.push(`${report.viewport}: page JavaScript errors`);
}

const result = {
  checkedAt: new Date().toISOString(),
  pageUrl,
  reports,
  failures
};
fs.writeFileSync(
  path.join(outputDir, 'verification-report.json'),
  JSON.stringify(result, null, 2)
);
console.log(JSON.stringify(result, null, 2));

if (failures.length) {
  throw new Error(`Published-page verification failed: ${failures.join('; ')}`);
}
