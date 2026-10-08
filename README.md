<p align="center"><img src="assets/unisinos.png" alt="Unisinos" width="200"></p>

# Barco de Resgate em Área Alagada · Flood Rescue Boat (RL)

**🇧🇷 Português** · [🇬🇧 English below](#english)

Aplicação web interativa (100% no navegador, sem instalar nada) que reproduz os experimentos do **Trabalho 2 de Aprendizado por Reforço 2026/2** (PPGCA/Unisinos): um barco precisa resgatar 3 pessoas em um mapa 6×6 com correnteza e destroços, modelado como um MDP com 832 estados e resolvido com algoritmos tabulares (Iteração de Valor e de Política, Monte Carlo ε-soft, Q-learning e Sarsa).

> **Status:** interface F1 pronta (ambiente, Iteração de Valor, treino de Q-learning/Sarsa ao vivo). Publicada via GitHub Pages.

## Como rodar localmente
O app é estático (JavaScript ES modules, sem dependências e sem build), mas precisa de um servidor HTTP:

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

> Abrir `index.html` por `file://` **não funciona**, pois navegadores bloqueiam módulos ES e Web Workers nesse modo.

O GitHub Pages publica a **raiz** do repositório (todos os caminhos são relativos). Testes do núcleo: `npm test`.

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

> **Status:** F1 interface ready (environment, Value Iteration, live Q-learning/Sarsa training). Published through GitHub Pages.

## Running locally
The app is static (ES modules, no dependencies, no build) but needs an HTTP server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

> Opening `index.html` via `file://` does **not** work, because browsers block ES modules and Web Workers in that mode.

GitHub Pages publishes the repository **root** (all paths are relative). Core tests: `npm test`.

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
