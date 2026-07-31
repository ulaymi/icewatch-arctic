const STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const ITEM_PREVIEW = "https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png";
const ITEM_STATISTICS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";
const COLLECTION = "sentinel-1-rtc";

const REGIONS = {
  barents: { label: "Баренцево море", bbox: [30, 68, 60, 80], center: [74, 43], zoom: 4 },
  kara: { label: "Карское море", bbox: [55, 69, 102, 82], center: [76, 78], zoom: 4 },
  laptev: { label: "Море Лаптевых", bbox: [100, 70, 140, 82], center: [76, 120], zoom: 4 },
  "east-siberian": { label: "Восточно-Сибирское море", bbox: [138, 68, 180, 80], center: [74, 160], zoom: 4 },
  chukchi: { label: "Чукотское море", bbox: [155, 64, 180, 78], center: [70.5, 169], zoom: 4 },
  nsr: { label: "Северный морской путь", bbox: [30, 65, 180, 82], center: [75, 105], zoom: 3 },
};

const LAYERS = {
  sar: {
    label: "Радиолокационный композит",
    legend: "Интенсивность SAR · VV + VH",
    min: "гладкая поверхность",
    max: "шероховатая поверхность",
    gradient: "linear-gradient(90deg,#071218,#116279,#28bfd3,#eefaf8)",
  },
  concentration: {
    label: "Ледовый покров",
    legend: "Предварительная SAR-оценка",
    min: "вода",
    max: "плотный покров",
    gradient: "linear-gradient(90deg,#06192c,#075a86,#1ac9de,#e8fffc)",
  },
  type: {
    label: "Тип и структура льда",
    legend: "Отношение поляризаций · VV / VH",
    min: "однородный",
    max: "неоднородный",
    gradient: "linear-gradient(90deg,#25258e,#1c8dc0,#45d0aa,#e8c846,#d84373)",
  },
  hazard: {
    label: "Навигационная опасность",
    legend: "Комбинированный SAR-индекс",
    min: "ниже",
    max: "выше",
    gradient: "linear-gradient(90deg,#1d5a57,#46b98c,#e4c446,#e98835,#c9364e)",
  },
};

const state = {
  map: null,
  baseLayer: null,
  boundaryLayer: null,
  overlays: [],
  labels: [],
  scenes: [],
  selectedScenes: [],
  observations: [],
  layer: "sar",
  opacity: 0.82,
  controller: null,
  requestId: 0,
};

