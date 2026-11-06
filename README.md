# Jogo da Forca Multiplayer

Jogo da forca em React + Vite com salas online, multiplayer em tempo real e ranking por dificuldade.

## Features

- Modo solo e multiplayer em sala
- Suporte a duas ou mais pessoas na mesma sala
- Cada jogador recebe uma palavra diferente no mesmo nível de dificuldade
- Seleção de dificuldade: fácil, médio, difícil e especialista
- Contagem regressiva e fim de rodada por tempo
- Sistema de pontuação e ranking
- Tweaks de interface: tema, som, pausa e reinício

## Tecnologias

- React 19
- Vite
- Supabase
- Node.js test runner

## Configuração local

1. Instale as dependências:
   npm install
2. Crie o arquivo de ambiente local a partir do exemplo:
   cp .env.example .env
3. Preencha as credenciais do projeto Supabase no arquivo .env:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_APP_URL (use http://localhost:5173 em desenvolvimento ou a URL do deploy em produção)
4. No painel do Supabase, configure a URL do site e os redirecionamentos de autenticação para a mesma origem da aplicação, por exemplo:
   - Site URL: http://localhost:5173
   - Redirect URLs: http://localhost:5173/**
5. No painel do Supabase, execute os scripts SQL de suporte disponíveis em:
   - supabase/rooms.sql
   - supabase/leaderboard-per-difficulty.sql

## Execução

npm run dev

## Validação

npm test
npm run build

## Links do projeto

- Figma: https://www.figma.com/design/jvIgsjretp3b8HhNPH8Q6f/Sem-t%C3%ADtulo--1---1---1-?node-id=0-1&t=pb7KYr8DWINMCHta-1
- Trello: https://trello.com/invite/b/6ab57fe4bc04fc43fd6645a0/ATTI78a1dadda35f24550d99a33bc452aacf894F1DBD/projeto-de-aps
- Projeto interativo: https://lovable.dev/projects/aa23be63-5c60-59f6-b937-65f19c694dc0?magic_link=mc_a9505d5d-1e04-4c89-b7cc-80e162b13709

## Autoras

- Emilly
- Gabriele
- Julia
