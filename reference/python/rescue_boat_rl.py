# ---
# jupyter:
#   jupytext:
#     text_representation:
#       extension: .py
#       format_name: percent
#   kernelspec:
#     display_name: Python 3
#     language: python
#     name: python3
# ---

# %% [markdown]
# # Trabalho 2 — Barco de resgate em área alagada
# **Aprendizado por Reforço 2026/2** · Programa de Pós-Graduação em Computação Aplicada · Unisinos
# **Prof.** Gabriel de Oliveira Ramos · **Integrantes:** Epitácio Vicente do Nascimento Neto e Antonio Clerton Santana de Araujo
#
# Este notebook contém **todo o código do trabalho**: (1) o ambiente Gymnasium `RescueBoatEnv`, (2) os algoritmos tabulares
# (Iteração de Valor e de Política — cap. 4; Monte Carlo on-policy ε-soft — cap. 5; Q-learning e Sarsa — cap. 6),
# (3) a busca de hiper-parâmetros e (4) os experimentos finais com as figuras do relatório.
#
# **Como executar no Colab:** *Ambiente de execução → Executar tudo*. Defina `RAPIDO = True` na célula de configuração
# para um teste de poucos minutos; com `RAPIDO = False` roda a busca completa usada no relatório.
#
# > **Material acessório:** aplicação web interativa (roda no navegador, sem instalar nada) para refazer estes experimentos: https://epineto.github.io/rescue-boat-rl-unisinos/ · Repositório (MIT): https://github.com/epineto/rescue-boat-rl-unisinos

# %% [markdown]
# ## 0. Configuração

# %%
import sys, subprocess, importlib
try:
    import gymnasium as gym
except ImportError:  # o Colab costuma trazer o gymnasium; se faltar, nós o instalamos
    subprocess.run([sys.executable, "-m", "pip", "-q", "install", "gymnasium"], check=True)
    import gymnasium as gym

try:
    from numba import njit
except ImportError:  # o Colab já traz o numba; se faltar, nós o instalamos
    subprocess.run([sys.executable, "-m", "pip", "-q", "install", "numba"], check=True)
    from numba import njit
import itertools, json, multiprocessing, os, time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
import numpy as np
import pandas as pd
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrowPatch, Polygon
from gymnasium import spaces

RAPIDO = False          # True: versão reduzida (poucos minutos). False: busca completa do relatório.
SEMENTE_BASE = 2026
SAIDA = "saidas_t2"     # figuras e tabelas geradas
os.makedirs(SAIDA, exist_ok=True)

plt.rcParams.update({
    "figure.dpi": 130, "savefig.dpi": 200, "font.size": 9, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#E3E6EE", "grid.linewidth": 0.6, "axes.axisbelow": True,
    "axes.titleweight": "bold", "axes.titlecolor": "#1D2369", "legend.frameon": False})
AZUL, VERMELHO, AZUL2, VERDE, CINZA = "#1D2369", "#C0392B", "#4A5AB8", "#2E7D5B", "#666666"

# =============================================================================
# LOGO DA UNISINOS NOS GRÁFICOS
# -----------------------------------------------------------------------------
# Mantemos o padrão dos notebooks das aulas 07 e 08: a logo aparece no canto
# superior direito de cada figura (fig.add_axes + imshow). Nós baixamos a imagem
# da URL pública abaixo; se o download falhar, as figuras saem sem logo e o
# restante do notebook continua normalmente.
# =============================================================================
import io, urllib.request
from PIL import Image
LOGO_URL = "https://porvir-5g-project.github.io/unisinos.png"

def carrega_logo(url=LOGO_URL):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return np.array(Image.open(io.BytesIO(resp.read())).convert("RGBA"))
    except Exception as e:
        print(f"(Aviso: não foi possível baixar a logo — {e})"); return None

_logo = carrega_logo()

from matplotlib.ticker import FuncFormatter, ScalarFormatter

def _fmt_ptbr(casas):
    """Formatador pt-BR: vírgula decimal, ponto como separador de milhar e sinal de menos tipográfico (−)."""
    def f(v, _pos=None):
        if abs(v) < 10 ** (-casas - 1): v = 0.0
        t = f"{abs(v):,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return ("\u2212" + t) if v < 0 else t
    return f

def _casas_decimais(ticks):
    """Menor número de casas (0 a 3) que representa todos os ticks da escala."""
    for c in range(4):
        if all(abs(round(t, c) - t) < 1e-9 * max(1.0, abs(t)) for t in ticks): return c
    return 3

def formata_eixos_ptbr(fig):
    """Aplica o formatador pt-BR a todos os eixos numéricos lineares; eixos log mantêm 10^n e eixos sem escala numérica ficam como estão."""
    for ax in fig.axes:
        if not ax.axison: continue
        for eixo, lim in ((ax.xaxis, ax.get_xlim()), (ax.yaxis, ax.get_ylim())):
            if eixo.get_scale() != "linear" or not isinstance(eixo.get_major_formatter(), ScalarFormatter): continue
            ticks = [t for t in eixo.get_majorticklocs() if min(lim) - 1e-9 <= t <= max(lim) + 1e-9]
            if ticks: eixo.set_major_formatter(FuncFormatter(_fmt_ptbr(_casas_decimais(ticks))))

def salva_fig(fig, nome):
    """Reservamos uma faixa no topo, aplicamos o formato numérico pt-BR aos eixos, colocamos a logo (se disponível) e salvamos a figura em SAIDA."""
    formata_eixos_ptbr(fig)
    fig.tight_layout(rect=[0, 0, 1, 0.86])
    if _logo is not None:
        ax_logo = fig.add_axes([0.76, 0.865, 0.23, 0.135], anchor="NE", zorder=10)
        ax_logo.imshow(_logo); ax_logo.axis("off")
    fig.savefig(f"{SAIDA}/{nome}", bbox_inches="tight")