function element(id) { return typeof document === "undefined" ? null : document.getElementById(id); }
function clamp(value, minimum = 0, maximum = 100) { return Math.min(maximum, Math.max(minimum, value)); }
function round(value, digits = 0) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function toDate(value) { return new Date(value); }
function isoDay(value) { return toDate(value).toISOString().slice(0, 10); }
function formatDate(value, withTime = false) {
  const options = withTime
    ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
    : { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("ru-RU", options).format(toDate(value)).replace(",", " ·");
}
function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
function startDate(end, days = 18) {
  const date = new Date(`${end}T23:59:59Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
function regionFeature(region) {
  const [west, south, east, north] = region.bbox;
  return {
    type: "Feature",
    properties: { name: region.label },
    geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  };
}
function intersectionArea(first, second) {
  const west = Math.max(first[0], second[0]);
  const south = Math.max(first[1], second[1]);
  const east = Math.min(first[2], second[2]);
  const north = Math.min(first[3], second[3]);
  return Math.max(0, east - west) * Math.max(0, north - south);
}

export function selectScenesForDate(scenes, selectedDate, regionBbox, maximum = 8) {
  if (!scenes.length) return [];
  const target = new Date(`${selectedDate}T23:59:59Z`).getTime();
  const eligible = scenes.filter((scene) => toDate(scene.properties.datetime).getTime() <= target);
  const candidates = eligible.length ? eligible : scenes;
  const days = [...new Set(candidates.map((scene) => isoDay(scene.properties.datetime)))];
  days.sort((a, b) => Math.abs(toDate(a) - target) - Math.abs(toDate(b) - target));
  const chosenDay = days[0];
  return candidates
    .filter((scene) => isoDay(scene.properties.datetime) === chosenDay)
    .filter((scene) => scene.assets?.vv && scene.assets?.vh && intersectionArea(scene.bbox, regionBbox) > 0)
    .sort((a, b) => intersectionArea(b.bbox, regionBbox) - intersectionArea(a.bbox, regionBbox))
    .slice(0, maximum);
}

export function buildPreviewUrl(scene, layer = "sar") {
  if (layer === "sar" && scene.assets?.rendered_preview?.href) {
    const url = new URL(scene.assets.rendered_preview.href);
    url.searchParams.set("max_size", "1024");
    return url.href;
  }

  const url = new URL(ITEM_PREVIEW);
  url.searchParams.set("collection", COLLECTION);
  url.searchParams.set("item", scene.id);
  url.searchParams.append("assets", "vv");
  url.searchParams.append("assets", "vh");
  url.searchParams.set("asset_as_band", "true");
  url.searchParams.set("nodata", "-32768");
  url.searchParams.set("format", "png");
  url.searchParams.set("max_size", "1024");

  if (layer === "concentration") {
    url.searchParams.set("expression", "vv");
    url.searchParams.set("rescale", "0.005,0.35");
    url.searchParams.set("colormap_name", "blues");
  } else if (layer === "type") {
    url.searchParams.set("expression", "vv/(vh+0.001)");
    url.searchParams.set("rescale", "1,14");
    url.searchParams.set("colormap_name", "turbo");
  } else {
    url.searchParams.set("expression", "0.65*vv+1.8*vh");
    url.searchParams.set("rescale", "0.01,0.55");
    url.searchParams.set("colormap_name", "magma");
  }
  return url.href;
}

async function searchScenes(region, date, signal) {
  const response = await fetch(STAC_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: [COLLECTION],
      bbox: region.bbox,
      datetime: `${startDate(date)}T00:00:00Z/${date}T23:59:59Z`,
      limit: 160,
      sortby: [{ field: "datetime", direction: "desc" }],
      query: { "sar:instrument_mode": { eq: "IW" } },
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Каталог Sentinel-1 недоступен (${response.status}).`);
  const collection = await response.json();
  if (!collection.features?.length) throw new Error("В выбранном окне нет сцен Sentinel-1.");
  return collection.features;
}

async function bandStatistic(scene, band, feature, signal) {
  const url = new URL(ITEM_STATISTICS);
  url.searchParams.set("collection", COLLECTION);
  url.searchParams.set("item", scene.id);
  url.searchParams.append("assets", band);
  url.searchParams.set("expression", band);
  url.searchParams.set("asset_as_band", "true");
  url.searchParams.set("max_size", "72");
  url.searchParams.set("nodata", "-32768");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feature),
    signal,
  });
  if (!response.ok) return null;
  const result = await response.json();
  const statistics = result.properties?.statistics ?? {};
  const value = statistics[band] ?? Object.values(statistics)[0];
  return value && Number.isFinite(value.mean) ? { mean: value.mean, count: value.count ?? 1 } : null;
}

export function calculateMetrics(vv, vh) {
  const vvDb = 10 * Math.log10(Math.max(vv, 0.000001));
  const vhDb = 10 * Math.log10(Math.max(vh, 0.000001));
  const concentration = clamp((vvDb + 24) / 17 * 100, 3, 98);
  const texture = clamp((vhDb + 31) / 16 * 100, 2, 92);
  const deformed = clamp(texture * (0.28 + concentration / 180), 2, concentration * 0.72);
  const young = clamp((concentration - deformed) * 0.3, 0, concentration - deformed);
  const firstYear = clamp(concentration - deformed - young, 0, 100);
  const water = clamp(100 - concentration, 0, 100);
  const hazard = clamp(1 + concentration / 30 + deformed / 42, 1, 5);
  return { vv, vh, vvDb, vhDb, concentration, deformed, young, firstYear, water, hazard };
}

async function analyzeScene(scene, feature, signal) {
  const [vv, vh] = await Promise.all([
    bandStatistic(scene, "vv", feature, signal),
    bandStatistic(scene, "vh", feature, signal),
  ]);
  if (!vv || !vh) return null;
  return {
    scene,
    date: scene.properties.datetime,
    ...calculateMetrics(vv.mean, vh.mean),
    pixels: Math.min(vv.count, vh.count),
  };
}

function weightedAverage(observations, key) {
  const count = observations.reduce((sum, item) => sum + item.pixels, 0);
  if (!count) return observations.reduce((sum, item) => sum + item[key], 0) / Math.max(1, observations.length);
  return observations.reduce((sum, item) => sum + item[key] * item.pixels, 0) / count;
}

