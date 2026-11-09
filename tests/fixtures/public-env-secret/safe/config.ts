// Keys that are public by design, and secrets that stay on the server.
export const publicConfig = {
  firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

export const serverConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
};