# %% [markdown]
# ## 1. Ambiente `RescueBoatEnv` (Gymnasium)
# **Mapa 6×6** (parametrizável por texto): `.` água calma · `~` correnteza · `x` destroços (logo abaixo da correnteza) ·
# `#` célula bloqueada (4) · `H` abrigo (início/entrega) · `P` pessoa ilhada.
#
# **MDP.** Estado $s=(l,c,e_1,e_2,e_3)$: posição do barco e situação de cada pessoa ($0$ ilhada, $1$ a bordo, $2$ salva), com no máximo
# 2 a bordo e mapa fixo ⇒ $|\mathcal S| = 32\times 26 = 832$. Ações: N, S, L, O. Em água calma o movimento é determinístico; na correnteza,
# com prob. 0,8 executa a ação e com 0,2 é arrastado uma célula ao sul. Colisão (parede/bloqueio) mantém o barco no lugar.
# Embarque e desembarque ocorrem na célula onde o passo termina (barco cheio ⇒ a pessoa continua ilhada; no abrigo todos a bordo desembarcam).
# Recompensas: −1 por passo (−10 ao entrar em célula de destroços — não é estado terminal: o episódio continua), +50 por pessoa entregue e +100 ao resgatar todas. Término: todas salvas;
# truncamento por limite de passos.

# %%
MAPA_PADRAO = [
    "P..P..",
    ".#..#P",
    "~~~~~~",
    "..xx..",
    ".#..#.",
    "..H...",
]
ACOES = {0: "N", 1: "S", 2: "L", 3: "O"}
DELTA = {0: (-1, 0), 1: (1, 0), 2: (0, 1), 3: (0, -1)}   # (linha, coluna)


# =============================================================================
# AMBIENTE RescueBoatEnv
# -----------------------------------------------------------------------------
# Aqui nós modelamos o problema como um MDP finito: construímos o espaço de estados
# (posição do barco × situação das 3 pessoas) e preenchemos env.P[s][a] com as
# transições (prob, próximo estado, recompensa, terminou) que os algoritmos usam.
# =============================================================================
class RescueBoatEnv(gym.Env):
    """Barco de resgate em área alagada — MDP tabular finito e episódico, com o modelo exposto em ``env.P``."""
    metadata = {"render_modes": ["ansi", "rgb_array"]}

    def __init__(self, mapa=MAPA_PADRAO, p_corr=0.2, capacidade=2, max_passos=100, render_mode=None,
                 r_passo=-1.0, r_destrocos=-10.0, r_pessoa=50.0, r_final=100.0):
        self.mapa = [str(l) for l in mapa]
        self.nl, self.nc = len(self.mapa), len(self.mapa[0])
        self.p_corr, self.cap, self.max_passos, self.render_mode = p_corr, capacidade, max_passos, render_mode
        self.r_passo, self.r_destrocos, self.r_pessoa, self.r_final = r_passo, r_destrocos, r_pessoa, r_final
        celulas = [(i, j) for i in range(self.nl) for j in range(self.nc)]
        self.bloqueios = {p for p in celulas if self.mapa[p[0]][p[1]] == "#"}
        self.corr = {p for p in celulas if self.mapa[p[0]][p[1]] == "~"}
        self.destrocos = {p for p in celulas if self.mapa[p[0]][p[1]] == "x"}
        self.abrigo = next(p for p in celulas if self.mapa[p[0]][p[1]] == "H")
        self.pessoas = [p for p in celulas if self.mapa[p[0]][p[1]] == "P"]          # numeramos as pessoas na ordem de leitura do mapa
        self.n_pes = len(self.pessoas)
        self.celulas = [p for p in celulas if p not in self.bloqueios]
        self.idx_cel = {p: k for k, p in enumerate(self.celulas)}
        self.situacoes = [e for e in itertools.product(range(3), repeat=self.n_pes) if sum(x == 1 for x in e) <= self.cap]
        self.idx_sit = {e: k for k, e in enumerate(self.situacoes)}
        self.nS, self.nA = len(self.celulas) * len(self.situacoes), 4
        self.observation_space, self.action_space = spaces.Discrete(self.nS), spaces.Discrete(self.nA)
        self.s0 = self.codifica(self.abrigo, (0,) * self.n_pes)
        self.P = self._constroi_P()
        self.s, self.passos = self.s0, 0

    # ---- codificação -------------------------------------------------------
    def codifica(self, cel, sit): return self.idx_cel[cel] * len(self.situacoes) + self.idx_sit[tuple(sit)]
    def decodifica(self, s):
        k, e = divmod(int(s), len(self.situacoes)); return self.celulas[k], self.situacoes[e]

    # ---- modelo ------------------------------------------------------------
    def _mover(self, cel, delta):
        n = (cel[0] + delta[0], cel[1] + delta[1])
        return cel if not (0 <= n[0] < self.nl and 0 <= n[1] < self.nc) or n in self.bloqueios else n

    def _resultado(self, cel, sit, nova):
        """Efeitos do fim do passo na célula ``nova``: destroços, embarque, desembarque no abrigo e término."""
        r = self.r_destrocos if nova in self.destrocos else self.r_passo
        sit = list(sit)
        for i, pos in enumerate(self.pessoas):                      # embarque: só embarcamos a pessoa se ainda houver vaga a bordo
            if pos == nova and sit[i] == 0 and sum(x == 1 for x in sit) < self.cap: sit[i] = 1
        if nova == self.abrigo:                                      # no abrigo desembarcamos todos e pagamos +50 por pessoa entregue
            for i in range(self.n_pes):
                if sit[i] == 1: sit[i] = 2; r += self.r_pessoa
        fim = all(x == 2 for x in sit)
        if fim: r += self.r_final
        return nova, tuple(sit), r, fim

    def _constroi_P(self):
        P = {}
        for s in range(self.nS):
            cel, sit = self.decodifica(s); P[s] = {}
            for a in range(self.nA):
                if all(x == 2 for x in sit):                         # nos estados terminais nós criamos um laço absorvente (prob. 1, recompensa 0)
                    P[s][a] = [(1.0, s, 0.0, True)]; continue
                saidas = [(1.0, DELTA[a])] if cel not in self.corr else [(1 - self.p_corr, DELTA[a]), (self.p_corr, DELTA[1])]
                acum = defaultdict(float)
                for p, d in saidas:
                    nova, nsit, r, fim = self._resultado(cel, sit, self._mover(cel, d))
                    acum[(self.codifica(nova, nsit), r, fim)] += p
                P[s][a] = [(p, s2, r, f) for (s2, r, f), p in acum.items()]
        return P

    # ---- API Gymnasium -----------------------------------------------------
    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed); self.s, self.passos = self.s0, 0
        return self.s, {}

    def step(self, a):
        trans = self.P[self.s][int(a)]
        i = self.np_random.choice(len(trans), p=[t[0] for t in trans])
        _, s2, r, fim = trans[i]
        self.s, self.passos = s2, self.passos + 1
        return s2, r, fim, (not fim) and self.passos >= self.max_passos, {}

    # ---- renderização ------------------------------------------------------
    def _grade(self, s):
        cel, sit = self.decodifica(s)
        g = [list(l) for l in self.mapa]
        for i, p in enumerate(self.pessoas):
            if sit[i] != 0: g[p[0]][p[1]] = "." if p != self.abrigo else "H"
        g[cel[0]][cel[1]] = "B"
        return g, sit

    def render(self, s=None):
        s = self.s if s is None else s
        if self.render_mode == "rgb_array" or self.render_mode == "png":
            return self.desenha(s)
        g, sit = self._grade(s)
        sit_txt = {0: "ilhada", 1: "a bordo", 2: "salva"}
        return "\n".join("".join(l) for l in g) + "\n" + " | ".join(f"P{i+1}: {sit_txt[e]}" for i, e in enumerate(sit))

    def desenha(self, s=None, politica=None, ax=None, titulo=None):
        """Imagem do mapa (matplotlib). Se ``politica`` (vetor de ações) for dada, desenha setas para o barco nas células de H e das pessoas
        na situação inicial; usado nas figuras do relatório."""
        s = self.s0 if s is None else s
        cel, sit = self.decodifica(s); proprio = ax is None
        if proprio: fig, ax = plt.subplots(figsize=(3.6, 3.6))
        cores = {".": "#EAF3FB", "~": "#9CC9EC", "x": "#C9A27E", "#": "#5B5F6B", "H": "#BFE3C9", "P": "#EAF3FB"}
        for i in range(self.nl):
            for j in range(self.nc):
                ch = self.mapa[i][j]
                ax.add_patch(Rectangle((j, self.nl - 1 - i), 1, 1, fc=cores[ch], ec="white", lw=1.5))
                topo = politica is not None                              # com setas, os símbolos ficam no canto da célula
                px, py, tam = (j + .2, self.nl - 1 - i + .8, 8) if topo else (j + .5, self.nl - 1 - i + .5, 12)
                if ch == "~": ax.text(px, py, "≈", ha="center", va="center", color="#4A86B8", fontsize=tam)
                if ch == "x": ax.text(px, py, "✕", ha="center", va="center", color="#7A5535", fontsize=tam - 1)
                if ch == "H": ax.text(px, py, "H", ha="center", va="center", color=VERDE, fontsize=tam + 1, fontweight="bold")
        for k, p in enumerate(self.pessoas):
            if sit[k] == 0:
                if politica is None: ax.text(p[1] + .5, self.nl - 1 - p[0] + .5, f"P{k+1}", ha="center", va="center", color=VERMELHO, fontsize=10, fontweight="bold", zorder=7, bbox=dict(boxstyle="round,pad=0.12", fc="white", ec="none", alpha=0.8))
                else: ax.text(p[1] + .2, self.nl - 1 - p[0] + .8, f"P{k+1}", ha="center", va="center", color=VERMELHO, fontsize=7, fontweight="bold")
        bx, by = cel[1] + .5, self.nl - 1 - cel[0] + .5                       # desenhamos o barco: casco + vela
        if politica is None: ax.add_patch(Polygon([(bx - .30, by - .08), (bx + .30, by - .08), (bx + .18, by - .26), (bx - .18, by - .26)], fc="#7A4B1F", ec="none", zorder=5))
        if politica is None: ax.add_patch(Polygon([(bx - .02, by - .04), (bx - .02, by + .32), (bx + .24, by - .04)], fc="white", ec=AZUL, lw=.8, zorder=5))
        if politica is not None:
            for p in self.celulas:
                if p in self.destrocos or p in self.pessoas: pass
                a = int(politica[self.codifica(p, sit)]); dx, dy = DELTA[a][1], -DELTA[a][0]
                x0, y0 = p[1] + .5 - .28 * dx, self.nl - 1 - p[0] + .5 - .28 * dy
                ax.add_patch(FancyArrowPatch((x0, y0), (x0 + .56 * dx, y0 + .56 * dy), arrowstyle="-|>", mutation_scale=8, color=AZUL, lw=1.1))
        ax.set_xlim(0, self.nc); ax.set_ylim(0, self.nl); ax.set_aspect("equal"); ax.axis("off")
        if titulo: ax.set_title(titulo, fontsize=9)
        if proprio:
            fig.canvas.draw(); img = np.asarray(fig.canvas.buffer_rgba())[..., :3].copy(); plt.close(fig); return img


