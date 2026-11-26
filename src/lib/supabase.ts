import { createClient } from '@supabase/supabase-js';

// Production fallback credentials so deployment on Vercel works out-of-the-box without entering env variables
const DEFAULT_SUPABASE_URL = 'https://zouslhgbyvbgadcarqar.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvdXNsaGdieXZiZ2FkY2FycWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2ODMxNTgsImV4cCI6MjExMTI1OTE1OH0.Y56YBNRDU08zKifBPvN62bu59Yxu0JwUCVXL6HZ-qQw';

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR_PROJECT'));
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export type AppRole = 'admin' | 'kitchen' | 'employee' | 'customer';
export type StaffProfile = {
  id: string;
  full_name: string;
  phone: string;
  role: AppRole;
  approval_status: string;
  restaurant_id: string;
  station_id?: string | null;
  email?: string;
  created_at?: string;
};
export type MenuItem = { id: string; name: string; name_ta?: string | null; description?: string | null; price: number; category_id?: string | null; category_name?: string; station_id?: string | null; station_name?: string; prep_minutes: number; is_vegetarian: boolean; is_available: boolean; image_url?: string | null };
export type CartLine = { item: MenuItem; quantity: number; note: string };
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
