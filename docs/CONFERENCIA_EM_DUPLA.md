# Conferência em dupla — configuração do Supabase

Nomes de telas conferidos na documentação oficial em 23/11/2026; o site pode mudar.

## 1. Projeto
1. Crie uma conta gratuita em https://supabase.com e um projeto novo.
2. Região: **South America (São Paulo)**. Guarde a senha do banco só com você.

## 2. Banco
1. No projeto, abra o **SQL Editor**.
2. Cole todo o conteúdo de `supabase/conferencia.sql` e execute.
3. Em outra consulta, defina o **código de criação** (12 caracteres ou mais, inventado por você) e execute:
   `select conferencia.definir_codigo('SEU-CODIGO-AQUI');`
   É a senha que autoriza criar conferências. Não a publique nem envie no chat.

## 3. Chaves
1. No projeto, abra **Connect** (ou **Settings > API Keys**).
2. Copie a **URL do projeto** e a **Publishable key** (`sb_publishable_...`) para `config.js`.
3. Nunca use a chave secreta (`sb_secret_...`).

## 4. Uso
1. Importe a planilha e toque em **Conferir em dupla**: informe seu nome e o código de criação.
2. A outra pessoa aponta a câmera para o QR code e informa o nome dela.
3. Ao terminar, exporte e use **Sair > Sair e apagar do servidor**.

## O que saber
- Quem tiver o link entra. Trate-o como senha e não mostre o QR de uma auditoria real em fotos ou vídeos.
- O servidor recebe planilha, contagens e nomes cifrados. Ele vê horários, quantidade e tamanho dos envios.
- Sem internet, os lançamentos ficam no aparelho e sobem depois. Para entrar numa conferência é preciso internet.
- Novidades chegam em cerca de 3 segundos.
- O plano gratuito pausa após 7 dias de pouca atividade; dá para retomar no painel.
- Limites do sistema: 40 conferências guardadas, 30.000 lançamentos e 20 aparelhos por conferência.

## Testes
`node tests/num.test.js`, `esc`, `vendor`, `migracao` e, para o banco, `npm i --no-save @electric-sql/pglite && node tests/banco.test.mjs`.
