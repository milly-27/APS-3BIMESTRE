begin;

alter table public.leaderboard drop constraint if exists leaderboard_pkey;
alter table public.leaderboard
  add constraint leaderboard_pkey primary key (user_id, difficulty);

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
        elapsed_seconds = excluded.elapsed_seconds,
        errors = excluded.errors,
        updated_at = excluded.updated_at
    where (excluded.elapsed_seconds, excluded.errors)
      < (public.leaderboard.elapsed_seconds, public.leaderboard.errors);

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

commit;
