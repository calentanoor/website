# Marktübersicht

Persönliches Markt-Dashboard: Indizes, Aktienscreener mit Fundamental- und
Technik-Rating, Detailseiten mit Chart, Signalen und Terminen.

## Starten

```bash
npm install
npm run dev          # http://localhost:3000, Live-Daten von Yahoo Finance
MOCK_DATA=1 npm run dev   # synthetische Demodaten, kein Internet nötig
```

Produktiv: `npm run build && npm start`.

## Seiten

- **Übersicht**: Index-Kacheln mit Technik-Rating
- **Index-Screener** (`/index/[id]`): Tabelle aller Mitglieder mit Ratings, Analysten-Konsens, Signalen
- **Eigene Ansicht** (`/screener`): Universum + frei kombinierbare Kennzahlen-Filter, speicherbare Ansichten
- **Watchlist** (`/watchlist`): per Stern markierte oder gesuchte Werte
- **Kalender** (`/kalender`): Konjunkturdaten (ForexFactory-Feed, aktuelle und nächste Woche),
  Fed/EZB-Termine (`src/lib/calendar.ts`, von Hand gepflegt), Optionsverfälle (berechnet),
  Quartalszahlen und Dividenden aller Indexwerte
- **Formationen** (`/formationen`): Scanner für Chartformationen (`src/lib/patterns.ts`) –
  Doppelboden/-top, (inverse) SKS, Dreiecke, Keile, Trendkanäle, Range, Flaggen,
  Ausbrüche aus Unterstützung/Widerstand; mit Auslöser, Kursziel, Stopp, Konfidenz und
  Optionsidee. Formationen werden auch im Chart der Detailseite eingezeichnet.
- **Top 5 heute** (Startseite) und **Strategie** (`/strategie`): drei regelbasierte Strategien
  (`src/lib/strategy.ts`) – Momentum-Trendfolge, Formations-Ausbruch, Rücksetzer im
  Aufwärtstrend – mit Marktfilter (Index über/unter SMA 200), Trailing-Stop, max. 90 Handelstagen
  Haltedauer und max. 10 Positionen. Backtest über 5 Jahre im Vergleich zu S&P 500, DAX und
  Euro Stoxx 50 (Jahresrenditen, Auswertung je Setup, Trade-Liste) und Testportfolio ab Startdatum.
  Optionsscheine am Geld mit 6 Monaten Laufzeit, gerollt bei < 3 Monaten Restlaufzeit
  (`src/lib/warrant.ts`). Die Top 5 nutzen `ACTIVE_STRATEGY` in `src/lib/strategy-data.ts`.
- **Optionen** (`/optionen/[symbol]`, nur US-Werte): erwarteter Kursverlauf (IV-Kegel 1σ/2σ),
  Expected Move je Verfall, Max Pain, Call-/Put-Walls, Gamma-Exposure (GEX) mit Gamma-Flip,
  Volatilitäts-Smile, Laufzeitstruktur, IV vs. realisierte Vola, Skew und automatische Einordnung.
  Greeks werden per Black-Scholes selbst berechnet (`src/lib/options-math.ts`).
- **Aktie** (`/stock/[symbol]`): Chart (Intraday, 30 Tage, 1 Jahr, 5 Jahre), Rating-Details, Termine

Watchlist und gespeicherte Ansichten liegen im `localStorage` des Browsers.

## Konfiguration

| Variable        | Wirkung                                                            |
| --------------- | ------------------------------------------------------------------ |
| `MOCK_DATA=1`   | Demodaten statt Yahoo Finance                                      |
| `SITE_PASSWORD` | Aktiviert einen Passwortschutz (Basic Auth) für ein Online-Deploy  |

## Aufbau

- `src/lib/indices.ts`: Indizes und ihre Mitglieder. Die Listen werden von Hand
  gepflegt und müssen bei Indexänderungen aktualisiert werden.
- `src/lib/market-data.ts`: Datenabruf über `yahoo-finance2`, gecacht mit `use cache`
  (Kurse 5 Min., Aktiendaten 30 Min.).
- `src/lib/indicators.ts`: SMA, EMA, RSI, MACD, ATR, Bollinger.
- `src/lib/rating.ts`: Rating-Modell. Jedes Kriterium wird linear zwischen
  einer schlechten und einer guten Schwelle auf 0–100 abgebildet, Kategorien
  sind Mittelwerte, Gesamt = Mittel aus Fundamental- und Technik-Score.

### Fundamental-Rating
Bewertung (KGV erw., PEG, EV/EBITDA bzw. KBV bei Finanzwerten), Qualität
(Eigenkapitalrendite, Margen), Wachstum (Umsatz, Gewinn), Finanzkraft
(Verschuldung, Current Ratio, Free Cashflow), Analysten (Konsens, Kursziel).

### Technik-Rating
Trend (Abstand zu SMA 50/200, Golden/Death Cross, Steigung SMA 200), Momentum
(RSI, MACD, 3-/6-Monats-Performance), Kursposition (52-Wochen-Spanne, ATR).

Die Daten stammen aus der inoffiziellen Yahoo-Finance-Schnittstelle, können
verzögert oder lückenhaft sein und stellen keine Anlageberatung dar.
