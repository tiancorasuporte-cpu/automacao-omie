# API Mobile — SGO Técnico

Base: `https://sistema.ancoraseguranca.app/api/mobile`

Auth: `Authorization: Bearer <token>` (exceto login).

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/login` | `{ username, password }` → token (só `is_tecnico`) |
| POST | `/logout` | invalida sessão |
| GET | `/me` | usuário + veículo padrão |
| POST | `/device-token` | `{ expoPushToken, platform }` |
| GET | `/os/` | O.S. do técnico (stages 4–6) |
| GET | `/os/:id/` | detalhe |
| POST | `/os/:id/start` | iniciar execução / confirmar material (`{ materialOk: true }` obrigatório se houver itens; `{ materialOk: false }` ou omitido registra aguardando confirmação) |
| POST | `/os/:id/check-in` | check-in |
| POST | `/os/:id/pause` | `{ motivo }` |
| POST | `/os/:id/resume` | retomar |
| POST | `/os/:id/check-out` | `{ resolucao, fotos? }` |
| POST | `/os/:id/usar-estoque` | `{ productId, quantidade, teamId? }` usa estoque da equipe na OS |
| GET | `/estoque/` | estoque das equipes + `pendentes` (saídas PDV aguardando OK) |
| POST | `/estoque/confirmar` | `{ saidaId }` confirma recebimento do material PDV |
| GET | `/frota/veiculo` | veículo `default_vehicle_id` |
| POST | `/frota/km` | leitura KM |
| POST | `/frota/abastecimento` | abastecimento |
| POST | `/frota/servico` | serviço |
| POST | `/sync` | `{ actions: [...] }` fila offline |

## Status da O.S. no app

Cada O.S. serializada inclui:

- `execStatus` / `execStatusLabel` — status operacional
- `needsMaterialConfirm` — se `true`, exibir confirmação de equipamentos antes do check-in
- `envio` — dados do envio de material
- `items[]` — `id`, `qtd`, `nome`, `status`, `productId`, `usado`, `sobraDestino`

| `execStatus` | Label | Quando |
|---|---|---|
| `agendada` | Agendada | stage 4 sem confirmação pendente |
| `aguardando_material` | Confirmar equipamentos | stage 4 com envio aguardando OK |
| `aguardando_checkin` | Aguardando check-in | stage 5 sem check-in |
| `instalando` | Instalando | stage 5 com check-in ativo |
| `pausada` | Pausada | stage 5 pausada |
| `pos_checkout` | Aguardando conferência | stage 5 após check-out |
| `executado` | Executado | stage 6 |
| `finalizado` | Finalizado | stage 7 |

Check-in: no máximo **1 O.S. com check-in aberto** por técnico/equipe.

## Offline sync

O app envia ações enfileiradas:

- `os_start` (`payload.materialOk: true` para confirmar equipamentos), `os_check_in`, `os_pause`, `os_resume`, `os_check_out`
- `frota_km`, `frota_abastecimento`, `frota_servico`

## Push

Ao agendar O.S. com `tecnicoNome`, o backend notifica tokens Expo do usuário cujo `name` coincide.
