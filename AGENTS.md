# Notas para agentes/contribuidores

## Tipos do banco (Supabase)

Hoje os tipos das tabelas (`ClProject`, `ClPublicLink`, etc.) ficam em
[src/lib/supabase/types.ts](src/lib/supabase/types.ts) escritos à mão. Para
reduzir os `as ClX` espalhados pelo código, gere os tipos diretamente do
schema com a Supabase CLI:

```bash
# uma vez, com o projeto linkado
supabase login
supabase link --project-ref <ref>

# regenerar os tipos
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

Em seguida, tipe os clientes Supabase com `Database`:

```ts
import type { Database } from "@/lib/supabase/database.types";

createBrowserClient<Database>(...)
createServerClient<Database>(...)
createClient<Database>(...) // service-role
```

E, gradualmente, troque os `as ClX` por inferência automática
(`Tables<"cl_projects">`).

## Comandos úteis

```bash
npm run dev
npm run lint
npm run typecheck
npm run format
npm run check     # lint + format:check + tsc
```

## Supabase — Segurança e armadilhas conhecidas

### Buckets de Storage

Os dois buckets usados pelo Checklist **precisam ter `public = true`**:

| Bucket | Finalidade |
|--------|-----------|
| `checklist-images` | Fotos enviadas nos formulários pelos clientes |
| `checklist-template-assets` | Imagens embedadas nos templates (lado autor) |

O código usa `/storage/v1/object/public/` via `getPublicAssetUrl()` — esse
endpoint **só funciona com `public = true`**. Se alguém reverter o flag pelo
dashboard, as imagens param de aparecer silenciosamente (sem erro no console do
servidor).

Para verificar/corrigir via SQL:

```sql
UPDATE storage.buckets
   SET public = true
 WHERE id IN ('checklist-images', 'checklist-template-assets');
```

### Políticas RLS de `cl_projects`

O app **compartilha todos os projetos entre todos os usuários autenticados**.
A policy responsável por isso é:

```sql
-- deve existir em cl_projects
CREATE POLICY "cl_projects: authenticated full access"
  ON public.cl_projects FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

Sem essa policy (apenas as `cl_projects_select/insert/update/delete` originais
que gateiam em `created_by = auth.uid()`), cada usuário só enxerga os projetos
que ele mesmo criou.

A função `cl_is_project_owner(project_id)` também checa `created_by =
auth.uid()`, então remover a policy acima quebra em cascata o acesso a
templates (`cl_form_templates`) e submissões (`cl_form_submissions`).

> **Regra:** nunca remover ou restringir `cl_projects` via dashboard sem criar
> uma migration correspondente e testar com dois usuários distintos.

## Convenções

- Validação de inputs server: schemas em `src/lib/schemas/*` (Zod) +
  `safeParse` + `fail(parsed.error.issues[0].message)`.
- Server Actions retornam `ActionResult<T>` ou tipos `as const` legados.
  Use `assertUser(supabase)` para checagem de auth e `ok`/`fail` em
  `src/lib/server-action.ts`.
- URLs públicas de Storage: `getPublicAssetUrl` / `getPublicBucketBaseUrl`
  em `src/lib/storage.ts` (não montar `${URL}/storage/v1/...` na mão).
- Datas em pt-BR: `formatDateTime` / `formatDate` em `src/lib/format.ts`.
- Iniciais para avatares: `getInitials` (nome) ou `getInitialsFromEmail`
  (e-mail), em `src/lib/format.ts`.
- Resolução de link público: `getActivePublicLink(token)` em
  `src/lib/public-link.ts` (devolve `not-found | inactive | ok`).

## Campos radio em matrizes (`radioGroupName`)

Quando um campo `radio` aparece dentro de um `MatrixRenderer` (campo repetido
por linha de item), **cada linha precisa de um `name` único** para os inputs,
caso contrário o browser trata todos os radios de todas as linhas como parte
do mesmo grupo — impedindo a seleção independente por linha.

