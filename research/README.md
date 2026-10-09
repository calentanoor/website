# Strategie-Forschung

Backtests auf echten Kursdaten (Yahoo, ~200 Indexwerte aus DAX, Euro Stoxx 50,
Nasdaq 100, Dow Jones) mit `scripts/backtest.ts`, ausgeführt über den Workflow
**Strategie-Backtest** (GitHub Actions, manuell startbar). Zeitraum 01.10.2021 –
08.10.2026; Parameter werden auf den ersten 3 Jahren (In-Sample) ausgewählt und
auf den letzten 2 Jahren (Out-of-Sample) geprüft. Kosten: Aktie 0,2 %,
Optionsschein 1 % je Transaktion (Rollen zählt doppelt). Max. 10 Positionen.

Vergleich Kaufen und Halten: S&P 500 +12,2 % p.a. (IS +9,4 %, OOS +16,5 %),
DAX +10,5 % p.a., Euro Stoxx 50 +8,9 % p.a.

## Runde 1 – Ausgangslage
- Puts verlieren in allen Strategien deutlich (Momentum-Puts Ø −2,9 % je Trade,
  Formations-Puts Ø −1,4 %) → Puts abgeschaltet.
- Momentum nur Calls: Aktie +11,5 % p.a., Max DD 13 %.
- Formations-Ausbrüche und Rücksetzer: kein stabiler Vorteil.
- Optionsscheine mit 10 % je Position: Drawdowns 70–99 %.

## Runde 2 – Varianten der Momentum-Strategie
- 55-Tage-Ausbruch + relative Stärke zum Heimatindex + Ausstieg nur per
  Trailing-Stop („Kombi B“): Aktie +13,4 % p.a. (IS +8,9 %, OOS +22,3 %), Max DD 15 %.
- Kleinere Optionsschein-Positionen und Scheine im Geld mit längerer Laufzeit
  senken den Drawdown stark.

## Runde 3 – Robustheit von Kombi B
| Variante | Aktie p.a. | Max DD |
|---|---|---|
| Kombi B (Trail 3 ATR) | +13,4 % | 15 % |
| Trail 2,5 / 3,5 ATR | +6,4 % / +9,4 % | 20 % / 16 % |
| ohne relative Stärke | +9,2 % | 12 % |
| mit Ausstieg unter SMA 50 | +8,9 % | 14 % |
| ohne Marktfilter | +5,5 % | 21 % |
| max. 5 Positionen à 20 % | +13,3 % | 9 % |

Optionsschein (Kombi B): 5 % je Position, 12 Monate, 10 % im Geld → +11,3 % p.a.,
Max DD 31 %; am Geld 6 Monate → +15,8 % p.a., Max DD 45 %.

**Übernommen als Standard:** Kombi B, nur Calls, Optionsschein 12 Monate 10 % im
Geld, 5 % je Position. Der Trailing-Stop von 3 ATR ist ein schmales Optimum –
realistisch eher 9–11 % p.a. erwarten. Die heutige Indexzusammensetzung blendet
ausgeschiedene Werte aus (leicht geschönte Ergebnisse).

## Runde 4 – „Qualität + Nachkauf“ (Strategie des Nutzers)
Einstieg bei Fundamental- (aus Jahresabschlüssen, point-in-time) und Technik-Score ≥ 60,
Gewinnmitnahme +20 % über Ø-Einstand, Verdopplung nach −20 % vom letzten Kauf, ganze
Nachkauf-Leiter wird reserviert. 20.000 € Kapital, 1.000 € Basis, Aktien, 0,2 % Kosten.
Jahresabschlüsse erst ab Geschäftsjahr 2021 verfügbar → Signale praktisch ab 2022.
Max DD täglich zu Marktpreisen (inkl. offener Verluste).

| Variante | p.a. | Max DD | Zyklen | Treffer (abgeschl.) | offen (Ø) | schlechtester |
|---|---|---|---|---|---|---|
| A: 3 Käufe (1+1+2), ohne Stopp | +2,2 % | 17 % | 33 | 100 % | 7 (−23 %) | TTD −85 % |
| B: 4 Käufe (1+1+2+4), 40k | +4,5 % | 10 % | 36 | 100 % | 6 (−9 %) | CPRT −29 % |
| C: 3 Käufe, Stopp −30 % nach letztem Kauf | +2,4 % | 15 % | 36 | 87 % | 5 (0 %) | TTD −30 % |
| D: ohne Nachkauf, Stopp −20 % | +6,8 % | 17 % | 229 | 62 % | 28 (−4 %) | TTD −38 % |
| E: 3 Käufe, Fundamental ≥ 70 | +5,9 % | 15 % | 33 | 100 % | 6 (−5 %) | PRX −18 % |
| G: TP 15 % / Nachkauf −15 % | +4,2 % | 19 % | 39 | 100 % | 5 (−19 %) | MBG −34 % |
| H: TP 30 % | +4,2 % | 5 % | 25 | 100 % | 6 (−8 %) | RMS −36 % |

Erkenntnis: 100 % Trefferquote bei abgeschlossenen Zyklen, die Verluste stecken in
offenen Positionen (typisch für Nachkauf-Strategien). Das reservierte Kapital liegt
großteils brach, daher niedrige Rendite aufs Gesamtkapital. Alle Varianten unter
S&P 500 (+12,2 % p.a.) und Momentum (+13,4 % p.a.). Heutige Indexzusammensetzung
begünstigt Nachkäufe zusätzlich (Pleite-/Absteiger-Werte fehlen).
