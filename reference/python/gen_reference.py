"""Gera tests/reference.json a partir do código Python de referência (rescue_boat_rl.py): modelo P completo, V*, política ótima
e valores-alvo estatísticos do relatório. Uso: python gen_reference.py <saida.json>   (requer numpy, gymnasium, matplotlib, pandas, numba)"""
import io, json, os, sys, tempfile, contextlib
import matplotlib; matplotlib.use("Agg")
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "rescue_boat_rl.py")).read()
corte = src.index("# %% [markdown]\n# ### 3.1")          # até as definições de VI/PI (inclui o ambiente e o simulador)
ns = {"__name__": "ref"}
os.chdir(tempfile.mkdtemp())
with contextlib.redirect_stdout(io.StringIO()):
    exec(compile(src[:corte], "rescue_boat_rl.py", "exec"), ns)
env, VI, PI = ns["env"], ns["iteracao_valor"], ns["iteracao_politica"]
RescueBoatEnv = ns["RescueBoatEnv"]
V, pi, Q, it = VI(env, 0.99); Vp, pip, rod = PI(env, 0.99)
ref = {
  "nS": env.nS, "nA": env.nA, "s0": env.s0, "cells": [list(c) for c in env.celulas], "situations": [list(e) for e in env.situacoes],
  "P": [[[ [p, s2, r, bool(f)] for p, s2, r, f in env.P[s][a] ] for a in range(env.nA)] for s in range(env.nS)],
  "gamma": 0.99, "V": [float(x) for x in V], "pi": [int(x) for x in pi], "Vstar_s0": float(V[env.s0]), "vi_sweeps": it, "pi_rounds": rod,
  "sens": {},
  # alvos estatísticos do relatório (10 sementes na busca; 20 no resultado final)
  "targets": {"Q-learning": {"mean": 161.92, "ic95": 0.033}, "Sarsa": {"mean": 161.74, "ic95": 0.256}, "Monte Carlo": {"mean": 159.76, "ic95": 0.86}},
}
for pen in (-10, -15, -20, -30, -60):
    e = RescueBoatEnv(r_destrocos=float(pen)); v, p, q, i = VI(e, 0.99)
    ref["sens"][str(pen)] = {"Vstar_s0": float(v[e.s0]), "pi": [int(x) for x in p]}
json.dump(ref, open(sys.argv[1], "w"), separators=(",", ":"))
print("referência escrita:", sys.argv[1], f"({os.path.getsize(sys.argv[1])/1024:.0f} KB)")
