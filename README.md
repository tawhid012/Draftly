# Draftly

Real-time private messaging system disguised as a personal notes and writing app.

## Database Setup (Supabase)

1. Create a new project on [Supabase](https://supabase.com).
2. Go to **SQL Editor** -> **New Query**.
3. Copy and run the contents of [`schema.sql`](schema.sql). This will set up:
   - `users`, `messages`, `typing_status`, `tasks`, and `notes` tables
   - Row Level Security (RLS) policies
   - Realtime publication subscriptions
   - `draftly-media` storage bucket with upload & read policies
4. Go to **Authentication** -> **Users** and create the allowed user accounts:
   - `ig.tawhid@gmail.com`
   - `choudharyafreen842@gmail.com`
5. Go to **Project Settings** -> **API** and copy:
   - **Project URL**
   - **Project API Keys** -> `anon` (public)
6. Open [`app.js`](app.js) and update `SUPABASE_URL` and `SUPABASE_ANON` at the top of the file:
   ```javascript
   const SUPABASE_URL  = 'https://<your-project-ref>.supabase.co';
   const SUPABASE_ANON = '<your-anon-key>';
   ```
