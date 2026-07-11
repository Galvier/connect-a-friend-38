
## Objetivo

Separar visões Admin/Cliente, permitir que o admin cadastre clientes (com senha auto-gerada e troca obrigatória no 1º login) e vincule várias instâncias WhatsApp (nome + token próprio) a cada cliente. O cliente vê apenas suas instâncias, conecta cada uma via modal de QR Code idêntico ao print da Evolution, e vê status + número conectado.

## Banco de dados (migração)

- `whatsapp_instances`: adicionar colunas
  - `api_token text not null` (token/apikey da instância na Evolution)
  - `connected_number text` (preenchido após conexão, via status)
  - `updated_at timestamptz` + trigger
- `profiles`: adicionar
  - `must_change_password boolean not null default false`
  - `name text`
- Manter RLS existente; adicionar policy de UPDATE em `whatsapp_instances` só para admin, e SELECT já cobre "own instances".

## Backend (Edge Functions)

1. `evolution-proxy` (existente): passar a receber `apiToken` no body (vindo do banco por instância) e usá-lo no header `apikey`, ignorando o segredo global. Também extrair, no `status`, o número conectado (`Name`/`ownerJid`) e retorná-lo.
2. Nova function `admin-create-user` (service role, `verify_jwt=true`):
   - Verifica que caller é admin (`has_role`).
   - Recebe `{ email, name }`.
   - Gera senha aleatória (16 chars).
   - Cria usuário via `auth.admin.createUser` (email_confirm=true).
   - Insere/atualiza `profiles` com `role='client'`, `name`, `must_change_password=true`.
   - Retorna a senha em texto uma única vez para o admin exibir/copiar.

## Frontend

### Roteamento
- `/admin` (existente) — só admin. Redireciona clientes para `/dashboard`.
- `/dashboard` — só cliente (admin é redirecionado para `/admin`).
- `/change-password` — rota nova, obrigatória quando `profiles.must_change_password = true`. Guarda em ambos dashboards: se flag ativa, redireciona pra cá.

### Tela Admin (`/admin`)
Reestruturar em duas seções (Tabs: "Clientes" | "Instâncias"):

- **Clientes**: tabela (nome, email, criado em, ações). Botão "Novo cliente" abre dialog (nome + email) → chama `admin-create-user` → mostra dialog com senha gerada e botão "Copiar".
- **Instâncias**: tabela (nome instância, token mascarado, cliente vinculado, status). Botão "Nova instância" abre dialog (select de cliente, nome, token). Ações: editar token, excluir.

### Tela Cliente (`/dashboard`)
- Lista em grid de cards, um por instância atribuída ao usuário logado. Cada card mostra:
  - Nome da instância
  - Badge de status (Conectado / Desconectado) — obtido via `evolution-proxy status` no mount
  - Se conectado: número (`connected_number`) + botão "Desconectar"
  - Se desconectado: botão "Conectar" que abre o **modal QR**
- Sem mais fluxo de "instância única" nem input manual de nome.

### Modal QR (novo componente `ConnectQrDialog`)
Design conforme imagem enviada:
- Header com ícone QR + título "Conectar WhatsApp" + botão X
- Subtítulo: "Escaneie o QR Code abaixo com seu WhatsApp para conectar a instância **{nome}**"
- Card branco central com a imagem do QR (mesmo `extractQr` atual)
- Bloco escuro com instruções numeradas 1–5 ("Abra o WhatsApp no celular", "Toque em Menu ou Configurações", "Toque em Dispositivos conectados", "Toque em Conectar um dispositivo", "Aponte seu celular para esta tela")
- Rodapé com botões "Atualizar QR Code" (refresh) e X (fechar)
- Polling `status` a cada 3s enquanto aberto; ao detectar `open`, fecha modal, atualiza `connected_number` no banco e mostra card conectado.

### Troca de senha
- `/change-password`: form simples (nova senha + confirmação) → `supabase.auth.updateUser({ password })` + `update profiles set must_change_password=false`. Depois navega conforme role.

## Detalhes técnicos

- `evolution-proxy`: assinatura passa a ser `{ action, instanceName, apiToken }`. Frontend busca o token da instância no banco antes de invocar. Manter fallback para `EVOLUTION_API_KEY` só se `apiToken` ausente (compat).
- `admin-create-user`: `verify_jwt=true` (default), autoriza via `has_role(auth.uid(),'admin')` usando o client autenticado; usa service-role client só para `auth.admin.createUser` e insert em `profiles`.
- Senha gerada: `crypto.getRandomValues` com alfabeto seguro; retornada apenas na resposta HTTP, nunca persistida em texto.
- Guard `must_change_password`: verificado nos loaders/hook de `/admin` e `/dashboard`; se true → `navigate('/change-password', {replace:true})`.
- Modal QR usa `Dialog` do shadcn; instância `Vinicola-Test` no print serve como referência visual (tema escuro).

## Fora de escopo

- Multi-tenant / workspaces
- Reset de senha por email (fluxo separado)
- Histórico de conexões