A prop `radioGroupName` foi adicionada em `FieldInputControl` e no `FieldInput`
de `public-forms-flow.tsx`. O caller passa a chave da linha (ex.: `key` no
`MatrixRenderer`):

```tsx
<FieldInputControl
  field={field}
  value={values[key]}
  radioGroupName={key}   // <— garante isolamento por linha
  onChange={(patch) => onChange(key, patch)}
/>
```

Sem essa prop, o `name` cai de volta para `field.id` (comportamento correto
fora de matrizes).

## Relatório PDF (`report-document.tsx`)

Os estilos do relatório usam três tokens de cor centralizados no topo do
arquivo — ajuste-os lá, não espalhe valores literais:

```ts
const ACCENT       = "#475569"; // slate-600 — barras e bordas
const ACCENT_DARK  = "#1e293b"; // slate-800 — texto forte
const ACCENT_LIGHT = "#f1f5f9"; // slate-100 — fundos suaves
```

O **header fixo** das páginas internas usa margem negativa para sangrar além
do padding da página. As constantes `PAGE_PADDING_TOP` e `PAGE_PADDING_H`
devem ser mantidas em sincronia com o `paddingTop`/`paddingHorizontal` do
estilo `page`.

**Campos vazios são omitidos** no PDF de um envio ou de uma sessão e no
resumo de submissão: só aparecem campos com `value` preenchido ou `image_url`
definido. A função local `isFilled(value, imageUrl)` centraliza essa checagem
— reutilize-a em vez de comparações inline.

**Campo tabela:** as células com texto no template ficam travadas; a resposta
guarda só o texto livre e as linhas/colunas extras (`options.columns/rows` e
JSON em `value`). Na hora de mostrar, o texto do template vence. O relatório
de respostas inclui a tabela quando há algum texto visível, mesmo sem JSON de
resposta. O último envio preenchido substitui a tabela inteira. No PDF ela sai
em bloco, fora da grade compacta de Sim/Não.

Há dois downloads do projeto. **Baixar relatório respostas** segue o relatório
de respostas (omite campo vazio). **Baixar checklist completo com respostas** (`worksheet` em
`ReportDocument`) inclui todas as perguntas dos formulários públicos. Texto
curto e longo saem só com o título (preto, negrito, sem linha de preenchimento
e sem faixa de fundo alternada). Número e data mantêm a linha. Se já houver
resposta em radio, select ou grupo, as demais opções continuam visíveis e a
escolhida sai marcada com um círculo preenchido, em negrito. O título da seção e o da pergunta
saem como badge (`sectionBadge` / `questionBadge`): fundo cinza, cantos
arredondados, sem barra lateral. Perguntas e respostas usam a fonte
condensada; a pergunta e a opção marcada ficam em negrito. O campo de
informação tem texto preto sobre fundo cinza claro.
O valor impresso é o último preenchido de cada campo, juntando os clientes do
mesmo formulário. Na matriz desse PDF as opções continuam na mesma linha do
ambiente (30/70). Cada opção é um item com folga, em fonte 7, e não quebra no
meio da frase.

**Layout dos campos de matriz no PDF:**
- Se todas as respostas forem "Sim"/"Não" (`isShortYesNo`), usa grade de 3
  colunas compacta.
- Qualquer resposta longa força coluna única, com ambiente em 30% e valor em
  70% da linha.

## Escopo das submissões: `project_id` (não `public_link_id`)

As submissões são autorizadas pelo **`project_id`**, não pelo `public_link_id`
do link que originou o preenchimento. Isso permite que submissões criadas via
links diferentes (ou links expirados/substituídos) continuem visíveis no
relatório e no resumo do projeto.

Ao validar se uma submissão pertence ao contexto do token, compare:

```ts
submissão.project_id === link.project_id  // correto
submissão.public_link_id === link.id      // ERRADO — não usar
```

