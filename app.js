const yearData = {
  1985: { forest: "92%" },
  2000: { forest: "81%" },
  2010: { forest: "69%" },
  2023: { forest: "54%" }
};

const departmentLabelPositions = {
  Pando: [-11.7, -67.6],
  Beni: [-14.1, -65.8],
  "La Paz": [-16.35, -68.15],
  Cochabamba: [-17.80, -66.0],
  Oruro: [-18.95, -68.1],
  Potosí: [-20.55, -66.75],
  Chuquisaca: [-21.2, -64.4],
  Tarija: [-22.00, -64.35],
  "Santa Cruz": [-18.1, -61.85]
};

const rasterSources = {
  1985: "./data/uso_suelo_1985_reserva_chore.tif",
  1995: "./data/uso_suelo_1995_reserva_chore.tif",
  2005: "./data/uso_suelo_2005_reserva_chore.tif",
  2015: "./data/uso_suelo_2015_reserva_chore.tif",
  2023: "./data/uso_suelo_2023_reserva_chore.tif"
};

const rasterLegendItems = [
  { label: "Formación forestal", color: "#1f8f45" },
  { label: "Sabana y vegetación abierta", color: "#d8be6a" },
  { label: "Agropecuario / transformación", color: "#ea7aff" },
  { label: "Agua", color: "#2d7ef7" },
  { label: "Otra cobertura", color: "#0e5b74" }
];

const rasterClassColors = {
  0: null,
  1: "#0e5b74",
  3: "#1f8f45",
  4: "#4ea85a",
  5: "#2b934f",
  9: "#d8be6a",
  10: "#d8be6a",
  11: "#c3a95d",
  12: "#d8be6a",
  13: "#ead39b",
  15: "#ea7aff",
  18: "#d84ed4",
  21: "#ef9f4c",
  23: "#b0b7bf",
  24: "#2d7ef7",
  25: "#e5d5aa",
  29: "#22b573",
  30: "#ef9f4c",
  33: "#5b8df9",
  39: "#0e5b74",
  41: "#93bf64",
  49: "#c294ff",
  50: "#1e7fce",
  62: "#8a8f94"
};

const setupTimeline = () => {
  const buttons = document.querySelectorAll("[data-year]");
  const forestValue = document.getElementById("forestValue");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");

      const data = yearData[button.dataset.year];
      if (forestValue && data) {
        forestValue.textContent = data.forest;
      }
    });
  });
};

const setupClosingPanorama = () => {
  const panoramaElement = document.getElementById("closingPanorama");

  if (!panoramaElement || typeof window.pannellum === "undefined") {
    return;
  }

  window.pannellum.viewer("closingPanorama", {
    type: "equirectangular",
    panorama: "./images/dji_fly_pano.jpg",
    autoLoad: true,
    autoRotate: -2,
    autoRotateInactivityDelay: 2500,
    showControls: true,
    showZoomCtrl: true,
    showFullscreenCtrl: true,
    mouseZoom: true,
    draggable: true,
    compass: false,
    pitch: -6,
    yaw: 8,
    hfov: 100
  });
};

const setupReveal = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
};

const getRasterColor = (values, georaster) => {
  const pixelValues = Array.isArray(values) ? values : [values];
  const selectedValue = pixelValues[0];

  if (selectedValue === null || selectedValue === undefined || Number.isNaN(selectedValue)) {
    return null;
  }

  const numericValue = Number(selectedValue);

  if (numericValue <= 0) {
    return null;
  }

  const palette = georaster?.palette;
  if (palette && palette[numericValue]) {
    const [red, green, blue, alpha = 255] = palette[numericValue];
    return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
  }

  if (pixelValues.length >= 3 && pixelValues.length <= 4 && georaster?.numberOfRasters <= 4) {
    const [red, green, blue, alpha = 255] = pixelValues.map((value) => Number(value) || 0);
    const maxRgb = Math.max(red, green, blue);

    if (maxRgb === 0) {
      return null;
    }

    return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
  }

  return rasterClassColors[numericValue] || "#0e5b74";
};

const createRasterLegendControl = () => {
  if (typeof window.L === "undefined") {
    return null;
  }

  return window.L.control({ position: "bottomright" });
};

const rasterGeorasterCache = new Map();
let reserveGeojsonPromise = null;
let reserveTotalGeojsonPromise = null;
const pressureTourBoundaryPromises = new Map();
const registeredLeafletMaps = [];
let mapRefreshObserver = null;

const attachRasterLegend = (map) => {
  const legendControl = createRasterLegendControl();
  if (!legendControl) {
    return null;
  }

  legendControl.onAdd = () => {
    const container = window.L.DomUtil.create("div", "preview-raster__legend");
    const items = rasterLegendItems
      .map(
        (item) =>
          `<li><span style="background:${item.color};"></span><strong>${item.label}</strong></li>`
      )
      .join("");

    container.innerHTML = `<h3>Leyenda de coberturas</h3><ul>${items}</ul>`;
    return container;
  };

  legendControl.addTo(map);
  return legendControl;
};

const attachPreviewYearLabel = (map, year) => {
  if (typeof window.L === "undefined") {
    return null;
  }

  const yearControl = window.L.control({ position: "topleft" });

  yearControl.onAdd = () => {
    const container = window.L.DomUtil.create("div", "preview-sidecar__year-label");
    container.textContent = String(year);
    return container;
  };

  yearControl.addTo(map);
  return yearControl;
};

const loadRasterGeoTIFF = (source) => {
  if (rasterGeorasterCache.has(source)) {
    return Promise.resolve(rasterGeorasterCache.get(source));
  }

  return fetch(source, { cache: "no-store" })
    .then((response) => response.arrayBuffer())
    .then((buffer) => window.parseGeoraster(buffer))
    .then((georaster) => {
      rasterGeorasterCache.set(source, georaster);
      return georaster;
    });
};

