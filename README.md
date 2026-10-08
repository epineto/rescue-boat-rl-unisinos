<p align="center"><img src="assets/unisinos.png" alt="Unisinos" width="200"></p>

# Barco de Resgate em Área Alagada · Flood Rescue Boat (RL)

**🇧🇷 Português** · [🇬🇧 English below](#english)

Aplicação web interativa (100% no navegador, sem instalar nada) que reproduz os experimentos do **Trabalho 2 de Aprendizado por Reforço 2026/2** (PPGCA/Unisinos): um barco precisa resgatar 3 pessoas em um mapa 6×6 com correnteza e destroços, modelado como um MDP com 832 estados e resolvido com algoritmos tabulares (Iteração de Valor e de Política, Monte Carlo ε-soft, Q-learning e Sarsa).

> **Status:** em construção (fase F0). A interface será publicada via GitHub Pages.

## O que a aplicação fará
- Editar o ambiente (penalidade dos destroços, correnteza, capacidade) e ver o mapa.
- Treinar os algoritmos no navegador, com curvas de aprendizado ao vivo, política em setas e animação da rota.
- Comparar com o ótimo exato (V*(s₀) = 161,93) e reproduzir a análise de sensibilidade da pesquisa.

## Materiais da pesquisa
- Notebook (Google Colab, público): https://drive.google.com/file/d/1USXmX9e0h3yvlcMSEU0GcgKP6sRh2YRU/view
- Código de referência em Python: [`reference/python/rescue_boat_rl.py`](reference/python/rescue_boat_rl.py)

## Autores
Epitácio Vicente do Nascimento Neto · Antonio Clerton Santana de Araujo — Programa de Pós-Graduação em Computação Aplicada, Unisinos. Professor: Gabriel de Oliveira Ramos.

## Licença
[MIT](LICENSE)

---

<a id="english"></a>
# Flood Rescue Boat (RL) — English

An interactive web app (runs 100% in the browser, nothing to install) that replicates the experiments of **Reinforcement Learning Assignment 2 (2026/2)** at PPGCA/Unisinos: a boat must rescue 3 people on a 6×6 map with a current and debris, modelled as an MDP with 832 states and solved with tabular algorithms (Value and Policy Iteration, ε-soft Monte Carlo, Q-learning and Sarsa).

> **Status:** under construction (phase F0). The UI will be published through GitHub Pages.

## What the app will do
- Edit the environment (debris penalty, current, capacity) and view the map.
- Train the algorithms in the browser, with live learning curves, policy arrows and route animation.
- Compare against the exact optimum (V*(s₀) = 161.93) and reproduce the sensitivity analysis from the study.

## Research materials
- Notebook (Google Colab, public): https://drive.google.com/file/d/1USXmX9e0h3yvlcMSEU0GcgKP6sRh2YRU/view
- Reference Python code: [`reference/python/rescue_boat_rl.py`](reference/python/rescue_boat_rl.py)

## Authors
Epitácio Vicente do Nascimento Neto · Antonio Clerton Santana de Araujo — Graduate Program in Applied Computing, Unisinos. Instructor: Gabriel de Oliveira Ramos.

## License
[MIT](LICENSE)
