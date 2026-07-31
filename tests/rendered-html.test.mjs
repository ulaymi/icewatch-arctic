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
  assert.match(html, /observation-date-slider/);
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
  assert.match(script, /light_nolabels/);
  assert.match(script, /ARCTIC_SEARCH_BBOXES/);
  assert.match(script, /gibs\.earthdata\.nasa\.gov/);
  assert.match(script, /VIIRS_NOAA20_CorrectedReflectance_TrueColor/);
  assert.match(script, /MODIS_Terra_CorrectedReflectance_TrueColor/);
  assert.match(script, /bindTooltip/);
  assert.doesNotMatch(script, /SCENE_LABEL|L\.marker|scene-label/);
  assert.doesNotMatch(script, /L\.rectangle/);
  assert.doesNotMatch(script, /rendered_preview/);
  assert.doesNotMatch(script, /dark_nolabels/);
  assert.match(css, /#ff0032/i);
  assert.match(css, /color-scheme:\s*light/);
  assert.doesNotMatch(css, /scene-label/);
  assert.match(page, /ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ/);
  assert.match(page, /Карта ниже всегда использует только реальные спутниковые данные/);
  assert.match(packageJson, /"name": "icewatch-arctic"/);
  assert.match(packageJson, /"build:pages"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("keeps the Arctic mosaic global and derives previews from the visible legend", async () => {
  const moduleUrl = new URL("../public/satellite-data.js", import.meta.url);
  moduleUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { buildGibsTileUrl, buildPreviewUrl, selectScenesForDate } = await import(moduleUrl.href);
  const scene = (id, bbox, datetime, assets = { vv: {}, vh: {} }) => ({
    id,
    bbox,
    properties: { datetime },
    assets,
  });
  const scenes = [
    scene("barents", [30, 68, 35, 72], "2026-07-30T08:00:00Z"),
    scene("chukchi", [-175, 68, -168, 73], "2026-07-30T20:00:00Z", { hh: {}, hv: {} }),
    scene("older", [80, 70, 88, 76], "2026-07-29T12:00:00Z"),
  ];

  assert.deepEqual(selectScenesForDate(scenes, "2026-07-30").map(({ id }) => id), ["barents", "chukchi"]);
  const sarPreview = new URL(buildPreviewUrl(scenes[0], "sar"));
  assert.equal(sarPreview.searchParams.get("colormap_name"), "viridis");
  assert.equal(sarPreview.searchParams.get("rescale"), "0.01,0.55");
  assert.equal(sarPreview.searchParams.get("expression"), "0.65*vv+1.8*vh");
  const chukchiPreview = new URL(buildPreviewUrl(scenes[1], "sar"));
  assert.equal(chukchiPreview.searchParams.get("expression"), "0.65*hh+1.8*hv");
  assert.equal(
    buildGibsTileUrl("VIIRS_NOAA20_CorrectedReflectance_TrueColor", "2026-07-30"),
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/2026-07-30/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
  );
});

test("configures a static GitHub Pages frontend", async () => {
  const [nextConfig, workflow, fonts] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../public/fonts.css", import.meta.url), "utf8"),
  ]);
  assert.match(nextConfig, /output:\s*isGitHubPages\s*\?\s*"export"/);
  assert.match(nextConfig, /basePath/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /pnpm run build:pages/);
  assert.match(fonts, /mts-text-regular\.woff2/);
});
