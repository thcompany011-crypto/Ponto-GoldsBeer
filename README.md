# Ponto Golds Beer

Sistema web/PWA de controle de ponto e gestão de jornada para colaboradores, com painel administrativo, auditoria, solicitações de ajuste, fechamento de horas e notificações da jornada.

Construído em **JavaScript puro**, sem framework, utilizando **Firebase Authentication, Firestore, Hosting, Storage Rules, Firebase Cloud Messaging e Cloud Functions**.

> **Importante:** o sistema foi desenvolvido para controle interno de presença/jornada e fechamento operacional. O cálculo de horas extras utiliza o valor definido por colaborador e **não pretende substituir um sistema de folha de pagamento ou um REP homologado**, nem aplicar automaticamente adicionais legais de 50%/100% ou regras específicas de convenções coletivas.

---

## Funcionalidades

### 👤 Controle de acesso

- Login com Firebase Authentication.
- Separação entre **administrador** e **colaborador**.
- Campo de permissão utilizado pelo sistema: `cargo`.
- Recuperação/redefinição de senha.
- Opção de mostrar/ocultar senha no login.
- Controle de acesso protegido pelas regras do Firestore.

### ⏱️ Registro de ponto

- Registro de **Entrada** e **Saída**.
- Espelho/histórico individual do colaborador.
- Organização dos registros por período.
- Controle da jornada prevista de cada colaborador.
- Registro de múltiplos turnos no mesmo dia.

### 📍 Restrição por localização

O registro de ponto utiliza a geolocalização do dispositivo para confirmar se o colaborador está próximo do estabelecimento.

Configuração atual no `js/dashboard.js`:

- Latitude do Golds Beer: `-16.373970`
- Longitude do Golds Beer: `-48.979419`
- Raio permitido: **150 metros**
- GPS com alta precisão.
- Sem uso de posição em cache.

Se o colaborador estiver fora do raio configurado, o sistema bloqueia o registro do ponto.

> O raio pode ser ajustado no código caso a precisão do GPS no local exija uma margem diferente.

### 👨‍💼 Painel administrativo

O administrador pode:

- Visualizar os registros da equipe.
- Auditar jornadas.
- Editar registros de ponto.
- Excluir registros.
- Lançar registros manualmente.
- Consultar colaboradores.
- Gerenciar jornadas.
- Cadastrar e gerenciar feriados.
- Analisar solicitações de ajuste.
- Gerar fechamento por período.

### 👥 Cadastro de colaboradores

O administrador pode cadastrar e editar:

- Nome.
- E-mail.
- Cargo/permissão.
- Jornada semanal.
- Horário semanal de entrada e saída.
- Valor da hora extra.
- Status ativo/inativo.

A jornada semanal possui 7 posições, uma para cada dia:

```text
0 = Domingo
1 = Segunda-feira
2 = Terça-feira
3 = Quarta-feira
4 = Quinta-feira
5 = Sexta-feira
6 = Sábado
```

### 📅 Jornada e horários semanais

Cada colaborador pode possuir:

- Carga horária prevista por dia.
- Horário programado de entrada.
- Horário programado de saída.
- Jornadas diferentes conforme o dia da semana.

Esses horários são utilizados tanto no fechamento quanto nos lembretes da jornada.

### 🎉 Feriados

O administrador pode cadastrar feriados.

Formato utilizado:

```text
AAAA-MM-DD
```

Em um feriado, a carga prevista do dia passa a ser **zero**. Assim, qualquer trabalho registrado nesse dia é considerado excedente para o cálculo do fechamento.

### 📝 Solicitações de ajuste

O colaborador pode solicitar:

- Criação de uma batida esquecida.
- Correção de uma batida.
- Exclusão de uma batida.

Cada solicitação possui status:

- `pendente`
- `aprovado`
- `rejeitado`

O administrador pode analisar e responder às solicitações.

