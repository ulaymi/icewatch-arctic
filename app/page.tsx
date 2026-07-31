"use client";

import { useState } from "react";

const navigation = [
  ["◈", "Мониторинг"],
  ["▤", "Карта в сравнении"],
  ["▦", "Статистика по морям"],
  ["⌁", "Временные ряды"],
  ["◫", "Маршруты"],
  ["⇩", "Выгрузки"],
  ["⚑", "Оповещения"],
] as const;

const regions = [
  ["barents", "Баренцево море"],
  ["kara", "Карское море"],
  ["laptev", "Море Лаптевых"],
  ["east-siberian", "Восточно-Сибирское море"],
  ["chukchi", "Чукотское море"],
  ["nsr", "Северный морской путь"],
] as const;

const layers = [
  ["sar", "Радиолокационный композит", "VV/HH + VH/HV", "sar-swatch"],
  ["concentration", "Ледовый покров", "SAR-оценка", "ice-swatch"],
  ["type", "Тип и структура льда", "Co-pol / Cross-pol", "type-swatch"],
  ["hazard", "Навигационная опасность", "аналитический индекс", "risk-swatch"],
] as const;

const demoModules: Record<string, { title: string; description: string; cards: readonly (readonly [string, string, string])[] }> = {
  "Карта в сравнении": {
    title: "Сравнение спутниковых источников",
    description: "Макет рабочего места для сопоставления радиолокационной и оптической мозаик.",
    cards: [
      ["Sentinel-1 SAR", "48 сцен", "Независим от облачности"],
      ["NOAA-20 VIIRS", "1 мозаика / сутки", "Естественные цвета · 375 м"],
      ["Terra MODIS", "1 мозаика / сутки", "Естественные цвета · 250–500 м"],
    ],
  },
  "Статистика по морям": {
    title: "Сводка по арктическим морям",
    description: "Демонстрационный пример будущей межрегиональной статистики.",
    cards: [
      ["Баренцево море", "18% льда", "Риск 1,6 / 5"],
      ["Карское море", "64% льда", "Риск 3,1 / 5"],
      ["Море Лаптевых", "79% льда", "Риск 3,8 / 5"],
    ],
  },
  "Маршруты": {
    title: "Окна проходимости маршрутов",
    description: "Демонстрационные маршрутные карточки без статуса навигационной рекомендации.",
    cards: [
      ["Сабетта → Мурманск", "Окно 06:00–13:00", "Умеренный риск"],
      ["Диксон → Певек", "Требуется уточнение", "Повышенный риск"],
      ["Архангельск → Сабетта", "Окно 09:00–18:00", "Низкий риск"],
    ],
  },
  "Выгрузки": {
    title: "Подготовленные наборы",
    description: "Демонстрационный реестр форматов, которые могут формироваться серверным контуром.",
    cards: [
      ["Карта покрытия", "GeoTIFF", "10 м · выбранная дата"],
      ["Статистика акватории", "CSV", "Показатели по сценам"],
      ["Оперативная сводка", "PDF", "Карта и ключевые риски"],
    ],
  },
  "Оповещения": {
    title: "Лента событий",
    description: "Демонстрационные уведомления для настройки будущих пороговых правил.",
    cards: [
      ["Карские Ворота", "Рост SAR-сигнала", "Порог превышен на 12%"],
      ["Подход к Сабетте", "Новая сцена", "Sentinel-1 · 15:51 UTC"],
      ["Море Лаптевых", "Облачность оптики", "Используется SAR-слой"],
    ],
  },
};

function KpiCard({
  tone,
  icon,
  label,
  valueId,
  value,
  unit,
  detailId,
  detail,
}: {
  tone: string;
  icon: string;
  label: string;
  valueId: string;
  value: string;
  unit: string;
  detailId: string;
  detail: string;
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <div>
        <span className="kpi-label">{label}</span>
        <strong><span id={valueId}>{value}</span> <small>{unit}</small></strong>
        <span className="kpi-detail" id={detailId}>{detail}</span>
      </div>
    </article>
  );
}

