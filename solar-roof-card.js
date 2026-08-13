/**
 * Solar Roof Card
 * Vizualizacia strechy so solarnymi panelmi (Tigo optimizers), vykonom a polohou slnka.
 * Obsahuje vizualny editor konfiguracie, prisposobenie velkosti, klik na panel
 * -> more-info dialog, detekciu anomalii, indikaciu offline/neaktualnych senzorov
 * a konfigurovatelne farebne prahy.
 *
 * Repo: https://github.com/<tvoj-github>/solar-roof-card
 */

// Deterministicke pozicie hviezd (aby sa pri kazdom prekresleni nemenili nahodne)
const STAR_POSITIONS = (() => {
  const pts = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 32; i++) {
    pts.push({ x: rand(), y: rand(), r: 0.6 + rand() * 1.3, o: 0.25 + rand() * 0.6 });
  }
  return pts;
})();

// Uhly pre luce slnka
const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => (d * Math.PI) / 180);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseColorToRgb(str) {
  if (!str) return [128, 128, 128];
  const s = String(str).trim();
  if (s.startsWith("#")) return hexToRgb(s);
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }
  return [128, 128, 128];
}

function lerpColor(c1, c2, t) {
  const [r1, g1, b1] = parseColorToRgb(c1);
  const [r2, g2, b2] = parseColorToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

class SolarRoofCard extends HTMLElement {
  static getStubConfig() {
    return { type: "custom:solar-roof-card" };
  }

  static getConfigElement() {
    return document.createElement("solar-roof-card-editor");
  }

  static getLayoutOptions() {
    return {
      grid_columns: 6,
      grid_rows: 8,
      grid_min_columns: 3,
      grid_min_rows: 4,
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Neplatna konfiguracia karty");
    }

    const defaults = {
      entity_prefix: "sensor.tigo_pv_",
      sun_entity: "sun.sun",
      display_mode_entity: "input_select.panel_display_mode",
      total_power_entity: "sensor.strecha_celkovo_vykon",
      east_power_entity: "sensor.strecha_vychod_vykon",
      south_power_entity: "sensor.strecha_juh_vykon",
      west_power_entity: "sensor.strecha_zapad_vykon",
      visual_max_power: 10000,
      panel_max_power: 530,
      show_chips: true,
      title: "",
      fill_height: false,
      height: null,
      max_width: null,
      min_width: "1100px",

      show_legend: true,
      sky_gradient: true,

      anomaly_detection: true,
      anomaly_threshold_ratio: 0.5,
      anomaly_min_total_power: 300,
      stale_minutes: 30,

      temp_cold_max: 5,
      temp_warm_max: 12,
      temp_hot_max: 19,
      temp_color_cold: "#00bfff",
      temp_color_warm: "#ffd700",
      temp_color_hot: "#ff8c42",
      temp_color_extreme: "#ff0000",

      power_color_zero: "#6c757d",
      power_color_min: "#0a3d0a",
      power_color_max: "#00ff00",

      roof: { width_mm: 17200, height_mm: 11700, ridge_mm: 5500 },
      panel: { width_mm: 2094, height_mm: 1134 },
      names: {
        W: ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"],
        S: [
          "A7", "A6", "A5", "A4", "A3", "A2", "A1",
          "A15", "A14", "A13", "A12", "A11", "A10", "A9", "A8",
        ],
        E: ["B9", "B10", "B11", "B12", "B13", "B14", "B15", "B16", "B17"],
      },
      layout: {
        W: [
          [0.55, 0.46], [0.55, 0.55], [0.25, 0.28], [0.25, 0.37],
          [0.25, 0.46], [0.25, 0.55], [0.25, 0.64], [0.25, 0.73],
        ],
        S: [
          [0.28, 0.51], [0.34, 0.51], [0.40, 0.51], [0.46, 0.51],
          [0.52, 0.51], [0.58, 0.51], [0.64, 0.51],
          [0.28, 0.2], [0.34, 0.2], [0.40, 0.2], [0.46, 0.2],
          [0.52, 0.2], [0.58, 0.2], [0.64, 0.2], [0.70, 0.2],
        ],
        E: [
          [0.83, 0.73], [0.83, 0.64], [0.83, 0.55], [0.83, 0.46],
          [0.83, 0.37], [0.83, 0.28], [0.52, 0.60], [0.52, 0.51], [0.52, 0.42],
        ],
      },
      max_panel_counts: { E: 8, S: 15, W: 9 },
    };

    this._config = this._deepMerge(defaults, config);

    if (!this._built) {
      this._buildDom();
      this._built = true;
    }
    this._applySizing();
    this._renderChips();
  }

  _deepMerge(base, override) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const key in override) {
      if (
        override[key] &&
        typeof override[key] === "object" &&
        !Array.isArray(override[key]) &&
        base[key] &&
        typeof base[key] === "object" &&
        !Array.isArray(base[key])
      ) {
        out[key] = this._deepMerge(base[key], override[key]);
      } else {
        out[key] = override[key];
      }
    }
    return out;
  }

  set hass(hass) {
    this._hass = hass;
    this._renderSvg();
  }

  getCardSize() {
    return this._config?.fill_height ? 10 : 8;
  }

  _buildDom() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          background: var(--ha-card-background, var(--card-background-color, black));
          overflow: hidden; padding: 8px 8px 12px;
          display: flex; flex-direction: column;
          height: var(--srcard-card-height, auto);
          box-sizing: border-box;
          border-radius: var(--ha-card-border-radius, 12px);
        }
        .title {
          color: var(--primary-text-color, white); font-size: 16px;
          padding: 4px 8px 8px; flex: 0 0 auto;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 4px 8px; flex: 0 0 auto; }
        .chip {
          display: flex; align-items: center; gap: 4px;
          background: var(--secondary-background-color, #1c1c1c);
          color: var(--secondary-text-color, #ddd);
          border: 1px solid var(--divider-color, #333);
          border-radius: 14px; padding: 4px 10px; font-size: 12px;
          cursor: pointer; user-select: none;
        }
        .chip.active {
          background: var(--primary-color, #ffb64c);
          color: var(--text-primary-color, #111);
          border-color: var(--primary-color, #ffb64c);
        }
        .chip:hover { filter: brightness(1.15); }
        .svg-wrap {
          width: 100%;
          flex: var(--srcard-wrap-flex, 0 1 auto);
          min-height: 0;
          display: flex; align-items: center; justify-content: center;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .svg-wrap svg {
          width: 100%;
          min-width: var(--srcard-min-width, 0);
          height: var(--srcard-svg-height, auto);
          max-width: var(--srcard-max-width, none);
          border-radius: 12px;
          opacity: 1;
        }
        .svg-wrap svg [data-entity] { cursor: pointer; }
        .svg-wrap svg [data-entity]:hover rect { filter: brightness(1.3); }
      </style>
      <ha-card>
        <div class="title"></div>
        <div class="chips"></div>
        <div class="svg-wrap"></div>
      </ha-card>
    `;
    this._titleEl = this.shadowRoot.querySelector(".title");
    this._chipsEl = this.shadowRoot.querySelector(".chips");
    this._svgWrap = this.shadowRoot.querySelector(".svg-wrap");

    this._chipsEl.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".chip");
      if (!chip) return;
      this._setDisplayMode(chip.dataset.mode);
    });

    this._svgWrap.addEventListener("click", (ev) => {
      const target = ev.target.closest("[data-entity]");
      if (!target) return;
      const entityId = target.getAttribute("data-entity");
      if (!entityId || !this._hass?.states[entityId]) return;
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          detail: { entityId },
          bubbles: true,
          composed: true,
        })
      );
    });
  }

  _applySizing() {
    const cfg = this._config;
    this.style.setProperty("--srcard-max-width", cfg.max_width || "none");
    this.style.setProperty("--srcard-min-width", cfg.min_width || "0");

    if (cfg.height) {
      this.style.height = cfg.height;
      this.style.setProperty("--srcard-card-height", "100%");
      this.style.setProperty("--srcard-wrap-flex", "1 1 auto");
      this.style.setProperty("--srcard-svg-height", "100%");
    } else if (cfg.fill_height) {
      this.style.height = "100%";
      this.style.setProperty("--srcard-card-height", "100%");
      this.style.setProperty("--srcard-wrap-flex", "1 1 auto");
      this.style.setProperty("--srcard-svg-height", "100%");
    } else {
      this.style.height = "";
      this.style.setProperty("--srcard-card-height", "auto");
      this.style.setProperty("--srcard-wrap-flex", "0 1 auto");
      this.style.setProperty("--srcard-svg-height", "auto");
    }
  }

  _setDisplayMode(mode) {
    if (!this._hass) return;
    this._hass.callService("input_select", "select_option", {
      entity_id: this._config.display_mode_entity,
      option: mode,
    });
  }

  _renderChips() {
    this._titleEl.textContent = this._config.title || "";
    this._titleEl.style.display = this._config.title ? "block" : "none";

    if (!this._config.show_chips) {
      this._chipsEl.style.display = "none";
      return;
    }
    this._chipsEl.style.display = "flex";

    const modes = [
      { key: "power", icon: "\u2600\uFE0F", label: "Watts" },
      { key: "temp", icon: "\uD83C\uDF21\uFE0F", label: "Teplota" },
      { key: "duty_cycle", icon: "%", label: "Duty" },
      { key: "current", icon: "\u26A1", label: "Prud" },
      { key: "rssi", icon: "\uD83D\uDCF6", label: "RSSI" },
      { key: "voltage_in", icon: "\uD83D\uDD0C", label: "Vin" },
      { key: "voltage_out", icon: "\uD83D\uDD0C", label: "Vout" },
    ];

    const activeMode =
      this._hass?.states[this._config.display_mode_entity]?.state || "power";

    this._chipsEl.innerHTML = modes
      .map(
        (m) => `
          <div class="chip ${m.key === activeMode ? "active" : ""}" data-mode="${m.key}">
            <span>${m.icon}</span><span>${m.label}</span>
          </div>`
      )
      .join("");
  }

  _renderSvg() {
    if (!this._hass || !this._config) return;
    this._renderChips();

    const newMode =
      this._hass.states[this._config.display_mode_entity]?.state || "power";
    const modeChanged = this._lastMode !== undefined && this._lastMode !== newMode;
    this._lastMode = newMode;

    const html = this._buildSvg();

    if (modeChanged) {
      this._svgWrap.style.transition = "opacity 0.18s ease";
      this._svgWrap.style.opacity = "0";
      clearTimeout(this._fadeTimer);
      this._fadeTimer = setTimeout(() => {
        this._svgWrap.innerHTML = html;
        requestAnimationFrame(() => {
          this._svgWrap.style.opacity = "1";
        });
      }, 160);
    } else {
      this._svgWrap.innerHTML = html;
    }
  }

  _getEntityStatus(entityId) {
    const st = this._hass.states[entityId];
    if (!st) return "missing";
    if (st.state === "unavailable" || st.state === "unknown") return "unavailable";
    const staleMinutes = this._config.stale_minutes;
    if (staleMinutes > 0 && st.last_updated) {
      const ageMin = (Date.now() - new Date(st.last_updated).getTime()) / 60000;
      if (ageMin > staleMinutes) return "stale";
    }
    return "ok";
  }

  _buildSvg() {
    const states = this._hass.states;
    const cfg = this._config;
    const self = this;

    const panel = { w: cfg.panel.width_mm, h: cfg.panel.height_mm };
    const ridge_mm = cfg.roof.ridge_mm;
    const dims = { width: cfg.roof.width_mm, height: cfg.roof.height_mm };

    const tilePatternLight = `
      <pattern id="roofTileLight" patternUnits="userSpaceOnUse" width="20" height="20">
        <rect x="0" y="0" width="20" height="20" fill="#80502e"/>
        <path d="M0,10 L20,10 M10,0 L10,20" stroke="#261910" stroke-width="1"/>
      </pattern>`;
    const tilePatternDark = `
      <pattern id="roofTileDark" patternUnits="userSpaceOnUse" width="20" height="20">
        <rect x="0" y="0" width="20" height="20" fill="#5C3A21"/>
        <path d="M0,10 L20,10 M10,0 L10,20" stroke="#261910" stroke-width="1"/>
      </pattern>`;

    const planeColors = {
      S: "url(#roofTileDark)",
      E: "url(#roofTileLight)",
      W: "url(#roofTileLight)",
      N: "url(#roofTileDark)",
    };

    const names = cfg.names;
    const layout = cfg.layout;

    const W = 1200;
    const H = 1100;
    const margin = 100;
    const drawW = W - margin * 2;
    const drawH = H - margin * 2;
    const scale = Math.min(drawW / dims.width, drawH / dims.height) * 0.7;

    const bw = dims.width * scale;
    const bh = dims.height * scale;

    const cx = W / 2 - 20;
    const cy = H / 2 + 10;

    const left = cx - bw / 2;
    const right = cx + bw / 2;
    const top = cy - bh / 2;
    const bottom = cy + bh / 2;

    const ridge_px = ridge_mm * scale;
    const ridgeL = { x: cx - ridge_px / 2, y: cy };
    const ridgeR = { x: cx + ridge_px / 2, y: cy };

    const pLT = { x: left, y: top };
    const pRT = { x: right, y: top };
    const pRB = { x: right, y: bottom };
    const pLB = { x: left, y: bottom };

    const planes = {
      S: { pts: [pLT, pRT, ridgeR, ridgeL], color: planeColors.S },
      N: { pts: [pRB, pLB, ridgeL, ridgeR], color: "#21201f" },
      E: { pts: [pRT, ridgeR, pRB], color: planeColors.E },
      W: { pts: [pLT, pLB, ridgeL], color: planeColors.W },
    };

    const panelScale = 0.8;
    const panel_px = {
      w: panel.h * scale * panelScale,
      h: panel.w * scale * panelScale,
    };

    const bbox = (pts) => {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        minx: Math.min(...xs),
        miny: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    };

    const pointInPoly = (pt, vs) => {
      let inside = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].x, yi = vs[i].y;
        const xj = vs[j].x, yj = vs[j].y;
        const intersect =
          yi > pt.y !== yj > pt.y &&
          pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };

    const getTempColor = (temp) => {
      if (temp <= cfg.temp_cold_max) return cfg.temp_color_cold;
      if (temp <= cfg.temp_warm_max) return cfg.temp_color_warm;
      if (temp <= cfg.temp_hot_max) return cfg.temp_color_hot;
      return cfg.temp_color_extreme;
    };

    const getPowerColor = (power) => {
      if (power <= 0) return cfg.power_color_zero;
      const ratio = Math.min(power / cfg.panel_max_power, 1);
      return lerpColor(cfg.power_color_min, cfg.power_color_max, ratio);
    };

    const unitsMap = {
      power: "W", duty_cycle: "%", temp: "\u00B0C", current: "A",
      rssi: "dB", voltage_in: "V", voltage_out: "V",
    };
    const suffixMap = {
      power: "power", duty_cycle: "duty_cycle", temp: "temperature",
      current: "current_in", rssi: "rssi", voltage_in: "voltage_in", voltage_out: "voltage_out",
    };

    const allPanelNames = [...names.W, ...names.S, ...names.E];

    const computeAnomalySet = (mode) => {
      const set = new Set();
      if (mode !== "power" || !cfg.anomaly_detection) return set;
      const vals = allPanelNames.map((nm) => {
        const id = `${cfg.entity_prefix}${nm.toLowerCase()}_power`;
        const st = states[id];
        if (!st || st.state === "unavailable" || st.state === "unknown") return null;
        const v = Number(st.state);
        return isNaN(v) ? null : v;
      });
      const validVals = vals.filter((v) => v !== null && v > 0);
      const total = validVals.reduce((a, b) => a + b, 0);
      if (validVals.length > 0 && total >= cfg.anomaly_min_total_power) {
        const mean = total / validVals.length;
        allPanelNames.forEach((nm, i) => {
          const v = vals[i];
          if (v !== null && v < mean * cfg.anomaly_threshold_ratio) {
            set.add(nm);
          }
        });
      }
      return set;
    };

    const panelsForPlane = (id, mode, anomalySet) => {
      const pl = planes[id];
      const pts = pl.pts;
      const box = bbox(pts);
      const ids = names[id] || [];
      const pos = layout[id] || [];
      const rects = [];

      for (let i = 0; i < ids.length; i++) {
        const nm = ids[i];
        const norm = pos[i];
        if (!norm) continue;

        const cxP = box.minx + norm[0] * box.w;
        const cyP = box.miny + norm[1] * box.h;

        let x = cxP - panel_px.w / 2;
        let y = cyP - panel_px.h / 2;

        if (!pointInPoly({ x: cxP, y: cyP }, pts)) {
          const centroid = {
            x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
            y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
          };
          x = (cxP + centroid.x) / 2 - panel_px.w / 2;
          y = (cyP + centroid.y) / 2 - panel_px.h / 2;
        }

        const rotate = nm.startsWith("B") ? 90 : 0;
        const cxRect = x + panel_px.w / 2;
        const cyRect = y + panel_px.h / 2;

        const key = nm.toLowerCase();
        const suffix = suffixMap[mode];
        const entityId = `${cfg.entity_prefix}${key}_${suffix}`;
        const status = self._getEntityStatus(entityId);

        let value = "?";
        let unit = unitsMap[mode];
        let bgColor = "#0b0b0b";
        let textColor = "#ffffff";
        let strokeColor = "rgba(255,255,255,0.08)";
        let strokeWidth = 1;
        let strokeDasharray = "";
        let overlayText = "";

        if (status === "unavailable" || status === "missing") {
          overlayText = "\u26A0";
          strokeColor = "#ff5252";
          strokeDasharray = "4,3";
          textColor = "#ff8a80";
        } else if (status === "stale") {
          overlayText = "\u23F1";
          strokeColor = "#ffb300";
          strokeDasharray = "4,3";
          textColor = "#ffcc80";
        } else {
          const raw = Number(states[entityId].state);
          if (isNaN(raw)) {
            overlayText = "?";
          } else {
            value = Math.round(raw);
            switch (mode) {
              case "power":
                bgColor = getPowerColor(raw);
                break;
              case "duty_cycle":
                textColor = "#ffb84c";
                break;
              case "temp":
                textColor = getTempColor(raw);
                break;
              case "current":
                textColor = "#4fc3f7";
                break;
              case "rssi":
                textColor = "#ff80ab";
                break;
              case "voltage_in":
                textColor = "#ffee58";
                break;
              case "voltage_out":
                textColor = "#ffd54f";
                break;
            }
          }
        }

        const isAnomaly = mode === "power" && status === "ok" && anomalySet.has(nm);
        if (isAnomaly) {
          strokeColor = "#ff1744";
          strokeWidth = 2.5;
          strokeDasharray = "";
        }

        rects.push(`
          <g data-entity="${entityId}">
            <rect x="${x}" y="${y}" width="${panel_px.w}" height="${panel_px.h}"
              rx="3" ry="3"
              fill="${mode === "power" ? bgColor : "#0b0b0b"}"
              stroke="${strokeColor}"
              stroke-width="${strokeWidth}"
              ${strokeDasharray ? `stroke-dasharray="${strokeDasharray}"` : ""}
              transform="rotate(${rotate},${cxRect},${cyRect})">${
                isAnomaly
                  ? `<animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/>`
                  : ""
              }</rect>
            <text x="${cxRect}" y="${cyRect - 1}" fill="white" text-anchor="middle" font-size="10">${nm}</text>
            <text x="${cxRect}" y="${cyRect + 8}" fill="${textColor}" text-anchor="middle" font-size="9">${overlayText || `${value}${unit}`}</text>
          </g>`);
      }
      return rects.join("");
    };

    const displayMode = states[cfg.display_mode_entity]?.state || "power";
    const anomalySet = computeAnomalySet(displayMode);

    const svgPlanes = Object.keys(planes)
      .map((id) => {
        const pl = planes[id];
        const poly = pl.pts.map((p) => `${p.x},${p.y}`).join(" ");
        return `<g id="plane_${id}">
          <polygon points="${poly}" fill="${pl.color}" stroke="none"/>
          ${panelsForPlane(id, displayMode, anomalySet)}
        </g>`;
      })
      .join("");

    const chimney = `<g><rect x="${cx - 240}" y="${cy - 180}" width="40" height="40" fill="#3a3a3a" stroke="#111" stroke-width="2" rx="3"/></g>`;

    const sunState = states[cfg.sun_entity];
    const isDay = sunState?.state === "above_horizon";
    const elevation = Number(sunState?.attributes?.elevation);

    let skyStops;
    if (!isDay) {
      skyStops = ["#02040a", "#0c1c33"];
    } else if (!isNaN(elevation) && elevation < 8) {
      skyStops = ["#3a2a52", "#c9663f"];
    } else {
      skyStops = ["#123047", "#1f5673"];
    }

    const rx = bw * 0.7;
    const ry = bh * 1.05;
    const roofOffset = 20;
    const az = Number(sunState?.attributes?.azimuth) || 180;
    const relAz = ((az - roofOffset) * Math.PI) / 180;
    const sunX = cx - rx * Math.sin(relAz);
    const sunY = cy + ry * Math.cos(relAz);

    const dx = cx - 230 - sunX;
    const dy = cy - 180 - sunY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const sx = dx / len;
    const sy = dy / len;
    const shadowLength = 80;
    const chimneySize = 30;
    const chX = cx - 240;
    const chY = cy - 160;

    const shadow = `<polygon points="
        ${chX},${chY}
        ${chX + chimneySize},${chY}
        ${chX + chimneySize + sx * shadowLength},${chY + sy * shadowLength}
        ${chX + sx * shadowLength},${chY + sy * shadowLength}
      " fill="rgba(0,0,0,0.25)" filter="blur(2px)"/>`;

    const sunPath = `<path d="
        M ${cx - rx} ${cy}
        A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}
        A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}
      " stroke="#ffb64c33" fill="none"/>`;

    const skyRect = cfg.sky_gradient
      ? `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#skyGrad)"/>`
      : "";

    const starDots = cfg.sky_gradient && !isDay
      ? STAR_POSITIONS.map(
          (s) => `<circle cx="${s.x * W}" cy="${s.y * H * 0.55}" r="${s.r}" fill="#fff" opacity="${s.o}"/>`
        ).join("")
      : "";

    const celestialBody = isDay
      ? `<g transform="translate(${sunX},${sunY})">
           <g>
             <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="90s" repeatCount="indefinite"/>
             ${RAY_ANGLES.map(
               (a) =>
                 `<line x1="0" y1="0" x2="${(Math.cos(a) * 34).toFixed(1)}" y2="${(Math.sin(a) * 34).toFixed(1)}" stroke="#ffcf7a" stroke-width="1.5" opacity="0.35"/>`
             ).join("")}
           </g>
           <circle r="20" fill="url(#sunGrad)"/>
           <circle r="10" fill="#fff8d6">
             <animate attributeName="r" values="9;11;9" dur="2.4s" repeatCount="indefinite"/>
           </circle>
         </g>`
      : `<g transform="translate(${sunX},${sunY})">
           <circle r="14" fill="#e9edf5"/>
           <circle r="14" cx="6" cy="-4" fill="${skyStops[1]}"/>
           <circle cx="-4" cy="3" r="1.6" fill="#c9d2e0" opacity="0.7"/>
           <circle cx="3" cy="6" r="1.1" fill="#c9d2e0" opacity="0.6"/>
         </g>`;

    const compassOpacity = displayMode === "power" ? 0.4 : 0.9;
    const customTexts = [
      { text: "V\u00FDchod", x: 200, y: 565 },
      { text: "Juh", x: 570, y: 300 },
      { text: "Z\u00E1pad", x: 960, y: 565 },
    ];
    const svgTexts = customTexts
      .map(
        (t) =>
          `<text x="${t.x}" y="${t.y}" fill="#ffb64c" fill-opacity="${compassOpacity}" font-size="14" text-anchor="middle" dominant-baseline="middle">${t.text}</text>`
      )
      .join("");

    const labels = {
      temp: "Teplota panelov \u00B0C",
      voltage_in: "Volty V in",
      voltage_out: "Volty V out",
      current: "Pr\u00FAd A",
      duty_cycle: "Duty cycle %",
      rssi: "RSSI dB",
    };
    const displayText = labels[displayMode] || "";
    const NText = `<text x="580" y="660" fill="#f7f7f2" font-size="16" text-anchor="middle" dominant-baseline="middle">${displayText}</text>`;

    const celkovoVal = Number(states[cfg.total_power_entity]?.state) || 0;
    const vychodVal = Number(states[cfg.east_power_entity]?.state) || 0;
    const juhVal = Number(states[cfg.south_power_entity]?.state) || 0;
    const zapadVal = Number(states[cfg.west_power_entity]?.state) || 0;

    const maxEastPower = cfg.max_panel_counts.E * cfg.panel_max_power;
    const maxSouthPower = cfg.max_panel_counts.S * cfg.panel_max_power;
    const maxWestPower = cfg.max_panel_counts.W * cfg.panel_max_power;
    const visualMaxPower = cfg.visual_max_power;

    const fillRatio = Math.min(celkovoVal / visualMaxPower, 1);
    const percentPower = Math.round(fillRatio * 100);

    const getBarColor = (power) => {
      const gold = [255, 193, 7];
      const orange = [255, 152, 0];
      const deep = [255, 111, 0];
      const t = Math.min(power / visualMaxPower, 1);
      let r, g, b;
      if (t < 0.5) {
        const k = t / 0.5;
        r = gold[0] + (orange[0] - gold[0]) * k;
        g = gold[1] + (orange[1] - gold[1]) * k;
        b = gold[2] + (orange[2] - gold[2]) * k;
      } else {
        const k = (t - 0.5) / 0.5;
        r = orange[0] + (deep[0] - orange[0]) * k;
        g = orange[1] + (deep[1] - orange[1]) * k;
        b = orange[2] + (deep[2] - orange[2]) * k;
      }
      return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    };

    const barColor = getBarColor(fillRatio * visualMaxPower);
    const barWidth = 250;
    const barHeight = 30;
    const barX = 450;
    const barY = 680;

    const barGraph = `
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#333" rx="6" ry="6"/>
      <rect x="${barX}" y="${barY}" width="${fillRatio * barWidth}" height="${barHeight}" fill="${barColor}" rx="6" ry="6" filter="url(#glow)">
        ${
          celkovoVal >= visualMaxPower
            ? `<animate attributeName="opacity" values="0.6;1;0.6" dur="3.0s" repeatCount="indefinite"/>
               <animateTransform attributeName="transform" type="scale" values="1;1.02;1" dur="3.0s" repeatCount="indefinite"/>`
            : ""
        }
      </rect>
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="url(#energyFlow)" opacity="0.8"/>
      <text x="${barX + barWidth / 2}" y="${barY + barHeight - 11}" fill="#fff" font-size="12" text-anchor="middle">
        ${celkovoVal >= visualMaxPower ? "100%+" : percentPower + "%"}
      </text>`;

    const vychodPercent = Math.round((vychodVal / maxEastPower) * 100) || 0;
    const juhPercent = Math.round((juhVal / maxSouthPower) * 100) || 0;
    const zapadPercent = Math.round((zapadVal / maxWestPower) * 100) || 0;

    let SensorInfo = "";
    if (displayMode === "power") {
      SensorInfo = `
        <text x="100" y="570" fill="#8ce99a" font-size="16" text-anchor="start">
          V\u00FDchod: ${vychodVal} W
          <tspan x="150" dy="20">(${vychodPercent}%)</tspan>
        </text>
        <text x="500" y="300" fill="#ffd54f" font-size="16" text-anchor="start">
          Juh: ${juhVal} W (${juhPercent}%)
        </text>
        <text x="960" y="570" fill="#ff8c42" font-size="16" text-anchor="start">
          Z\u00E1pad: ${zapadVal} W
          <tspan x="1000" dy="20">(${zapadPercent}%)</tspan>
        </text>
        <text x="460" y="660" fill="#00b7ff" font-size="16" text-anchor="start">
          Celkov\u00FD v\u00FDkon panelov: ${celkovoVal} W
        </text>`;
    }

    let legend = "";
    if (cfg.show_legend) {
      let legendContent = "";
      if (displayMode === "power") {
        legendContent = `
          <text x="0" y="0" fill="#ddd" font-size="11">V\u00FDkon panelu</text>
          <rect x="0" y="8" width="130" height="9" rx="3" fill="url(#legendPowerGrad)"/>
          <text x="0" y="30" fill="#999" font-size="9">0W</text>
          <text x="130" y="30" fill="#999" font-size="9" text-anchor="end">${cfg.panel_max_power}W+</text>`;
      } else if (displayMode === "temp") {
        const items = [
          { c: cfg.temp_color_cold, l: `\u2264${cfg.temp_cold_max}\u00B0C` },
          { c: cfg.temp_color_warm, l: `\u2264${cfg.temp_warm_max}\u00B0C` },
          { c: cfg.temp_color_hot, l: `\u2264${cfg.temp_hot_max}\u00B0C` },
          { c: cfg.temp_color_extreme, l: `>${cfg.temp_hot_max}\u00B0C` },
        ];
        legendContent = items
          .map(
            (it, i) => `
              <rect x="${i * 65}" y="6" width="12" height="12" rx="2" fill="${it.c}"/>
              <text x="${i * 65 + 16}" y="16" fill="#999" font-size="9">${it.l}</text>`
          )
          .join("");
      }
      const statusY = displayMode === "power" || displayMode === "temp" ? 46 : 8;
      legend = `<g transform="translate(40,${H - 74})">
        ${legendContent}
        <text x="0" y="${statusY}" fill="#999" font-size="9">\u26A0 nedostupn\u00E9    \u23F1 neaktu\u00E1lne</text>
      </g>`;
    }

    return `
      <svg viewBox="0 0 ${W} ${H}">
        <defs>
          <filter id="glow">
            <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#00d4ff" flood-opacity="0.45"/>
          </filter>
          <linearGradient id="energyFlow" gradientUnits="userSpaceOnUse" x1="0" x2="100">
            <stop offset="0%" stop-color="transparent"/>
            <stop offset="50%" stop-color="rgba(255,255,255,0.5)"/>
            <stop offset="100%" stop-color="transparent"/>
            <animateTransform attributeName="gradientTransform" type="translate" from="-100 0" to="200 0" dur="1.2s" repeatCount="indefinite"/>
          </linearGradient>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${skyStops[0]}"/>
            <stop offset="100%" stop-color="${skyStops[1]}"/>
          </linearGradient>
          <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#fff6c0"/>
            <stop offset="55%" stop-color="#ffb64c"/>
            <stop offset="100%" stop-color="#ff8a3d" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="legendPowerGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${cfg.power_color_min}"/>
            <stop offset="100%" stop-color="${cfg.power_color_max}"/>
          </linearGradient>
          ${tilePatternLight}
          ${tilePatternDark}
        </defs>
        ${skyRect}
        ${starDots}
        ${svgPlanes}
        ${chimney}
        ${shadow}
        ${sunPath}
        ${celestialBody}
        ${svgTexts}
        ${NText}
        ${SensorInfo}
        ${barGraph}
        ${legend}
      </svg>`;
  }
}

customElements.define("solar-roof-card", SolarRoofCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "solar-roof-card",
  name: "Solar Roof Card",
  description:
    "Vizualizacia strechy so solarnymi panelmi, vykonom a polohou slnka (Tigo optimizers).",
});

/**
 * Vizualny editor konfiguracie karty.
 * Pokrocile veci (rozmery strechy, layout panelov, nazvy) sa nastavuju len
 * cez YAML rezim (ikona editora kodu v hornej casti dialogu Upravit kartu).
 */
class SolarRoofCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...(config || {}) };
    if (!this._built) {
      this._buildForm();
      this._built = true;
    }
    if (this._hass) {
      this._fillDatalists();
    }
    this._fillValues();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built && this.shadowRoot) {
      this._fillDatalists();
    }
  }

  _fireChanged() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _set(key, value, isNumber) {
    const cfg = { ...this._config };
    if (value === "" || value === undefined || value === null) {
      delete cfg[key];
    } else {
      cfg[key] = isNumber ? Number(value) : value;
    }
    this._config = cfg;
    this._fireChanged();
  }

  _setBool(key, value) {
    this._config = { ...this._config, [key]: value };
    this._fireChanged();
  }

  _buildForm() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        .wrap { display: flex; flex-direction: column; gap: 12px; padding: 8px 0 16px; }
        .section-title {
          font-weight: 600; margin-top: 8px; font-size: 13px; opacity: 0.75;
          text-transform: uppercase; letter-spacing: .02em;
        }
        .row { display: flex; flex-direction: column; gap: 4px; }
        .row.inline { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; }
        label { font-size: 13px; color: var(--primary-text-color, #fff); }
        input[type="text"], input[type="number"] {
          padding: 8px; border-radius: 6px; border: 1px solid var(--divider-color, #444);
          background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color, #fff);
          font-size: 14px; box-sizing: border-box; width: 100%;
        }
        input[type="checkbox"] { width: 20px; height: 20px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .hint { font-size: 11px; opacity: 0.6; line-height: 1.4; }
      </style>
      <div class="wrap">
        <div class="section-title">Zakladne</div>
        <div class="row">
          <label>Titulok</label>
          <input type="text" data-key="title" placeholder="(ziadny)">
        </div>
        <div class="row inline">
          <label>Zobrazit prepinac rezimov (chipy)</label>
          <input type="checkbox" data-key="show_chips" data-bool="1">
        </div>

        <div class="section-title">Entity</div>
        <div class="row">
          <label>Prefix entit panelov</label>
          <input type="text" data-key="entity_prefix" placeholder="sensor.tigo_pv_">
        </div>
        <div class="row">
          <label>Entita slnka</label>
          <input type="text" data-key="sun_entity" list="dl-sun" placeholder="sun.sun">
        </div>
        <div class="row">
          <label>Entita rezimu zobrazenia (input_select)</label>
          <input type="text" data-key="display_mode_entity" list="dl-input_select" placeholder="input_select.panel_display_mode">
        </div>
        <div class="row">
          <label>Celkovy vykon</label>
          <input type="text" data-key="total_power_entity" list="dl-sensor" placeholder="sensor.strecha_celkovo_vykon">
        </div>
        <div class="grid2">
          <div class="row">
            <label>Vykon Vychod</label>
            <input type="text" data-key="east_power_entity" list="dl-sensor" placeholder="sensor.strecha_vychod_vykon">
          </div>
          <div class="row">
            <label>Vykon Juh</label>
            <input type="text" data-key="south_power_entity" list="dl-sensor" placeholder="sensor.strecha_juh_vykon">
          </div>
        </div>
        <div class="row">
          <label>Vykon Zapad</label>
          <input type="text" data-key="west_power_entity" list="dl-sensor" placeholder="sensor.strecha_zapad_vykon">
        </div>

        <div class="section-title">Vykonove limity</div>
        <div class="grid2">
          <div class="row">
            <label>Max. vykon panelu (W)</label>
            <input type="number" data-key="panel_max_power" placeholder="530">
          </div>
          <div class="row">
            <label>Skala progress baru (W)</label>
            <input type="number" data-key="visual_max_power" placeholder="10000">
          </div>
        </div>

        <div class="section-title">Farby - teplota</div>
        <div class="grid2">
          <div class="row">
            <label>Hranica studena (C)</label>
            <input type="number" data-key="temp_cold_max" placeholder="5">
          </div>
          <div class="row">
            <label>Hranica tepla (C)</label>
            <input type="number" data-key="temp_warm_max" placeholder="12">
          </div>
        </div>
        <div class="row">
          <label>Hranica horuca (C)</label>
          <input type="number" data-key="temp_hot_max" placeholder="19">
        </div>
        <div class="grid2">
          <div class="row">
            <label>Farba studena</label>
            <input type="text" data-key="temp_color_cold" placeholder="#00bfff">
          </div>
          <div class="row">
            <label>Farba tepla</label>
            <input type="text" data-key="temp_color_warm" placeholder="#ffd700">
          </div>
        </div>
        <div class="grid2">
          <div class="row">
            <label>Farba horuca</label>
            <input type="text" data-key="temp_color_hot" placeholder="#ff8c42">
          </div>
          <div class="row">
            <label>Farba extremna</label>
            <input type="text" data-key="temp_color_extreme" placeholder="#ff0000">
          </div>
        </div>

        <div class="section-title">Farby - vykon</div>
        <div class="grid2">
          <div class="row">
            <label>Farba nulovy vykon</label>
            <input type="text" data-key="power_color_zero" placeholder="#6c757d">
          </div>
          <div class="row">
            <label>Farba min. vykon</label>
            <input type="text" data-key="power_color_min" placeholder="#0a3d0a">
          </div>
        </div>
        <div class="row">
          <label>Farba max. vykon</label>
          <input type="text" data-key="power_color_max" placeholder="#00ff00">
        </div>

        <div class="section-title">Anomalie a offline</div>
        <div class="row inline">
          <label>Zvyraznit anomalne panely (nizky vykon oproti okoliu)</label>
          <input type="checkbox" data-key="anomaly_detection" data-bool="1">
        </div>
        <div class="grid2">
          <div class="row">
            <label>Prah anomalie (0-1, 0.5 = 50% priemeru)</label>
            <input type="number" step="0.05" data-key="anomaly_threshold_ratio" placeholder="0.5">
          </div>
          <div class="row">
            <label>Min. celkovy vykon pre kontrolu (W)</label>
            <input type="number" data-key="anomaly_min_total_power" placeholder="300">
          </div>
        </div>
        <div class="row">
          <label>Senzor je "neaktualny" po (minutach)</label>
          <input type="number" data-key="stale_minutes" placeholder="30">
        </div>

        <div class="section-title">Vzhlad</div>
        <div class="row inline">
          <label>Zobrazit legendu</label>
          <input type="checkbox" data-key="show_legend" data-bool="1">
        </div>
        <div class="row inline">
          <label>Obloha podla dennej doby (hviezdy/mesiac v noci)</label>
          <input type="checkbox" data-key="sky_gradient" data-bool="1">
        </div>

        <div class="section-title">Velkost karty</div>
        <div class="row inline">
          <label>Roztiahnut na celu vysku kontajnera</label>
          <input type="checkbox" data-key="fill_height" data-bool="1">
        </div>
        <div class="row">
          <label>Pevna vyska (napr. 600px alebo 100vh)</label>
          <input type="text" data-key="height" placeholder="(auto)">
        </div>
        <div class="row">
          <label>Max. sirka SVG (napr. 900px)</label>
          <input type="text" data-key="max_width" placeholder="(bez obmedzenia)">
        </div>
        <div class="row">
          <label>Min. sirka SVG (zabrani necitatelnemu textu na mobile)</label>
          <input type="text" data-key="min_width" placeholder="1100px">
        </div>
        <div class="hint">
          Tip: pre kartu "na celu stranku" pouzi Panel view alebo Sections view
          (kde ju mozes aj tahanim zmensit/zvacsit) a zapni "Roztiahnut na celu
          vysku kontajnera". Klikom na panel v grafike sa otvori jeho detail
          (more-info dialog). Rozlozenie panelov a rozmery strechy sa nastavuju
          len cez YAML - prepni na editor kodu ikonou vpravo hore v dialogu
          Upravit kartu.
        </div>

        <datalist id="dl-sun"></datalist>
        <datalist id="dl-input_select"></datalist>
        <datalist id="dl-sensor"></datalist>
      </div>
    `;

    this.shadowRoot.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      const isBool = el.dataset.bool === "1";
      const isNumber = el.type === "number";
      el.addEventListener(isBool ? "change" : "input", () => {
        if (isBool) {
          this._setBool(key, el.checked);
        } else {
          this._set(key, el.value, isNumber);
        }
      });
    });
  }

  _fillValues() {
    if (!this.shadowRoot) return;
    const cfg = this._config;
    const boolDefaults = {
      show_chips: true,
      fill_height: false,
      anomaly_detection: true,
      show_legend: true,
      sky_gradient: true,
    };
    this.shadowRoot.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      if (el.dataset.bool === "1") {
        const def = boolDefaults[key] ?? false;
        el.checked = cfg[key] !== undefined ? !!cfg[key] : def;
      } else {
        el.value = cfg[key] !== undefined && cfg[key] !== null ? cfg[key] : "";
      }
    });
  }

  _fillDatalists() {
    if (!this._hass || !this.shadowRoot) return;
    const states = this._hass.states;
    const groups = { sun: [], input_select: [], sensor: [] };
    Object.keys(states).forEach((id) => {
      const domain = id.split(".")[0];
      if (groups[domain]) {
        groups[domain].push(id);
      }
    });
    Object.keys(groups).forEach((domain) => {
      const dl = this.shadowRoot.getElementById(`dl-${domain}`);
      if (!dl) return;
      dl.innerHTML = groups[domain]
        .sort()
        .map((id) => `<option value="${id}"></option>`)
        .join("");
    });
  }
}

customElements.define("solar-roof-card-editor", SolarRoofCardEditor);