const loadReserveGeojson = () => {
  if (reserveGeojsonPromise) {
    return reserveGeojsonPromise;
  }

  reserveGeojsonPromise = fetch("./data/ReservaChore_actual.geojson", { cache: "no-store" }).then(
    (response) => response.json()
  );

  return reserveGeojsonPromise;
};

const loadReserveTotalGeojson = () => {
  if (reserveTotalGeojsonPromise) {
    return reserveTotalGeojsonPromise;
  }

  reserveTotalGeojsonPromise = fetch("./data/ReservaChore_TOTAL.geojson", {
    cache: "no-store"
  }).then((response) => response.json());

  return reserveTotalGeojsonPromise;
};

const loadPressureTourBoundaryGeojson = (source) => {
  if (pressureTourBoundaryPromises.has(source)) {
    return pressureTourBoundaryPromises.get(source);
  }

  const promise = fetch(source, { cache: "no-store" }).then((response) => response.json());
  pressureTourBoundaryPromises.set(source, promise);
  return promise;
};

const normalizeSettlementName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Â/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const pressureTourBoundaries = [
  {
    source: "./data/yapacani.geojson",
    label: "Yapacaní",
    tone: "west",
    labelMarker: [-16.80, -64.34]
  },
  {
    source: "./data/sanjuan.geojson",
    label: "San Juan",
    tone: "center",
    labelMarker: [-16.90, -64.02]
  },
  {
    source: "./data/santarosa.geojson",
    label: "Santa Rosa del Sara",
    tone: "east",
    labelMarker: [-16.68, -63.86]
  }
];

const refreshLeafletRasterMap = ({
  map,
  bounds,
  rasterLayer,
  padding = 0.12,
  zoomOffset = 0
}) => {
  if (!map || !bounds || !map.getContainer()?.isConnected) {
    return;
  }

  map.invalidateSize({ pan: false, animate: false });
  map.fitBounds(bounds.pad(padding), { animate: false });

  if (zoomOffset !== 0) {
    map.setZoom(map.getZoom() + zoomOffset, { animate: false });
  }

  if (rasterLayer?.redraw) {
    rasterLayer.redraw();
  }
};

const scheduleLeafletRasterRefresh = (config) => {
  [0, 120, 320].forEach((delay) => {
    window.setTimeout(() => {
      refreshLeafletRasterMap(config);
    }, delay);
  });
};

const getMapRefreshObserver = () => {
  if (mapRefreshObserver || typeof IntersectionObserver === "undefined") {
    return mapRefreshObserver;
  }

  mapRefreshObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const config = registeredLeafletMaps.find(
          (item) => item.map?.getContainer() === entry.target
        );

        if (config) {
          scheduleLeafletRasterRefresh(config);
        }
      });
    },
    { threshold: 0.12 }
  );

  return mapRefreshObserver;
};

const upsertLeafletRasterMap = (config) => {
  const existingIndex = registeredLeafletMaps.findIndex((item) => item.map === config.map);

  if (existingIndex >= 0) {
    registeredLeafletMaps[existingIndex] = config;
  } else {
    registeredLeafletMaps.push(config);
    getMapRefreshObserver()?.observe(config.map.getContainer());
  }

  scheduleLeafletRasterRefresh(config);
};

const createForestPattern = (map, patternId) => {
  const svgRoot = map.getPanes().overlayPane.querySelector("svg");
  if (!svgRoot) {
    return;
  }

  let defs = svgRoot.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }

  if (!svgRoot.querySelector(`#${patternId}`)) {
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.setAttribute("id", patternId);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", "14");
    pattern.setAttribute("height", "14");

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "14");
    bg.setAttribute("height", "14");
    bg.setAttribute("fill", "#f4f8f1");
    bg.setAttribute("opacity", "0.96");
    pattern.appendChild(bg);

    const treeA = document.createElementNS("http://www.w3.org/2000/svg", "path");
    treeA.setAttribute("d", "M4 10.5 L7 4.5 L10 10.5 Z M6.9 10.5 L7.1 13");
    treeA.setAttribute("stroke", "#5f9364");
    treeA.setAttribute("stroke-width", "0.75");
    treeA.setAttribute("fill", "#8db88d");
    treeA.setAttribute("opacity", "0.82");
    pattern.appendChild(treeA);

    const treeB = document.createElementNS("http://www.w3.org/2000/svg", "path");
    treeB.setAttribute("d", "M11 3.6 L13.5 -1.2 L16 3.6 Z M13.4 3.6 L13.6 6");
    treeB.setAttribute("stroke", "#6a9b6d");
    treeB.setAttribute("stroke-width", "0.6");
    treeB.setAttribute("fill", "#9ec59a");
    treeB.setAttribute("opacity", "0.72");
    pattern.appendChild(treeB);

    const treeC = document.createElementNS("http://www.w3.org/2000/svg", "path");
    treeC.setAttribute("d", "M-2 3.6 L0.5 -1.2 L3 3.6 Z M0.4 3.6 L0.6 6");
    treeC.setAttribute("stroke", "#6a9b6d");
    treeC.setAttribute("stroke-width", "0.6");
    treeC.setAttribute("fill", "#9ec59a");
    treeC.setAttribute("opacity", "0.72");
    pattern.appendChild(treeC);

    defs.appendChild(pattern);
  }

  if (!svgRoot.querySelector("#reserveGlow")) {
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", "reserveGlow");
    filter.setAttribute("x", "-30%");
    filter.setAttribute("y", "-30%");
    filter.setAttribute("width", "160%");
    filter.setAttribute("height", "160%");

    const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blur.setAttribute("stdDeviation", "3.2");
    blur.setAttribute("result", "blur");
    filter.appendChild(blur);

    const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    const n1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    n1.setAttribute("in", "blur");
    const n2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    n2.setAttribute("in", "SourceGraphic");
    merge.appendChild(n1);
    merge.appendChild(n2);
    filter.appendChild(merge);
    defs.appendChild(filter);
  }
};

