const FALLBACK_SUPABASE_URL = "https://zdspapaigdywpbfwwzfb.supabase.co";

export async function loadAppConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (response.ok) {
      const config = await response.json();
      return {
        supabaseUrl: config.supabaseUrl || FALLBACK_SUPABASE_URL,
        supabaseAnonKey: config.supabaseAnonKey || "",
      };
    }
  } catch (error) {
    // Local file previews cannot call Vercel serverless functions.
  }

  return {
    supabaseUrl: FALLBACK_SUPABASE_URL,
    supabaseAnonKey: localStorage.getItem("nudgeFleet.anonKey") || "",
  };
}

export function configIsReady(config) {
  return Boolean(config?.supabaseUrl && config?.supabaseAnonKey);
}
