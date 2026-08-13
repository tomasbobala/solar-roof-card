# Solar Roof Card

Vlastná Lovelace karta pre Home Assistant, ktorá vizualizuje strechu so solárnymi
panelmi (Tigo optimizers), ich výkon/teplotu/duty cycle/prúd/napätie/RSSI a polohu
slnka nad strechou počas dňa. Karta je samostatná – nepotrebuje `button-card` ani
`mushroom` cards, prepínanie zobrazovaného režimu (Watts/Teplota/Duty/...) je
vstavané priamo v karte.

## Inštalácia cez HACS (vlastný repozitár)

1. V Home Assistant otvor **HACS → Frontend**.
2. Klikni na tri bodky vpravo hore → **Vlastné repozitáre / Custom repositories**.
3. Zadaj URL tohto repozitára a kategóriu **Frontend**, potvrď.
4. Nájdi **Solar Roof Card** v zozname a klikni **Stiahnuť / Download**.
5. Home Assistant zvyčajne pridá resource automaticky. Ak nie, over v
   **Nastavenia → Dashboardy → tri bodky → Zdroje (Resources)**, či existuje záznam:

   ```yaml
   url: /hacsfiles/solar-roof-card/solar-roof-card.js
   type: module
   ```

6. Tvrdo obnov prehliadač (Ctrl+F5), aby sa načítal nový JS súbor.

## Manuálna inštalácia (bez HACS)

1. Skopíruj `solar-roof-card.js` do `config/www/solar-roof-card.js`.
2. V **Nastavenia → Dashboardy → Zdroje** pridaj:

   ```yaml
   url: /local/solar-roof-card.js
   type: module
   ```

## Predpoklady v Home Assistant

Karta očakáva tieto entity (dajú sa premenovať cez konfiguráciu, viď nižšie):

- `sensor.tigo_pv_<panel>_power`, `_temperature`, `_duty_cycle`, `_current_in`,
  `_rssi`, `_voltage_in`, `_voltage_out` – pre každý panel (napr. `sensor.tigo_pv_a1_power`)
- `input_select.panel_display_mode` s možnosťami:
  `power`, `temp`, `duty_cycle`, `current`, `rssi`, `voltage_in`, `voltage_out`
- `sun.sun` (vstavaná HA entita)
- `sensor.strecha_celkovo_vykon`, `sensor.strecha_vychod_vykon`,
  `sensor.strecha_juh_vykon`, `sensor.strecha_zapad_vykon`

Príklad `input_select` v `configuration.yaml`:

```yaml
input_select:
  panel_display_mode:
    name: Režim zobrazenia panelov
    options:
      - power
      - temp
      - duty_cycle
      - current
      - rssi
      - voltage_in
      - voltage_out
    initial: power
```

## Použitie v dashboarde

Najjednoduchšie (použije presne tvoje defaultné rozloženie strechy):

```yaml
type: custom:solar-roof-card
```

Plný príklad so všetkými nastaviteľnými parametrami nájdeš v [`example.yaml`](example.yaml).

## Konfigurácia cez UI (bez YAML)

Karta má vlastný vizuálny editor. V dashboarde klikni na kartu → **tri bodky →
Upraviť kartu** (alebo pri pridávaní karty vyhľadaj "Solar Roof Card") a otvorí
sa formulár, kde nastavíš:

- titulok a zobrazenie prepínača režimov
- entity (prefix panelov, slnko, `input_select`, výkony podľa strán) – so
  automatickým našepkávaním existujúcich entít
- výkonové limity (max. výkon panelu, škála progress baru)
- veľkosť karty (viď nižšie)

Pokročilé veci – rozmery strechy, zoznam panelov a ich rozloženie (`roof`,
`panel`, `names`, `layout`, `max_panel_counts`) – sa nastavujú len cez YAML.
V dialógu "Upraviť kartu" prepneš na YAML editor ikonou (`</>`) vpravo hore.

## Prispôsobenie veľkosti karty

Karta sa štandardne správa ako bežná Lovelace karta (výška podľa obsahu,
šírka na 100 % stĺpca). Ak ju chceš roztiahnuť na celú stránku/kontajner:

| Kľúč | Popis |
|---|---|
| `fill_height: true` | Karta sa roztiahne na 100 % výšky svojho kontajnera (SVG sa škáluje dnu, pomer strán sa zachová). Najlepšie funguje v **Panel view** (jedna karta = celá obrazovka) alebo v novom **Sections view**, kde ju vieš aj ťahaním zväčšiť/zmenšiť. |
| `height: "600px"` / `"100vh"` | Pevná výška karty (má prednosť pred `fill_height`). |
| `max_width: "900px"` | Obmedzí maximálnu šírku SVG – užitočné, ak je karta v širokom Panel view a nechceš, aby bola strecha extrémne roztiahnutá. Bez zadania sa SVG roztiahne na celú dostupnú šírku. |

Príklad karty na celú stránku:

```yaml
views:
  - title: Strecha
    type: panel
    cards:
      - type: custom:solar-roof-card
        fill_height: true
```

Príklad v novom Sections view (karta sa dá potiahnutím zväčšiť):

```yaml
views:
  - type: sections
    sections:
      - type: grid
        cards:
          - type: custom:solar-roof-card
            fill_height: true
```

## Čitateľnosť na mobile

SVG vizualizácia strechy má veľa detailov (17+ panelov, hodnoty pri každom),
takže pri príliš malej šírke by bol text nečitateľný. Karta preto nikdy
nezmenší SVG pod `min_width` (default `1100px`) – ak je obrazovka užšia,
zobrazí sa horizontálny scroll/pinch-zoom namiesto drobného textu.

