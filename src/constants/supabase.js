import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://nofawxywnhqrqnwokkge.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZmF3eHl3bmhxcnFud29ra2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMzMzNDcsImV4cCI6MjA5MzgwOTM0N30.RVD8fyCWGljLmOWzroRtzRuYpQZ-T1kCRkjYIlM4G-c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