# %% [markdown]
# ### 1.1 Validação do ambiente

# %%
env = RescueBoatEnv()
print(f"|S| = {env.nS} estados  (esperado 32 × 26 = 832) | |A| = {env.nA} | pessoas: {env.pessoas} | abrigo: {env.abrigo}")
assert env.nS == 832 and len(env.celulas) == 32 and len(env.situacoes) == 26
# conferimos que cada linha de P soma 1 (distribuição de probabilidade)
assert all(abs(sum(p for p, *_ in env.P[s][a]) - 1) < 1e-12 for s in range(env.nS) for a in range(env.nA))
# Testamos as regras de embarque, capacidade e desembarque com transições montadas à mão:
def so_destino(s, a):                        # nas células de água calma há um único resultado
    (p, s2, r, f), = env.P[s][a]; return s2, r, f
# (1) embarque: do lado de uma pessoa, entrar na célula dela muda a situação de 0 para 1
s_a = env.codifica((0, 1), (0, 0, 0)); s2, r, f = so_destino(s_a, 3)          # O: (0,1) -> (0,0), onde está P1
assert env.decodifica(s2) == ((0, 0), (1, 0, 0)) and r == -1
# (2) colisão: tentar entrar em célula bloqueada mantém o barco no lugar
s_c = env.codifica((1, 3), (0, 0, 0)); s2, r, f = so_destino(s_c, 2)          # L: (1,3) -> (1,4) é bloqueio
assert env.decodifica(s2)[0] == (1, 3)
# (3a) capacidade: com 2 a bordo, a terceira pessoa continua ilhada
s_d = env.codifica((0, 5), (1, 1, 0)); s2, r, f = so_destino(s_d, 1)           # S: (0,5) -> (1,5), onde está P3, mas o barco está cheio
assert env.decodifica(s2) == ((1, 5), (1, 1, 0))
# (3b) desembarque + término: chegando ao abrigo com os dois a bordo, ganhamos +50 por pessoa; com tudo salvo, +100
s_e = env.codifica((4, 2), (1, 1, 2)); s2, r, f = so_destino(s_e, 1)           # S: (4,2) -> (5,2) = abrigo
assert env.decodifica(s2) == ((5, 2), (2, 2, 2)) and r == -1 + 2 * 50 + 100 and f
# (4) destroços: entrar em célula de destroços custa -10 (e não -1); não é estado terminal, o episódio continua
s_g = env.codifica((4, 2), (0, 0, 0)); s2, r, f = so_destino(s_g, 0)           # N: (4,2) -> (3,2) = destroços
assert env.decodifica(s2)[0] == (3, 2) and r == -10
print("Regras do ambiente conferidas (embarque, capacidade, desembarque, término e destroços).")
print(env.render())

