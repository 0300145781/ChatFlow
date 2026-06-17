-- Drop the foreign key constraints to allow the dummy AI user to exist and send messages
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- We could optionally add a constraint back that references auth.users OR the specific AI UUID, 
-- but in this app it's safe enough to just leave the UUID unconstrained.

-- Create a dummy profile for the Groq AI
INSERT INTO profiles (id, friend_code, name, avatar_url, bio, public_key) 
VALUES (
  '00000000-0000-0000-0000-000000000000', 
  'GROQAI', 
  'AI', 
  'https://ui-avatars.com/api/?name=AI&background=0D8ABC&color=fff&rounded=true&bold=true', 
  'I am Groq AI. Mention @AI to talk to me!',
  NULL
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  avatar_url = EXCLUDED.avatar_url,
  bio = EXCLUDED.bio;

-- Add RLS policy to allow users to insert messages sent by the AI
-- (Because otherwise users can only insert messages where auth.uid() = sender_id)
DROP POLICY IF EXISTS "Users can insert AI messages" ON messages;
CREATE POLICY "Users can insert AI messages" ON messages
  FOR INSERT WITH CHECK (sender_id = '00000000-0000-0000-0000-000000000000');
