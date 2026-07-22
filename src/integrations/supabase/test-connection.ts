import { supabase } from "./client";

export async function testSupabaseConnection() {
  const { data, error } = await supabase
    .from("sales_categories")
    .select("id, name")
    .limit(5);

  if (error) {
    console.error("[Supabase] Test koneksi gagal:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    throw error;
  }

  console.log("[Supabase] Test koneksi berhasil:", data);

  return data;
}