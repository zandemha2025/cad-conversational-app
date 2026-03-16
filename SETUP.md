# ScaleCAD Setup Guide

Follow these steps in order. Don't skip ahead.

---

## Step 1: Open Terminal

- Press **Cmd + Space** on your keyboard
- Type **Terminal**
- Press **Enter**
- A window with text appears — this is where you'll type commands

---

## Step 2: Install Homebrew (if you don't have it)

Copy-paste this into Terminal and press Enter:

```
brew --version
```

**If you see a version number** like `Homebrew 4.x.x` — skip to Step 3.

**If you see "command not found"**, copy-paste this and press Enter:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow what it says on screen. When it's done, close Terminal and open it again.

---

## Step 3: Download the code

Copy-paste this into Terminal and press Enter:

```
git clone https://github.com/zandemha2025/ScaleCad.git
```

Then go into the folder:

```
cd ScaleCad
```

---

## Step 4: Create your accounts and get your keys

You need to sign up at 6 websites. **Keep every tab open in your browser** — you'll paste from them in Step 5.

---

### 4A: Supabase (the database)

1. Open **https://app.supabase.com** in your browser
2. Click **Sign Up** (or log in if you already have an account)
3. Click the green **New Project** button
4. Fill in:
   - **Name:** `scalecad`
   - **Database Password:** make up a password and **write it down** (you need it later)
   - **Region:** pick the closest one to you
5. Click **Create new project**
6. Wait about 2 minutes for it to finish setting up

Now you need to find 5 things on this page. **Write each one down** (a notes app or sticky note is fine):

**Project Ref:**
- Look at the URL bar in your browser
- It looks like: `https://supabase.com/dashboard/project/abcdefghijk`
- The random letters after `/project/` is your Project Ref
- Example: `abcdefghijk`

**Project URL:**
- Click the **gear icon** (bottom-left sidebar) to go to **Project Settings**
- Click **API** on the left
- You'll see **Project URL** near the top — something like `https://abcdefghijk.supabase.co`
- Copy it

**Anon Key:**
- On that same page, scroll down to **Project API keys**
- Find the row that says `anon` and `public`
- Click the **copy icon** next to it

**Service Role Key:**
- Same section, find the row that says `service_role` and `secret`
- Click **Reveal**, then click the **copy icon**

**JWT Secret:**
- Scroll down more on that same page
- Find the section called **JWT Settings**
- Copy the **JWT Secret** value

---

### 4B: Google AI Studio (the AI brain)

1. Open **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click **Create API Key**
4. A key appears starting with `AIza...`
5. Click **Copy**

---

### 4C: Zoo.dev (turns code into 3D models)

1. Open **https://zoo.dev**
2. Sign up or log in
3. Go to your **Account** or **Settings** (click your profile icon)
4. Find **API Keys**
5. Click **Create API Key**
6. Copy it

---

### 4D: Cloudflare R2 (stores uploaded files)

1. Open **https://dash.cloudflare.com**
2. Sign up or log in
3. In the left sidebar, click **R2 Object Storage**
4. Click **Create bucket**
   - Name it exactly: `scalecad-files`
   - Click **Create bucket**
5. On the bucket page, find the **Public URL** and copy it
   - If there's no public URL yet, click **Settings** on the bucket, enable **Public access**, then copy the URL

Now get the API keys:

6. Go back to the main **R2** page
7. Click **Manage R2 API Tokens** (top-right area)
8. Click **Create API token**
   - Permissions: pick **Object Read & Write**
   - Bucket: choose `scalecad-files`
   - Click **Create API Token**
9. It shows you 3 values — **copy all 3 now, the Secret only appears once**:
   - **Account ID**
   - **Access Key ID**
   - **Secret Access Key**

---

### 4E: Upstash (background job queue)

1. Open **https://console.upstash.com**
2. Sign up or log in
3. Click **Create Database**
   - **Name:** `scalecad`
   - **Type:** Redis
   - **Region:** pick the closest to you
   - Make sure **TLS** is enabled (usually on by default)
4. Click **Create**
5. On the database page, find the **Redis URL**
   - It looks like: `rediss://default:abc123xyz@us1-something.upstash.io:6380`
6. Copy it

---

### 4F: Fly.io (puts your app on the internet)

1. Open **https://fly.io**
2. Click **Sign Up** — create an account
3. That's it — the setup script handles the rest

---

## Step 5: Run the setup script

Go back to your **Terminal** window.

Make sure you're in the ScaleCad folder (if you're not sure, paste this):

```
cd ScaleCad
```

Then run:

```
chmod +x setup.sh && ./setup.sh
```

The script will start asking you to paste each key, one at a time.

**How it works:**
- It shows a label like `Project Ref:`
- You go to the browser tab where you have that value
- Copy it
- Go back to Terminal
- Press **Cmd+V** to paste
- Press **Enter**
- It asks the next one

**Note about passwords:** When you paste passwords or secret keys, **you won't see anything appear on screen** — that's normal, it's hiding the text for security. Just paste and press Enter.

Keep going until it finishes asking for all the keys. The order is:
1. Supabase Project Ref
2. Supabase DB Password
3. Supabase Project URL
4. Supabase Service Key
5. Supabase Anon Key
6. Supabase JWT Secret
7. Gemini API Key
8. Zoo.dev API Key
9. Cloudflare Account ID
10. Cloudflare Access Key
11. Cloudflare Secret Key
12. Cloudflare Bucket Name (`scalecad-files`)
13. Cloudflare Public URL
14. Upstash Redis URL

---

## Step 6: Wait for deployment

After you paste all the keys, the script does everything automatically:

- Sets up the database (about 30 seconds)
- Builds and deploys the backend server (about 3 minutes)
- Builds and deploys the background worker (about 4 minutes)
- Loads the hardware catalog (about 30 seconds)

It will open your browser to log in to Fly.io — follow the instructions.

Near the end, it asks:

```
Deploy frontend to Vercel now? (y/n):
```

Type **y** and press Enter. If it asks you to log into Vercel, follow the on-screen steps.

---

## Step 7: You're done

When everything finishes, you'll see:

```
ScaleCAD is live!

  API server:   https://scalecad-api.fly.dev
  Local dev:    http://localhost:5173
```

The app is now live on the internet.

---

## Running locally (for development)

If you want to run the app on your own computer:

```
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## If something goes wrong

**You can re-run the setup script at any time:**

```
./setup.sh
```

It remembers what you pasted before. Just press Enter to keep the old value, or paste a new one to change it.

**Check server logs:**

```
flyctl logs --app scalecad-api
flyctl logs --app scalecad-worker
```

---

## Quick reference: what each service does

| Service | What it does | Cost |
|---------|-------------|------|
| **Supabase** | Stores all your data (projects, users, chat history) | Free up to 500MB |
| **Google Gemini** | The AI that designs fixtures and answers questions | Free up to 60 requests/min |
| **Zoo.dev** | Compiles fixture code into 3D models | Free tier available |
| **Cloudflare R2** | Stores uploaded STEP files and exported models | Free up to 10GB |
| **Upstash Redis** | Manages background jobs (file processing, generation) | Free up to 10K commands/day |
| **Fly.io** | Hosts the backend server and worker on the internet | Free tier available |
| **Vercel** | Hosts the frontend website | Free tier available |