Além disso, o administrador continua podendo corrigir registros diretamente pela área de auditoria.

### 💰 Fechamento de horas

O sistema permite gerar um relatório por:

- Período.
- Colaborador específico.
- Todos os colaboradores.

O cálculo apresenta:

- Horas trabalhadas.
- Horas previstas.
- Horas pendentes.
- Horas excedentes.
- Valor das horas extras.
- Dias trabalhados.
- Detalhamento diário.
- Feriados.
- Entrada e saída.
- Saldo diário.

O valor da hora extra é definido individualmente no cadastro do colaborador.

### 📄 Exportações

O fechamento pode ser exportado em:

- **PDF**
- **CSV**
- **Imagem PNG**

O PDF possui:

- Identificação do relatório.
- Colaborador.
- Período.
- Detalhamento diário.
- Entrada.
- Saída.
- Horas trabalhadas.
- Carga prevista.
- Saldo.
- Total de horas extras.
- Valor total.
- Área para assinatura do responsável/RH.
- Área para ciência do colaborador.
- Paginação.

### 🔔 Notificações da jornada

O sistema possui suporte a notificações Web Push utilizando **Firebase Cloud Messaging (FCM)**.

O colaborador pode ativar as notificações da jornada no próprio sistema.

Os lembretes podem avisar sobre:

- Jornada próxima.
- Horário de registrar entrada.
- Entrada não registrada após o horário previsto.
- Horário de registrar saída.
- Saída não registrada após o horário previsto.

As notificações são armazenadas por dispositivo/token, permitindo que o mesmo usuário utilize mais de um dispositivo.

### ☁️ Automação com Firebase Cloud Functions

O projeto possui uma Cloud Function chamada:

```text
verificarJornadasENotificar
```

Ela é executada automaticamente **a cada 1 minuto**, utilizando o fuso:

```text
America/Sao_Paulo
```

A função verifica colaboradores ativos e seus horários programados para disparar as notificações necessárias.

A região configurada atualmente é:

```text
southamerica-east1
```

### 📆 Agenda

O sistema também permite gerar uma agenda no formato:

```text
.ics
```

O arquivo pode ser importado em aplicativos de calendário compatíveis para facilitar a visualização dos horários semanais.

Arquivo gerado:

```text
meus-horarios-golds-beer.ics
```

### 📱 PWA

O projeto funciona como uma **Progressive Web App (PWA)**.

Possui:

- `manifest.json`
- Service Worker.
- Ícone 192x192.
- Ícone 512x512.
- Instalação na tela inicial.
- Funcionamento em modo de aplicativo/standalone.
- Suporte à infraestrutura de notificações Web Push.

A aplicação pode ser instalada em dispositivos compatíveis, reduzindo a necessidade de acessar o sistema pelo navegador tradicional.

---

## Estrutura atual do projeto

```text
├── index.html
├── login.html
├── dashboard.html
│
├── css/
│   ├── style.css
│   └── responsive-golds.css
│
├── js/
│   ├── firebase.js
│   ├── login.js
│   ├── auth.js
│   └── dashboard.js
│
├── functions/
│   ├── index.js
│   └── package.json
│
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
│
├── firestore.rules
├── storage.rules
├── firebase.json
├── manifest.json
├── service-worker.js
├── logo.png
├── .firebaserc
└── .nojekyll
```

### Principais arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Roteamento inicial da aplicação |
| `login.html` | Tela de autenticação |
| `dashboard.html` | Painel principal do sistema |
| `css/style.css` | Estilos principais |
| `css/responsive-golds.css` | Ajustes responsivos |
| `js/firebase.js` | Configuração/inicialização do Firebase |
| `js/login.js` | Login, senha e recuperação de acesso |
| `js/auth.js` | Cadastro de colaboradores |
| `js/dashboard.js` | Ponto, auditoria, jornada, relatórios, notificações e gestão |
| `functions/index.js` | Automação das notificações da jornada |
| `firestore.rules` | Regras de segurança do Firestore |
| `storage.rules` | Regras de segurança do Storage |
| `manifest.json` | Configuração PWA |
| `service-worker.js` | Service Worker e suporte PWA/notificações |
| `firebase.json` | Configuração de Hosting, Firestore, Storage e Functions |