# %%
fig, ax = plt.subplots(figsize=(3.6, 3.6)); env.desenha(ax=ax, titulo="Mapa do ambiente (início)"); salva_fig(fig, "fig_mapa.png"); plt.show()
print("Trecho de episódio aleatório (renderização em texto):")
env.reset(seed=0); env.action_space.seed(0)   # fixamos as duas sementes para o trecho de exemplo ser reproduzível
for t in range(3):
    s, r, fim, trunc, _ = env.step(env.action_space.sample()); print(f"-- passo {t+1}: r={r}\n{env.render()}")

# %% [markdown]
# ## 2. Simulador rápido a partir de `env.P`
# Os experimentos usam um simulador numérico **equivalente** (construído a partir de `env.P`) para acelerar milhares de episódios.
# O teste abaixo confere que ele reproduz as mesmas transições do ambiente Gymnasium.

# %%
# =============================================================================
# SIMULADOR RÁPIDO
# -----------------------------------------------------------------------------
# Para treinar dezenas de milhares de episódios, nós compilamos env.P em arrays do
# numpy e amostramos as transições direto deles (mesma interface do Gymnasium).
# =============================================================================
class AmbienteRapido:
    """Mesma interface reset/step do Gymnasium, amostrando diretamente de env.P pré-compilado em arrays."""
    def __init__(self, env, max_passos=100, seed=0):
        self.nS, self.nA, self.s0, self.max_passos = env.nS, env.nA, env.s0, max_passos
        K = max(len(env.P[s][a]) for s in range(env.nS) for a in range(env.nA))
        self.prox = np.zeros((env.nS, env.nA, K), dtype=np.int32); self.cum = np.ones((env.nS, env.nA, K))
        self.rec = np.zeros((env.nS, env.nA, K)); self.fim = np.zeros((env.nS, env.nA, K), dtype=bool)
        for s in range(env.nS):
            for a in range(env.nA):
                c = 0.0
                for k, (p, s2, r, f) in enumerate(env.P[s][a]):
                    c += p; self.prox[s, a, k], self.cum[s, a, k], self.rec[s, a, k], self.fim[s, a, k] = s2, c, r, f
                self.cum[s, a, len(env.P[s][a]) - 1:] = 1.0
                self.prox[s, a, len(env.P[s][a]):] = self.prox[s, a, len(env.P[s][a]) - 1]
        self.rng = np.random.default_rng(seed); self.s = self.s0; self.t = 0

    def reset(self): self.s, self.t = self.s0, 0; return self.s

    def step(self, a):
        u, k = self.rng.random(), 0
        c = self.cum[self.s, a]
        while u > c[k]: k += 1
        s2, r, f = self.prox[self.s, a, k], self.rec[self.s, a, k], self.fim[self.s, a, k]
        self.s, self.t = int(s2), self.t + 1
        return self.s, float(r), bool(f), (not f) and self.t >= self.max_passos


# validamos o simulador: comparamos a frequência empírica das transições com env.P (barco na correnteza, ação N)
fast = AmbienteRapido(env, seed=1)
s_ref = env.codifica((2, 2), (0, 0, 0)); n = 40000; cont = defaultdict(int)
for _ in range(n):
    fast.s = s_ref; s2, r, f, _ = fast.step(0); cont[(s2, r)] += 1
for p, s2, r, f in env.P[s_ref][0]:
    print(f"P teórica={p:.2f}  freq. simulador={cont[(s2, r)] / n:.3f}  (s'={env.decodifica(s2)[0]}, r={r})")
    assert abs(p - cont[(s2, r)] / n) < 0.01

# %% [markdown]
# ## 3. Algoritmos tabulares
# * **Iteração de Valor** e **Iteração de Política** (cap. 4) usam `env.P` e fornecem a política ótima de referência.
# * **Monte Carlo on-policy ε-soft** (cap. 5, first-visit): sempre parte do abrigo, sem inícios exploratórios.
# * **Q-learning** (off-policy) e **Sarsa** (on-policy) (cap. 6).
#
# Treinamos com limite de **200 passos** por episódio e avaliamos a política gulosa com **100 passos**. O ε decai linearmente de `eps0` a `eps_min`
# na primeira metade dos episódios. Para que os milhares de episódios rodem em segundos, nós compilamos os laços com **numba**.

# %%
# =============================================================================
# ALGORITMOS TABULARES
# -----------------------------------------------------------------------------
# Implementamos Iteração de Valor e de Política (cap. 4), Monte Carlo on-policy
# ε-soft first-visit (cap. 5) e Q-learning/Sarsa (cap. 6). Em todos, o ε decai
# linearmente na primeira metade do treino e nós desempatamos ações ao acaso.
# =============================================================================
def iteracao_valor(env, gamma=0.99, theta=1e-10, max_it=100000):
    V = np.zeros(env.nS)
    for it in range(max_it):
        delta = 0.0
        for s in range(env.nS):
            q = [sum(p * (r + gamma * V[s2] * (not f)) for p, s2, r, f in env.P[s][a]) for a in range(env.nA)]
            m = max(q); delta = max(delta, abs(m - V[s])); V[s] = m
        if delta < theta: break
    Q = np.array([[sum(p * (r + gamma * V[s2] * (not f)) for p, s2, r, f in env.P[s][a]) for a in range(env.nA)] for s in range(env.nS)])
    return V, Q.argmax(1), Q, it + 1

