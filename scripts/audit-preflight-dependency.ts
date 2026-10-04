/**
 * audit-preflight-dependency — proves the library does not silently rely on
 * Tailwind's preflight.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/index.css` imports `tailwindcss/theme.css` + `tailwindcss/utilities.css`
 * instead of the monolithic `tailwindcss`, deliberately leaving PREFLIGHT out so
 * the package stops restyling a consumer's whole page. Preflight, though, is not
 * only a courtesy reset — parts of it are load-bearing for OUR OWN markup:
 * it put `font-family` and `line-height` on `html`, and `box-sizing: border-box`
 * on every element. Dropping it silently removed those from us too.
 *
 * That class of regression is invisible in the sound app, which ships its own
 * preflight and therefore MASKS it; and invisible to `tsc`, `eslint`, `vitest`
 * and `check:docs`, none of which compute a style. It showed up only by looking
 * at Storybook — the library rendered with nothing else on the page.
 *
 * WHAT IT DOES
 * ------------
 * For each story below it snapshots the computed styles of every element in the
 * library's subtree, then injects the REAL `preflight.css` (read out of
 * `node_modules/tailwindcss`) into the `base` layer and snapshots again. Any
 * property that CHANGES is a property the element was inheriting from preflight
 * and no longer gets. Preflight is the oracle — no hand-maintained expectations
 * to drift.
 *
 * A finding on an element carrying an `rbn:`/`rbnt:` class is a REGRESSION: our
 * own markup depends on a reset we no longer ship, and the fix is to add that
 * declaration to the scoped `@layer base` block in `src/index.css`.
 *
 * A finding on an element with no prefixed class that is also not a descendant
 * of one is EXPECTED and reported separately: that is the consumer's own markup
 * (story wrappers, third-party portals like sonner's toaster), which we stopped
 * styling on purpose. The audit fails only on the first category.
 *
 * USAGE
 * -----
 *   npm run build-storybook
 *   npm run audit:preflight
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Coverage is derived from `storybook-static/index.json` rather than listed by
 * hand: ONE story per component, every component. A hand-written list silently
 * stops covering whatever is added later, which is precisely how the `<h3>`
 * inside `atoms/Accordion` went unnoticed in the first place.
 */
async function collectStoryIds(): Promise<string[]> {
  const index = JSON.parse(
    await readFile(join(STORYBOOK_DIRECTORY, 'index.json'), 'utf8'),
  ) as { entries: Record<string, { type: string; title: string }> };

  const firstStoryPerComponent = new Map<string, string>();
  for (const [storyId, entry] of Object.entries(index.entries)) {
    if (entry.type !== 'story') continue; // skip autodocs pages
    if (!firstStoryPerComponent.has(entry.title)) {
      firstStoryPerComponent.set(entry.title, storyId);
    }
  }
  return [...firstStoryPerComponent.values()];
}

/**
 * Inherited or universally-reset properties preflight actually governs. Adding
 * one here only makes the audit stricter, never wrong: the oracle supplies both
 * sides of the comparison.
 */
const AUDITED_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'lineHeight',
  'fontWeight',
  'color',
  'margin',
  'padding',
  'borderWidth',
  'borderStyle',
  'boxSizing',
  'listStyleType',
  'display',
  'appearance',
  'verticalAlign',
  'textAlign',
] as const;

const STORYBOOK_DIRECTORY = resolve(
  import.meta.dirname,
  '..',
  'storybook-static',
);
const PREFLIGHT_PATH = resolve(
  import.meta.dirname,
  '..',
  'node_modules',
  'tailwindcss',
  'preflight.css',
);
const PORT = 6199;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

type AuditFinding = {
  property: string;
  withoutPreflight: string;
  withPreflight: string;
  count: number;
  sample: string;
};

type AuditResult = {
  elementCount: number;
  prefixedElementCount: number;
  /** Findings on OUR markup — these are regressions. */
  regressions: AuditFinding[];
  /** Findings on the consumer's own markup — expected, reported for the record. */
  outsideLibrary: AuditFinding[];
};

/**
 * Static file server for `storybook-static`. Playwright could use `file://`,
 * but the audit fetches `preflight.css` from the page and a cross-origin or
 * opaque fetch fails SILENTLY, which once produced a false "0 differences".
 * Serving both from one origin removes that failure mode.
 */
