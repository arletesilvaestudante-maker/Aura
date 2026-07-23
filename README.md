# Aura - AI Integration with Neon DB

Aplicação Node.js integrada com Neon DB (PostgreSQL) e Google AI Studio.

## Configuração Rápida

### 1. Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto:

```env
# Neon Database
DATABASE_URL=postgresql://user:password@ep-your-endpoint.neon.tech/aura_db?sslmode=require

# Google AI Studio
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# Server
PORT=3000
NODE_ENV=development
```

### 2. Instalação de Dependências
```bash
npm install
```

### 3. Executar Migrações
```bash
npm run migrate
```

### 4. Iniciar o Servidor
```bash
npm run dev
```

## Estrutura do Projeto

```
Aura/
├── config/
│   ├── db.js              # Conexão com Neon DB
│   └── ai.js              # Configuração Google AI
├── migrations/
│   ├── 001_init_schema.sql
│   └── run.js
├── routes/
│   ├── ai.js              # Endpoints da API
│   └── db.js              # Endpoints do banco
├── controllers/
│   ├── aiController.js
│   └── dbController.js
├── server.js              # Entry point
├── .env.example
└── package.json
```

## Endpoints Disponíveis

- `POST /api/ai/generate` - Gera texto com Google AI
- `GET /api/ai/history/:userId` - Recupera histórico de interações
- `POST /api/db/users` - Cria novo usuário
- `GET /api/db/users/:userId` - Recupera dados do usuário
- `POST /api/db/content` - Salva conteúdo gerado
- `GET /api/db/content/:userId` - Recupera conteúdo do usuário

## Setup Neon DB

1. Acesse [neon.tech](https://neon.tech)
2. Crie um novo projeto
3. Copie a CONNECTION STRING
4. Cole em `DATABASE_URL` no `.env`

## Setup Google AI Studio

1. Acesse [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Crie uma nova API Key
3. Cole em `GOOGLE_AI_API_KEY` no `.env`

## Testando

```bash
# Health check
curl http://localhost:3000/health

# Database status
curl http://localhost:3000/db-status

# Gerar conteúdo com IA
curl -X POST http://localhost:3000/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Escreva um poema sobre IA"}'
```
