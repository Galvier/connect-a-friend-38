
## Objetivo

1. Corrigir a falha na geração de QR Code atualizando os endpoints da `evolution-proxy` para o novo padrão da API (identificação da instância via header `apikey`).
2. Refinar o layout do card de instância no `/dashboard` — mais respiro, hierarquia clara, ícone destacado e número em destaque.

## 1. `supabase/functions/evolution-proxy/index.ts`

Substituir os endpoints pelo padrão do print (sem `{instanceId}` no path — a instância é resolvida pelo header `apikey` do token da instância):

| Action    | Antes                                          | Depois                                     |
| --------- | ---------------------------------------------- | ------------------------------------------ |
| `status`  | `GET /instance/connectionState/{name}`         | `GET /instance/status`                     |
| `qr`      | `GET /instance/connect/{name}`                 | `GET /instance/qr`                         |
| `logout`  | `DELETE /instance/logout/{name}`               | `DELETE /instance/logout`                  |

Adicionar também:
- `disconnect` → `POST /instance/disconnect` (para o botão "Desconectar" — logout encerra a sessão, disconnect apenas desconecta).
- Fallback de número: se `GET /instance/status` não trouxer o `owner/number`, chamar `GET /instance/info` (também sem path param) para extrair.

Manter a lógica de `connectedNumber` / `state` normalizados no retorno.

### Ajuste em `extractQr` (client)
Como agora o QR vem de `/instance/qr` (endpoint dedicado), a resposta tende a ser mais direta (`{ qrcode: "data:image/png;base64,..." }` ou `{ base64: "..." }`). O `extractQr` atual do `ConnectQrDialog` já cobre múltiplos formatos, mas vou reforçar a busca por chaves comuns (`qrcode`, `base64`, `code`, `qr`).

## 2. `src/routes/dashboard.tsx` — card refinado

Manter estrutura em card (grid responsivo), refinando:

- **Header**: ícone circular do WhatsApp (verde suave) à esquerda, nome da instância com `truncate` e um subtítulo pequeno ("Instância WhatsApp"). Status como pill compacto no canto superior direito, com ponto colorido animado (verde pulsando quando conectado, cinza quando não).
- **Corpo**: bloco destacado para o número — label pequeno "Número conectado" + número em fonte maior (`text-lg font-semibold font-mono`) formatado como `+55 11 99999-9999`. Quando não conectado, mostrar em estado vazio elegante ("Aguardando conexão").
- **Rodapé**: botão full-width com altura maior e ícone. Quando conectado, botão outline destrutivo ("Desconectar"). Quando desconectado, botão primary sólido ("Conectar WhatsApp").
- **Espaçamento**: `p-5`, `gap-4`, `min-h-[220px]` para uniformidade.

Helper de formatação de número BR (`formatPhone`) inline no arquivo.

Nenhuma alteração em lógica de auth, criação, ou schema.

## 3. `src/routes/admin.tsx`

Só um ajuste: trocar o mesmo call de status pelo novo endpoint (via `evolution-proxy`, já herdado automaticamente da mudança acima — sem alterar código do admin).

## Fora do escopo

- Fluxo de criação de instância, autenticação, popup de QR (só ajuste mínimo do `extractQr`).
- Schema/RLS/policies.