def iteracao_politica(env, gamma=0.99, theta=1e-10):
    pi = np.zeros(env.nS, dtype=int); V = np.zeros(env.nS); rodadas = 0
    while True:
        rodadas += 1
        while True:                                                     # avaliamos a política atual (varreduras até convergir)
            delta = 0.0
            for s in range(env.nS):
                v = sum(p * (r + gamma * V[s2] * (not f)) for p, s2, r, f in env.P[s][pi[s]])
                delta = max(delta, abs(v - V[s])); V[s] = v
            if delta < theta: break
        estavel = True                                                  # melhoramos a política de forma gulosa; se nada mudar, paramos
        for s in range(env.nS):
            q = [sum(p * (r + gamma * V[s2] * (not f)) for p, s2, r, f in env.P[s][a]) for a in range(env.nA)]
            melhor = int(np.argmax(q))
            if q[melhor] > q[pi[s]] + 1e-12: pi[s], estavel = melhor, False
        if estavel: return V, pi, rodadas

@njit
def _eps_linear(ep, n_ep, eps0, eps_min):
    """ε decai linearmente de eps0 até eps_min durante a primeira metade dos episódios e depois fica constante."""
    return max(eps_min, eps0 - (eps0 - eps_min) * ep / max(1.0, 0.5 * n_ep))

@njit
def _acao_eps(Q, s, eps):
    """Política ε-gulosa com desempate aleatório entre as ações de maior valor."""
    nA = Q.shape[1]
    if np.random.random() < eps: return np.random.randint(nA)
    m = Q[s].max(); n = 0
    for a in range(nA):
        if Q[s, a] == m: n += 1
    k = np.random.randint(n)
    for a in range(nA):
        if Q[s, a] == m:
            if k == 0: return a
            k -= 1
    return 0

@njit
def _passo(prox, cum, rec, fim, s, a):
    """Amostra (s', r, terminou) de P[s][a] — mesma amostragem do AmbienteRapido."""
    u = np.random.random(); k = 0
    while u > cum[s, a, k]: k += 1
    return prox[s, a, k], rec[s, a, k], fim[s, a, k]

@njit
def _q_learning(prox, cum, rec, fim, s0, n_ep, alpha, gamma, eps0, eps_min, seed, max_passos, sarsa):
    np.random.seed(seed)
    nS, nA = prox.shape[0], prox.shape[1]
    Q = np.zeros((nS, nA)); retornos = np.zeros(n_ep); sucesso = np.zeros(n_ep, dtype=np.bool_)
    for ep in range(n_ep):
        eps = _eps_linear(ep, n_ep, eps0, eps_min); s = s0; a = _acao_eps(Q, s, eps); G = 0.0; t = 0; terminou = False
        while True:
            s2, r, terminou = _passo(prox, cum, rec, fim, s, a); G += r; t += 1
            a2 = _acao_eps(Q, s2, eps)
            if terminou: alvo = r
            elif sarsa: alvo = r + gamma * Q[s2, a2]            # Sarsa (on-policy): usa a ação que realmente vai tomar
            else: alvo = r + gamma * Q[s2].max()                # Q-learning (off-policy): usa o máximo
            Q[s, a] += alpha * (alvo - Q[s, a]); s = s2; a = a2
            if terminou or t >= max_passos: break
        retornos[ep] = G; sucesso[ep] = terminou
    return Q, retornos, sucesso

@njit
def _monte_carlo(prox, cum, rec, fim, s0, n_ep, gamma, eps0, eps_min, alpha, seed, max_passos):
    """MC on-policy first-visit para controle ε-soft. alpha < 0 usa a média amostral; senão passo constante."""
    np.random.seed(seed)
    nS, nA = prox.shape[0], prox.shape[1]
    Q = np.zeros((nS, nA)); N = np.zeros((nS, nA)); retornos = np.zeros(n_ep); sucesso = np.zeros(n_ep, dtype=np.bool_)
    ts = np.zeros(max_passos, dtype=np.int64); ta = np.zeros(max_passos, dtype=np.int64); tr = np.zeros(max_passos)
    visto = np.zeros((nS, nA), dtype=np.int64)                   # marca (s,a) já vistos no episódio atual (first-visit)
    for ep in range(n_ep):
        eps = _eps_linear(ep, n_ep, eps0, eps_min); s = s0; t = 0; terminou = False
        while True:                                              # geramos o episódio com a política ε-gulosa atual
            a = _acao_eps(Q, s, eps); s2, r, terminou = _passo(prox, cum, rec, fim, s, a)
            ts[t], ta[t], tr[t] = s, a, r; t += 1; s = s2
            if terminou or t >= max_passos: break
        G = 0.0; total = 0.0
        for k in range(t): total += tr[k]
        ret = np.zeros(t)
        for k in range(t - 1, -1, -1):                           # retornos de trás para frente: G = r + γ G
            G = tr[k] + gamma * G; ret[k] = G
        for k in range(t):                                       # primeira visita de cada (s,a)
            if visto[ts[k], ta[k]] != ep + 1:
                visto[ts[k], ta[k]] = ep + 1; N[ts[k], ta[k]] += 1
                passo = 1.0 / N[ts[k], ta[k]] if alpha < 0 else alpha
                Q[ts[k], ta[k]] += passo * (ret[k] - Q[ts[k], ta[k]])
        retornos[ep] = total; sucesso[ep] = terminou
    return Q, retornos, sucesso

@njit
def _avalia(prox, cum, rec, fim, s0, politica, n_ep, max_passos, gamma_av, seed):
    np.random.seed(seed)
    G = np.zeros(n_ep); Gd = np.zeros(n_ep); suc = np.zeros(n_ep); pas = np.zeros(n_ep)
    for ep in range(n_ep):
        s = s0; t = 0; fator = 1.0; terminou = False
        while True:
            s, r, terminou = _passo(prox, cum, rec, fim, s, politica[s]); G[ep] += r; Gd[ep] += fator * r; fator *= gamma_av; t += 1
            if terminou or t >= max_passos: break
        suc[ep] = terminou; pas[ep] = t
    return G, Gd, suc, pas

