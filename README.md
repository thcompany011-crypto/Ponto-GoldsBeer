# Ponto Golds Beer

Sistema web de controle de ponto (PWA) para colaboradores, com painel administrativo de auditoria e fechamento financeiro. Construído em JavaScript puro (sem framework) sobre Firebase (Auth + Firestore).

## Funcionalidades

- Registro de entrada/saída pelo colaborador, com espelho de ponto pessoal.
- Painel admin: auditoria de todos os turnos, edição/exclusão de batidas, lançamento manual.
- Cadastro e edição de colaboradores direto pelo painel (nome, e-mail, cargo, jornada semanal e valor da hora).
- Cadastro de feriados (usados no cálculo de jornada/hora extra).
- Solicitação de ajuste de ponto pelo colaborador (registrar esquecido, corrigir horário ou pedir exclusão), com fila de aprovação para o admin. O admin continua podendo editar/excluir direto pela Auditoria, quando precisar.
- Fechamento financeiro por período, com:
  - Cálculo de hora extra dia a dia, a valor fixo por colaborador (contrato informal — sem adicional de 50%/100% do regime CLT).
  - Totais gerais da equipe.
  - Exportação em PDF (com detalhamento diário por colaborador e área de assinatura) e em CSV.

## Estrutura

```
├── index.html          # Roteador inicial (decide entre login/dashboard)
├── login.html           # Tela de login
├── dashboard.html        # Painel principal (colaborador + admin)
├── css/style.css
├── js/
│   ├── firebase.js       # Inicialização do Firebase (config do projeto)
│   ├── login.js          # Lógica de login
│   ├── auth.js           # Cadastro de colaboradores (usado pelo admin)
│   └── dashboard.js       # Toda a lógica do painel: ponto, relatório, colaboradores, feriados
├── firestore.rules
├── storage.rules
└── firebase.json
```

## Modelo de dados (Firestore)

### Coleção `usuarios/{uid}`
```json
{
  "nome": "Fulano de Tal",
  "email": "fulano@exemplo.com",
  "cargo": "colaborador",           // "colaborador" | "admin" — único campo de permissão válido
  "jornadaSemanal": [0, 8, 8, 8, 8, 8, 0], // horas previstas por dia, índice 0 = Domingo
  "valorHoraExtra": 11.0,             // valor da hora normal, usado para calcular a extra
  "ativo": true
}
```

> ⚠️ O campo de permissão é **sempre `cargo`**. Não usar `role` — isso já causou um bug de permissão no passado (o painel liberava a tela de admin, mas o Firestore recusava as ações porque a regra de segurança só reconhecia `cargo`).

### Coleção `batidas/{id}`
```json
{ "uid": "uid-do-colaborador", "tipo": "Entrada", "data": "2026-09-07T13:00:00.000Z" }
```

### Coleção `feriados/{id}`
```json
{ "data": "2026-12-25", "descricao": "Natal" }
```

### Coleção `solicitacoes/{id}`
```json
{
  "uid": "uid-do-colaborador",
  "nome": "Fulano de Tal",
  "acao": "criar",              // "criar" | "editar" | "excluir"
  "batidaId": null,               // preenchido em "editar"/"excluir"
  "tipoOriginal": null,           // snapshot do ponto original, se "editar"/"excluir"
  "dataOriginal": null,
  "tipoNovo": "Entrada",          // preenchido em "criar"/"editar"
  "dataNova": "2026-09-08T18:00:00.000Z",
  "motivo": "Esqueci de bater o ponto na entrada",
  "status": "pendente",           // "pendente" | "aprovado" | "rejeitado"
  "criadoEm": "2026-09-08T20:10:00.000Z",
  "respondidoEm": null,
  "respostaAdmin": null           // motivo da rejeição, se houver
}
```

## Como criar o primeiro administrador

Como o cadastro pelo painel exige estar logado como admin, o **primeiro** admin precisa ser criado manualmente:
1. Crie o usuário em Authentication → Add user, no Console do Firebase.
2. Crie manualmente o documento em `usuarios/{uid-gerado}` com `cargo: "admin"`.
3. A partir daí, use o próprio painel ("Novo Colaborador") para cadastrar os demais.

## Segurança

- As regras (`firestore.rules`) validam que só admin pode criar/editar usuários e editar/excluir batidas; um colaborador só cria/lê as próprias batidas.
- Solicitações de ajuste: o colaborador só cria e cancela (enquanto pendente) as próprias; só admin aprova/rejeita.
- `storage.rules` restringe cada usuário à própria pasta (`/usuarios/{uid}/...`); qualquer outro caminho é bloqueado por padrão.
- A API key do Firebase em `js/firebase.js` não é secreta por natureza (é de uso público em apps web), mas recomenda-se restringi-la por domínio no Google Cloud Console.

## Publicação

```bash
firebase deploy
```

(requer `firebase-tools` instalado e login feito: `firebase login`)
