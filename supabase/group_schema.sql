-- 0. Helper Functions to prevent infinite recursion
create or replace function public.is_group_member(check_group_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from group_members 
    where group_id = check_group_id 
    and user_id = auth.uid()
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.is_group_admin(check_group_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from group_members 
    where group_id = check_group_id 
    and user_id = auth.uid()
    and role = 'admin'
  );
end;
$$ language plpgsql security definer set search_path = public;

-- 1. Create Groups Table
create table if not exists groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  avatar_url text,
  created_by uuid references auth.users not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table groups enable row level security;

-- 2. Create Group Members Table
create table if not exists group_members (
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  role text default 'member' not null check (role in ('admin', 'member')),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (group_id, user_id)
);

alter table group_members enable row level security;

-- 3. Create Policies for Groups
drop policy if exists "Group members can view groups" on groups;
create policy "Group members can view groups" on groups
  for select using (
    created_by = auth.uid() or
    public.is_group_member(id)
  );

drop policy if exists "Authenticated users can create groups" on groups;
create policy "Authenticated users can create groups" on groups
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Group admins can update groups" on groups;
create policy "Group admins can update groups" on groups
  for update using (public.is_group_admin(id));

drop policy if exists "Members can view other members" on group_members;
create policy "Members can view other members" on group_members
  for select using (public.is_group_member(group_id));

drop policy if exists "Admins can insert members" on group_members;
create policy "Admins can insert members" on group_members
  for insert with check (
    public.is_group_admin(group_id)
    or auth.uid() = user_id -- Allow creator to insert themselves during creation
  );

drop policy if exists "Admins can update members" on group_members;
create policy "Admins can update members" on group_members
  for update using (public.is_group_admin(group_id));

drop policy if exists "Admins or self can delete members" on group_members;
create policy "Admins or self can delete members" on group_members
  for delete using (
    auth.uid() = user_id or
    public.is_group_admin(group_id)
  );

-- 3. Modify Messages Table to support groups
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'group_id') then
    alter table messages alter column receiver_id drop not null;
    alter table messages add column group_id uuid references groups(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from information_schema.table_constraints where table_name = 'messages' and constraint_name = 'message_target_check') then
    alter table messages add constraint message_target_check check (
      (receiver_id is not null and group_id is null) or 
      (receiver_id is null and group_id is not null)
    );
  end if;
end $$;

drop policy if exists "Users can read their own messages." on messages;
create policy "Users can read their own messages." on messages
  for select using (
    auth.uid() = sender_id or 
    auth.uid() = receiver_id or
    public.is_group_member(group_id)
  );

-- Enable real-time for the groups table safely
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table groups;
  end if;
  
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table group_members;
  end if;
end $$;

-- 4. Group Keys for E2E Encryption
create table if not exists group_keys (
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  encrypted_key text not null,
  primary key (group_id, user_id)
);

alter table group_keys enable row level security;

drop policy if exists "Members can view their own group key" on group_keys;
create policy "Members can view their own group key" on group_keys
  for select using (auth.uid() = user_id);

drop policy if exists "Admins can insert group keys" on group_keys;
create policy "Admins can insert group keys" on group_keys
  for insert with check (
    public.is_group_admin(group_id)
    or exists (select 1 from groups where id = group_id and created_by = auth.uid()) -- Creator
  );

