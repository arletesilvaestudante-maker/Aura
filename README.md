# Aura Operacional

Frontend estático com API serverless para Netlify e persistência PostgreSQL no Neon.

## Variáveis secretas no Netlify

- `DATABASE_URL`: conexão PostgreSQL agrupada do usuário de aplicação (não use o owner).
- `AURA_BOOTSTRAP_NAME`: nome do primeiro administrador.
- `AURA_BOOTSTRAP_LOGIN`: login do primeiro administrador.
- `AURA_BOOTSTRAP_PASSWORD`: senha temporária forte. Remova após o primeiro acesso.

Não use a chave administrativa da API do Neon no frontend nem no repositório.

## Banco

Execute as migrações em ordem:

```bash
npm install
npm run migrate
```

## Validação

```bash
npm run check
npx netlify dev
```

## Publicação

Faça primeiro um deploy de preview. Promova para produção somente após:

1. rotacionar todas as credenciais expostas;
2. criar usuário PostgreSQL de privilégio mínimo;
3. executar as migrações;
4. testar login, troca obrigatória de senha, PID, catálogo, usuários e alertas;
5. remover `AURA_BOOTSTRAP_PASSWORD` do ambiente.