const setupReserveMap = () => {
  const mapElement = document.getElementById("reserveMap");

  if (!mapElement || typeof window.L === "undefined") {
    return;
  }

  const map = window.L.map(mapElement, {
    zoomControl: false,
    scrollWheelZoom: false
  });

  window.L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Esri" }
  ).addTo(map);

  Promise.all([
    fetch("./data/departamentosBolivia.geojson").then((response) => response.json()),
    fetch("./data/ReservaChore_actual.geojson").then((response) => response.json())
  ])
    .then(([departmentsGeojson, reserveGeojson]) => {
      window.L.geoJSON(departmentsGeojson, {
        style: () => ({
          color: "rgba(255,255,255,0.78)",
          weight: 1.1,
          fillOpacity: 0
        })
      }).addTo(map);

      Object.entries(departmentLabelPositions).forEach(([name, latlng]) => {
        window.L.marker(latlng, { opacity: 0 })
          .addTo(map)
          .bindTooltip(name, {
            permanent: true,
            direction: "center",
            className: "department-label"
          });
      });

      const reserveLayer = window.L.geoJSON(reserveGeojson, {
        style: {
          color: "#f4efe1",
          weight: 2.8,
          fillColor: "#915b5b",
          fillOpacity: 0.36
        }
      }).addTo(map);

      const boliviaCenter = [-16.7, -64.7];
      map.setView(boliviaCenter, 6);

      const reserveBounds = reserveLayer.getBounds();
      const center = reserveBounds.getCenter();

      window.L.marker(center)
        .addTo(map)
        .bindPopup("Reserva Forestal El Choré<br>Santa Cruz, Bolivia");

      window.L.marker(center, { opacity: 0 })
        .addTo(map)
        .bindTooltip("<strong>Reserva El Choré</strong>", {
          permanent: true,
          direction: "top",
          className: "reserve-map__label",
          offset: [0, -10]
        });
    })
    .catch(() => {
      mapElement.innerHTML =
        "<p style=\"padding:1rem;color:white;\">No se pudo cargar el mapa de ubicación.</p>";
    });
};

const setupReserveDetailMap = () => {
  const mapElement = document.getElementById("reserveDetailMap");

  if (!mapElement || typeof window.L === "undefined") {
    return;
  }

  const map = window.L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: false
  });

  window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    attribution: "OpenStreetMap, CARTO"
  }).addTo(map);

  Promise.all([
    fetch("./data/departamentosBolivia.geojson").then((response) => response.json()),
    fetch("./data/ReservaChore_actual.geojson").then((response) => response.json())
  ])
    .then(([departmentsGeojson, reserveGeojson]) => {
      window.L.geoJSON(departmentsGeojson, {
        style: () => ({
          color: "rgba(120, 120, 120, 0.4)",
          weight: 0.8,
          fillColor: "#dfe4e1",
          fillOpacity: 0.1
        })
      }).addTo(map);

      const reserveHaloLayer = window.L.geoJSON(reserveGeojson, {
        style: () => ({
          color: "rgba(77, 132, 90, 0.22)",
          weight: 10,
          opacity: 1,
          fill: false
        })
      }).addTo(map);

      const reserveLayer = window.L.geoJSON(reserveGeojson, {
        style: () => ({
          color: "#145a32",
          weight: 2.8,
          opacity: 0.95,
          fill: true,
          fillColor: "#93c47d",
          fillOpacity: 0.18
        })
      }).addTo(map);

      const reserveInnerStroke = window.L.geoJSON(reserveGeojson, {
        style: () => ({
          color: "#7aa36f",
          weight: 1.1,
          opacity: 0.9,
          dashArray: "2 4",
          fill: false
        })
      }).addTo(map);

      map.fitBounds(reserveLayer.getBounds().pad(0.42));

      reserveHaloLayer.bringToBack();
      reserveLayer.bringToFront();
      reserveInnerStroke.bringToFront();

      const center = reserveLayer.getBounds().getCenter();
      window.L.marker(center, { opacity: 0 })
        .addTo(map)
        .bindTooltip("EL CHORÉ", {
          permanent: true,
          direction: "top",
          className: "reserve-detail__label",
          offset: [0, -6]
        });
    })
    .catch(() => {
      mapElement.innerHTML = "<p style=\"padding:1rem;color:#355;\">No se pudo cargar el mapa detallado.</p>";
    });
};

const previewMetadataPaths = {
  1985: "./generated/uso_suelo_1985_preview.json",
  1995: "./generated/uso_suelo_1995_preview.json",
  2005: "./generated/uso_suelo_2005_preview.json",
  2015: "./generated/uso_suelo_2015_preview.json",
  2023: "./generated/uso_suelo_2023_preview.json"
};

const setupPreviewMapPanel = ({ mapId, metadataPath, fallbackMessage, year }) => {
  const mapElement = document.getElementById(mapId);

  if (!mapElement || typeof window.L === "undefined") {
    return Promise.resolve(null);
  }

  const map = window.L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: false
  });
  mapElement.__leafletMap = map;

  window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    attribution: "OpenStreetMap, CARTO"
  }).addTo(map);

  attachRasterLegend(map);
  attachPreviewYearLabel(map, year);

  return Promise.all([
    fetch(metadataPath, { cache: "no-store" }).then((response) => response.json()),
    loadReserveGeojson()
  ])
    .then(([previewMetadata, reserveGeojson]) => {
      const [west, south, east, north] = previewMetadata.bounds;
      const imageBounds = [
        [south, west],
        [north, east]
      ];

      const imageLayer = window.L.imageOverlay(`./generated/${previewMetadata.preview}`, imageBounds, {
        opacity: 0.97,
        interactive: false
      }).addTo(map);

      const reserveOutline = window.L.geoJSON(reserveGeojson, {
        style: {
          color: "#f6f0df",
          weight: 2.2,
          fillOpacity: 0
        }
      }).addTo(map);

      const reserveBounds = reserveOutline.getBounds();
      reserveOutline.bringToFront();

      upsertLeafletRasterMap({
        map,
        bounds: reserveBounds,
        rasterLayer: imageLayer,
        padding: 0.14,
        zoomOffset: 0
      });

      return { map, imageLayer, reserveOutline, reserveBounds };
    })
    .catch(() => {
      mapElement.innerHTML = `<p style="padding:1rem;color:#243;">${fallbackMessage}</p>`;
      return null;
    });
};