@njit
def _perfil(prox, cum, rec, fim, s0, politica, em_destr, em_corr, n_ep, max_passos, seed):
    """Para n_ep episódios com a política dada: fração que toca os destroços, nº médio de passos em destroços e na correnteza."""
    np.random.seed(seed); tocou = 0.0; nd_tot = 0.0; nc_tot = 0.0
    for ep in range(n_ep):
        s = s0; t = 0; nd = 0
        while True:
            s, r, terminou = _passo(prox, cum, rec, fim, s, politica[s]); t += 1
            if em_destr[s]: nd += 1
            if em_corr[s]: nc_tot += 1
            if terminou or t >= max_passos: break
        nd_tot += nd; tocou += nd > 0
    return tocou / n_ep, nd_tot / n_ep, nc_tot / n_ep

def _arr(amb): return amb.prox, amb.cum, amb.rec, amb.fim, amb.s0

def q_learning(amb, n_ep, alpha, gamma, eps0, eps_min=0.05, seed=0, max_passos=200, sarsa=False):
    return _q_learning(*_arr(amb), n_ep, alpha, gamma, eps0, eps_min, seed, max_passos, sarsa)

def monte_carlo(amb, n_ep, gamma, eps0, eps_min=0.05, alpha=None, seed=0, max_passos=200):
    return _monte_carlo(*_arr(amb), n_ep, gamma, eps0, eps_min, -1.0 if alpha is None else alpha, seed, max_passos)

GAMMA_AV = 0.99     # γ do problema: usamos o mesmo γ para comparar todas as políticas (inclusive com a Iteração de Valor)

def avalia(amb, politica, n_ep=1000, max_passos=100, seed=12345):
    """Avaliamos uma política determinística (vetor estado→ação) por simulação, com limite de 100 passos."""
    G, Gd, suc, pas = _avalia(*_arr(amb), np.asarray(politica, dtype=np.int64), n_ep, max_passos, GAMMA_AV, seed)
    return {"retorno": G.mean(), "retorno_desc": Gd.mean(), "sucesso": suc.mean(), "passos": pas.mean()}

# %% [markdown]
# ### 3.1 Referência: Iteração de Valor e Iteração de Política

# %%
t0 = time.time(); V_vi, pi_vi, Q_vi, it_vi = iteracao_valor(env, 0.99)
V_pi, pi_pi, rod_pi = iteracao_politica(env, 0.99)
print(f"Iteração de Valor: {it_vi} varreduras ({time.time()-t0:.1f}s) | Iteração de Política: {rod_pi} rodadas | políticas iguais nos estados com V igual: "
      f"{np.mean(np.isclose(V_vi, V_pi, atol=1e-6)):.3f}")
amb = AmbienteRapido(env)
ref = avalia(amb, pi_vi, n_ep=5000)
print(f"V*(s0) = {V_vi[env.s0]:.2f} (valor descontado ótimo exato) | simulação com 5000 episódios: retorno descontado {ref['retorno_desc']:.2f}, "
      f"retorno sem desconto {ref['retorno']:.2f}, sucesso {ref['sucesso']:.3f}, passos {ref['passos']:.1f}")
assert abs(ref["retorno_desc"] - V_vi[env.s0]) < 2.0     # a simulação reproduz o valor exato de V*(s0)

# %% [markdown]
# ## 4. Busca de hiper-parâmetros
# Para cada configuração treinamos com várias sementes e medimos a **política gulosa final** (1000 episódios de avaliação, 100 passos).
# Critério de escolha: maior **retorno descontado médio (γ = 0,99)** na avaliação (desempate pela taxa de sucesso), o mesmo critério para todos os algoritmos. **Todas** as configurações ficam registradas
# em `saidas_t2/busca_hiperparametros.csv` e são resumidas no relatório.

# %%
N_SEM = 3 if RAPIDO else 10
EP_QL = 3000 if RAPIDO else 30000
EP_MC = 6000 if RAPIDO else 60000
GRADE = {
    "Q-learning": dict(alpha=[0.05, 0.1, 0.2, 0.5], eps0=[1.0, 0.5, 0.2], gamma=[0.95, 0.99]),
    "Sarsa":      dict(alpha=[0.05, 0.1, 0.2, 0.5], eps0=[1.0, 0.5, 0.2], gamma=[0.95, 0.99]),
    "Monte Carlo": dict(alpha=[None, 0.05, 0.1], eps0=[1.0, 0.5, 0.2], gamma=[0.95, 0.99]),
}
if RAPIDO:
    GRADE = {k: {kk: vv[:2] for kk, vv in v.items()} for k, v in GRADE.items()}

# =============================================================================
# EXECUÇÃO EM PARALELO
# -----------------------------------------------------------------------------
# Para ganhar tempo, nós rodamos vários treinos ao mesmo tempo, um em cada
# núcleo do processador. Isso usa processos criados com "fork" (no Linux, e
# portanto no Colab): cada processo novo nasce como uma cópia do programa já
# pronto, inclusive com as funções do numba já compiladas.
# Por isso nós compilamos o numba UMA vez aqui, antes de abrir os processos.
# =============================================================================
AMB = AmbienteRapido(env)
q_learning(AMB, 5, 0.1, 0.99, 1.0); q_learning(AMB, 5, 0.1, 0.99, 1.0, sarsa=True); monte_carlo(AMB, 5, 0.99, 1.0); avalia(AMB, pi_vi, 5)

def roda_em_paralelo(funcao, tarefas):
    """Aplicamos ``funcao`` a cada tarefa, usando todos os núcleos quando for possível.
    Se o sistema não permitir criar processos com "fork" (é o caso do Windows), nós rodamos as tarefas
    uma de cada vez. O resultado é o mesmo; só demora mais."""
    try:
        ctx = multiprocessing.get_context("fork")
    except ValueError:                       # este sistema não tem "fork": caímos para a execução sequencial
        return [funcao(t) for t in tarefas]
    with ProcessPoolExecutor(max_workers=os.cpu_count(), mp_context=ctx) as ex:
        return list(ex.map(funcao, tarefas, chunksize=1))

