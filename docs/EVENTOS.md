# Eventos Socket.IO (Projeto Completo - Etapas 1 a 10)

## Cliente -> servidor
| Evento | Payload | Observações |
|---|---|---|
| `player:join` | `{ name: string, token: string, character?: string }` | `token` = 16-64 caracteres `[A-Za-z0-9-]`. Nome sanitizado (máx. 12). |
| `time:ping` | `{ clientTime: number }` + ack | O ack devolve `{ clientTime, serverTime }`. |
| `room:create` | `{ character?: string }` | Cria sala privada com código único de 6 caracteres. |
| `room:join` | `{ code: string, character?: string }` | Valida existência, vaga (máx. 4) e se a partida ainda não iniciou. |
| `room:leave` | `{}` | Remove o jogador da sala e transfere liderança se o anfitrião sair. |
| `player:ready` | `{ ready: boolean }` | Alterna prontidão; quando todos (2+) estão prontos, inicia contagem regressiva. |
| `player:selectCharacter` | `{ character: 'rex' | 'luna' | 'byte' | 'niko' }` | Impede personagens duplicados na mesma sala. |
| `room:start` | `{}` | Apenas o anfitrião pode iniciar manualmente com 2+ jogadores. |
| `matchmaking:join` | `{ character?: string }` | Entra na fila pública ou ingressa em sala pública aberta. |
| `matchmaking:leave` | `{}` | Sai da fila de matchmaking. |
| `game:input` | `{ up: boolean, down: boolean, left: boolean, right: boolean }` | Envia estado direcional ao servidor autoritativo. |
| `game:placeBomb` | `{}` | Solicita colocação de bomba na célula atual do jogador. |

## Servidor -> cliente
| Evento | Payload |
|---|---|
| `player:joined` | `{ playerId, name, character, resumed, room, match, serverTime }` |
| `player:error` | `{ code, message }` |
| `session:replaced` | `{}` |
| `rate:limited` | `{}` |
| `room:created` / `room:joined` / `room:updated` | `{ code, isPublic, status, hostId, maxPlayers, minPlayersToStart, countdownEndsAt, players }` |
| `room:left` | `{ code }` |
| `room:error` | `{ code, message }` |
| `matchmaking:waiting` | `{ queueSize }` |
| `matchmaking:found` | Estado serializado da sala pública |
| `matchmaking:left` | `{ queueSize }` |
| `game:starting` | `{ code, startsInMs, countdownEndsAt }` |
| `game:started` | `{ code, players, match, serverTime }` |
| `game:state` | Snapshot completo a 20 Hz (`remainingMs`, `suddenDeathActive`, `grid`, `players`, `bombs`, `explosions`, `powerups`) |
| `game:finished` | `{ roomCode, winnerId, finishReason, ranking }` |
