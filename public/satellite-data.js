const STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const ITEM_PREVIEW = "https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png";
const ITEM_STATISTICS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";
const COLLECTION = "sentinel-1-rtc";
const ARCTIC_SEARCH_BBOXES = [
  [20, 64, 180, 84],
  [-180, 64, -160, 78],
];

const REGIONS = {
  barents: { label: "Баренцево море", bbox: [30, 68, 60, 80], center: [74, 43], zoom: 4 },
  kara: { label: "Карское море", bbox: [55, 69, 102, 82], center: [76, 78], zoom: 4 },
  laptev: { label: "Море Лаптевых", bbox: [100, 70, 140, 82], center: [76, 120], zoom: 4 },
  "east-siberian": { label: "Восточно-Сибирское море", bbox: [138, 68, 180, 80], center: [74, 160], zoom: 4 },
  chukchi: { label: "Чукотское море", bbox: [155, 64, 180, 78], extraBboxes: [[-180, 64, -160, 78]], center: [70.5, 178], zoom: 4 },
  nsr: { label: "Северный морской путь", bbox: [20, 64, 180, 84], extraBboxes: [[-180, 64, -160, 78]], center: [75, 110], zoom: 3 },
};

const LAYERS = {
  sar: {
    label: "Радиолокационный композит",
    legend: "Нормированная интенсивность SAR · Co-pol + Cross-pol",
    expression: "0.65*{co}+1.8*{cross}",
    rescale: [0.01, 0.55],
    colormap: "viridis",
    min: "0,01 · ниже",
    max: "0,55 · выше",
    gradient: "linear-gradient(90deg,#440154,#414487,#2a788e,#22a884,#7ad151,#fde725)",
  },
  concentration: {
    label: "Ледовый покров",
    legend: "Предварительная SAR-оценка покрытия",
    expression: "100*({co}-0.005)/0.345",
    rescale: [0, 100],
    colormap: "blues",
    min: "0% · вода",
    max: "100% · покров",
    gradient: "linear-gradient(90deg,#f7fbff,#c6dbef,#6baed6,#2171b5,#08306b)",
  },
  type: {
    label: "Тип и структура льда",
    legend: "Отношение поляризаций · VV / VH",
    expression: "{co}/({cross}+0.001)",
    rescale: [1, 14],
    colormap: "turbo",
    min: "1 · однородный",
    max: "14 · неоднородный",
    gradient: "linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#a4fc3c,#f9ba38,#e3440a,#7a0403)",
  },
  hazard: {
    label: "Навигационная опасность",
    legend: "Комбинированный SAR-индекс",
    expression: "1+4*((0.65*{co}+1.8*{cross})-0.01)/0.54",
    rescale: [1, 5],
    colormap: "magma",
    min: "1 · ниже",
    max: "5 · выше",
    gradient: "linear-gradient(90deg,#000004,#3b0f70,#8c2981,#de4968,#fe9f6d,#fcfdbf)",
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
  availableDates: [],
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

function regionBboxes(region) { return [region.bbox, ...(region.extraBboxes ?? [])]; }
function sceneIntersectionWithRegion(scene, region) {
  return Math.max(...regionBboxes(region).map((bbox) => intersectionArea(scene.bbox, bbox)));
}
function analysisFeatureForScene(region, scene) {
  const bbox = regionBboxes(region)
    .map((candidate) => [candidate, intersectionArea(scene.bbox, candidate)])
    .sort((first, second) => second[1] - first[1])[0]?.[0] ?? region.bbox;
  return regionFeature({ label: region.label, bbox });
}
function normalizeBboxForMap(bbox) {
  const [west, south, east, north] = bbox;
  if ((west + east) / 2 < -120) return [west + 360, south, east + 360, north];
  return [west, south, east, north];
}
function availableDates(scenes) {
  return [...new Set(scenes.map((scene) => isoDay(scene.properties.datetime)))].sort();
}
function closestAvailableDate(dates, requestedDate) {
  if (!dates.length) return null;
  const target = new Date(`${requestedDate}T23:59:59Z`).getTime();
  const prior = dates.filter((day) => new Date(`${day}T23:59:59Z`).getTime() <= target);
  return prior.at(-1) ?? dates[0];
}
function polarizationAssets(scene) {
  if (scene.assets?.vv && scene.assets?.vh) return { co: "vv", cross: "vh", label: "VV/VH" };
  if (scene.assets?.hh && scene.assets?.hv) return { co: "hh", cross: "hv", label: "HH/HV" };
  return null;
}

export function selectScenesForDate(scenes, selectedDate) {
  if (!scenes.length) return [];
  const chosenDay = closestAvailableDate(availableDates(scenes), selectedDate);
  return scenes
    .filter((scene) => isoDay(scene.properties.datetime) === chosenDay)
    .filter((scene) => polarizationAssets(scene))
    .sort((first, second) => normalizeBboxForMap(first.bbox)[0] - normalizeBboxForMap(second.bbox)[0]);
}

export function buildPreviewUrl(scene, layer = "sar") {
  const rendering = LAYERS[layer] ?? LAYERS.sar;
  const polarization = polarizationAssets(scene);
  if (!polarization) throw new Error(`Сцена ${scene.id} не содержит согласованную пару поляризаций.`);
  const url = new URL(ITEM_PREVIEW);
  url.searchParams.set("collection", COLLECTION);
  url.searchParams.set("item", scene.id);
  url.searchParams.append("assets", polarization.co);
  url.searchParams.append("assets", polarization.cross);
  url.searchParams.set("asset_as_band", "true");
  url.searchParams.set("nodata", "-32768");
  url.searchParams.set("format", "png");
  url.searchParams.set("max_size", "1024");
  url.searchParams.set("expression", rendering.expression.replaceAll("{co}", polarization.co).replaceAll("{cross}", polarization.cross));
  url.searchParams.set("rescale", rendering.rescale.join(","));
  url.searchParams.set("colormap_name", rendering.colormap);
  return url.href;
}

async function searchScenes(date, signal) {
  const collections = await Promise.all(ARCTIC_SEARCH_BBOXES.map(async (bbox) => {
    const response = await fetch(STAC_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collections: [COLLECTION],
        bbox,
        datetime: `${startDate(date, 14)}T00:00:00Z/${date}T23:59:59Z`,
        limit: 1000,
        sortby: [{ field: "datetime", direction: "desc" }],
        query: { "sar:instrument_mode": { eq: "IW" } },
      }),
      signal,
    });
    if (!response.ok) throw new Error(`Каталог Sentinel-1 недоступен (${response.status}).`);
    return response.json();
  }));
  const uniqueScenes = new Map();
  for (const collection of collections) {
    for (const scene of collection.features ?? []) uniqueScenes.set(scene.id, scene);
  }
  const scenes = [...uniqueScenes.values()].sort((first, second) => toDate(second.properties.datetime) - toDate(first.properties.datetime));
  if (!scenes.length) throw new Error("В арктическом коридоре нет сцен Sentinel-1 за выбранный период.");
  return scenes;
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