const setupPreviewSidecarMap = () => {
  const chapters = Array.from(document.querySelectorAll(".preview-sidecar__chapter"));
  const mapPanels = Array.from(document.querySelectorAll(".preview-sidecar__map-panel"));

  if (!chapters.length || !mapPanels.length || typeof window.L === "undefined") {
    return;
  }

  const mapConfigs = {
    1985: {
      mapId: "previewSidecarMap1985",
      metadataPath: previewMetadataPaths[1985],
      fallbackMessage: "No se pudo cargar la vista de 1985.",
      year: 1985
    },
    1995: {
      mapId: "previewSidecarMap1995",
      metadataPath: previewMetadataPaths[1995],
      fallbackMessage: "No se pudo cargar la vista de 1995.",
      year: 1995
    },
    2005: {
      mapId: "previewSidecarMap2005",
      metadataPath: previewMetadataPaths[2005],
      fallbackMessage: "No se pudo cargar la vista de 2005.",
      year: 2005
    },
    2015: {
      mapId: "previewSidecarMap2015",
      metadataPath: previewMetadataPaths[2015],
      fallbackMessage: "No se pudo cargar la vista de 2015.",
      year: 2015
    },
    2023: {
      mapId: "previewSidecarMap2023",
      metadataPath: previewMetadataPaths[2023],
      fallbackMessage: "No se pudo cargar la vista de 2023.",
      year: 2023
    }
  };

  Object.values(mapConfigs).forEach((config) => {
    setupPreviewMapPanel(config);
  });

  let activeKey = "1985";

  const setActiveChapter = (key) => {
    chapters.forEach((chapter) => {
      chapter.classList.toggle("is-active", chapter.dataset.previewKey === String(key));
    });
  };

  const setActiveMapPanel = (key) => {
    mapPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.previewKey === String(key));
    });

    window.requestAnimationFrame(() => {
      const activePanel = mapPanels.find((panel) => panel.dataset.previewKey === String(key));
      if (!activePanel) {
        return;
      }

      activePanel
        .querySelectorAll(".preview-sidecar__map, #swipeCompareMap")
        .forEach((element) => {
          const map = element.__leafletMap;
          if (map) {
            map.invalidateSize();
          }
        });
    });
  };

  const activatePreview = (key) => {
    if (!mapPanels.some((panel) => panel.dataset.previewKey === String(key)) || key === activeKey) {
      return;
    }

    activeKey = key;
    setActiveChapter(key);
    setActiveMapPanel(key);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (!visibleEntries.length) {
        return;
      }

      const nextKey = visibleEntries[0].target.dataset.previewKey;
      activatePreview(nextKey);
    },
    {
      threshold: [0.25, 0.5, 0.75],
      rootMargin: "-10% 0px -25% 0px"
    }
  );

  const resolveChapterFromViewport = () => {
    const viewportAnchor = window.innerHeight * 0.32;

    let bestChapter = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    chapters.forEach((chapter) => {
      const rect = chapter.getBoundingClientRect();
      const chapterAnchor = rect.top + Math.min(rect.height * 0.35, 220);
      const distance = Math.abs(chapterAnchor - viewportAnchor);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestChapter = chapter;
      }
    });

    if (bestChapter?.dataset.previewKey) {
      activatePreview(bestChapter.dataset.previewKey);
    }
  };

  let scrollTicking = false;
  const handleScroll = () => {
    if (scrollTicking) {
      return;
    }

    scrollTicking = true;
    window.requestAnimationFrame(() => {
      resolveChapterFromViewport();
      scrollTicking = false;
    });
  };

  chapters.forEach((chapter) => {
    observer.observe(chapter);
    chapter.addEventListener("click", () => {
      if (chapter.dataset.previewKey) {
        activatePreview(chapter.dataset.previewKey);
      }
    });
  });

  window.addEventListener("scroll", handleScroll, { passive: true });
  setActiveChapter("1985");
  setActiveMapPanel("1985");
  window.requestAnimationFrame(resolveChapterFromViewport);
};