def _um_treino(args):
    algo, cfg, seed = args
    if algo == "Monte Carlo": Q, ret, suc = monte_carlo(AMB, EP_MC, cfg["gamma"], cfg["eps0"], alpha=cfg["alpha"], seed=seed)
    else: Q, ret, suc = q_learning(AMB, EP_QL, cfg["alpha"], cfg["gamma"], cfg["eps0"], seed=seed, sarsa=(algo == "Sarsa"))
    ev = avalia(AMB, Q.argmax(1), n_ep=1000, seed=seed + 1)
    return dict(algoritmo=algo, **{k: ("média" if v is None else v) for k, v in cfg.items()}, semente=seed, **ev,
                suc_treino_final=float(suc[-500:].mean()))

def busca():
    tarefas = []
    for algo, g in GRADE.items():
        for valores in itertools.product(*g.values()):
            cfg = dict(zip(g.keys(), valores))
            tarefas += [(algo, cfg, SEMENTE_BASE + k) for k in range(N_SEM)]
    print(f"{len(tarefas)} treinos ({N_SEM} sementes por configuração) ...")
    t0 = time.time()
    linhas = roda_em_paralelo(_um_treino, tarefas)                   # um treino por núcleo, em paralelo
    print(f"busca concluída em {(time.time()-t0)/60:.1f} min")
    return pd.DataFrame(linhas)

df_busca = busca()
df_busca.to_csv(f"{SAIDA}/busca_por_semente.csv", index=False)
chaves = ["algoritmo", "alpha", "eps0", "gamma"]
tab = (df_busca.groupby(chaves).agg(ret_desc=("retorno_desc", "mean"), ret_desc_dp=("retorno_desc", "std"), retorno=("retorno", "mean"),
                                    sucesso=("sucesso", "mean"), passos=("passos", "mean")).reset_index()
       .sort_values(["algoritmo", "ret_desc", "sucesso"], ascending=[True, False, False]))
tab.to_csv(f"{SAIDA}/busca_hiperparametros.csv", index=False)
melhores = {a: tab[tab.algoritmo == a].iloc[0] for a in tab.algoritmo.unique()}
print(tab.groupby("algoritmo").head(3).round(3).to_string(index=False))

# %% [markdown]
# ## 5. Experimentos finais
# Reexecutamos a melhor configuração de cada algoritmo com **10 sementes** e registramos curvas de aprendizado (média e IC de 95%),
# a avaliação final e a rota aprendida.

# %%
N_FIN = 4 if RAPIDO else 20
def _final(args):
    algo, cfg, seed = args
    alpha = None if cfg["alpha"] == "média" else float(cfg["alpha"])
    if algo == "Monte Carlo": Q, ret, suc = monte_carlo(AMB, EP_MC, float(cfg["gamma"]), float(cfg["eps0"]), alpha=alpha, seed=seed)
    else: Q, ret, suc = q_learning(AMB, EP_QL, float(cfg["alpha"]), float(cfg["gamma"]), float(cfg["eps0"]), seed=seed, sarsa=(algo == "Sarsa"))
    return algo, Q, ret, suc, avalia(AMB, Q.argmax(1), 2000, seed=seed + 5)

tarefas = []
for algo, row in melhores.items():
    cfg = {k: row[k] for k in ("alpha", "eps0", "gamma")}
    tarefas += [(algo, cfg, 9000 + k) for k in range(N_FIN)]
fin = roda_em_paralelo(_final, tarefas)                              # mesma função de paralelização da busca

res = defaultdict(list)
for algo, Q, ret, suc, ev in fin: res[algo].append((Q, ret, suc, ev))
linhas = [{"algoritmo": "Iteração de Valor (referência)", **ref, "ic95_desc": 0.0, "V*(s0)": V_vi[env.s0]}]
for algo, lst in res.items():
    Rd = np.array([e["retorno_desc"] for *_, e in lst]); R = np.array([e["retorno"] for *_, e in lst])
    S = np.array([e["sucesso"] for *_, e in lst]); P_ = np.array([e["passos"] for *_, e in lst])
    linhas.append({"algoritmo": algo, "retorno_desc": Rd.mean(), "retorno": R.mean(), "sucesso": S.mean(), "passos": P_.mean(),
                   "ic95_desc": 1.96 * Rd.std(ddof=1) / np.sqrt(len(Rd))})
tab_final = pd.DataFrame(linhas); tab_final.to_csv(f"{SAIDA}/resultado_final.csv", index=False)
print(tab_final.round(3).to_string(index=False))

