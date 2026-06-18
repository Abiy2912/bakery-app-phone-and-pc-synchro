import { createClient } from '@supabase/supabase-js';

// 1. Fixed URL format (added .supabase.co to the end)
const supabaseUrl = 'https://ugfvmturtdzikssufesp.supabase.co';

// 2. Your long Anon Public Key stays exactly the same
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZnZtdHVydGR6aWtzc3VmZXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzYwNTEsImV4cCI6MjA5Njc1MjA1MX0.P1SLWmDRo-7lbnuXyxXC2pGcMY9yS4ljpZESB7ipLXs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);