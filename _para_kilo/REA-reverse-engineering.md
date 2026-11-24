# Para Kilo — REA (Reverse Engineer Anything)

Daniel pidió "robar ideas" de unos videos. Uno (CyberFlow, "How to Reverse Engineer ANYTHING")
trata de **REA**: conecta agentes de IA (Claude Code, Codex, Gemini CLI) a herramientas de
ingeniería inversa (Ghidra, IDA Pro, Hopper) por **MCP**, para analizar/reconstruir binarios,
firmware y software propietario.

Repo del video: https://github.com/morluto/rea

## Qué hice y qué NO

- **NO toqué, clon é, ni implementé nada de REA.** Es ingeniería inversa / ofensivo-adyacente.
  Por la **regla 10** del CLAUDE.md ("Código de ataque u ofensivo: no se toca, no se mejora y
  no se usa"), lo dejo aquí anotado y nada más. Esta carpeta es solo esta nota.
- Daniel autorizó quedarme con **la parte benigna**: el patrón de orquestación
  "un agente que coordina herramientas/habilidades". Eso lo implementé aparte, limpio, en
  `aria/orquestador.py` (sin nada de reversing: solo coordina las herramientas que ARIA ya tiene).

## Si Kilo quiere evaluarlo

Queda a tu criterio y al de Daniel. Si se llegara a tocar REA, que sea en un entorno aislado
y con el consentimiento explícito de Daniel; no debe entrar al runtime de ASAGI ni de ARIA.