function setConnection(mode, title, detail) {
  const stateElement = document.querySelector(".connection-state");
  stateElement?.classList.toggle("connected", mode === "connected");
  stateElement?.classList.toggle("error", mode === "error");
  if (element("connection-title")) element("connection-title").textContent = title;
  if (element("connection-detail")) element("connection-detail").textContent = detail;
}

function setLoading(visible, message, error = false) {
  const loading = element("map-loading");
  if (!loading) return;
  loading.classList.toggle("hidden", !visible);
  loading.classList.toggle("error", error);
  if (message) {
    const title = loading.querySelector("b");
    if (title) title.textContent = message;
  }
}

function initMap() {
  if (state.map || !globalThis.L || !element("ice-map")) return;
  const L = globalThis.L;
  state.map = L.map("ice-map", { zoomControl: true, attributionControl: true, minZoom: 2, maxZoom: 13 }).setView([74, 43], 4);
  state.baseLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap © CARTO · Sentinel-1 © Copernicus",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(state.map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    pane: "shadowPane",
    opacity: 0.56,
    maxZoom: 19,
  }).addTo(state.map);
  state.map.attributionControl.setPrefix(false);
  state.map.on("mousemove", ({ latlng }) => {
    element("coordinates").textContent = `${Math.abs(latlng.lat).toFixed(3)}° ${latlng.lat >= 0 ? "N" : "S"}, ${Math.abs(latlng.lng).toFixed(3)}° ${latlng.lng >= 0 ? "E" : "W"}`;
  });
  state.map.on("click", ({ latlng }) => {
    const mean = state.observations.length ? weightedAverage(state.observations, "hazard") : null;
    L.popup().setLatLng(latlng).setContent(`<b>Точка наблюдения</b><br>${latlng.lat.toFixed(3)}° N, ${latlng.lng.toFixed(3)}° E<br><span style="color:#82949e">Средний риск акватории: ${mean ? `${mean.toFixed(1)} / 5` : "рассчитывается"}</span>`).openOn(state.map);
  });
}

function removeMapLayers() {
  for (const layer of [...state.overlays, ...state.labels]) state.map?.removeLayer(layer);
  state.overlays = [];
  state.labels = [];
}

function renderRegion(region) {
  if (!state.map) return;
  if (state.boundaryLayer) state.map.removeLayer(state.boundaryLayer);
  const [west, south, east, north] = region.bbox;
  state.boundaryLayer = globalThis.L.rectangle([[south, west], [north, east]], {
    color: "#35c5de", weight: 1, opacity: 0.38, dashArray: "5 7", fillOpacity: 0,
  }).addTo(state.map);
  state.map.setView(region.center, region.zoom, { animate: true });
}

function renderScenes(scenes = state.selectedScenes) {
  if (!state.map) return;
  removeMapLayers();
  const L = globalThis.L;
  for (const [index, scene] of scenes.entries()) {
    const [west, south, east, north] = scene.bbox;
    const overlay = L.imageOverlay(buildPreviewUrl(scene, state.layer), [[south, west], [north, east]], {
      opacity: state.opacity,
      interactive: false,
      crossOrigin: true,
      className: "satellite-scene",
    }).addTo(state.map);
    overlay.on("error", () => overlay.setOpacity(0));
    state.overlays.push(overlay);
    if (index < 4) {
      const label = L.marker([(south + north) / 2, (west + east) / 2], {
        interactive: false,
        icon: L.divIcon({ className: "scene-label", html: `<div>S1 · ${formatDate(scene.properties.datetime, true)}</div>`, iconSize: [108, 22] }),
      }).addTo(state.map);
      state.labels.push(label);
    }
  }
  const layer = LAYERS[state.layer];
  element("map-layer-title").textContent = layer.label;
  element("legend-title").textContent = layer.legend;
  element("legend-min").textContent = layer.min;
  element("legend-max").textContent = layer.max;
  element("legend-gradient").style.background = layer.gradient;
  element("map-scenes-count").textContent = `${scenes.length}`;
}

function aggregateByDay(observations) {
  const groups = new Map();
  for (const observation of observations) {
    const day = isoDay(observation.date);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(observation);
  }
  return [...groups.entries()].map(([day, values]) => ({
    day,
    date: values[0].date,
    concentration: values.reduce((sum, item) => sum + item.concentration, 0) / values.length,
    hazard: values.reduce((sum, item) => sum + item.hazard, 0) / values.length,
    scene: values[0].scene,
  })).sort((a, b) => toDate(a.date) - toDate(b.date));
}