Consultas de listagem de submissões também usam `.eq("project_id", ...)`.

## Consolidação de submissões no relatório (`loadFullReport`)

A montagem do relatório completo mora em
`src/lib/reports/full-report.ts`. `getPublicFullReport(token)` e
`getProjectFullReport(projectId)` só resolvem o `project_id` e chamam
`loadFullReport`. Não duplique essa query nas actions.

Quando um cliente reenvia o mesmo formulário (mesmo `client_email` +
`template_id`), a função **mescla** as submissões em vez de exibi-las
separadamente:

1. Agrupa por chave `${template_id}::${client_email.toLowerCase()}`.
2. Itera em ordem crescente de `submitted_at` (ASC); o último `submitted_at`
   vira o cabeçalho da entrada.
3. Para cada campo/ambiente, mantém apenas o **valor mais recente preenchido**
   (sobrescreve anteriores se não estiver vazio). Tabela substitui o JSON
   inteiro (não mescla célula a célula).
4. Entradas sem nenhum campo preenchido são descartadas antes de montar o PDF.

Não altere a ordenação da query sem ajustar essa lógica.

Há dois downloads (`DownloadReportActions` / `worksheet` em `ReportDocument`):
relatório de respostas (omite vazio) e checklist completo com respostas
(todas as perguntas dos templates públicos). Os botões ficam na capa do
link público (`getPublicFullReport`). `getProjectFullReport` permanece
como action autenticada, mas o dashboard não expõe mais o download.

## Campo tabela (`type: "table"`)

Helpers em `src/lib/forms/table.ts`. O template guarda a grade em
`options.columns` / `options.rows`. Células com texto no template ficam
**travadas**. A resposta (`value`) é JSON só com texto livre e
linhas/colunas extras — `serializeTableAnswer` devolve `null` se não
houver nada disso. `resolveTable` aplica o template por cima da resposta.

- Builder: `table-structure-editor.tsx` (colunas reordenáveis via DnD).
- Preenchimento: `table-field.tsx`
- Leitura: `table-value-view.tsx`
- No fluxo público a tabela **não entra no progresso nem na validação de
  obrigatório** (`type === "table"` é ignorado como `info`/`image`).
  `isTableAnswered` e `tableHasVisibleText` servem para PDF/resumo.

A constraint `cl_form_fields_type_check` precisa incluir `'table'`
(migration `supabase/migrations/20261027152518_table_field_type.sql`).

## Link público único por projeto

O botão "Gerar link" (`project-public-link-dialog.tsx`) só é exibido quando
não há nenhum link cadastrado (`links.length === 0`). Cada projeto deve ter no
máximo um link ativo; criar múltiplos links já não é suportado pela UI.

## Renomear projeto (nome + descrição)

`renameProject(id, name, description?)` atualiza os dois campos de uma vez.
O schema `projectRenameSchema` aceita `description` opcional/nullable; string
vazia vira `null` no update. A action revalida `/projects` e
`/projects/:id`. O dialog do card (`ProjectCardMenu`) abre com os valores
atuais e mostra o erro de validação no próprio formulário.

## Card de template em Configurações

`TemplateCard` exibe a **descrição do template**, não o nome do projeto.
A prop é `description`; `projectName` foi removida.

## Drag-and-drop no builder (`template-builder.tsx`)

Há um único `DndContext` para seções e campos. `collisionDetection` separa os
alvos:

- Arrastar **seção**: só considera droppables cujo `id` está em
  `sections.map(s => s.local_id)` (distância do ponteiro ao centro vertical).
- Arrastar **campo**: considera campos de qualquer seção e a zona
  `section-drop:{local_id}`. Em `onDragOver` o campo muda de
  `section_local_id` quando o alvo é outra seção; `onDragEnd` reordena dentro
  da seção atual. Seção recolhida abre ao receber o campo.

