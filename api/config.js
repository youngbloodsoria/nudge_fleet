module.exports = function handler(request, response) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=86400");

  response.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "https://zdspapaigdywpbfwwzfb.supabase.co",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  });
};