const setupSwipeCompareMap = () => {
  const mapElement = document.getElementById("swipeCompareMap");
  const divider = document.getElementById("swipeDivider");
  const range = document.getElementById("swipeCompareRange");

  if (!mapElement || !divider || !range || typeof window.L === "undefined") {
    return;
  }

  const map = window.L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: false
  });
  mapElement.__leafletMap = map;

  window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    attribution: "OpenStreetMap, CARTO"
  }).addTo(map);

  const beforePane = map.createPane("swipeBeforePane");
  const afterPane = map.createPane("swipeAfterPane");
  beforePane.style.zIndex = "350";
  afterPane.style.zIndex = "360";

  let beforeLayer = null;
  let afterLayer = null;
  let reserveOutline = null;
  let reserveBounds = null;

  const applySwipe = () => {
    const value = Number(range.value);
    divider.style.left = `${value}%`;
    const containerRect = map.getContainer().getBoundingClientRect();
    const dividerX = containerRect.left + (containerRect.width * value) / 100;

    const beforeImage = beforeLayer?.getElement?.();
    if (beforeImage) {
      const beforeRect = beforeImage.getBoundingClientRect();
      const beforeRightInset = Math.max(0, beforeRect.right - dividerX);
      beforeImage.style.clipPath = `inset(0px ${beforeRightInset}px 0px 0px)`;
      beforeImage.style.webkitClipPath = `inset(0px ${beforeRightInset}px 0px 0px)`;
    }

    const afterImage = afterLayer?.getElement?.();
    if (afterImage) {
      const afterRect = afterImage.getBoundingClientRect();
      const afterLeftInset = Math.max(0, dividerX - afterRect.left);
      afterImage.style.clipPath = `inset(0px 0px 0px ${afterLeftInset}px)`;
      afterImage.style.webkitClipPath = `inset(0px 0px 0px ${afterLeftInset}px)`;
    }
  };

  Promise.all([
    fetch(previewMetadataPaths[1985], { cache: "no-store" }).then((response) => response.json()),
    fetch(previewMetadataPaths[2023], { cache: "no-store" }).then((response) => response.json()),
    loadReserveGeojson()
  ])
    .then(([metadata1985, metadata2023, reserveGeojson]) => {
      const [west, south, east, north] = metadata1985.bounds;
      const imageBounds = [
        [south, west],
        [north, east]
      ];

      beforeLayer = window.L.imageOverlay(`./generated/${metadata1985.preview}`, imageBounds, {
        pane: "swipeBeforePane",
        opacity: 0.97,
        interactive: false
      }).addTo(map);

      afterLayer = window.L.imageOverlay(`./generated/${metadata2023.preview}`, imageBounds, {
        pane: "swipeAfterPane",
        opacity: 0.97,
        interactive: false
      }).addTo(map);

      reserveOutline = window.L.geoJSON(reserveGeojson, {
        style: {
          color: "#f6f0df",
          weight: 2.2,
          fillOpacity: 0
        }
      }).addTo(map);

      reserveBounds = reserveOutline.getBounds();
      reserveOutline.bringToFront();

      upsertLeafletRasterMap({
        map,
        bounds: reserveBounds,
        rasterLayer: afterLayer,
        padding: 0.14,
        zoomOffset: 0
      });

      applySwipe();
      [120, 320].forEach((delay) => {
        window.setTimeout(() => {
          map.invalidateSize({ pan: false, animate: false });
          applySwipe();
        }, delay);
      });
    })
    .catch(() => {
      mapElement.innerHTML =
        "<p style=\"padding:1rem;color:#243;\">No se pudo cargar el comparador swipe.</p>";
    });

  range.addEventListener("input", applySwipe);

  map.on("zoom move resize", applySwipe);
};

const setupPressureMapStory = () => {
  const mapElement = document.getElementById("pressureMapStory");

  if (!mapElement || typeof window.L === "undefined") {
    return;
  }

  const map = window.L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: false
  });

  map.createPane("pressureRasterPane");
  map.getPane("pressureRasterPane").style.zIndex = "430";

  map.createPane("pressureOutlinePane");
  map.getPane("pressureOutlinePane").style.zIndex = "440";

  window.L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Esri" }
  ).addTo(map);

  Promise.all([
    fetch(previewMetadataPaths[2023], { cache: "no-store" }).then((response) => response.json()),
    loadReserveTotalGeojson()
  ])
    .then(([previewMetadata, reserveGeojson]) => {
      const [west, south, east, north] = previewMetadata.bounds;
      const imageBounds = [
        [south, west],
        [north, east]
      ];
      const reserveOutline = window.L.geoJSON(reserveGeojson, {
        pane: "pressureOutlinePane",
        style: {
          color: "#ffe600",
          weight: 2.2,
          opacity: 0.96,
          fillOpacity: 0
        }
      }).addTo(map);

      const imageLayer = window.L.imageOverlay("./generated/uso_suelo_2023_pressure_mask.png", imageBounds, {
        pane: "pressureRasterPane",
        opacity: 1,
        interactive: false
      }).addTo(map);

      reserveOutline.bringToFront();

      upsertLeafletRasterMap({
        map,
        bounds: reserveOutline.getBounds(),
        rasterLayer: imageLayer,
        padding: 0,
        zoomOffset: 0.5
      });
    })
    .catch(() => {
      mapElement.innerHTML =
        "<p style=\"padding:1rem;color:#f4f0e5;\">No se pudo cargar el mapa de factores de presión.</p>";
    });
};

const pressureTourScenes = [
  {
    title: "Frontera de transición",
    text:
      "En Yapacaní, la serie 1985-2023 muestra predominio de cobertura forestal y aperturas agropecuarias todavía dispersas. La presión existe, pero aún no rompe de forma generalizada la continuidad del bosque.",
    shortLabel: "Frontera de<br>transición",
    marker: [-16.62025776264426, -64.38463197233128],
    labelOffset: { x: 42, y: -22 },
    zoom: 10
  },
  {
    title: "Núcleo de fragmentación",
    text:
      "En San Juan, el cambio de uso del suelo avanza desde el borde sur hacia el interior y divide la matriz forestal en bloques cada vez menores. Aquí la fragmentación ya es estructural y reduce la conectividad del territorio.",
    shortLabel: "Núcleo de<br>fragmentación",
    marker: [-16.898069438951918, -64.01113093126527],
    labelOffset: { x: 42, y: -16 },
    zoom: 10
  },
  {
    title: "Zona de transformación intensa",
    text:
      "En Santa Rosa del Sara, el paisaje aparece ampliamente transformado por usos agropecuarios. Los remanentes de bosque son menores y aislados, lo que convierte a este sector en el frente más intensamente transformado del Choré.",
    shortLabel: "Zona de<br>transformación<br>intensa",
    marker: [-16.59337721731494, -63.917493140422],
    labelOffset: { x: 42, y: -14 },
    zoom: 10
  }
];

const createPressureTourMarker = () =>
  window.L.divIcon({
    className: "",
    html: '<span class="pressure-tour__marker"></span>',
    iconSize: [30, 44],
    iconAnchor: [15, 40]
  });

const createPressureTourBoundaryLabel = (boundary) =>
  window.L.divIcon({
    className: "",
    html: `<span class="pressure-tour__municipio-tag pressure-tour__municipio-tag--${boundary.tone}">${boundary.label}</span>`,
    iconSize: null
  });

