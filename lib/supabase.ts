import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Trade {
  id?: string;
  ticker: string;
  entry_price: number;
  exit_price: number | null;
  shares: number;
  entry_date: string;
  exit_date: string | null;
  strategy: string;
  notes: string | null;
  created_at?: string;
}

export async function getTrades(): Promise<Trade[]> {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("entry_date", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function addTrade(trade: Omit<Trade, "id" | "created_at">): Promise<boolean> {
  const { error } = await supabase.from("trades").insert(trade);
  return !error;
}

export async function updateTrade(id: string, updates: Partial<Trade>): Promise<boolean> {
  const { error } = await supabase.from("trades").update(updates).eq("id", id);
  return !error;
}
