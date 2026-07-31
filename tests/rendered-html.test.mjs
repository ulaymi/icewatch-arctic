import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the IceWatch dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /IceWatch/);
  assert.match(html, /Ледовая обстановка/);
  assert.match(html, /РЕАЛЬНЫЕ ДАННЫЕ/);
  assert.match(html, /Sentinel-1 SAR/);
  assert.match(html, /ice-map/);
  assert.match(html, /satellite-data\.js/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships cloud-streamed satellite logic and project branding", async () => {
  const [page, layout, script, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/satellite-data.js", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../public/mts-eco-logo.svg", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.match(page, /mts-eco-logo\.svg/);
  assert.match(page, /Баренцево море/);
  assert.match(layout, /leaflet@1\.9\.4/);
  assert.match(script, /sentinel-1-rtc/);
  assert.match(script, /ITEM_STATISTICS/);
  assert.match(script, /buildPreviewUrl/);
  assert.match(script, /calculateMetrics/);
  assert.match(css, /MTS Text/);
  assert.match(packageJson, /"name": "icewatch-arctic"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