export default function Home() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const [activeLayer, setActiveLayer] = useState("sar");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Мониторинг");
  const demoModule = demoModules[activeNav];

  function selectLayer(key: string) {
    setActiveLayer(key);
    window.dispatchEvent(new CustomEvent("ice:layer-select", { detail: { key } }));
  }

  function selectNavigation(label: string) {
    setActiveNav(label);
    const targetId = label === "Мониторинг" ? "map-panel" : label === "Временные ряды" ? "ice-chart" : "demo-module";
    window.setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="menu-button"
          type="button"
          aria-label="Открыть меню"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
        <a className="brand" href="#map-panel" aria-label="IceWatch — мониторинг льда">
          <img className="brand-logo" src={`${basePath}/mts-eco-logo.svg`} alt="МТС Экосистема" />
          <span className="brand-divider" />
          <span>
            <strong>IceWatch</strong>
            <small>Арктическая навигационная аналитика</small>
          </span>
        </a>

        <div className="top-filter">
          <label htmlFor="satellite-select">Спутник</label>
          <select id="satellite-select" defaultValue="combined">
            <option value="combined">Sentinel-1 SAR + NOAA-20 VIIRS</option>
            <option value="sentinel1">Sentinel-1 SAR · RTC</option>
            <option value="viirs">NOAA-20 · VIIRS True Color</option>
            <option value="modis">Terra · MODIS True Color</option>
          </select>
        </div>
        <div className="top-filter region-filter">
          <label htmlFor="region-select">Акватория</label>
          <select id="region-select" defaultValue="nsr">
            {regions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>

        <div className="connection-state">
          <span className="connection-pulse" />
          <span>
            <b id="connection-title">Подключаем каталог…</b>
            <small id="connection-detail">Microsoft Planetary Computer</small>
          </span>
        </div>
        <button className="refresh-button" id="refresh-data" type="button" title="Обновить данные" aria-label="Обновить спутниковые данные">↻</button>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <nav aria-label="Разделы платформы">
            {navigation.map(([icon, label]) => (
              <button
                className={activeNav === label ? "active" : ""}
                type="button"
                key={label}
                onClick={() => selectNavigation(label)}
              >
                <span aria-hidden="true">{icon}</span>{label}
              </button>
            ))}
          </nav>

          <section className="sidebar-card route-card">
            <div className="sidebar-card-title"><span>Маршрут · демо</span><b>САБЕТТА → МУРМАНСК</b></div>
            <div className="route-line"><i /><i /><i /></div>
            <dl>
              <div><dt>Состояние</dt><dd id="route-status">Расчёт…</dd></div>
              <div><dt>Окно снимка</dt><dd id="route-window">—</dd></div>
              <div><dt>Сигнал</dt><dd id="route-signal">—</dd></div>
            </dl>
          </section>

          <section className="sidebar-card notice-card">
            <span className="notice-icon">!</span>
            <div><b>Исследовательский режим</b><p>Оценки не заменяют официальные ледовые карты и указания капитана.</p></div>
          </section>

          <button className="collapse-button" type="button" onClick={() => setSidebarOpen(false)}>‹ <span>Свернуть</span></button>
        </aside>

        <section className="content">
          <div className="content-heading">
            <div>
              <span className="eyebrow">СЕВЕРНЫЕ МОРЯ РОССИИ · SENTINEL-1 · VIIRS · MODIS</span>
              <h1>Ледовая обстановка</h1>
            </div>
            <div className="heading-meta">
              <span className="live-chip"><i /> РЕАЛЬНЫЕ ДАННЫЕ</span>
              <span id="scene-summary">Поиск актуальных сцен…</span>
            </div>
          </div>

          {demoModule && (
            <section className="panel demo-module" id="demo-module" aria-label={`${demoModule.title} — демонстрационные данные`}>
              <div className="panel-header">
                <div><span className="panel-kicker">ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ</span><h2>{demoModule.title}</h2></div>
                <span className="demo-badge">ДЕМО</span>
              </div>
              <p className="demo-description">{demoModule.description} Карта ниже всегда использует только реальные спутниковые данные.</p>
              <div className="demo-grid">
                {demoModule.cards.map(([label, value, detail]) => (
                  <article key={label}><span>{label}</span><b>{value}</b><small>{detail}</small></article>
                ))}
              </div>
            </section>
          )}

          <section className="kpi-grid" aria-label="Ключевые показатели">
            <KpiCard tone="cyan" icon="❄" label="Ледовый покров" valueId="metric-concentration" value="—" unit="%" detailId="metric-concentration-note" detail="по SAR-отражению" />
            <KpiCard tone="amber" icon="▲" label="Навигационная опасность" valueId="metric-hazard" value="—" unit="/ 5" detailId="metric-hazard-note" detail="аналитический индекс" />
            <KpiCard tone="violet" icon="≋" label="Деформированный лёд" valueId="metric-ridged" value="—" unit="%" detailId="metric-ridged-note" detail="предварительная оценка" />
            <KpiCard tone="blue" icon="◷" label="Давность наблюдения" valueId="metric-age" value="—" unit="ч" detailId="metric-age-note" detail="время получения сцены" />
          </section>

          <div className="primary-grid">
            <section className="panel map-panel" id="map-panel">
              <div className="panel-header map-title-row">
                <div>
                  <span className="panel-kicker">ИНТЕРАКТИВНАЯ КАРТА</span>
                  <h2 id="map-layer-title">Радиолокационный композит</h2>
                </div>
                <div className="map-time"><span id="map-date">—</span><small id="map-orbit">орбита —</small></div>
              </div>
              <div className="map-stage">
                <div id="ice-map" aria-label="Карта ледовой обстановки" />
                <div className="map-loading" id="map-loading">
                  <span className="radar-loader" />
                  <b>Ищем снимки по всему северному побережью</b>
                  <small>Данные поступают напрямую из облачного каталога</small>
                </div>
                <div className="map-legend" id="map-legend">
                  <span id="legend-title">Нормированная интенсивность SAR · VV/HH + VH/HV</span>
                  <div className="legend-gradient" id="legend-gradient" />
                  <div className="legend-labels"><span id="legend-min">0,01 · ниже</span><span id="legend-max">0,55 · выше</span></div>
                </div>
                <div className="coordinates" id="coordinates">72.000° N, 48.000° E</div>
              </div>
              <div className="map-date-control">
                <input id="observation-date" type="hidden" />
                <div className="map-date-control-copy">
                  <span>
                    <small>ДАТА МОЗАИКИ</small>
                    <b id="date-slider-value">Поиск доступных дат…</b>
                  </span>
                  <em id="date-slider-scenes">Все снимки северного побережья</em>
                </div>
                <input
                  id="observation-date-slider"
                  type="range"
                  min="0"
                  max="0"
                  defaultValue="0"
                  step="1"
                  disabled
                  aria-label="Дата спутниковой мозаики"
                />
                <div className="map-date-control-range">
                  <span id="date-slider-start">—</span>
                  <span>реальные проходы Sentinel-1 + суточные мозаики NASA</span>
                  <span id="date-slider-end">—</span>
                </div>
              </div>
              <div className="map-footer">
                <span><i className="source-dot" /> Источник: <span id="map-source">Copernicus Sentinel-1 RTC + NASA GIBS VIIRS</span></span>
                <span>Пространственное разрешение: <b id="map-resolution">10 м</b></span>
                <span>Снимки по всему побережью: <b id="map-scenes-count">—</b></span>
              </div>
            </section>

            <aside className="analysis-column">
              <section className="panel layers-panel">
                <div className="panel-header"><div><span className="panel-kicker">ВИЗУАЛИЗАЦИЯ</span><h2>Слои карты</h2></div><span className="settings-glyph">⌘</span></div>
                <div className="layer-list">
                  {layers.map(([key, label, detail, swatch]) => (
                    <button
                      className={activeLayer === key ? "active" : ""}
                      type="button"
                      key={key}
                      onClick={() => selectLayer(key)}
                    >
                      <span className={`layer-radio ${activeLayer === key ? "checked" : ""}`} />
                      <span className="layer-copy"><b>{label}</b><small>{detail}</small></span>
                      <span className={`layer-swatch ${swatch}`} />
                    </button>
                  ))}
                </div>
                <label className="opacity-control">
                  <span>Непрозрачность <b id="opacity-value">82%</b></span>
                  <input id="opacity-control" type="range" min="20" max="100" defaultValue="82" />
                </label>
              </section>

              <section className="panel composition-panel">
                <div className="panel-header"><div><span className="panel-kicker">SAR-КЛАССИФИКАЦИЯ</span><h2>Структура покрытия</h2></div><span className="model-badge">МОДЕЛЬ</span></div>
                <div className="donut-row">
                  <div className="ice-donut" id="ice-donut"><span><b id="donut-value">—</b><small>лёд</small></span></div>
                  <div className="composition-legend">
                    <div><i className="water" /><span>Открытая вода</span><b id="class-water">—</b></div>
                    <div><i className="young" /><span>Молодой лёд</span><b id="class-young">—</b></div>
                    <div><i className="first" /><span>Однолетний</span><b id="class-first">—</b></div>
                    <div><i className="deformed" /><span>Деформированный</span><b id="class-deformed">—</b></div>
                  </div>
                </div>
              </section>

              <section className="panel forecast-panel">
                <div className="panel-header"><div><span className="panel-kicker">ЭКСТРАПОЛЯЦИЯ ТРЕНДА · ДЕМО</span><h2>Риск на 72 часа</h2></div><span className="trend-arrow" id="forecast-trend">→</span></div>
                <div className="forecast-bars">
                  <div><span><b>24 ч</b><em id="forecast-24-label">—</em></span><i><u id="forecast-24" /></i></div>
                  <div><span><b>48 ч</b><em id="forecast-48-label">—</em></span><i><u id="forecast-48" /></i></div>
                  <div><span><b>72 ч</b><em id="forecast-72-label">—</em></span><i><u id="forecast-72" /></i></div>
                </div>
                <p>Линейное продолжение динамики последних SAR-сцен, без учёта прогноза ветра.</p>
              </section>
            </aside>
          </div>

          <div className="bottom-grid">
            <section className="panel timeline-panel">
              <div className="panel-header">
                <div><span className="panel-kicker">ДИНАМИКА НАБЛЮДЕНИЙ</span><h2>Ледовый покров по спутниковым проходам</h2></div>
                <div className="period-tabs" aria-label="Период графика"><button type="button">7 дней</button><button className="active" type="button">14 дней</button><button type="button">30 дней</button></div>
              </div>
              <div className="chart-wrap" id="ice-chart">
                <div className="chart-grid"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
                <svg className="chart-svg" viewBox="0 0 900 170" role="img" aria-label="График ледового покрова">
                  <path id="chart-area" d="" />
                  <polyline id="chart-line" points="" />
                  <g id="chart-points" />
                </svg>
                <div className="chart-empty" id="chart-empty">График появится после обработки сцен</div>
              </div>
              <div className="timeline-scenes" id="timeline-scenes" />
            </section>

            <section className="panel decision-panel">
              <div className="panel-header"><div><span className="panel-kicker">ОПЕРАТИВНАЯ СВОДКА</span><h2>На что обратить внимание</h2></div><span className="report-time" id="report-time">—</span></div>
              <div className="decision-list">
                <article><span className="signal-icon safe">✓</span><div><b id="decision-water-title">Открытая вода</b><p id="decision-water">Ожидаем расчёт по выбранной акватории.</p></div></article>
                <article><span className="signal-icon warn">▲</span><div><b id="decision-ridge-title">Торошение</b><p id="decision-ridge">Ожидаем оценку кросс-поляризации VH.</p></div></article>
                <article><span className="signal-icon info">◎</span><div><b>Следующее обновление</b><p id="decision-update">Каталог проверяется при смене даты и акватории.</p></div></article>
              </div>
            </section>
          </div>

          <footer className="footer">
            <span>IceWatch · исследовательский прототип</span>
            <span>Данные: <a href="https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc" target="_blank" rel="noreferrer">Sentinel-1 RTC</a> · <a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" target="_blank" rel="noreferrer">NASA GIBS</a> · без локального хранения</span>
            <span>Последний запрос: <b id="footer-updated">—</b></span>
          </footer>
        </section>
      </div>
    </main>
  );
}
