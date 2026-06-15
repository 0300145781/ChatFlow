-- Create a table for public profiles
create table profiles (
  id uuid references auth.users not null primary key,
  friend_code text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone." on profiles
  for select using (true);

create policy "Users can insert their own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id);

-- Function to handle new user signup
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, friend_code)
  values (new.id, new.raw_user_meta_data->>'friend_code');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function after a user is inserted
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create contacts table
create table contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  contact_user_id uuid references auth.users not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, contact_user_id)
);

-- Set up Row Level Security (RLS) for contacts
alter table contacts enable row level security;

create policy "Users can view their own contacts." on contacts
  for select using (auth.uid() = user_id);

create policy "Users can insert their own contacts." on contacts
  for insert with check (auth.uid() = user_id);

-- Update contacts to support custom names
alter table contacts add column name text;

create policy "Users can update their own contacts." on contacts
  for update using (auth.uid() = user_id);

-- Create messages table
create table messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references auth.users not null,
  receiver_id uuid references auth.users not null,
  content text not null,
  type text default 'text' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table messages enable row level security;

create policy "Users can read their own messages." on messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can insert their own messages." on messages
  for insert with check (auth.uid() = sender_id);

-- Enable real-time for the messages table
alter publication supabase_realtime add table messages;

-- Media Support
alter table profiles add column avatar_url text;

-- Create Storage Buckets
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
insert into storage.buckets (id, name, public) values ('voice_notes', 'voice_notes', true);

-- Storage Policies
create policy "Public Access" on storage.objects for select using (bucket_id in ('avatars', 'voice_notes'));
drop policy if exists "Authenticated Uploads" on storage.objects;
create policy "Authenticated Uploads" on storage.objects for insert with check (
  bucket_id in ('avatars', 'voice_notes') and 
  auth.role() = 'authenticated' and
  (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Authenticated Updates" on storage.objects for update using (
  bucket_id in ('avatars', 'voice_notes') and 
  auth.role() = 'authenticated' and
  (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Authenticated Deletes" on storage.objects for delete using (
  bucket_id in ('avatars', 'voice_notes') and 
  auth.role() = 'authenticated' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Database Indexing (For Speed)
create index if not exists idx_messages_sender_receiver on messages(sender_id, receiver_id);
create index if not exists idx_profiles_friend_code on profiles(friend_code);

-- Message Deletion Features
alter table messages 
add column is_deleted boolean default false,
add column deleted_for_users text[] default '{}';

create policy "Users can update messages." on messages
  for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Reactions and Read Receipts
alter table messages 
add column reactions jsonb default '[]'::jsonb,
add column read_at timestamp with time zone;
