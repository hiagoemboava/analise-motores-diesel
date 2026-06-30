# 🛢️ Análise de Dados de Motores Diesel — Monitoramento Preditivo em Embarcação de Uso Militar

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=white)
![Jupyter](https://img.shields.io/badge/Jupyter-Notebook-orange?logo=jupyter&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-Data%20Analysis-150458?logo=pandas&logoColor=white)
![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow)
![Licença](https://img.shields.io/badge/Licen%C3%A7a-MIT-green)

---

## 📌 Sobre o Projeto

Este projeto aplica técnicas de **Análise Exploratória de Dados (EDA)** sobre dados reais de telemetria coletados dos sistemas de propulsão de uma **embarcação de uso militar**, com o objetivo de:

- Identificar padrões operacionais e anomalias nos motores principais
- Validar a confiabilidade dos sensores instalados a bordo
- Construir a base para um sistema de **monitoramento preditivo** das máquinas
- Apoiar a tomada de decisão técnica da equipe de engenharia de máquinas

O estudo analisa dois motores principais: **Motor BB (boreste)** e **Motor BE (bombordo)**, com foco nas variáveis de pressão de óleo, rotação (RPM) e temperatura.

---

## 🗃️ Dataset

| Atributo | Detalhe |
|---|---|
| **Origem** | Sistema de monitoramento embarcado (telemetria real) |
| **Formato** | `.csv` (série temporal) |
| **Período** | ~15,5 horas de operação contínua |
| **Frequência** | Coleta periódica automatizada via sistema Node-RED |
| **Variáveis principais** | RPM, Pressão de Óleo (bar), Temperatura (°C), Timestamp |
| **Motores analisados** | MCP BB (Motor Principal de Casco Boreste) e MCP BE (Bombordo) |

> ⚠️ **Nota:** Os dados foram anonimizados e não contêm informações operacionais sensíveis.

---

## 🔬 Metodologia

```
1. Coleta e Importação dos Dados
       ↓
2. Limpeza e Pré-processamento
   (tratamento de nulos, offsets de sensor, ruído de RPM em repouso)
       ↓
3. Análise Exploratória (EDA)
   (estatísticas descritivas, distribuições, boxplots, séries temporais)
       ↓
4. Análise de Correlação
   (matriz de correlação, scatter plots RPM × Pressão)
       ↓
5. Diagnóstico de Anomalias
   (identificação de leituras fora do padrão por motor)
       ↓
6. Conclusões e Recomendações Técnicas
```

---

## 📊 Principais Resultados

### ✅ Motor BB (Boreste)
- Correlação de **0,95** entre RPM e pressão de óleo — comportamento esperado e saudável
- Dados consistentes ao longo de todo o período de operação analisado

### ⚠️ Motor BE (Bombordo)
- Identificada **anomalia no sensor de pressão de óleo**: leituras zeradas em períodos de operação normal
- Evidência de falha instrumental confirmada por análise estatística
- Recomendação emitida para inspeção e substituição do sensor

### 📉 Qualidade dos Dados
- Detectadas **lacunas de coleta** (gaps temporais) na série histórica
- Identificado **offset de zero** em sensores de temperatura durante paradas do motor
- Ruído de RPM em repouso tratado com filtragem por limiar

---

## 🛠️ Tecnologias Utilizadas

| Ferramenta | Uso |
|---|---|
| **Python 3.10+** | Linguagem principal |
| **Pandas** | Manipulação e limpeza de dados |
| **Matplotlib / Seaborn** | Visualizações e gráficos |
| **NumPy** | Cálculos numéricos |
| **Jupyter Notebook** | Ambiente de análise interativa |
| **Node-RED** | Coleta e geração dos dados de telemetria |

---

## 📁 Estrutura do Repositório

```
📦 analise-motores-diesel/
├── 📂 data/
│   ├── raw/                  # CSVs originais de telemetria
│   └── processed/            # Dados tratados e filtrados
├── 📂 notebooks/
│   └── analise_motores.ipynb # Notebook principal da análise
├── 📂 reports/
│   └── relatorio_final.pdf   # Relatório técnico gerado
├── 📂 images/
│   └── *.png                 # Gráficos exportados
├── requirements.txt          # Dependências do projeto
└── README.md
```

---

## ▶️ Como Executar

### Pré-requisitos
- Python 3.10 ou superior
- pip ou conda instalado

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/analise-motores-diesel.git
cd analise-motores-diesel

# 2. Instale as dependências
pip install -r requirements.txt

# 3. Abra o Jupyter Notebook
jupyter notebook notebooks/analise_motores.ipynb
```

### Dependências (`requirements.txt`)
```
pandas>=1.5.0
numpy>=1.23.0
matplotlib>=3.6.0
seaborn>=0.12.0
jupyter>=1.0.0
```

---

## 📈 Próximos Passos

- [ ] Implementar modelo de **detecção de anomalias** (Isolation Forest / Z-Score dinâmico)
- [ ] Criar **dashboard interativo** com Plotly ou Power BI
- [ ] Ampliar dataset para análise de múltiplos períodos operacionais
- [ ] Treinar modelo preditivo para **manutenção preventiva**

---

## 👤 Autor

**Hiago Emboava Arantes dos Santos**
Oficial da Marinha do Brasil | Análise de Dados | Gestão de Projetos com IA

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Conectar-0077B5?logo=linkedin&logoColor=white)](https://linkedin.com/in/seu-usuario)
[![GitHub](https://img.shields.io/badge/GitHub-Perfil-181717?logo=github&logoColor=white)](https://github.com/seu-usuario)

---

## 📄 Licença

Este projeto está licenciado sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

---

> *"Dados sem contexto são ruído. Dados com contexto operacional são inteligência."*
