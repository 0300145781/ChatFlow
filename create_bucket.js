import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ytmvqmmeswuhuvxlfoqi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0bXZxbW1lc3d1aHV2eGxmb3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MjIwODAsImV4cCI6MjA5NzA5ODA4MH0.W0OVgSSeFSDg6prtEYkIOpiTFXRLm8XOYtH2mSRcqu4';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.storage.createBucket('chat_media', { public: true });
  console.log('Result:', data, error);
}
main();
