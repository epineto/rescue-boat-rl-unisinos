# Reprodução dos resultados do relatório na aplicação

[English version](REPRODUCTION.md) · [README](../README.md)

Este guia mapeia cada tabela, figura e número do relatório do Trabalho 2 ao cartão/botão da aplicação (<https://epineto.github.io/rescue-boat-rl-unisinos/>) e informa os valores esperados. Use o **ambiente padrão** (penalidade dos destroços −10, correnteza 0,2, capacidade 2, mapa 6×6 padrão) e o idioma que preferir.

> **Atalho:** a seção **Reproduzir** (botão **Reproduzir a pesquisa**) executa em sequência a Comparação (20 sementes), a Sensibilidade completa (10 sementes) e a Busca completa (66 configurações × 10 sementes), restaura o ambiente padrão e, no fim, baixa um `.zip` com todos os CSVs. Leva alguns minutos. Abaixo está o mapeamento manual, item a item.

## Tolerâncias
O relatório usa um simulador em Numba e sementes do NumPy; o app usa o gerador mulberry32 (`src/rng.js`) e as sementes 9000 + k, como no notebook. O que é **determinístico** (modelo P, V*, política ótima, número de varreduras/rodadas) coincide exatamente. O que depende de sorteios (Q-learning, Sarsa, Monte Carlo) coincide **estatisticamente**: espere valores dentro do IC95 do relatório, não idênticos casa a casa.

## Mapa de correspondência

| Item do relatório | Onde na aplicação | Como obter | Valor esperado |
|---|---|---|---|
| **Figura 1**: mapa 6×6 (abrigo H em (5,2); pessoas P1 (0,0), P2 (0,3), P3 (1,5); correnteza na linha 2; destroços (3,2) e (3,3); 4 blocos) | **Ambiente e referência** → Mapa e legenda | Abrir a página | Mapa idêntico ao da figura; \|S\| = 832 estados, 4 ações |
| **Figura 1**: rota ótima (volta pelo centro, cruzando a correnteza e os destroços) | **Rota** | Política **Ótima**, semente 3, **Iniciar** | Rota de cerca de 31 passos pelo centro: correnteza (2,2), destroços (3,2), (4,2), abrigo (arrastes da correnteza podem causar desvios) |
| Iteração de Valor: 35 varreduras; V*(s₀) = 161,93 | **Ambiente e referência** → Referência: Iteração de Valor | Abrir a página | V*(s₀) = 161,93; 35 varreduras; 31,0 passos; sucesso 100% |
| Iteração de Política: 14 rodadas, mesma política | **Treinar** → algoritmo **Iteração de Política** → Calcular | Escolher o algoritmo e clicar em Calcular | 14 rodadas; "Coincide com a Iteração de Valor? Sim" |
| **Tabela 1**, linha "It. de Valor (ref.)": 161,84 ± 0,00; 31,0 passos | **Comparar** → linha Iteração de Valor (exata) | **Comparar** | Retorno 161,93 (exato); o relatório mostra 161,84 por ser a política avaliada por simulação (2000 episódios) |
| **Tabela 1**, Q-learning: melhor config. (0,1; 1; 0,95) → 161,92 ± 0,03; 31,0 passos | **Comparar** (config. padrão = melhores da pesquisa) | Sementes = 20 → **Comparar** | 161,92 ± ~0,03 (IC95), sucesso 100%, ~31 passos |
| **Tabela 1**, Sarsa: melhor config. (0,2; 1; 0,99) → 161,74 ± 0,26; 31,3 passos | idem | idem | 161,74 ± ~0,26, sucesso 100%, ~31 passos |
| **Tabela 1**, Monte Carlo: melhor config. (média; 0,5; 0,95) → 159,76 ± 0,86; 31,0 passos | idem | idem | 159,76 ± ~0,86, sucesso 100% |
| **Tabela 1**, colunas Pior / Mediana / Melhor da busca (Monte Carlo −63,4 / 41,0 / 160,5; Q-learning 102,0 / 140,0 / 161,9; Sarsa 117,0 / 134,8 / 161,6) | **Busca** | **Restaurar grade da pesquisa** (66 configurações, 10 sementes) → **Rodar a busca**; ordenar a tabela por retorno | Pior/mediana/melhor por algoritmo próximos aos valores do relatório; melhor config. de cada algoritmo igual à da tabela |
| Texto: efeito de ε₀ (Q-learning 151,6 / 145,9 / 137,0 para ε₀ = 1; 0,5; 0,2; Sarsa 155,3 / 135,7 / 130,4) | **Busca** → CSV com todas as configurações | Exportar e calcular a média por ε₀ | Médias próximas às do relatório |
| Texto: α = 0,5 instável; Monte Carlo com α constante muito pior (29,7 com α = 0,05; −21,5 com α = 0,1) | **Busca** → tabela ordenável | Ordenar por retorno | Piores casos: Q-learning 102,0 (70% de sucesso), Sarsa 117,0 (90%), Monte Carlo α = 0,1; ε₀ = 0,5; γ = 0,99 com 0% de sucesso |
| **Figura 2**: retorno e sucesso no treino (média de sementes; eixo x log; linha tracejada = Iteração de Valor) | **Comparar** → Curvas de aprendizado | Marcar "Eixo x em escala logarítmica" | Monte Carlo sobe mais rápido (~80% de sucesso no 1º ponto); métodos TD passam de 95% por volta de 5.000 episódios |
| **Figura 1** (políticas gulosas) | **Comparar** → Políticas gulosas | Após **Comparar** | As quatro políticas passam pelos destroços uma vez e ~4,5 passos na correnteza, voltando pelo centro |
| **Figura 3**: passos em destroços e na correnteza × penalidade | **Sensibilidade** | **Calcular (Iteração de Valor)** e depois **Incluir Q-learning e Sarsa** (10 sementes) | Rota ótima muda entre −10 e −15 (com −10 cruza os destroços; de −15 em diante contorna); V*(s₀) = 161,93 com −10 e 159,158 com −15 a −60 |
| Texto: Sarsa não é mais cauteloso (−15: 11,1% de episódios nos destroços vs 2,0% do Q-learning; 5,02 vs 4,58 passos na correnteza, ótimo 4,50) | **Sensibilidade** → tabela | Incluir Q-learning e Sarsa, 10 sementes | Valores próximos aos citados (ruído de sorteio) |

## Passo a passo resumido
1. **Referência:** abra a página; confira V*(s₀) = 161,93.
2. **Treino único:** em **Treinar**, Q-learning com α = 0,1, ε₀ = 1, γ = 0,95, 30.000 episódios → **Treinar**; o retorno descontado da política gulosa deve ficar perto de 161,9.
3. **Tabela 1 (resultado final):** em **Comparar**, Número de sementes = 20 → **Comparar**.
4. **Tabela 1 (busca):** em **Busca**, **Restaurar grade da pesquisa** → **Rodar a busca** (10 sementes; o "Modo rápido" usa só 3).
5. **Figura 3:** em **Sensibilidade**, **Restaurar penalidades da pesquisa** → **Calcular** → **Incluir Q-learning e Sarsa** com 10 sementes.
6. **Exportar:** os botões **Exportar CSV** de cada seção geram as tabelas; **Reproduzir a pesquisa** gera o `.zip` com tudo.

## Compartilhar uma configuração
O botão **Copiar link da configuração** (seção **Reproduzir**) gera um link `#cfg=…` com o mapa, o ambiente e os hiperparâmetros do cartão Treinar. Quem abre o link vê a mesma configuração.
