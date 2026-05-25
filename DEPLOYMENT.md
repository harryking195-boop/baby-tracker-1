# Deploying Baby Tracker

## 1. Supabase

1. Open your Supabase project.
2. Go to SQL Editor.
3. Run `supabase/schema.sql`.
4. In Authentication > URL Configuration, add your deployed site URL.

## 2. Vercel

1. Push this project to GitHub.
2. Import the repo into Vercel.
3. Add environment variables:

```bash
VITE_SUPABASE_URL=https://cirghiodugfnatynkvhu.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

4. Deploy.

## 3. Sharing

After signing in, the app creates your baby account. Open Profile and share the generated invite URL or QR code. A partner opens that URL, signs in with email, and is added to the same baby account.
