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
