-- AgentFlow · Esquema de Supabase
-- Ejecutar en Supabase → SQL Editor. Es idempotente (se puede ejecutar varias veces).
--
-- Seguridad: RLS activado SIN políticas públicas. Solo el servidor de Next.js,
-- usando SUPABASE_SERVICE_ROLE_KEY (que omite RLS), puede leer y escribir.
-- La clave anon/publishable no tiene acceso a estas tablas.

create extension if not exists pgcrypto;

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null check (char_length(prompt) <= 2000),
  status text not null check (status in ('running', 'passed', 'failed', 'error')),
  mode text not null check (mode in ('demo', 'llm')),
  max_iterations integer not null check (max_iterations between 1 and 10),
  total_iterations integer not null default 0,
  summary text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  position integer not null,
  title text not null,
  description text not null default '',
  assignee text not null check (assignee in ('orchestrator', 'develop', 'testing')),
  reviewer text,
  status text not null check (status in ('pending', 'in_progress', 'in_review', 'changes_requested', 'completed', 'failed')),
  attempts integer not null default 0,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  feedback jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  from_agent text not null,
  to_agent text not null,
  kind text not null,
  content text not null,
  task_id uuid references public.tasks(id) on delete set null,
  iteration integer,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  agent text not null,
  level text not null check (level in ('info', 'success', 'warn', 'error')),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.iterations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  number integer not null,
  passed boolean not null,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Cambios de archivos del workspace virtual (el contenido se guarda como texto;
-- nunca se escribe en el sistema de archivos ni se ejecuta en el servidor).
create table if not exists public.file_changes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  seq integer not null,
  iteration integer not null,
  path text not null check (char_length(path) <= 120),
  kind text not null check (kind in ('created', 'modified', 'deleted')),
  before_content text,
  after_content text,
  created_at timestamptz not null default now()
);

-- Migración desde la versión anterior del esquema (idempotente).
alter table public.tasks add column if not exists files jsonb not null default '[]'::jsonb;

create index if not exists runs_created_at_idx on public.runs (created_at desc);
create index if not exists tasks_run_id_idx on public.tasks (run_id, position);
create index if not exists agent_messages_run_id_idx on public.agent_messages (run_id, created_at);
create index if not exists agent_logs_run_id_idx on public.agent_logs (run_id, created_at);
create index if not exists iterations_run_id_idx on public.iterations (run_id, created_at);
create index if not exists file_changes_run_id_idx on public.file_changes (run_id, seq);

alter table public.runs enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_logs enable row level security;
alter table public.iterations enable row level security;
alter table public.file_changes enable row level security;
