## Objetivo

Corrigir a exibição de status/número das instâncias no **Admin** e no **Dashboard do cliente**.

## Problemas observados

1. **Admin (`/admin` → aba Instâncias)**: tabela mostra apenas Nome / Cliente / Token. Falta status de conexão e número conectado.
2. **Dashboard cliente (`/dashboard`)**: card aparece como "Conectado" mesmo sem estar, sem botão QR, sem número. Provável causa: `extractState` em `dashboard.tsx` retorna `"close"` como fallback, mas quando a Evolution API responde com formato inesperado o código pode estar interpretando errado; além disso o número só é lido de `data?.connectedNumber` que a edge function pode não estar devolvendo.

## Mudanças

### 1. `src/routes/admin.tsx` — status + número por instância
- Adicionar checagem de status por instância (mesmo padrão do dashboard: `supabase.functions.invoke("evolution-proxy", { action: "status", ... })`).
- Guardar `statuses: Record<string, "loading" | "connected" | "disconnected">` e ler `connected_number` da tabela.
- Adicionar 2 colunas na tabela de Instâncias: **Status** (badge verde "Conectado" / cinza "Desconectado" / loader) e **Número** (`+{connected_number}` ou "—").
- Ao detectar conexão, persistir `connected_number` na tabela (igual ao dashboard).

### 2. `src/routes/dashboard.tsx` — corrigir status/número/QR
- Revisar `extractState`: hoje qualquer resposta sem `state === "open"` vira "close". Garantir que apenas quando a resposta é válida marcamos "connected"; caso contrário "disconnected" — para que o botão **Conectar (QR)** apareça corretamente.
- Exibir o `connected_number` já persistido mesmo enquanto o status ainda está "loading" (assim o número não some ao recarregar).
- Ajustar layout do card: nome com `truncate`, badge com `shrink-0`, espaçamento consistente, altura mínima, botão sempre visível (QR ou Desconectar).

### 3. `supabase/functions/evolution-proxy/index.ts` — retornar número
- Garantir que a action `status` extraia o número conectado (`data.instance.owner` / `data.wuid` / `data.number`, conforme retorno da Evolution) e devolva em `connectedNumber` para o front persistir.

## Detalhes técnicos

- Reaproveitar `extractState` movendo para `src/lib/evolution.ts` (novo) e importar em admin + dashboard, evitando duplicação.
- Nenhuma mudança de schema (colunas `connected_number` já existem em `whatsapp_instances`).
- Sem alterações em RLS/policies.

## Fora do escopo

- Não mexer no fluxo de autenticação, criação de clientes, ou popup de QR (`ConnectQrDialog`) além do necessário.