function updateChart(observations) {
  const daily = aggregateByDay(observations);
  const empty = element("chart-empty");
  const line = element("chart-line");
  const area = element("chart-area");
  const points = element("chart-points");
  if (!daily.length) return;
  empty.classList.add("hidden");
  const coordinates = daily.map((item, index) => {
    const x = daily.length === 1 ? 450 : 18 + index * (864 / (daily.length - 1));
    const y = 160 - clamp(item.concentration) * 1.45;
    return [x, y];
  });
  line.setAttribute("points", coordinates.map(([x, y]) => `${x},${y}`).join(" "));
  area.setAttribute("d", `M ${coordinates[0][0]} 160 L ${coordinates.map(([x, y]) => `${x} ${y}`).join(" L ")} L ${coordinates.at(-1)[0]} 160 Z`);
  points.innerHTML = coordinates.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" />`).join("");

  const timeline = element("timeline-scenes");
  timeline.innerHTML = "";
  for (const [index, item] of daily.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === daily.length - 1 ? "active" : "";
    button.textContent = `${formatDate(item.date)} · ${formatNumber(item.concentration)}%`;
    button.addEventListener("click", () => {
      timeline.querySelectorAll("button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      const [west, south, east, north] = item.scene.bbox;
      state.map.fitBounds([[south, west], [north, east]], { padding: [28, 28] });
    });
    timeline.append(button);
  }
}

function hazardLabel(value) {
  if (value < 1.8) return "низкий";
  if (value < 2.8) return "умеренный";
  if (value < 3.8) return "повышенный";
  return "высокий";
}

function updateDashboard(observations, scenes, region) {
  if (!observations.length) {
    element("scene-summary").textContent = `${scenes.length} сцен найдено · статистика недоступна`;
    return;
  }
  const concentration = weightedAverage(observations, "concentration");
  const hazard = weightedAverage(observations, "hazard");
  const deformed = weightedAverage(observations, "deformed");
  const young = weightedAverage(observations, "young");
  const firstYear = weightedAverage(observations, "firstYear");
  const water = weightedAverage(observations, "water");
  const latest = observations.reduce((current, item) => toDate(item.date) > toDate(current.date) ? item : current);
  const ageHours = Math.max(0, (Date.now() - toDate(latest.date).getTime()) / 3_600_000);

  element("metric-concentration").textContent = formatNumber(concentration);
  element("metric-concentration-note").textContent = `${formatNumber(water)}% открытой воды`;
  element("metric-hazard").textContent = formatNumber(hazard, 1);
  element("metric-hazard-note").textContent = `${hazardLabel(hazard)} уровень`;
  element("metric-ridged").textContent = formatNumber(deformed);
  element("metric-ridged-note").textContent = `VH ${formatNumber(weightedAverage(observations, "vhDb"), 1)} dB`;
  element("metric-age").textContent = ageHours > 999 ? ">999" : formatNumber(ageHours);
  element("metric-age-note").textContent = `UTC ${formatDate(latest.date, true)}`;

  element("donut-value").textContent = `${formatNumber(concentration)}%`;
  element("ice-donut").style.background = `conic-gradient(#19c5e8 0 ${concentration}%, #172832 ${concentration}% 100%)`;
  element("class-water").textContent = `${formatNumber(water)}%`;
  element("class-young").textContent = `${formatNumber(young)}%`;
  element("class-first").textContent = `${formatNumber(firstYear)}%`;
  element("class-deformed").textContent = `${formatNumber(deformed)}%`;

  const daily = aggregateByDay(observations);
  const first = daily[0]?.concentration ?? concentration;
  const last = daily.at(-1)?.concentration ?? concentration;
  const delta = daily.length > 1 ? last - first : 0;
  const forecast = [1, 2, 3].map((step) => clamp(hazard + delta * step / 55, 1, 5));
  [24, 48, 72].forEach((hours, index) => {
    element(`forecast-${hours}`).style.width = `${forecast[index] / 5 * 100}%`;
    element(`forecast-${hours}-label`).textContent = `${formatNumber(forecast[index], 1)} / 5`;
  });
  element("forecast-trend").textContent = delta > 2 ? "↗" : delta < -2 ? "↘" : "→";

  element("route-status").textContent = hazard >= 3.6 ? "Требует проводки" : hazard >= 2.6 ? "С осторожностью" : "Проходимость выше";
  element("route-window").textContent = formatDate(latest.date, true);
  element("route-signal").textContent = `${formatNumber(concentration)}% льда`;
  element("decision-water-title").textContent = water >= 45 ? "Заметная доля открытой воды" : "Преобладает ледовый покров";
  element("decision-water").textContent = `SAR-оценка для акватории: ${formatNumber(water)}% воды и ${formatNumber(concentration)}% ледового покрытия.`;
  element("decision-ridge-title").textContent = deformed >= 30 ? "Повышенный сигнал деформации" : "Умеренный сигнал деформации";
  element("decision-ridge").textContent = `${formatNumber(deformed)}% покрытия имеет усиленный кросс-поляризационный отклик; требуется проверка ледовой картой.`;
  element("decision-update").textContent = `Повторный запрос к каталогу выполняется при выборе новой даты или акватории ${region.label}.`;
  element("scene-summary").textContent = `${state.scenes.length} сцен в окне · ${scenes.length} на карте · ${observations.length} обработано`;
  element("report-time").textContent = formatDate(latest.date, true);
  updateChart(observations);
}

async function runAnalysis() {
  const requestId = ++state.requestId;
  state.controller?.abort();
  state.controller = new AbortController();
  const { signal } = state.controller;
  const selectedRegion = element("region-select")?.value ?? "barents";
  const region = REGIONS[selectedRegion] ?? REGIONS.barents;
  const date = element("observation-date")?.value || new Date().toISOString().slice(0, 10);

  setConnection("loading", "Запрашиваем Sentinel-1…", region.label);
  setLoading(true, "Ищем ближайшие спутниковые сцены");
  element("scene-summary").textContent = `Каталог Sentinel-1 · ${region.label}`;
  renderRegion(region);
  removeMapLayers();

  try {
    const scenes = await searchScenes(region, date, signal);
    if (requestId !== state.requestId) return;
    const selectedScenes = selectScenesForDate(scenes, date, region.bbox, selectedRegion === "nsr" ? 10 : 8);
    if (!selectedScenes.length) throw new Error("Нет подходящих сцен с поляризациями VV и VH.");
    state.scenes = scenes;
    state.selectedScenes = selectedScenes;
    renderScenes();
    setLoading(false);

    const latest = selectedScenes[0];
    element("map-date").textContent = formatDate(latest.properties.datetime, true);
    element("map-orbit").textContent = `${latest.properties["sat:orbit_state"] === "ascending" ? "восходящая" : "нисходящая"} орбита · ${latest.properties.platform?.toUpperCase() ?? "SENTINEL-1"}`;
    element("map-resolution").textContent = `${latest.properties["sar:pixel_spacing_range"] ?? 10} м`;
    setConnection("connected", "Каталог подключён", `сцена ${formatDate(latest.properties.datetime, true)} UTC`);

    const feature = regionFeature(region);
    const observationResults = await Promise.all(selectedScenes.slice(0, 8).map((scene) => analyzeScene(scene, feature, signal)));
    if (requestId !== state.requestId) return;
    state.observations = observationResults.filter(Boolean);
    updateDashboard(state.observations, selectedScenes, region);
    const now = new Date();
    element("footer-updated").textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    setConnection("error", "Не удалось получить данные", error.message);
    setLoading(true, error.message || "Ошибка загрузки", true);
    const subtitle = element("map-loading")?.querySelector("small");
    if (subtitle) subtitle.textContent = "Измените дату или акваторию и повторите запрос";
    element("scene-summary").textContent = "Данные временно недоступны";
  }
}

function bindInterface() {
  element("refresh-data")?.addEventListener("click", runAnalysis);
  element("observation-date")?.addEventListener("change", runAnalysis);
  element("region-select")?.addEventListener("change", runAnalysis);
  element("opacity-control")?.addEventListener("input", (event) => {
    state.opacity = Number(event.target.value) / 100;
    element("opacity-value").textContent = `${event.target.value}%`;
    state.overlays.forEach((overlay) => overlay.setOpacity(state.opacity));
  });
  window.addEventListener("ice:layer-select", ({ detail }) => {
    if (!LAYERS[detail?.key]) return;
    state.layer = detail.key;
    renderScenes();
  });
}

function boot() {
  let attempts = 0;
  const start = () => {
    if (!globalThis.L) {
      if (attempts++ < 80) setTimeout(start, 100);
      return;
    }
    initMap();
    bindInterface();
    runAnalysis();
  };
  start();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