export function calculateMetrics(co, cross) {
  const coDb = 10 * Math.log10(Math.max(co, 0.000001));
  const crossDb = 10 * Math.log10(Math.max(cross, 0.000001));
  const concentration = clamp((coDb + 24) / 17 * 100, 3, 98);
  const texture = clamp((crossDb + 31) / 16 * 100, 2, 92);
  const deformed = clamp(texture * (0.28 + concentration / 180), 2, concentration * 0.72);
  const young = clamp((concentration - deformed) * 0.3, 0, concentration - deformed);
  const firstYear = clamp(concentration - deformed - young, 0, 100);
  const water = clamp(100 - concentration, 0, 100);
  const hazard = clamp(1 + concentration / 30 + deformed / 42, 1, 5);
  return { co, cross, coDb, crossDb, concentration, deformed, young, firstYear, water, hazard };
}

async function analyzeScene(scene, feature, signal) {
  const polarization = polarizationAssets(scene);
  if (!polarization) return null;
  const [co, cross] = await Promise.all([
    bandStatistic(scene, polarization.co, feature, signal),
    bandStatistic(scene, polarization.cross, feature, signal),
  ]);
  if (!co || !cross) return null;
  return {
    scene,
    date: scene.properties.datetime,
    polarization: polarization.label,
    ...calculateMetrics(co.mean, cross.mean),
    pixels: Math.min(co.count, cross.count),
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
  state.map = L.map("ice-map", { zoomControl: true, attributionControl: true, minZoom: 2, maxZoom: 13 }).setView([75, 110], 3);
  state.baseLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap © CARTO · Sentinel-1 © Copernicus",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(state.map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    pane: "shadowPane",
    opacity: 0.78,
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
  const focusBounds = globalThis.L.latLngBounds();
  const rectangles = regionBboxes(region).map((bbox) => {
    const [west, south, east, north] = normalizeBboxForMap(bbox);
    focusBounds.extend([[south, west], [north, east]]);
    return globalThis.L.rectangle([[south, west], [north, east]], {
      color: "#ff0032", weight: 1, opacity: 0.42, dashArray: "5 7", fillOpacity: 0,
    });
  });
  state.boundaryLayer = globalThis.L.layerGroup(rectangles).addTo(state.map);
  state.map.fitBounds(focusBounds, { animate: true, padding: [24, 24], maxZoom: region.zoom });
}

function renderScenes(scenes = state.selectedScenes) {
  if (!state.map) return;
  removeMapLayers();
  const L = globalThis.L;
  for (const [index, scene] of scenes.entries()) {
    const [west, south, east, north] = normalizeBboxForMap(scene.bbox);
    const overlay = L.imageOverlay(buildPreviewUrl(scene, state.layer), [[south, west], [north, east]], {
      opacity: state.opacity,
      interactive: true,
      crossOrigin: true,
      className: "satellite-scene",
    }).addTo(state.map);
    overlay.on("error", () => overlay.setOpacity(0));
    overlay.bindTooltip(`Sentinel-1 · ${formatDate(scene.properties.datetime, true)} UTC`, { sticky: true });
    state.overlays.push(overlay);
    if (index < 10) {
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

function updateMapSceneMeta(scenes, selectedDate) {
  element("map-date").textContent = formatDate(selectedDate);
  if (!scenes.length) {
    element("map-orbit").textContent = "нет снимков на выбранную дату";
    element("map-resolution").textContent = "10 м";
    return;
  }
  const orbitStates = new Set(scenes.map((scene) => scene.properties["sat:orbit_state"]).filter(Boolean));
  const orbitLabel = orbitStates.size > 1
    ? "восходящие + нисходящие орбиты"
    : orbitStates.has("ascending") ? "восходящая орбита" : "нисходящая орбита";
  const platforms = [...new Set(scenes.map((scene) => scene.properties.platform?.toUpperCase()).filter(Boolean))].join(" + ") || "SENTINEL-1";
  const polarizations = [...new Set(scenes.map((scene) => polarizationAssets(scene)?.label).filter(Boolean))].join(" + ");
  element("map-orbit").textContent = `${scenes.length} сцен · ${orbitLabel} · ${platforms} · ${polarizations}`;
  element("map-resolution").textContent = `${scenes[0].properties["sar:pixel_spacing_range"] ?? 10} м`;
}

function updateDateSliderCopy(selectedDate, scenes) {
  element("date-slider-value").textContent = formatDate(selectedDate);
  element("date-slider-scenes").textContent = `${scenes.length} снимков · вся российская Арктика`;
}

function configureDateSlider(scenes, requestedDate) {
  state.availableDates = availableDates(scenes);
  const slider = element("observation-date-slider");
  if (!slider || !state.availableDates.length) return requestedDate;
  const selectedDate = closestAvailableDate(state.availableDates, requestedDate);
  const selectedIndex = state.availableDates.indexOf(selectedDate);
  slider.min = "0";
  slider.max = `${Math.max(0, state.availableDates.length - 1)}`;
  slider.value = `${Math.max(0, selectedIndex)}`;
  slider.disabled = state.availableDates.length < 2;
  element("observation-date").value = selectedDate;
  element("date-slider-start").textContent = formatDate(state.availableDates[0]);
  element("date-slider-end").textContent = formatDate(state.availableDates.at(-1));
  updateDateSliderCopy(selectedDate, selectScenesForDate(scenes, selectedDate));
  return selectedDate;
}

function previewDateFromSlider(index) {
  const selectedDate = state.availableDates[clamp(Number(index), 0, Math.max(0, state.availableDates.length - 1))];
  if (!selectedDate) return;
  element("observation-date").value = selectedDate;
  state.selectedScenes = selectScenesForDate(state.scenes, selectedDate);
  renderScenes();
  updateMapSceneMeta(state.selectedScenes, selectedDate);
  updateDateSliderCopy(selectedDate, state.selectedScenes);
  element("scene-summary").textContent = `${state.selectedScenes.length} снимков на выбранную дату · показаны все северные моря`;
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
      const [west, south, east, north] = normalizeBboxForMap(item.scene.bbox);
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

function updateDashboard(observations, scenes, region, regionalSceneCount) {
  if (!observations.length) {
    element("scene-summary").textContent = `${scenes.length} снимков показано по всему побережью · ${regionalSceneCount ? "статистика недоступна" : `нет покрытия акватории «${region.label}»`}`;
    ["metric-concentration", "metric-hazard", "metric-ridged", "metric-age", "donut-value"].forEach((id) => { element(id).textContent = "—"; });
    element("decision-water").textContent = `Все доступные снимки остаются на карте; для акватории «${region.label}» на выбранную дату нет расчётного покрытия.`;
    element("decision-ridge").textContent = "Переместите ползунок на соседний спутниковый проход для региональной оценки.";
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
  element("metric-ridged-note").textContent = `Cross-pol ${formatNumber(weightedAverage(observations, "crossDb"), 1)} dB`;
  element("metric-age").textContent = ageHours > 999 ? ">999" : formatNumber(ageHours);
  element("metric-age-note").textContent = `UTC ${formatDate(latest.date, true)}`;

  element("donut-value").textContent = `${formatNumber(concentration)}%`;
  element("ice-donut").style.background = `conic-gradient(#19c5e8 0 ${concentration}%, #edf0f4 ${concentration}% 100%)`;
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
  element("decision-update").textContent = `Ползунок переключает доступные проходы; выбор акватории «${region.label}» меняет только фокус и расчёт показателей.`;
  element("scene-summary").textContent = `${scenes.length} снимков на карте по всему побережью · ${regionalSceneCount} в зоне расчёта · ${observations.length} обработано`;
  element("report-time").textContent = formatDate(latest.date, true);
  updateChart(observations);
}

async function runAnalysis({ reuseScenes = false } = {}) {
  const requestId = ++state.requestId;
  state.controller?.abort();
  state.controller = new AbortController();
  const { signal } = state.controller;
  const selectedRegion = element("region-select")?.value ?? "nsr";
  const region = REGIONS[selectedRegion] ?? REGIONS.nsr;
  const requestedDate = element("observation-date")?.value || new Date().toISOString().slice(0, 10);

  setConnection("loading", "Запрашиваем Sentinel-1…", "всё северное побережье России");
  setLoading(true, reuseScenes ? "Пересчитываем выбранный проход" : "Ищем снимки по всему северному побережью");
  element("scene-summary").textContent = `Каталог Sentinel-1 · вся российская Арктика`;
  renderRegion(region);
  removeMapLayers();

  try {
    const scenes = reuseScenes && state.scenes.length ? state.scenes : await searchScenes(requestedDate, signal);
    if (requestId !== state.requestId) return;
    state.scenes = scenes;
    const selectedDate = configureDateSlider(scenes, requestedDate);
    const selectedScenes = selectScenesForDate(scenes, selectedDate);
    if (!selectedScenes.length) throw new Error("Нет подходящих двухполяризационных сцен Sentinel-1.");
    state.selectedScenes = selectedScenes;
    renderScenes();
    updateMapSceneMeta(selectedScenes, selectedDate);
    setLoading(false);

    setConnection("connected", "Каталог подключён", `${selectedScenes.length} снимков · ${formatDate(selectedDate)}`);

    const regionalScenes = selectedScenes.filter((scene) => sceneIntersectionWithRegion(scene, region) > 0);
    const observationResults = await Promise.all(regionalScenes.slice(0, 8).map((scene) => analyzeScene(scene, analysisFeatureForScene(region, scene), signal)));
    if (requestId !== state.requestId) return;
    state.observations = observationResults.filter(Boolean);
    updateDashboard(state.observations, selectedScenes, region, regionalScenes.length);
    const now = new Date();
    element("footer-updated").textContent = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    setConnection("error", "Не удалось получить данные", error.message);
    setLoading(true, error.message || "Ошибка загрузки", true);
    const subtitle = element("map-loading")?.querySelector("small");
    if (subtitle) subtitle.textContent = "Переместите ползунок на соседний проход или повторите запрос";
    element("scene-summary").textContent = "Данные временно недоступны";
  }
}

function bindInterface() {
  element("refresh-data")?.addEventListener("click", () => {
    element("observation-date").value = new Date().toISOString().slice(0, 10);
    runAnalysis();
  });
  element("region-select")?.addEventListener("change", () => runAnalysis({ reuseScenes: true }));
  element("observation-date-slider")?.addEventListener("input", (event) => previewDateFromSlider(event.target.value));
  element("observation-date-slider")?.addEventListener("change", () => runAnalysis({ reuseScenes: true }));
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