const setupPressureTour = () => {
  const mapElement = document.getElementById("pressureTourMap");
  const titleElement = document.getElementById("pressure-tour-title");
  const textElement = document.getElementById("pressureTourText");
  const counterElement = document.getElementById("pressureTourCounter");
  const prevButton = document.getElementById("pressureTourPrev");
  const nextButton = document.getElementById("pressureTourNext");
  const callout = document.getElementById("pressureTourCallout");
  const stepButtons = Array.from(document.querySelectorAll(".pressure-tour__step"));

  if (
    !mapElement ||
    !titleElement ||
    !textElement ||
    !counterElement ||
    !prevButton ||
    !nextButton ||
    !callout ||
    typeof window.L === "undefined"
  ) {
    return;
  }

  const map = window.L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: false
  });

  window.L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    attribution: "OpenStreetMap, CARTO"
  }).addTo(map);

  let activeIndex = 0;

  Promise.all([
    fetch(previewMetadataPaths[2023], { cache: "no-store" }).then((response) => response.json()),
    loadReserveTotalGeojson(),
    ...pressureTourBoundaries.map((boundary) => loadPressureTourBoundaryGeojson(boundary.source))
  ])
    .then(([previewMetadata, reserveGeojson, ...boundaryGeojsons]) => {
      const [west, south, east, north] = previewMetadata.bounds;
      const imageBounds = [
        [south, west],
        [north, east]
      ];

      const imageLayer = window.L.imageOverlay(`./generated/${previewMetadata.preview}`, imageBounds, {
        opacity: 0.97,
        interactive: false
      }).addTo(map);

      const boundaryLayers = pressureTourBoundaries.map((boundary, index) =>
        window.L.geoJSON(boundaryGeojsons[index], {
          style: {
            color: "#111111",
            weight: boundary.tone === "center" ? 2.8 : 2.4,
            opacity: 0.96,
            fillOpacity: 0,
            dashArray: null
          }
        }).addTo(map)
      );

      const boundaryLabels = pressureTourBoundaries.map((boundary) =>
        window.L.marker(boundary.labelMarker, {
          icon: createPressureTourBoundaryLabel(boundary),
          interactive: false,
          keyboard: false,
          zIndexOffset: 200
        }).addTo(map)
      );

      const reserveOutline = window.L.geoJSON(reserveGeojson, {
        style: {
          color: "#111111",
          weight: 2.8,
          fillOpacity: 0
        }
      }).addTo(map);

      imageLayer.bringToFront();
      boundaryLayers.forEach((layer) => layer.bringToFront());
      reserveOutline.bringToFront();

      pressureTourScenes.forEach((scene) => {
        window.L.marker(scene.marker, {
          icon: createPressureTourMarker()
        }).addTo(map);
      });

      const updateCalloutPosition = (scene) => {
        const point = map.latLngToContainerPoint(scene.marker);
        callout.style.left = `${point.x + scene.labelOffset.x}px`;
        callout.style.top = `${point.y + scene.labelOffset.y}px`;
      };

      const setScene = (index) => {
        const scene = pressureTourScenes[index];
        activeIndex = index;

        titleElement.textContent = scene.title;
        titleElement.classList.toggle("is-compact", scene.title.length > 24);
        textElement.textContent = scene.text;
        counterElement.textContent = `${index + 1} / ${pressureTourScenes.length}`;
        callout.innerHTML = scene.shortLabel;
        callout.classList.add("is-visible");

        stepButtons.forEach((button) => {
          button.classList.toggle("is-active", Number(button.dataset.step) === index);
        });

        prevButton.disabled = index === 0;
        nextButton.disabled = index === pressureTourScenes.length - 1;

        map.setView(scene.marker, scene.zoom, { animate: true });
        window.setTimeout(() => {
          map.invalidateSize({ pan: false, animate: false });
          updateCalloutPosition(scene);
        }, 220);
      };

      map.on("move zoom resize", () => {
        updateCalloutPosition(pressureTourScenes[activeIndex]);
      });

      prevButton.addEventListener("click", () => {
        if (activeIndex > 0) {
          setScene(activeIndex - 1);
        }
      });

      nextButton.addEventListener("click", () => {
        if (activeIndex < pressureTourScenes.length - 1) {
          setScene(activeIndex + 1);
        }
      });

      stepButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.step);
          if (!Number.isNaN(index)) {
            setScene(index);
          }
        });
      });

      upsertLeafletRasterMap({
        map,
        bounds: reserveOutline.getBounds(),
        rasterLayer: imageLayer,
        padding: 0.18,
        zoomOffset: 0
      });

      setScene(0);
    })
    .catch(() => {
      mapElement.innerHTML =
        "<p style=\"padding:1rem;color:#243;\">No se pudo cargar el recorrido de presión.</p>";
    });
};

