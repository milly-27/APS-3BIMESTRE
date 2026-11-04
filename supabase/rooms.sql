create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique check (invite_code ~ '^[A-F0-9]{6}$'),
  host_id uuid not null references auth.users (id) on delete cascade,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  status text not null default 'waiting'
    check (status in ('waiting', 'in_progress', 'finished')),
  created_at timestamptz not null default now()
);

alter table public.rooms drop column if exists word;

create table if not exists public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.room_word_bank (
  word text primary key,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'expert'))
);

create table if not exists public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  word text not null
);

create table if not exists public.room_round_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  correct_letters text[] not null default '{}',
  incorrect_letters text[] not null default '{}',
  errors integer not null default 0 check (errors between 0 and 10),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'won', 'lost')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (room_id, user_id)
);

create table if not exists public.leaderboard (
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  errors integer not null check (errors between 0 and 9),
  updated_at timestamptz not null default now(),
  primary key (user_id, difficulty)
);

alter table public.leaderboard drop constraint if exists leaderboard_pkey;
alter table public.leaderboard
  add constraint leaderboard_pkey primary key (user_id, difficulty);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_word_bank enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_round_players enable row level security;
alter table public.leaderboard enable row level security;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "Room members can read their rooms" on public.rooms;
create policy "Room members can read their rooms"
  on public.rooms for select
  to authenticated
  using (public.is_room_member(id));

drop policy if exists "Room members can read their participants" on public.room_players;
create policy "Room members can read their participants"
  on public.room_players for select
  to authenticated
  using (public.is_room_member(room_id));

revoke all on public.rooms, public.room_players from anon, authenticated;
revoke all on public.room_word_bank, public.room_secrets, public.room_round_players
  from anon, authenticated;
revoke all on public.leaderboard from anon, authenticated;
grant select (id, invite_code, host_id, difficulty, status, created_at)
  on public.rooms to authenticated;
grant select on public.room_players to authenticated;
grant select on public.leaderboard to anon, authenticated;

drop policy if exists "Anyone can read the leaderboard" on public.leaderboard;
create policy "Anyone can read the leaderboard"
  on public.leaderboard for select
  to anon, authenticated
  using (true);

