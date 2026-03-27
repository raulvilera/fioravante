import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nemztmnfnkaitixyqskq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbXp0bW5mbmthaXRpeHlxc2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNDkyODAsImV4cCI6MjA4OTgyNTI4MH0.pcC17gn-UIV3kWY9YMNG9e8PhMp9AQk-FfdKKYD_qzk';

// Tabelas no schema PUBLIC — não usar db.schema para não redirecionar queries
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'fioravante_auth_session',
  },
});

export const isSupabaseConfigured = true;