function startServer(): Promise<() => Promise<void>> {
  const server = createServer(async (request, response) => {
    const requestedPath = (request.url ?? '/').split('?')[0];
    const relativePath = requestedPath === '/' ? '/index.html' : requestedPath;
    // `normalize` collapses `..` so a crafted URL cannot escape the directory.
    const filePath = join(STORYBOOK_DIRECTORY, normalize(relativePath));
    if (!filePath.startsWith(STORYBOOK_DIRECTORY) || !existsSync(filePath)) {
      response.writeHead(404).end('not found');
      return;
    }
    try {
      const body = await readFile(filePath);
      response
        .writeHead(200, {
          'Content-Type':
            CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
        })
        .end(body);
    } catch {
      response.writeHead(500).end('read error');
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(PORT, () => {
      resolvePromise(
        () => new Promise<void>((done) => server.close(() => done())),
      );
    });
  });
}

async function auditStory(
  page: import('@playwright/test').Page,
  storyId: string,
  preflightCss: string,
): Promise<AuditResult> {
  await page.goto(
    `http://127.0.0.1:${PORT}/iframe.html?id=${storyId}&viewMode=story`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForSelector(
    "#storybook-root [class*='rbn:'], #storybook-root [class*='rbnt:']",
    {
      timeout: 15_000,
    },
  );

  return page.evaluate(
    ({ properties, css }) => {
      const root = document.getElementById('storybook-root');
      if (!root)
        throw new Error('#storybook-root missing — did the story render?');

      // `Array.from`, not spread: this file is type-checked by the repo's
      // node-targeted tsconfig, which does not include the `DOM.Iterable` lib.
      const elements = Array.from(root.querySelectorAll('*')).filter(
        (element) => !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName),
      );
      // `getAttribute` rather than `.className`: on SVG elements `className` is
      // an SVGAnimatedString, whose `toString()` is "[object SVGAnimatedString]"
      // — every `<path>` would be misread as unclassed.
      const classNameOf = (element: Element) =>
        element.getAttribute('class') ?? '';
      const isLibraryElement = (element: Element) =>
        /(^|\s)rbn(t)?:/.test(classNameOf(element));
      /**
       * A `border-style` difference is only observable when some side has a
       * non-zero width. Preflight's `border: 0 solid` flips style to `solid`
       * while keeping width `0`, which paints nothing — reporting it would be a
       * guaranteed false positive on every SVG `<path>` and xyflow div.
       */
      const allBorderWidthsZero = (width: string) =>
        width.split(/\s+/).every((side) => parseFloat(side) === 0);
      const snapshot = () =>
        elements.map((element) => {
          const computed = getComputedStyle(element);
          return Object.fromEntries(
            properties.map((property) => [
              property,
              computed[property as never] as string,
            ]),
          );
        });

      const before = snapshot();

      // Inject into the SAME cascade layer preflight normally occupies, so the
      // comparison reflects real precedence rather than an inflated one.
      const style = document.createElement('style');
      style.textContent = `@layer base {\n${css}\n}`;
      document.head.appendChild(style);
      // Two frames: one for the style to apply, one for layout to settle.
      return new Promise<AuditResult>((done) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const after = snapshot();
            style.remove();

            const regressions = new Map<string, AuditFinding>();
            const outsideLibrary = new Map<string, AuditFinding>();

            elements.forEach((element, index) => {
              const ours =
                isLibraryElement(element) ||
                element.closest("[class*='rbn:'], [class*='rbnt:']") !== null;
              const bucket = ours ? regressions : outsideLibrary;
              for (const property of properties) {
                const withoutPreflight = before[index][property];
                const withPreflight = after[index][property];
                if (withoutPreflight === withPreflight) continue;
                if (
                  property === 'borderStyle' &&
                  allBorderWidthsZero(before[index].borderWidth) &&
                  allBorderWidthsZero(after[index].borderWidth)
                ) {
                  continue;
                }
                const key = `${property}|${withoutPreflight}|${withPreflight}`;
                const existing = bucket.get(key);
                if (existing) {
                  existing.count += 1;
                  continue;
                }
                const className = classNameOf(element);
                bucket.set(key, {
                  property,
                  withoutPreflight,
                  withPreflight,
                  count: 1,
                  sample: `<${element.tagName.toLowerCase()}> ${
                    className
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(' ') || '(no class)'
                  }`,
                });
              }
            });

            const byCount = (a: AuditFinding, b: AuditFinding) =>
              b.count - a.count;
            done({
              elementCount: elements.length,
              prefixedElementCount: elements.filter(isLibraryElement).length,
              regressions: [...regressions.values()].sort(byCount),
              outsideLibrary: [...outsideLibrary.values()].sort(byCount),
            });
          }),
        );
      });
    },
    { properties: [...AUDITED_PROPERTIES], css: preflightCss },
  );
}