---

# Modelo de dados — Firestore

## Coleção `usuarios/{uid}`

Exemplo:

```json
{
  "nome": "Fulano de Tal",
  "email": "fulano@exemplo.com",
  "cargo": "colaborador",
  "jornadaSemanal": [0, 8, 8, 8, 8, 8, 0],
  "horariosSemanais": [
    {},
    {"entrada": "08:00", "saida": "17:00"},
    {"entrada": "08:00", "saida": "17:00"},
    {"entrada": "08:00", "saida": "17:00"},
    {"entrada": "08:00", "saida": "17:00"},
    {"entrada": "08:00", "saida": "17:00"},
    {}
  ],
  "valorHoraExtra": 11.0,
  "ativo": true,
  "criadoEm": "2026-09-08T20:10:00.000Z"
}
```

### Permissões

O campo responsável pela permissão é:

```text
cargo
```

Valores utilizados:

```text
admin
colaborador
```

> **Não utilizar `role` como substituto de `cargo`.** As regras de segurança do Firestore utilizam `cargo` para determinar as permissões administrativas.

---

## Coleção `batidas/{id}`

Exemplo:

```json
{
  "uid": "uid-do-colaborador",
  "tipo": "Entrada",
  "data": "2026-09-07T13:00:00.000Z"
}
```

Tipos utilizados:

```text
Entrada
Saída
```

---

## Coleção `feriados/{id}`

```json
{
  "data": "2026-12-25",
  "descricao": "Natal"
}
```

---

## Coleção `solicitacoes/{id}`

```json
{
  "uid": "uid-do-colaborador",
  "nome": "Fulano de Tal",
  "acao": "criar",
  "batidaId": null,
  "tipoOriginal": null,
  "dataOriginal": null,
  "tipoNovo": "Entrada",
  "dataNova": "2026-09-08T18:00:00.000Z",
  "motivo": "Esqueci de bater o ponto na entrada",
  "status": "pendente",
  "criadoEm": "2026-09-08T20:10:00.000Z",
  "respondidoEm": null,
  "respostaAdmin": null
}
```

Valores de `acao`:

```text
criar
editar
excluir
```

Valores de `status`:

```text
pendente
aprovado
rejeitado
```

---

## Coleção de tokens de notificações

Os tokens de cada dispositivo ficam vinculados ao usuário:

```text
usuarios/{uid}/pushTokens/{tokenId}
```

Isso permite registrar os dispositivos autorizados a receber as notificações da jornada.

---

# Segurança

A aplicação utiliza Firebase Authentication e regras de segurança do Firestore e Storage.

### Firestore

As regras controlam, entre outras operações:

- Acesso do próprio colaborador aos seus registros.
- Operações administrativas.
- Cadastro/edição de usuários.
- Edição e exclusão de batidas.
- Criação e gerenciamento de solicitações.
- Aprovação/rejeição de solicitações por administradores.

### Storage

O `storage.rules` restringe o acesso às pastas individuais dos usuários:

```text
/usuarios/{uid}/...
```

Outros caminhos são bloqueados por padrão.

### Firebase API Key

A chave presente em `js/firebase.js` faz parte da configuração de um aplicativo Firebase Web e **não deve ser tratada como uma senha de servidor**.

Mesmo assim, recomenda-se:

- Restringir a chave por domínio/API no Google Cloud Console quando aplicável.
- Manter Authentication corretamente configurado.
- Manter Firestore Rules e Storage Rules protegidas.
- Nunca colocar credenciais privadas de servidor no JavaScript do navegador.
- Não publicar service account keys ou outras credenciais privadas no repositório.

