-- Execute este comando no SQL Editor do Supabase caso ainda não tenha criado a tabela:
create table if not exists user_protocols (
  user_id uuid references auth.users not null primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table user_protocols enable row level security;

drop policy if exists "Usuarios gerenciam apenas seus proprios dados" on user_protocols;

create policy "Usuarios gerenciam apenas seus proprios dados"
  on user_protocols
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