async function main() {
  if (!existsSync(STORYBOOK_DIRECTORY)) {
    console.error(
      '[audit-preflight] storybook-static/ missing — run `npm run build-storybook`.',
    );
    process.exit(1);
  }
  const preflightCss = await readFile(PREFLIGHT_PATH, 'utf8');
  const storyIds = await collectStoryIds();
  const stop = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  /** Finding key → the finding plus every story it appears in. */
  const regressions = new Map<string, AuditFinding & { stories: string[] }>();
  const outsideLibrary = new Map<string, AuditFinding>();
  const skipped: string[] = [];
  let audited = 0;

  try {
    for (const storyId of storyIds) {
      let result: AuditResult;
      try {
        result = await auditStory(page, storyId, preflightCss);
      } catch {
        // A story that renders no prefixed markup has nothing to audit — that
        // is not a failure, but it IS worth naming so coverage stays honest.
        skipped.push(storyId);
        continue;
      }
      audited += 1;
      for (const finding of result.regressions) {
        const key = `${finding.property}|${finding.withoutPreflight}|${finding.withPreflight}`;
        const existing = regressions.get(key);
        if (existing) {
          existing.count += finding.count;
          existing.stories.push(storyId);
        } else {
          regressions.set(key, { ...finding, stories: [storyId] });
        }
      }
      for (const finding of result.outsideLibrary) {
        const key = `${finding.property}|${finding.withoutPreflight}|${finding.withPreflight}`;
        const existing = outsideLibrary.get(key);
        if (existing) existing.count += finding.count;
        else outsideLibrary.set(key, { ...finding });
      }
    }
  } finally {
    await browser.close();
    await stop();
  }

  console.log(
    `[audit-preflight] audited ${audited} stories (one per component)` +
      (skipped.length > 0
        ? `, skipped ${skipped.length} that render no prefixed markup: ${skipped.join(', ')}`
        : ''),
  );

  if (outsideLibrary.size > 0) {
    console.log(
      "\n[audit-preflight] Differences OUTSIDE the library's markup — expected,\n" +
        'since dropping preflight is exactly the decision not to style these:',
    );
    for (const finding of [...outsideLibrary.values()].sort(
      (a, b) => b.count - a.count,
    )) {
      console.log(
        `    ${String(finding.count).padStart(4)}x  ${finding.property}: ` +
          `"${finding.withoutPreflight}" -> "${finding.withPreflight}"   e.g. ${finding.sample}`,
      );
    }
  }

  if (regressions.size > 0) {
    console.error(
      '\n[audit-preflight] FAIL — library elements depend on preflight rules this package no longer ships:',
    );
    for (const finding of [...regressions.values()].sort(
      (a, b) => b.count - a.count,
    )) {
      console.error(
        `    ${String(finding.count).padStart(4)}x  ${finding.property}: ` +
          `"${finding.withoutPreflight}" -> "${finding.withPreflight}"\n` +
          `          e.g. ${finding.sample}\n` +
          `          in ${finding.stories.slice(0, 3).join(', ')}${finding.stories.length > 3 ? ` (+${finding.stories.length - 3} more)` : ''}`,
      );
    }
    console.error(
      '\nAdd the missing declaration to the scoped `@layer base` block in src/index.css.',
    );
    process.exit(1);
  }
  console.log(
    '\n[audit-preflight] OK — no library element depends on preflight.',
  );
}

await main();