const setupSettlementPressureMap = () => {
  const mapElement = document.getElementById("settlementPressureMap");

  if (!mapElement || typeof window.L === "undefined") {
    return;
  }

  const map = window.L.map(mapElement, {
    zoomControl: false,
    scrollWheelZoom: false
  });

  window.L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Esri" }
  ).addTo(map);

  map.createPane("settlementMarkers");
  map.getPane("settlementMarkers").style.zIndex = 640;
  map.createPane("settlementLabels");
  map.getPane("settlementLabels").style.zIndex = 650;

  Promise.allSettled([
    loadReserveTotalGeojson(),
    ...pressureTourBoundaries.map((boundary) => loadPressureTourBoundaryGeojson(boundary.source)),
    fetch("./data/centrospoblados.geojson", { cache: "no-store" })
      .then((response) => response.json())
      .catch(() => ({ type: "FeatureCollection", features: [] }))
  ])
    .then((results) => {
      try {
        const reserveGeojson = results[0]?.status === "fulfilled" ? results[0].value : null;
        const settlementsGeojson =
          results[results.length - 1]?.status === "fulfilled"
            ? results[results.length - 1].value
            : { type: "FeatureCollection", features: [] };
        const boundaryGeojsons = results
          .slice(1, 1 + pressureTourBoundaries.length)
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);

        let reserveOutline = null;

        if (reserveGeojson) {
          reserveOutline = window.L.geoJSON(reserveGeojson, {
            style: {
              color: "#ffe600",
              weight: 2.2,
              opacity: 0.96,
              fillOpacity: 0
            }
          }).addTo(map);
        }

        boundaryGeojsons.forEach((boundaryGeojson) => {
          try {
            window.L.geoJSON(boundaryGeojson, {
              style: {
                color: "#111111",
                weight: 2.2,
                opacity: 0.9,
                dashArray: "4 8",
                fillOpacity: 0
              }
            }).addTo(map);
          } catch (error) {
            console.error("No se pudo dibujar un límite municipal:", error);
          }
        });

        pressureTourBoundaries.forEach((boundary) => {
          try {
            window.L.marker(boundary.labelMarker, { opacity: 0 })
              .addTo(map)
              .bindTooltip(boundary.label, {
                permanent: true,
                direction: "center",
                className: "settlement-panel__label"
              });
          } catch (error) {
            console.error("No se pudo dibujar una etiqueta municipal:", error);
          }
        });

        const settlementFeatures = Array.isArray(settlementsGeojson?.features)
          ? settlementsGeojson.features.filter((feature) => {
              const coordinates = feature?.geometry?.coordinates;
              return (
                feature?.geometry?.type === "Point" &&
                Array.isArray(coordinates) &&
                coordinates.length >= 2 &&
                Number.isFinite(Number(coordinates[0])) &&
                Number.isFinite(Number(coordinates[1]))
              );
            })
          : [];

        const highlightedSettlements = new Set([
          "SANTA ROSA DEL SARA",
          "SAN JUAN DEL PIRAI",
          "SAN JUAN DEL CHORE",
          "MIRAFLORES",
          "MENONITA",
          "CINCO",
          "21 DE MARZO",
          "EL CARMEN",
          "SAN SALVADOR",
          "MONTERREY",
          "ESTRELLA DEL NORTE",
          "SOBERANIA",
          "RIO NUEVO",
          "SAN JORGE",
          "LA PLANCHADA",
          "LA ISLA",
          "LOS LIMOS",
          "PETA GRANDE",
          "LA VICTORIA",
          "PUEBLOS UNIDOS"
        ]);

        const settlementsLayer = window.L.geoJSON(
          {
            type: "FeatureCollection",
            features: settlementFeatures
          },
          {
            pane: "settlementMarkers",
            pointToLayer: (feature, latlng) => {
              const settlementName = normalizeSettlementName(feature.properties?.NOM_CEN_PO);
              const isHighlighted = highlightedSettlements.has(settlementName);

              return window.L.circleMarker(latlng, {
                radius: isHighlighted ? 6 : 4,
                color: isHighlighted ? "#fff5cf" : "rgba(255,245,225,0.92)",
                weight: isHighlighted ? 1.6 : 1,
                fillColor: isHighlighted ? "#f4c96b" : "#e4a14a",
                fillOpacity: 0.96
              });
            },
            onEachFeature: (feature, layer) => {
              const rawName = feature.properties?.NOM_CEN_PO || "Centro poblado";
              const settlementName = normalizeSettlementName(rawName);

              layer.bindPopup(`<strong>${rawName}</strong>`, {
                className: "settlement-panel__popup"
              });

              if (highlightedSettlements.has(settlementName)) {
                layer.bindTooltip(rawName, {
                  permanent: true,
                  direction: "right",
                  offset: [10, 0],
                  className: "settlement-panel__village-label",
                  pane: "settlementLabels"
                });
              }
            }
          }
        ).addTo(map);

        const mapBounds = window.L.latLngBounds([]);

        if (reserveOutline) {
          const reserveBounds = reserveOutline.getBounds();
          if (reserveBounds.isValid()) {
            mapBounds.extend(reserveBounds);
          }
        }

        const settlementBounds = settlementsLayer.getBounds();
        if (settlementBounds.isValid()) {
          mapBounds.extend(settlementBounds);
        }

        if (mapBounds.isValid()) {
          map.setView([-16.50, -64.50], 9.49);
        } else {
          map.setView([-16.50, -64.80], 9.499999);
        }
      } catch (error) {
        console.error("Fallo al construir settlementPressureMap:", error);
      }
    })
    .catch((error) => {
      console.error("No se pudo cargar el mapa territorial:", error);
      mapElement.innerHTML =
        "<p style=\"padding:1rem;color:#f4f0e5;\">No se pudo cargar el mapa territorial.</p>";
    });
};

const createChartNumberFormatter = (value) => {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return value.toFixed(0);
};

const createHectareLabel = (value) =>
  `${value.toLocaleString("es-BO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} ha`;

