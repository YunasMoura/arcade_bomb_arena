# Arcade Bomb Arena (Versão Final 1.0)

Jogo multiplayer 2D de arena com bombas em tempo real com **servidor autoritativo**.
Stack: Node.js, Express, Socket.IO, HTML5 Canvas, Web Audio API e JavaScript ES Modules puro.

## Funcionalidades Concluídas (Todas as Etapas 1 a 10)

- **Sessão & Reconexão:** Identidade persistente via token com janela de reconexão de 30s (inclusive retomando partidas em andamento).
- **Salas & Matchmaking:** Salas privadas com código exclusivo de 6 dígitos, lobby com seleção exclusiva de personagens (`Rex`, `Luna`, `Byte`, `Niko`), prontidão e matchmaking automático.
- **Arena & Pixel Art:** Geração procedural de arenas `17 × 15` com 3 temas visuais (`neon_city`, `cyber_ruins`, `volcanic_core`), zonas de spawn seguras e sprites pixel art animados.
- **Combate Autoritativo (30 Hz tick / 20 Hz broadcast):** Movimentação com assist de quina, bombas com reação em cadeia, 5 power-ups (`+Bomba`, `+Fogo`, `+Velocidade`, `Chutar Bomba`, `Bomba Perfurante`), partículas e áudio sintetizado via Web Audio API.
- **Sudden Death & Placar:** Fechamento progressivo da arena em espiral nos últimos 60 segundos, tela de ranking com abates/pontuação e retorno automático ao lobby.

## Como Executar e Testar

```bash
npm install
npm test      # Executa todos os 40 testes (unitários, integração e multiplayer)
npm start     # Inicia o servidor em http://localhost:3000
```
