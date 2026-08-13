/**
 * Solar Roof Card
 * Vizualizacia strechy so solarnymi panelmi (Tigo optimizers), vykonom a polohou slnka.
 * Obsahuje aj vizualny editor konfiguracie (GUI) a podporu prisposobenia velkosti karty.
 *
 * Repo: https://github.com/<tvoj-github>/solar-roof-card
 */

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
          background: black; overflow: hidden; padding: 8px 8px 12px;
          display: flex; flex-direction: column;
          height: var(--srcard-card-height, auto);
          box-sizing: border-box;
        }
        .title { color: white; font-size: 16px; padding: 4px 8px 8px; flex: 0 0 auto; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 4px 8px; flex: 0 0 auto; }
        .chip {
          display: flex; align-items: center; gap: 4px;
          background: #1c1c1c; color: #ddd; border: 1px solid #333;
          border-radius: 14px; padding: 4px 10px; font-size: 12px;
          cursor: pointer; user-select: none;
        }
        .chip.active { background: #ffb64c; color: #111; border-color: #ffb64c; }
        .chip:hover { filter: brightness(1.15); }
        .svg-wrap {
          width: 100%;
          flex: var(--srcard-wrap-flex, 0 1 auto);
          min-height: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .svg-wrap svg {
          width: 100%;
          height: var(--srcard-svg-height, auto);
          max-width: var(--srcard-max-width, none);
          border-radius: 12px;
        }
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
  }

  _applySizing() {
    const cfg = this._config;
    this.style.setProperty("--srcard-max-width", cfg.max_width || "none");

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
    this._svgWrap.innerHTML = this._buildSvg();
  }

  _buildSvg() {
    const states = this._hass.states;
    const cfg = this._config;

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
      if (temp === "?" || temp === 0) return "#6c757d";
      if (temp < 0) return "#00bfff";
      if (temp <= 5) return "#00bfff";
      if (temp <= 12) return "#ffd700";
      if (temp <= 19) return "#ff8c42";
      return "#ff0000";
    };

    const getGreenShade = (power) => {
      if (power <= 0 || power === "?") return "#6c757d";
      const ratio = Math.min(power / cfg.panel_max_power, 1);
      const green = Math.floor(50 + ratio * 205);
      return `rgb(0,${green},0)`;
    };

    const panelsForPlane = (id, mode) => {
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

        let value = "?";
        let unit = "";
        let bgColor = "#0b0b0b";
        let textColor = "#ffffff";
        const key = nm.toLowerCase();

        switch (mode) {
          case "power":
            value = Number(states[`${cfg.entity_prefix}${key}_power`]?.state) || 0;
            unit = "W";
            bgColor = getGreenShade(value);
            break;
          case "duty_cycle":
            value = states[`${cfg.entity_prefix}${key}_duty_cycle`]?.state || "?";
            unit = "%";
            textColor = "#ffb84c";
            break;
          case "temp":
            value = states[`${cfg.entity_prefix}${key}_temperature`]?.state || "?";
            unit = "\u00B0C";
            textColor = getTempColor(value);
            break;
          case "current":
            value = states[`${cfg.entity_prefix}${key}_current_in`]?.state || "?";
            unit = "A";
            textColor = "#4fc3f7";
            break;
          case "rssi":
            value = states[`${cfg.entity_prefix}${key}_rssi`]?.state || "?";
            unit = "dB";
            textColor = "#ff80ab";
            break;
          case "voltage_in":
            value = states[`${cfg.entity_prefix}${key}_voltage_in`]?.state || "?";
            unit = "V";
            textColor = "#ffee58";
            break;
          case "voltage_out":
            value = states[`${cfg.entity_prefix}${key}_voltage_out`]?.state || "?";
            unit = "V";
            textColor = "#ffd54f";
            break;
        }

        if (value !== "?" && !isNaN(Number(value))) {
          value = Math.round(Number(value));
        }

        rects.push(`
          <g>
            <rect x="${x}" y="${y}" width="${panel_px.w}" height="${panel_px.h}"
              rx="3" ry="3"
              fill="${mode === "power" ? bgColor : "#0b0b0b"}"
              stroke="rgba(255,255,255,0.04)"
              transform="rotate(${rotate},${cxRect},${cyRect})"/>
            <text x="${cxRect}" y="${cyRect - 1}" fill="white" text-anchor="middle" font-size="10">${nm}</text>
            <text x="${cxRect}" y="${cyRect + 8}" fill="${textColor}" text-anchor="middle" font-size="9">${value}${unit}</text>
          </g>`);
      }
      return rects.join("");
    };

    const displayMode = states[cfg.display_mode_entity]?.state || "power";

    const svgPlanes = Object.keys(planes)
      .map((id) => {
        const pl = planes[id];
        const poly = pl.pts.map((p) => `${p.x},${p.y}`).join(" ");
        return `<g id="plane_${id}">
          <polygon points="${poly}" fill="${pl.color}" stroke="none"/>
          ${panelsForPlane(id, displayMode)}
        </g>`;
      })
      .join("");

    const chimney = `<g><rect x="${cx - 240}" y="${cy - 180}" width="40" height="40" fill="#3a3a3a" stroke="#111" stroke-width="2" rx="3"/></g>`;

    const sunState = states[cfg.sun_entity];
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
      " stroke="#ffb64c55" fill="none"/>`;

    let customTexts = [];
    if (displayMode !== "power") {
      customTexts = [
        { text: "V\u00FDchod", x: 200, y: 565 },
        { text: "Juh", x: 570, y: 300 },
        { text: "Z\u00E1pad", x: 960, y: 565 },
      ];
    }
    const svgTexts = customTexts
      .map(
        (t) =>
          `<text x="${t.x}" y="${t.y}" fill="#ffb64c" font-size="14" text-anchor="middle" dominant-baseline="middle">${t.text}</text>`
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
          ${tilePatternLight}
          ${tilePatternDark}
        </defs>
        ${svgPlanes}
        ${chimney}
        ${shadow}
        ${sunPath}
        ${
          sunState?.state === "above_horizon"
            ? `<g>
                <circle cx="${sunX}" cy="${sunY}" r="14" fill="#ffb64c">
                  <animate attributeName="r" values="12;15;12" dur="2s" repeatCount="indefinite"/>
                </circle>
                <circle cx="${sunX}" cy="${sunY}" r="20" fill="#ffb64c55">
                  <animate attributeName="r" values="18;22;18" dur="2.5s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2.5s" repeatCount="indefinite"/>
                </circle>
              </g>`
            : ""
        }
        ${svgTexts}
        ${NText}
        ${SensorInfo}
        ${barGraph}
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
 * Vizualny editor konfiguracie karty (zobrazi sa v UI editore dashboardu
 * namiesto YAML, ked je karta pridana cez "Pridat kartu" alebo cez "Upravit").
 * Pokrocile veci (rozmery strechy, layout panelov, nazvy) sa nastavuju len
 * cez YAML rezim (ikona editora kodu v hornej casti dialogu Upravit kartu).
 */
class SolarRoofCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...(config || {}) };
    if (!this._built) {
      this._buildForm();
      this._built = true;
      if (this._hass) {
        this._fillDatalists();
      }
    }
    this._fillValues();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) {
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
        <div class="hint">
          Tip: pre kartu "na celu stranku" pouzi Panel view alebo Sections view
          (kde ju mozes aj tahanim zmensit/zvacsit) a zapni "Roztiahnut na celu
          vysku kontajnera". Rozlozenie panelov a rozmery strechy sa nastavuju
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
    const cfg = this._config;
    this.shadowRoot.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      if (el.dataset.bool === "1") {
        const def = key === "show_chips";
        el.checked = cfg[key] !== undefined ? !!cfg[key] : def;
      } else {
        el.value = cfg[key] !== undefined && cfg[key] !== null ? cfg[key] : "";
      }
    });
  }

  _fillDatalists() {
    if (!this._hass) return;
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
