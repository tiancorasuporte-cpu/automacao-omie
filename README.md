# Automação Omie

Sistema de alertas de vencimento integrado ao **Omie** com envio de WhatsApp via **WAHA**. Usa o mesmo front-end do Harmony Hub (TanStack Start + design system Âncora).

## Funcionalidades

- Sincroniza vencimentos de **boletos**, **NF-e** (produtos) e **NFS-e** (serviços) da API Omie
- Suporta **vários aplicativos Omie** via `.env`
- Envia WhatsApp **1 dia antes** do vencimento (horário configurável)
- Integração com **WAHA** (`/api/sendText`)
- Setup inicial pede credenciais do **PostgreSQL** e cria usuário **superadmin**

## Primeira execução

```bash
npm install
npm run dev
```

1. Acesse `https://localhost:8080/setup`
2. Informe host, porta, usuário, senha e banco PostgreSQL
3. O sistema cria as tabelas e o usuário `superadmin` / `ancora`
4. Configure o `.env` com apps Omie e WAHA
5. Entre em `/` e acesse o painel

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste:

| Variável | Descrição |
|----------|-----------|
| `OMIE_APPS` | IDs dos apps, separados por vírgula |
| `OMIE_{ID}_NAME` | Nome amigável da empresa |
| `OMIE_{ID}_APP_KEY` | App Key do Omie |
| `OMIE_{ID}_APP_SECRET` | App Secret do Omie |
| `OMIE_{ID}_NOTIFY_PHONE` | WhatsApp fallback (opcional) |
| `WAHA_URL` | URL base do WAHA |
| `WAHA_API_KEY` | Chave API (opcional) |
| `WAHA_SESSION` | Nome da sessão (padrão: `default`) |

## Rotas

| Rota | Descrição |
|------|-----------|
| `/setup` | Configuração inicial do banco |
| `/` | Login |
| `/dashboard` | Painel e sincronização manual |
| `/vencimentos` | Lista de vencimentos |
| `/settings` | WAHA, alertas e apps Omie |
| `/users` | Gestão de usuários (admin) |

## Scheduler

- Sincroniza Omie a cada **6 horas**
- Envia alertas **1x por dia** no horário definido em Configurações (padrão 09:00)
- Alertas são para documentos que **vencem amanhã**

## Scripts

```bash
npm run dev       # desenvolvimento (HTTPS :8080)
npm run build     # build produção
bun run db:setup  # aplica schema se .env já existir
```

## API Omie utilizada

- [Contas a Receber](https://app.omie.com.br/api/v1/financas/contareceber/) — boletos e títulos
- [NF-e Consultar](https://app.omie.com.br/api/v1/produtos/nfconsultar/) — notas de produtos
- [NFS-e](https://app.omie.com.br/api/v1/servicos/nfse/) — notas de serviços
- [Clientes](https://app.omie.com.br/api/v1/geral/clientes/) — telefone do cliente
