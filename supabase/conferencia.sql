-- AUDITORIA DE ESTOQUE — conferência em dupla (Supabase)
-- Rode este arquivo inteiro uma vez no SQL Editor. Pode ser rodado de novo sem apagar dados.
-- O servidor guarda só conteúdo cifrado pelo navegador; a chave fica no link e nunca é enviada.

create schema if not exists conferencia;

create table if not exists conferencia.ajustes(
  id int primary key default 1 check (id = 1),
  codigo_hash bytea not null
);
create table if not exists conferencia.salas(
  id uuid primary key,
  token_hash bytea not null,
  dono_hash bytea not null,
  arquivo text not null,
  ultimo_seq bigint not null default 0,
  criada_em timestamptz not null default now()
);
create table if not exists conferencia.eventos(
  sala uuid not null references conferencia.salas(id) on delete cascade,
  seq bigint not null,
  op uuid not null,
  dados text not null,
  criado_em timestamptz not null default now(),
  primary key (sala, seq),
  unique (sala, op)                         -- reenvio da mesma operação nunca duplica
);
create table if not exists conferencia.participantes(
  sala uuid not null references conferencia.salas(id) on delete cascade,
  id uuid not null,
  nome text not null,
  visto_em timestamptz not null default now(),
  primary key (sala, id)
);

-- Ninguém acessa as tabelas diretamente: só pelas funções abaixo.
alter table conferencia.ajustes enable row level security;
alter table conferencia.salas enable row level security;
alter table conferencia.eventos enable row level security;
alter table conferencia.participantes enable row level security;
revoke all on schema conferencia from public, anon, authenticated;
revoke all on all tables in schema conferencia from public, anon, authenticated;

create or replace function conferencia.resumo(t text) returns bytea
language sql immutable set search_path = '' as $$ select sha256(convert_to(t, 'UTF8')) $$;

-- Define o código que autoriza criar conferências (mínimo de 12 caracteres). Só o dono do projeto executa.
create or replace function conferencia.definir_codigo(codigo text) returns text
language plpgsql set search_path = '' as $$
begin
  if length(codigo) < 12 then raise exception 'Use pelo menos 12 caracteres'; end if;
  insert into conferencia.ajustes(id, codigo_hash) values (1, conferencia.resumo(codigo))
  on conflict (id) do update set codigo_hash = excluded.codigo_hash;
  return 'Código definido';
end $$;

create or replace function public.criar_sala(p_codigo text, p_sala uuid, p_token text, p_dono text, p_arquivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from conferencia.ajustes a where a.codigo_hash = conferencia.resumo(coalesce(p_codigo, ''))) then
    raise exception 'CODIGO_INVALIDO'; end if;
  if length(coalesce(p_token, '')) < 32 or length(coalesce(p_dono, '')) < 32 or length(coalesce(p_arquivo, '')) not between 1 and 8000000 then
    raise exception 'DADOS_INVALIDOS'; end if;
  if (select count(*) from conferencia.salas) >= 40 then raise exception 'LIMITE_SALAS'; end if;
  insert into conferencia.salas(id, token_hash, dono_hash, arquivo)
  values (p_sala, conferencia.resumo(p_token), conferencia.resumo(p_dono), p_arquivo)
  on conflict (id) do nothing;
  if not exists (select 1 from conferencia.salas s where s.id = p_sala and s.token_hash = conferencia.resumo(p_token)) then
    raise exception 'DADOS_INVALIDOS'; end if;
end $$;

create or replace function public.abrir_sala(p_sala uuid, p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  select s.arquivo into r from conferencia.salas s where s.id = p_sala and s.token_hash = conferencia.resumo(coalesce(p_token, ''));
  if not found then raise exception 'SALA_INEXISTENTE'; end if;
  return r;
end $$;

-- Envia os lançamentos novos e devolve os que o aparelho ainda não tem, em ordem.
create or replace function public.sincronizar(p_sala uuid, p_token text, p_desde bigint, p_eventos jsonb, p_part uuid, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_seq bigint; e jsonb;
begin
  if jsonb_typeof(p_eventos) <> 'array' or jsonb_array_length(p_eventos) > 200 or length(coalesce(p_nome, '')) > 600 then
    raise exception 'DADOS_INVALIDOS'; end if;
  if jsonb_array_length(p_eventos) > 0 then
    -- trava a sala: a numeração fica sem buracos e quem lê nunca pula um lançamento
    select s.ultimo_seq into v_seq from conferencia.salas s
     where s.id = p_sala and s.token_hash = conferencia.resumo(coalesce(p_token, '')) for update;
  else
    select s.ultimo_seq into v_seq from conferencia.salas s
     where s.id = p_sala and s.token_hash = conferencia.resumo(coalesce(p_token, ''));
  end if;
  if not found then raise exception 'SALA_INEXISTENTE'; end if;

  for e in select * from jsonb_array_elements(p_eventos) loop
    if length(coalesce(e->>'dados', '')) not between 1 and 4000 then raise exception 'DADOS_INVALIDOS'; end if;
    if not exists (select 1 from conferencia.eventos x where x.sala = p_sala and x.op = (e->>'op')::uuid) then
      if v_seq >= 30000 then raise exception 'LIMITE_EVENTOS'; end if;
      v_seq := v_seq + 1;
      insert into conferencia.eventos(sala, seq, op, dados) values (p_sala, v_seq, (e->>'op')::uuid, e->>'dados');
    end if;
  end loop;
  if jsonb_array_length(p_eventos) > 0 then update conferencia.salas s set ultimo_seq = v_seq where s.id = p_sala; end if;

  if not exists (select 1 from conferencia.participantes p where p.sala = p_sala and p.id = p_part)
     and (select count(*) from conferencia.participantes p where p.sala = p_sala) >= 20 then
    raise exception 'LIMITE_PARTICIPANTES'; end if;
  insert into conferencia.participantes(sala, id, nome) values (p_sala, p_part, coalesce(p_nome, ''))
  on conflict (sala, id) do update set nome = excluded.nome, visto_em = now();

  return jsonb_build_object(
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('seq', t.seq, 'op', t.op, 'dados', t.dados) order by t.seq)
       from (select x.seq, x.op, x.dados from conferencia.eventos x where x.sala = p_sala and x.seq > p_desde order by x.seq limit 500) t), '[]'::jsonb),
    'participantes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'ativo', p.visto_em > now() - interval '30 seconds') order by p.id)
       from conferencia.participantes p where p.sala = p_sala), '[]'::jsonb));
end $$;

-- Apaga a conferência do servidor (só quem criou tem a chave de dono).
create or replace function public.apagar_sala(p_sala uuid, p_dono text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from conferencia.salas s where s.id = p_sala and s.dono_hash = conferencia.resumo(coalesce(p_dono, ''));
  if not found then raise exception 'SALA_INEXISTENTE'; end if;
end $$;

revoke all on all functions in schema conferencia from public, anon, authenticated;
revoke all on function public.criar_sala(text, uuid, text, text, text) from public;
revoke all on function public.abrir_sala(uuid, text) from public;
revoke all on function public.sincronizar(uuid, text, bigint, jsonb, uuid, text) from public;
revoke all on function public.apagar_sala(uuid, text) from public;
grant usage on schema public to anon;
grant execute on function public.criar_sala(text, uuid, text, text, text) to anon;
grant execute on function public.abrir_sala(uuid, text) to anon;
grant execute on function public.sincronizar(uuid, text, bigint, jsonb, uuid, text) to anon;
grant execute on function public.apagar_sala(uuid, text) to anon;