const setupResultsCharts = () => {
  if (typeof window.Chart === "undefined") {
    return;
  }

  const lineCanvas = document.getElementById("forestAgricultureChart");
  const stackedCanvas = document.getElementById("landUseStructureChart");
  const balanceCanvas = document.getElementById("changeBalanceChart");

  if (!lineCanvas || !stackedCanvas || !balanceCanvas) {
    return;
  }

  const years = ["1985", "1995", "2005", "2015", "2023"];

  window.Chart.defaults.color = "#d8d2c8";
  window.Chart.defaults.font.family = "\"Space Grotesk\", sans-serif";
  window.Chart.defaults.borderColor = "rgba(217, 201, 163, 0.12)";

  const sharedGrid = "rgba(217, 201, 163, 0.12)";
  const sharedTick = "#d8d2c8";
  const titleColor = "#f5f1e8";
  const sharedTooltip = {
    backgroundColor: "rgba(17, 19, 21, 0.96)",
    titleColor: "#f5f1e8",
    bodyColor: "#d8d2c8",
    borderColor: "rgba(217, 201, 163, 0.18)",
    borderWidth: 1,
    padding: 12
  };

  new window.Chart(lineCanvas, {
    type: "line",
    data: {
      labels: years,
      datasets: [
        {
          label: "Bosque",
          data: [490366.8, 541102.2, 468353.4, 376478.5, 327207.2],
          borderColor: "#4d6b3c",
          backgroundColor: "#4d6b3c",
          pointRadius: 4,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.25
        },
        {
          label: "Agricultura",
          data: [8341.7, 9598.1, 53969.6, 122137.6, 180221.7],
          borderColor: "#c96b2c",
          backgroundColor: "#c96b2c",
          pointRadius: 4,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.25
        },
        {
          label: "Bosque inundable",
          data: [391551.6, 313639.0, 327556.9, 330245.7, 322397.2],
          borderColor: "#6e8b5b",
          backgroundColor: "#6e8b5b",
          pointRadius: 4,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "left",
          labels: {
            color: sharedTick,
            boxWidth: 10,
            usePointStyle: true,
            pointStyle: "circle"
          }
        },
        title: {
          display: true,
          text: "Evolución del bosque y la agricultura en El Choré (1985-2023)",
          color: titleColor,
          align: "start",
          font: { size: 16, weight: "600" }
        },
        tooltip: {
          ...sharedTooltip,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${createHectareLabel(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: sharedTick },
          grid: { color: sharedGrid }
        },
        y: {
          ticks: {
            color: sharedTick,
            callback: (value) => createChartNumberFormatter(value)
          },
          title: {
            display: true,
            text: "Área (hectáreas)",
            color: titleColor
          },
          grid: { color: sharedGrid }
        }
      }
    }
  });

  new window.Chart(stackedCanvas, {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        { label: "Bosque", data: [49.0, 54.1, 46.8, 37.6, 32.7], backgroundColor: "#234b34" },
        { label: "Bosque inundable", data: [39.2, 31.4, 32.8, 33.0, 32.4], backgroundColor: "#4d6b3c" },
        { label: "Humedal", data: [0.6, 0.6, 0.8, 1.3, 1.0], backgroundColor: "#4f7081" },
        { label: "Herbazal", data: [6.6, 9.0, 9.9, 11.0, 10.1], backgroundColor: "#6e8b5b" },
        { label: "Agricultura", data: [1.0, 1.4, 5.4, 12.2, 18.0], backgroundColor: "#b8742a" },
        { label: "Pastura", data: [0.4, 0.5, 1.2, 1.3, 1.4], backgroundColor: "#d9c9a3" },
        { label: "Infraestructura urbana", data: [0.0, 0.0, 0.1, 0.1, 0.1], backgroundColor: "#9e2a2b" },
        { label: "Otros usos", data: [3.2, 3.0, 3.0, 3.5, 4.3], backgroundColor: "#6d6963" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "left",
          labels: {
            color: sharedTick,
            boxWidth: 12,
            usePointStyle: true,
            pointStyle: "rectRounded"
          }
        },
        title: {
          display: true,
          text: "Estructura de usos de suelo en la Reserva El Choré (1985-2023)",
          color: titleColor,
          align: "start",
          font: { size: 16, weight: "600" }
        },
        tooltip: {
          ...sharedTooltip,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} %`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: sharedTick },
          grid: { color: sharedGrid }
        },
        y: {
          stacked: true,
          min: 0,
          max: 100,
          ticks: {
            color: sharedTick,
            callback: (value) => `${value}%`
          },
          grid: { color: sharedGrid }
        }
      }
    }
  });

  new window.Chart(balanceCanvas, {
    type: "bar",
    data: {
      labels: [
        "Agricultura",
        "Herbazal",
        "Pastura",
        "Otra área natural sin vegetación",
        "Humedal",
        "Mosaico de usos",
        "Otra área antrópica sin vegetación",
        "Otra formación natural no forestal",
        "Infraestructura urbana",
        "Playa / duna / arena",
        "Minería",
        "No observado",
        "Río / lago",
        "Bosque inundable",
        "Bosque"
      ],
      datasets: [
        {
          label: "Cambio 1985-2023",
          data: [171900, 34700, 9400, 6400, 4400, 3300, 538.2, 432.7, 123.6, 108.1, 0.2, 0.2, -460.2, -67700, -163200],
          backgroundColor: [
            "#b8742a",
            "#8b7e56",
            "#d9c9a3",
            "#8f5f46",
            "#4f7081",
            "#b69461",
            "#9e2a2b",
            "#7b6247",
            "#7c1f21",
            "#a66f3b",
            "#5f7681",
            "#6d6963",
            "#405f74",
            "#4d6b3c",
            "#234b34"
          ]
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Pérdida de bosques y expansión agrícola en la Reserva El Choré (1985-2023)",
          color: titleColor,
          align: "start",
          font: { size: 16, weight: "600" }
        },
        tooltip: {
          ...sharedTooltip,
          callbacks: {
            label: (context) => createHectareLabel(context.parsed.x)
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: sharedTick,
            callback: (value) => createChartNumberFormatter(value)
          },
          grid: { color: sharedGrid }
        },
        y: {
          ticks: { color: sharedTick },
          grid: { color: sharedGrid }
        }
      }
    }
  });
};

window.addEventListener("resize", () => {
  registeredLeafletMaps.forEach((config) => {
    scheduleLeafletRasterRefresh(config);
  });
});

setupTimeline();
setupReveal();
window.addEventListener("load", setupReserveMap);
window.addEventListener("load", setupReserveDetailMap);
window.addEventListener("load", setupPreviewSidecarMap);
window.addEventListener("load", setupSwipeCompareMap);
window.addEventListener("load", setupPressureMapStory);
window.addEventListener("load", setupSettlementPressureMap);
window.addEventListener("load", setupPressureTour);
window.addEventListener("load", setupResultsCharts);
window.addEventListener("load", setupClosingPanorama);