create or replace function public.save_ranking_result(
  p_display_name text,
  p_difficulty text,
  p_elapsed_seconds integer,
  p_errors integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Entre em uma conta para registrar seu resultado.';
  end if;

  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'O nome deve ter de 1 a 32 caracteres.';
  end if;

  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard', 'expert')
    or p_elapsed_seconds is null or p_elapsed_seconds < 0
    or p_errors is null or p_errors not between 0 and 9 then
    raise exception using errcode = '22023', message = 'Os dados do resultado são inválidos.';
  end if;

  insert into public.leaderboard (
    user_id, display_name, difficulty, elapsed_seconds, errors, updated_at
  )
  values (
    auth.uid(), trim(p_display_name), p_difficulty, p_elapsed_seconds, p_errors, now()
  )
  on conflict (user_id, difficulty) do update
    set display_name = excluded.display_name,
        difficulty = excluded.difficulty,
        elapsed_seconds = excluded.elapsed_seconds,
        errors = excluded.errors,
        updated_at = excluded.updated_at
    where (excluded.elapsed_seconds, excluded.errors)
      < (public.leaderboard.elapsed_seconds, public.leaderboard.errors);

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

drop policy if exists "Players can read their own round" on public.room_round_players;
create policy "Players can read their own round"
  on public.room_round_players for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.create_room(
  p_difficulty text,
  p_display_name text
)
returns table (room_id uuid, invite_code text, difficulty text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_invite_code text;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Entre na sala como jogador para continuar.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert') then
    raise exception using errcode = '22023', message = 'Nível de dificuldade inválido.';
  end if;

  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'O nome deve ter de 1 a 32 caracteres.';
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 5 then
      raise exception using errcode = '54000', message = 'Não foi possível gerar um código de sala. Tente novamente.';
    end if;

    v_invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    begin
      insert into public.rooms (invite_code, host_id, difficulty)
      values (v_invite_code, auth.uid(), p_difficulty)
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      v_room_id := null;
    end;
  end loop;

  insert into public.room_players (room_id, user_id, display_name)
  values (v_room_id, auth.uid(), trim(p_display_name));

  return query
    select r.id, r.invite_code, r.difficulty, r.status
    from public.rooms as r
    where r.id = v_room_id;
end;
$$;

create or replace function public.join_room(
  p_invite_code text,
  p_display_name text
)
returns table (room_id uuid, invite_code text, difficulty text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Entre na sala como jogador para continuar.';
  end if;

  if p_display_name is null or char_length(trim(p_display_name)) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'O nome deve ter de 1 a 32 caracteres.';
  end if;

  if p_invite_code is null or upper(trim(p_invite_code)) !~ '^[A-F0-9]{6}$' then
    raise exception using errcode = '22023', message = 'Informe um código de sala válido.';
  end if;

  select r.*
    into v_room
    from public.rooms as r
    where r.invite_code = upper(trim(p_invite_code))
      and r.status = 'waiting'
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Sala não encontrada ou partida já iniciada.';
  end if;

  insert into public.room_players (room_id, user_id, display_name)
  values (v_room.id, auth.uid(), trim(p_display_name))
  on conflict on constraint room_players_pkey
    do update set display_name = excluded.display_name;

  return query
    select v_room.id, v_room.invite_code, v_room.difficulty, v_room.status;
end;
$$;

create or replace function public.start_room(p_room_id uuid)
returns table (room_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_word text;
  v_player_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Entre na sala para iniciar a partida.';
  end if;

  select r.*
    into v_room
    from public.rooms as r
    where r.id = p_room_id
    for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Sala não encontrada.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Somente o anfitrião pode iniciar a partida.';
  end if;

  if v_room.status <> 'waiting' then
    raise exception using errcode = '55000', message = 'Esta sala já foi iniciada.';
  end if;

  select count(*)
    into v_player_count
    from public.room_players as rp
    where rp.room_id = p_room_id;

  if v_player_count < 2 then
    raise exception using errcode = '55000', message = 'Aguarde pelo menos mais um jogador antes de iniciar.';
  end if;

  select wb.word
    into v_word
    from public.room_word_bank as wb
    where wb.difficulty = v_room.difficulty
    order by random()
    limit 1;

  if v_word is null then
    raise exception using errcode = '55000', message = 'Não há palavras cadastradas para esta dificuldade.';
  end if;

  insert into public.room_secrets (room_id, word)
    values (p_room_id, v_word);

  insert into public.room_round_players (room_id, user_id)
    select p_room_id, rp.user_id
    from public.room_players as rp
    where rp.room_id = p_room_id;

  update public.rooms as r
    set status = 'in_progress'
    where r.id = p_room_id;

  return query select p_room_id, 'in_progress'::text;
end;
$$;

create or replace function public.get_round_state(p_room_id uuid)
returns table (
  room_id uuid,
  status text,
  difficulty text,
  masked_word text,
  errors integer,
  max_errors integer,
  correct_letters text[],
  incorrect_letters text[],
  elapsed_seconds integer,
  revealed_word text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_word text;
  v_player public.room_round_players%rowtype;
  v_room_status text;
  v_difficulty text;
  v_masked_word text;
  v_elapsed integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Entre na sala para consultar a rodada.';
  end if;

  if not exists (
    select 1 from public.room_players as rp
    where rp.room_id = p_room_id and rp.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'Você não participa desta sala.';
  end if;

  select rs.word, r.status, r.difficulty
    into v_word, v_room_status, v_difficulty
    from public.room_secrets as rs
    join public.rooms as r on r.id = rs.room_id
    where rs.room_id = p_room_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'A rodada desta sala ainda não foi iniciada.';
  end if;

  select rp.*
    into v_player
    from public.room_round_players as rp
    where rp.room_id = p_room_id and rp.user_id = auth.uid();

  if not found then
    raise exception using errcode = 'P0002', message = 'A rodada desta sala ainda não foi iniciada.';
  end if;

  select string_agg(
      case
        when translate(upper(substr(v_word, s.position, 1)),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'AAAAAEEEEIIIIOOOOOUUUUC') = any(v_player.correct_letters)
          then substr(v_word, s.position, 1)
        else '_'
      end,
      '' order by s.position
    )
    into v_masked_word
    from generate_series(1, char_length(v_word)) as s(position);

  v_elapsed := greatest(
    0,
    floor(extract(epoch from (coalesce(v_player.completed_at, now()) - v_player.started_at)))::integer
  );

  return query
    select p_room_id,
      case when v_room_status = 'finished' and v_player.status = 'in_progress'
        then 'finished' else v_player.status end,
      v_difficulty,
      v_masked_word,
      v_player.errors,
      10,
      v_player.correct_letters,
      v_player.incorrect_letters,
      v_elapsed,
      case when v_player.status <> 'in_progress' then v_word else null end;
end;
$$;

create or replace function public.submit_room_guess(p_room_id uuid, p_letter text)
returns table (
  room_id uuid,
  status text,
  difficulty text,
  masked_word text,
  letter_correct boolean,
  errors integer,
  max_errors integer,
  correct_letters text[],
  incorrect_letters text[],
  elapsed_seconds integer,
  revealed_word text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_letter text;
  v_word text;
  v_normalized_word text;
  v_room_status text;
  v_difficulty text;
  v_player public.room_round_players%rowtype;
  v_letter_correct boolean := false;
  v_masked_word text;
  v_elapsed integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Entre na sala para enviar um palpite.';
  end if;

  v_letter := translate(
    upper(trim(coalesce(p_letter, ''))),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'AAAAAEEEEIIIIOOOOOUUUUC'
  );

  if char_length(v_letter) <> 1 or v_letter !~ '^[A-Z]$' then
    raise exception using errcode = '22023', message = 'Informe apenas uma letra.';
  end if;

  select rs.word, r.status, r.difficulty
    into v_word, v_room_status, v_difficulty
    from public.room_secrets as rs
    join public.rooms as r on r.id = rs.room_id
    where rs.room_id = p_room_id;

  if not found then
    raise exception using errcode = '42501', message = 'Você não participa de uma rodada ativa desta sala.';
  end if;

  select rp.*
    into v_player
    from public.room_round_players as rp
    where rp.room_id = p_room_id and rp.user_id = auth.uid()
    for update;

  if not found then
    raise exception using errcode = '42501', message = 'Você não participa de uma rodada ativa desta sala.';
  end if;

  if v_room_status <> 'in_progress' then
    raise exception using errcode = '55000', message = 'Esta partida não está em andamento.';
  end if;

  v_normalized_word := translate(
    upper(v_word),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'AAAAAEEEEIIIIOOOOOUUUUC'
  );
  if v_player.status = 'in_progress'
    and not (v_letter = any(v_player.correct_letters))
    and not (v_letter = any(v_player.incorrect_letters)) then
    v_letter_correct := position(v_letter in v_normalized_word) > 0;

    if v_letter_correct then
      v_player.correct_letters := array_append(v_player.correct_letters, v_letter);
      if not exists (
        select 1
        from generate_series(1, char_length(v_normalized_word)) as s(position)
        where substr(v_normalized_word, s.position, 1) <> all(v_player.correct_letters)
      ) then
        v_player.status := 'won';
        v_player.completed_at := now();
      end if;
    else
      v_player.incorrect_letters := array_append(v_player.incorrect_letters, v_letter);
      v_player.errors := v_player.errors + 1;
      if v_player.errors >= 10 then
        v_player.status := 'lost';
        v_player.completed_at := now();
      end if;
    end if;

    update public.room_round_players as rp
      set correct_letters = v_player.correct_letters,
          incorrect_letters = v_player.incorrect_letters,
          errors = v_player.errors,
          status = v_player.status,
          completed_at = v_player.completed_at
      where rp.room_id = p_room_id and rp.user_id = auth.uid();
  end if;

  select string_agg(
      case when translate(upper(substr(v_word, s.position, 1)),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC') = any(v_player.correct_letters)
        then substr(v_word, s.position, 1) else '_' end,
      '' order by s.position
    )
    into v_masked_word
    from generate_series(1, char_length(v_word)) as s(position);

  v_elapsed := greatest(
    0,
    floor(extract(epoch from (coalesce(v_player.completed_at, now()) - v_player.started_at)))::integer
  );

  return query
    select p_room_id, v_player.status, v_difficulty, v_masked_word,
      v_letter_correct, v_player.errors, 10,
      v_player.correct_letters, v_player.incorrect_letters,
      v_elapsed,
      case when v_player.status <> 'in_progress' then v_word else null end;
end;
$$;

insert into public.room_word_bank (word, difficulty) values
  ('sol', 'easy'), ('rio', 'easy'), ('lua', 'easy'), ('gato', 'easy'),
  ('bola', 'easy'), ('casa', 'easy'), ('jogo', 'easy'), ('vento', 'easy'),
  ('livro', 'easy'),
  ('amigos', 'medium'), ('escola', 'medium'), ('janela', 'medium'),
  ('viagem', 'medium'), ('palavra', 'medium'), ('jogador', 'medium'),
  ('teclado', 'medium'), ('planeta', 'medium'),
  ('biblioteca', 'hard'), ('computador', 'hard'), ('laboratório', 'hard'),
  ('pensamento', 'hard'), ('experiência', 'hard'), ('astronauta', 'hard'),
  ('formigueiro', 'hard'), ('personagem', 'hard'),
  ('extraordinário', 'expert'), ('sustentabilidade', 'expert'),
  ('interatividade', 'expert'), ('biodiversidade', 'expert'),
  ('desenvolvimento', 'expert'), ('multiprocessador', 'expert'),
  ('anticonstitucional', 'expert'), ('interdisciplinaridade', 'expert')
on conflict (word) do update set difficulty = excluded.difficulty;

revoke all on function public.create_room(text, text) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.start_room(uuid) from public;
revoke all on function public.get_round_state(uuid) from public;
revoke all on function public.submit_room_guess(uuid, text) from public;
revoke all on function public.save_ranking_result(text, text, integer, integer) from public, anon;
grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.start_room(uuid) to authenticated;
grant execute on function public.get_round_state(uuid) to authenticated;
grant execute on function public.submit_room_guess(uuid, text) to authenticated;
grant execute on function public.save_ranking_result(text, text, integer, integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'rooms'
    ) then
      alter publication supabase_realtime add table public.rooms;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_players'
    ) then
      alter publication supabase_realtime add table public.room_players;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'room_round_players'
    ) then
      alter publication supabase_realtime add table public.room_round_players;
    end if;
  end if;
end;
$$;