A proteção real dos dados do aplicativo depende principalmente da autenticação e das regras de segurança do Firebase.

---

# Como criar o primeiro administrador

O cadastro pelo painel exige que já exista um administrador.

Por isso, o primeiro administrador deve ser criado manualmente:

1. Abra o projeto no Firebase Console.
2. Acesse **Authentication**.
3. Crie o primeiro usuário em **Add user**.
4. Copie o UID gerado.
5. Acesse o **Firestore Database**.
6. Crie a coleção:
   ```text
   usuarios
   ```
7. Crie o documento utilizando o UID do usuário como ID.
8. Defina pelo menos:
   ```text
   nome: Nome do administrador
   email: email do administrador
   cargo: admin
   ativo: true
   ```
9. Faça login no sistema.
10. A partir daí, utilize o próprio painel para cadastrar os demais colaboradores.

---

# Configuração do Firebase

O projeto utiliza:

- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Firebase Storage Rules
- Firebase Cloud Messaging
- Firebase Cloud Functions

O arquivo `firebase.json` atualmente configura:

- Hosting
- Firestore Rules
- Storage Rules
- Functions

As Cloud Functions utilizam:

```text
Node.js 20
```

---

# Publicação

É necessário ter o Firebase CLI instalado.

Login:

```bash
firebase login
```

Depois, dentro da pasta do projeto:

```bash
firebase deploy
```

O deploy utiliza a configuração do `firebase.json`.

Para publicar somente uma parte específica, também é possível utilizar os comandos do Firebase CLI para cada serviço, conforme a necessidade do ambiente.

---

# Desenvolvimento local

Após autenticar o Firebase CLI, o projeto pode ser executado/testado utilizando os recursos do Firebase CLI e/ou servido por um servidor local compatível com aplicações web.

Evite abrir páginas que dependem de módulos Firebase diretamente pelo protocolo `file://`. Utilize um servidor HTTP local.

---

# Observações importantes

### Cálculo de horas

O sistema calcula:

```text
Horas trabalhadas
Horas previstas
Horas pendentes
Horas excedentes
Valor das horas extras
```

O valor da hora extra é definido no cadastro do colaborador.

O sistema não implementa automaticamente regras jurídicas de folha de pagamento, adicionais de 50%/100%, banco de horas, convenções coletivas ou demais particularidades trabalhistas.

### Geolocalização

O navegador precisa permitir acesso à localização para registrar o ponto.

A precisão pode variar de acordo com:

- GPS do aparelho.
- Ambiente interno.
- Qualidade do sinal.
- Configurações do dispositivo.
- Navegador utilizado.

### Notificações

Para receber notificações:

1. O navegador precisa permitir notificações.
2. O Service Worker precisa estar funcionando.
3. O dispositivo precisa possuir um token FCM válido.
4. O colaborador precisa ter horários semanais cadastrados.
5. As Cloud Functions precisam estar implantadas no Firebase.

---

# Tecnologias utilizadas

- HTML5
- CSS3
- JavaScript ES Modules
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- Firebase Storage Rules
- Firebase Cloud Messaging
- Firebase Cloud Functions
- Node.js 20
- Progressive Web App (PWA)
- Service Worker
- jsPDF
- jsPDF AutoTable
- html2canvas
- Geolocation API
- Web Push

---

# Objetivo do sistema

O **Ponto Golds Beer** foi desenvolvido para centralizar o controle interno da jornada dos colaboradores, reduzindo registros manuais e facilitando a conferência administrativa.

A proposta é reunir em uma única aplicação:

- Registro de ponto.
- Controle de jornada.
- Restrição por localização.
- Auditoria.
- Solicitações de ajuste.
- Cadastro de colaboradores.
- Feriados.
- Fechamento de horas.
- Exportação de relatórios.
- Agenda.
- Notificações automáticas.
- Instalação como aplicativo PWA.

