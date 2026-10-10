# Reproducing the report's results in the app

[Versão em português](REPRODUCAO.md) · [README](../README.md)

This guide maps each table, figure and number of the Assignment 2 report to the card/button of the app (<https://epineto.github.io/rescue-boat-rl-unisinos/>) and gives the expected values. Use the **default environment** (debris penalty −10 when entering a debris cell, which is not a terminal state; current 0.2, capacity 2, default 6×6 map). Click **EN** in the header for English.

> **Shortcut:** the **Reproduce** section (button **Reproduce the study**) runs Comparison (20 seeds), full Sensitivity (10 seeds) and full Search (66 configurations × 10 seeds) in sequence, restores the default environment and finally downloads a `.zip` with every CSV. It takes a few minutes. The manual, item-by-item mapping follows.

## Tolerances
The report uses a Numba simulator and NumPy seeds; the app uses the mulberry32 generator (`src/rng.js`) and seeds 9000 + k, as in the notebook. Everything **deterministic** (model P, V*, optimal policy, number of sweeps/rounds) matches exactly. Anything that depends on sampling (Q-learning, Sarsa, Monte Carlo) matches **statistically**: expect values within the report's 95% CI, not identical ones.

## Correspondence map

| Report item | Where in the app | How | Expected value |
|---|---|---|---|
| **Figure 1**: 6×6 map (shelter H at (5,2); people P1 (0,0), P2 (0,3), P3 (1,5); current on row 2; debris (3,2), (3,3); 4 blocks) | **Environment & reference** → Map and legend | Open the page | Same map as the figure; \|S\| = 832 states, 4 actions |
| **Figure 1**: optimal route (returns through the centre crossing the current and the debris) | **Route** | Policy **Optimal**, seed 3, **Play** | route of about 31 steps through the centre: current (2,2), debris (3,2), (4,2), shelter (current drags may add detours) |
| Value Iteration: 35 sweeps; V*(s₀) = 161.93 | **Environment & reference** → Reference: Value Iteration | Open the page | V*(s₀) = 161.93; 35 sweeps; 31.0 steps; 100% success |
| Policy Iteration: 14 rounds, same policy | **Train** → algorithm **Policy Iteration** → Compute | Pick the algorithm and click Compute | 14 rounds; "Matches Value Iteration? Yes" |
| **Table 1**, row "Value Iteration (ref.)": 161.84 ± 0.00; 31.0 steps | **Compare** → Value Iteration (exact) row | **Compare** | Return 161.93 (exact); the report shows 161.84 because it evaluates the policy by simulation (2000 episodes) |
| **Table 1**, Q-learning: best config. (0.1; 1; 0.95) → 161.92 ± 0.03; 31.0 steps | **Compare** (default config. = study's best) | Seeds = 20 → **Compare** | 161.92 ± ~0.03 (95% CI), 100% success, ~31 steps |
| **Table 1**, Sarsa: best config. (0.2; 1; 0.99) → 161.74 ± 0.26; 31.3 steps | same | same | 161.74 ± ~0.26, 100% success, ~31 steps |
| **Table 1**, Monte Carlo: best config. (average; 0.5; 0.95) → 159.76 ± 0.86; 31.0 steps | same | same | 159.76 ± ~0.86, 100% success |
| **Table 1**, Worst / Median / Best of the search (Monte Carlo −63.4 / 41.0 / 160.5; Q-learning 102.0 / 140.0 / 161.9; Sarsa 117.0 / 134.8 / 161.6) | **Search** | **Restore the study's grid** (66 configurations, 10 seeds) → **Run the search**; sort the table by return | Worst/median/best per algorithm close to the report; best config. of each algorithm equals the table's |
| Text: effect of ε₀ (Q-learning 151.6 / 145.9 / 137.0 for ε₀ = 1; 0.5; 0.2; Sarsa 155.3 / 135.7 / 130.4) | **Search** → CSV with all configurations | Export and average per ε₀ | Averages close to the report |
| Text: α = 0.5 unstable; Monte Carlo with constant α much worse (29.7 with α = 0.05; −21.5 with α = 0.1) | **Search** → sortable table | Sort by return | Worst cases: Q-learning 102.0 (70% success), Sarsa 117.0 (90%), Monte Carlo α = 0.1, ε₀ = 0.5, γ = 0.99 with 0% success |
| **Figure 2**: return and success during training (mean over seeds; log x axis; dashed line = Value Iteration) | **Compare** → Learning curves | Tick "Logarithmic x axis" | Monte Carlo rises faster (~80% success at the first point); TD methods pass 95% around 5,000 episodes |
| **Figure 1** (greedy policies) | **Compare** → Greedy policies | After **Compare** | All four policies touch the debris once and spend ~4.5 steps in the current, returning through the centre |
| **Figure 3**: steps on debris and in the current × penalty | **Sensitivity** | **Compute (Value Iteration)** then **Include Q-learning and Sarsa** (10 seeds) | Optimal route changes between −10 and −15 (with −10 it crosses the debris; from −15 on it goes around); V*(s₀) = 161.93 at −10 and 159.158 for −15 to −60 |
| Text: Sarsa is not more cautious (−15: 11.1% of episodes on debris vs 2.0% for Q-learning; 5.02 vs 4.58 steps in the current, optimum 4.50) | **Sensitivity** → table | Include Q-learning and Sarsa, 10 seeds | Values close to those quoted (sampling noise) |

## Short walkthrough
1. **Reference:** open the page; check V*(s₀) = 161.93.
2. **Single run:** in **Train**, Q-learning with α = 0.1, ε₀ = 1, γ = 0.95, 30,000 episodes → **Train**; the greedy policy's discounted return should be near 161.9.
3. **Table 1 (final result):** in **Compare**, Number of seeds = 20 → **Compare**.
4. **Table 1 (search):** in **Search**, **Restore the study's grid** → **Run the search** (10 seeds; "Quick mode" uses only 3).
5. **Figure 3:** in **Sensitivity**, **Restore the study's penalties** → **Compute** → **Include Q-learning and Sarsa** with 10 seeds.
6. **Export:** each section's **Export CSV** button produces the tables; **Reproduce the study** produces the `.zip` with everything.

## Sharing a configuration
**Copy configuration link** (in **Reproduce**) generates a `#cfg=…` link with the map, environment and the Train card's hyperparameters. Whoever opens it sees the same configuration.
