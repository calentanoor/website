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