- Ak ti to na mobile stále vyhovuje väčšie, zvýš `min_width` (napr. `1400px`).
- Ak naopak chceš, aby sa text skutočne zmenšoval a nebolo scrollovanie,
  nastav `min_width: null` – vráti sa pôvodné plne responzívne správanie.

## Nové funkcie

### Klik na panel
Kliknutím/ťuknutím na konkrétny panel v grafike sa otvorí štandardný
Home Assistant more-info dialóg pre entitu, ktorá je práve zobrazená
(napr. v režime "Teplota" sa otvorí teplotný senzor toho panelu).

### Detekcia anomálií
Ak je výkon panelu výrazne nižší než priemer ostatných (napr. zatienenie,
porucha optimizéra), panel dostane červený pulzujúci okraj. Kontroluje sa
len v režime Watts a len keď celkový výkon systému prekročí
`anomaly_min_total_power` (aby sa to nezobrazovalo v noci/za tmy).

### Nedostupné / neaktuálne senzory
- **⚠ (červený prerušovaný okraj)** – senzor je `unavailable`/`unknown`
  alebo neexistuje.
- **⏱ (oranžový prerušovaný okraj)** – senzor má hodnotu, ale
  neaktualizoval sa dlhšie ako `stale_minutes` (default 30 min) – naznačuje,
  že Tigo/optimizér prestal komunikovať.

### Vzhľad
- Obloha na pozadí sa mení podľa polohy slnka (deň / súmrak / noc), v noci
  sa objavia hviezdy a mesiac namiesto slnka (dá sa vypnúť cez `sky_gradient`).
- Slnko má jemné rotujúce lúče a žiarivý gradient.
- Legenda farieb (výkon/teplota) v ľavom dolnom rohu (`show_legend`).
- Pri prepnutí režimu (Watts/Teplota/...) sa grafika jemne prekríži (fade).

### Farebné prahy
Teplotné hranice a farby (studená/teplá/horúca/extrémna) aj farby škály
výkonu (0 W → min → max) sú plne nastaviteľné cez vizuálny editor alebo YAML
– viac v tabuľke nižšie.

## Konfiguračné voľby

| Kľúč | Popis | Default |
|---|---|---|
| `title` | Nadpis nad kartou | `""` (skryté) |
| `show_chips` | Zobraziť prepínač režimov | `true` |
| `entity_prefix` | Prefix entít panelov | `sensor.tigo_pv_` |
| `sun_entity` | Entita slnka | `sun.sun` |
| `display_mode_entity` | `input_select` pre režim | `input_select.panel_display_mode` |
| `total_power_entity` | Celkový výkon | `sensor.strecha_celkovo_vykon` |
| `east_power_entity` / `south_power_entity` / `west_power_entity` | Výkon podľa strany | `sensor.strecha_*_vykon` |
| `visual_max_power` | Škála progress baru (W) | `10000` |
| `panel_max_power` | Max. výkon 1 panelu (W) | `530` |
| `fill_height` | Roztiahnuť kartu na 100 % výšky kontajnera | `false` |
| `height` | Pevná výška karty (CSS hodnota, napr. `600px`, `100vh`) | `null` (auto) |
| `max_width` | Max. šírka SVG (CSS hodnota) | `null` (bez limitu) |
| `min_width` | Min. šírka SVG – pod touto hranicou sa karta nezmenšuje, namiesto toho sa dá horizontálne posúvať/pinch-zoomovať. Chráni čitateľnosť textu na mobile. | `"1100px"` |
| `show_legend` | Zobraziť legendu farieb v rohu karty | `true` |
| `sky_gradient` | Obloha podľa dennej doby + hviezdy/mesiac v noci | `true` |
| `anomaly_detection` | Zvýrazniť panely s podozrivo nízkym výkonom | `true` |
| `anomaly_threshold_ratio` | Panel je "anomálny", ak jeho výkon < priemer × tento pomer | `0.5` |
| `anomaly_min_total_power` | Detekcia anomálií beží len keď je celkový výkon aspoň toľko W | `300` |
| `stale_minutes` | Po koľkých minútach bez aktualizácie sa senzor považuje za "neaktuálny" | `30` |
| `temp_cold_max` / `temp_warm_max` / `temp_hot_max` | Hranice teplotných pásiem (°C) | `5` / `12` / `19` |
| `temp_color_cold` / `_warm` / `_hot` / `_extreme` | Farby teplotných pásiem | modrá/zlatá/oranžová/červená |
| `power_color_zero` | Farba panelu s nulovým výkonom | `#6c757d` |
| `power_color_min` / `power_color_max` | Farebná škála výkonu (0 → `panel_max_power`) | tmavozelená → jasná zelená |
| `roof.width_mm` / `roof.height_mm` / `roof.ridge_mm` | Rozmery strechy a hrebeňa | 17200 / 11700 / 5500 |
| `panel.width_mm` / `panel.height_mm` | Rozmer jedného panelu | 2094 / 1134 |
| `max_panel_counts.E/S/W` | Počet panelov na strane (pre % z max) | 8 / 15 / 9 |
| `names.E/S/W` | Zoznam ID panelov na danej streche | tvoje panely |
| `layout.E/S/W` | Relatívne pozície panelov (0–1) v ploche strechy | tvoj layout |

## Poznámky

- Karta je responzívna – SVG sa škáluje na šírku kontajnera cez `viewBox`.
- Kliknutím na chip (Watts/Teplota/...) sa zavolá
  `input_select.select_option` na `display_mode_entity`.
- Ak niektorý senzor chýba alebo je `unavailable`, panel zobrazí `?` namiesto
  hodnoty (žiadny `NaN`).