Não volte a aninhar um `DndContext` por seção — isso quebrava o drag de seções.

## Ordem dos formulários do projeto (`templates-panel.tsx`)

A lista usa um `DndContext` para disciplinas e formulários, com grip no lugar
das setas. Arrastar a disciplina reordena só as disciplinas visíveis e preserva
o slot das que não têm formulário (`reorderDisciplines` /
`reorderSubsetSlots`). Arrastar um formulário reordena dentro da disciplina ou
move para outra, inclusive "Sem disciplina" (`syncProjectTemplateGroups`).
Durante o arraste, um grupo que esvazia continua visível para receber o item
de volta.

Helpers genéricos em `src/lib/forms/reorder-groups.ts`:
`relocateInGroup`, `reorderInGroup`, `reorderSubsetSlots`. Reuse-os em
vez de reordenar arrays no componente. `syncProjectTemplateGroups` exige
a lista completa dos templates do projeto. `reorderDisciplines` exige a
lista completa de disciplinas (mesmo as sem formulário).

## Texto rico em `label` e `help_text`

Labels e textos de ajuda dos campos aceitam HTML curto. A sanitização
centralizada fica em `src/lib/rich-text.ts`:

```ts
sanitizeFieldHtml(html)  // tags: p, br, strong, em, ul, ol, li, a
plainTextFromHtml(html)  // para progresso, PDF fallback e comparações
fieldPlainLabel(label)   // texto plano do label (busca, toasts, etc.)
parseRichText(html)      // árvore para o PDF
```

- **Editor:** `InlineHtmlEditor` (TipTap) no builder. Links só via
  `normalizeHref` (http/https/mailto, ou domínio sem protocolo → https).
- **Persistência:** `saveTemplate` sanitiza `label` e `help_text` de novo
  no servidor — não confie só no cliente.
- **UI:** `RichText` / `RichTextOr` / `FieldHelpText` em
  `src/components/rich-text.tsx` (`dangerouslySetInnerHTML` só com HTML já
  sanitizado).
- **PDF:** `PdfRichLabel` em `src/app/p/[token]/pdf/pdf-rich-label.tsx`
  — nunca jogue HTML cru no `@react-pdf/renderer`.

## Modo visualização (`?preview=1`)

`isPreviewMode` / `withPreview` / `PREVIEW_IDENTITY` em
`src/app/p/[token]/preview-mode.ts`. O botão "Visualizar" do dialog de
link público abre `/p/{token}?preview=1`.

Nesse modo o fluxo público:

- usa identidade fixa (`Visualização` / `preview@local`);
- **não** lê nem grava draft no `localStorage`;
- **não** carrega respostas anteriores;
- mostra `PreviewBanner` e oculta o bloco "Respondendo como…".

Ao adicionar rotas ou writes no fluxo `/p/[token]`, preserve o query
`preview=1` com `withPreview` e pule persistência quando `preview` for true.

## Igualar ambientes na matriz (`EnvLinks`)

O cliente pode marcar uma coluna para acompanhar outra. Helpers em
`src/lib/forms/utils.ts`:

- `linkEnvironment(links, target, source)` — grava o vínculo; desfaz ciclo
  se a origem já apontava para o destino.
- `resolveEnvRoot(env, links)` — segue a cadeia até a origem.
- `syncLinkedField(...)` — copia o valor da origem para o grupo; destinos
  bloqueados (`isTargetLocked`) ficam como estão.
- `linksFromDraft` / `env_links` no draft (`draft-progress.ts`) persistem
  os vínculos no `localStorage` junto com as respostas.

A UI de "Igualar" e o scroll horizontal da matriz ficam em
`src/components/forms/matrix-tools.tsx` (`EqualizeColumnSelect`,
`useHorizontalScrollSync`, `MatrixPanScroll`). Use essas classes/hooks
em vez de duplicar tabela de matriz.