# %%
def suaviza(x, w): return np.convolve(x, np.ones(w) / w, mode="valid")
fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.7))
cores = {"Q-learning": AZUL, "Sarsa": AZUL2, "Monte Carlo": VERMELHO}
for algo, lst in res.items():
    n_ep = len(lst[0][1]); w = max(50, n_ep // 100)
    for ax, idx in zip(axs, (1, 2)):
        M = np.array([suaviza(np.asarray(x[idx], float), w) for x in lst]); m, ic = M.mean(0), 1.96 * M.std(0, ddof=1) / np.sqrt(len(M))
        xs = np.arange(len(m)) + w; ax.plot(xs, m, color=cores[algo], label=algo); ax.fill_between(xs, m - ic, m + ic, color=cores[algo], alpha=.15)
axs[0].axhline(ref["retorno"], color=VERDE, ls="--", lw=1, label="Iteração de Valor"); axs[0].set_title("Retorno por episódio (treino)"); axs[1].set_title("Taxa de sucesso (treino)")
for ax in axs: ax.set_xlabel("Episódios (escala log)"); ax.set_xscale("log")
axs[0].legend(fontsize=7); salva_fig(fig, "fig_curvas.png"); plt.show()

# %% [markdown]
# ### 5.1 Política aprendida e o dilema "caminho curto × contorno"
# A rota pelos destroços ao centro é curta e arriscada (a correnteza pode empurrar o barco para os destroços, −10); o contorno pelas laterais é mais longo,
# porém seguro. Medimos, para cada política, quantos passos entram em célula de destroços (−10; não é estado terminal) e na correnteza.

# %%
def rota(politica, env, seed=0, max_passos=100):
    """Executamos um episódio no ambiente Gymnasium com a política dada e devolvemos o caminho percorrido."""
    e = RescueBoatEnv(max_passos=max_passos); e.reset(seed=seed); s = e.s0; caminho = [e.abrigo]; nd = nc = 0
    while True:
        s, r, fim, trunc, _ = e.step(int(politica[s])); cel, _ = e.decodifica(s); caminho.append(cel)
        nd += cel in e.destrocos; nc += cel in e.corr
        if fim or trunc: break
    return caminho, nd, fim, nc

def perfil_rota(politica, env_=None, amb_=None, n=3000, seed=77):
    """Medimos o perfil de risco da política: fração dos episódios que toca os destroços, passos médios em destroços e na correnteza, e o sucesso."""
    env_ = env_ or env; amb_ = amb_ or AMB
    em_d = np.array([env_.decodifica(s)[0] in env_.destrocos for s in range(env_.nS)]); em_c = np.array([env_.decodifica(s)[0] in env_.corr for s in range(env_.nS)])
    tocou, nd, nc = _perfil(*_arr(amb_), np.asarray(politica, dtype=np.int64), em_d, em_c, n, 100, seed)
    return tocou, nd, nc, avalia(amb_, politica, n, 100, seed)["sucesso"]

pols = {"Iteração de Valor": pi_vi}
for algo, lst in res.items():
    ev_melhor = max(range(len(lst)), key=lambda k: lst[k][3]["retorno_desc"]); pols[algo] = lst[ev_melhor][0].argmax(1)
linhas = []
for nome, pol in pols.items():
    tocou, nd, nc, ok = perfil_rota(pol)
    linhas.append({"política": nome, "tocam destroços": tocou, "passos em destroços": nd, "passos na correnteza": nc, "sucesso (100 passos)": ok})
tab_dest = pd.DataFrame(linhas); tab_dest.to_csv(f"{SAIDA}/destrocos.csv", index=False); print(tab_dest.round(3).to_string(index=False))

fig, axs = plt.subplots(1, len(pols), figsize=(2.2 * len(pols), 2.4))
for ax, (nome, pol) in zip(axs, pols.items()):
    env.desenha(ax=ax, politica=pol, titulo=nome)
salva_fig(fig, "fig_politicas.png"); plt.show()

# %% [markdown]
# ### 5.2 Sensibilidade à penalidade dos destroços
# Com a penalidade da proposta (−10) cruzar os destroços uma vez compensa em relação ao contorno, e os três algoritmos aprendem a mesma rota.
# Para testar a hipótese do Cliff Walking (Q-learning arrisca, Sarsa contorna), nós aumentamos a penalidade e comparamos as políticas gulosas aprendidas.

# %%
def sensibilidade(penalidades=(-10, -15, -20, -30, -60), n_sem=10, n_ep=None):
    n_ep = n_ep or (3000 if RAPIDO else 30000); linhas = []
    for pen in penalidades:
        e = RescueBoatEnv(r_destrocos=float(pen)); a = AmbienteRapido(e); _, pi, _, _ = iteracao_valor(e, 0.99)
        cand = {"Iteração de Valor": [pi]}
        for nome, sarsa in (("Q-learning", False), ("Sarsa", True)):
            cand[nome] = [q_learning(a, n_ep, 0.1, 0.99, 1.0, seed=500 + k, sarsa=sarsa)[0].argmax(1) for k in range(n_sem)]
        for nome, pols_ in cand.items():
            perf = np.array([perfil_rota(pl, e, a, n=1500) for pl in pols_]); ev = [avalia(a, pl, 1500)["retorno_desc"] for pl in pols_]
            linhas.append({"penalidade": pen, "algoritmo": nome, "tocam destroços": perf[:, 0].mean(), "passos em destroços": perf[:, 1].mean(),
                           "passos na correnteza": perf[:, 2].mean(), "retorno_desc": np.mean(ev), "sucesso": perf[:, 3].mean()})
    return pd.DataFrame(linhas)

tab_sens = sensibilidade(); tab_sens.to_csv(f"{SAIDA}/sensibilidade_destrocos.csv", index=False)
print(tab_sens.round(3).to_string(index=False))
fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.7))
for nome, cor in (("Iteração de Valor", VERDE), ("Q-learning", AZUL), ("Sarsa", VERMELHO)):
    d = tab_sens[tab_sens.algoritmo == nome]
    axs[0].plot(-d.penalidade, d["passos em destroços"], "o-", color=cor, label=nome); axs[1].plot(-d.penalidade, d["passos na correnteza"], "o-", color=cor, label=nome)
axs[0].set_title("Passos em destroços por episódio"); axs[1].set_title("Passos na correnteza por episódio")
for ax in axs: ax.set_xlabel("Penalidade dos destroços (módulo)")
axs[0].legend(fontsize=7); salva_fig(fig, "fig_sensibilidade.png"); plt.show()

# %% [markdown]
# ### 5.3 Trajetória ilustrativa (política ótima)

# %%
caminho, nd, fim, nc = rota(pi_vi, env, seed=3)
print(f"Rota (Iteração de Valor): {len(caminho)-1} passos, destroços tocados: {nd}, sucesso: {fim}")
print(" → ".join(f"({i},{j})" for i, j in caminho))
fig, ax = plt.subplots(figsize=(3.6, 3.6)); env.desenha(ax=ax, titulo="Rota da política ótima (1 episódio)")
xs = [c[1] + .5 for c in caminho]; ys = [env.nl - 1 - c[0] + .5 for c in caminho]; ax.plot(xs, ys, color=AZUL, lw=1.6, alpha=.8, marker="o", ms=3)
salva_fig(fig, "fig_rota.png"); plt.show()

# %% [markdown]
# ## 6. Resumo para o relatório
# As tabelas e figuras desta seção estão em `saidas_t2/` (`busca_hiperparametros.csv`, `resultado_final.csv`, `destrocos.csv`,
# `sensibilidade_destrocos.csv`, `fig_mapa.png`, `fig_curvas.png`, `fig_politicas.png`, `fig_sensibilidade.png`, `fig_rota.png`).

# %%
print("Melhor configuração por algoritmo:")
print(pd.DataFrame(melhores).T[["alpha", "eps0", "gamma", "ret_desc", "retorno", "sucesso", "passos"]].round(3).to_string())
print("\nArquivos gerados:", sorted(os.listdir(SAIDA)))
