# neevv — Deployment Guide

## Prerequisites

1. **Google Cloud SDK** installed → [Install Guide](https://cloud.google.com/sdk/docs/install)
2. **Node.js 20+** installed
3. **Git** installed
4. Your **Neev GCP project** (neev-491312) with billing active

---

## 🚀 Quick Deploy (5 Minutes)

### Step 1: Clone and Configure

```bash
# Clone the repo (after pushing to GitHub)
git clone https://github.com/YOUR_USERNAME/neevv-app.git
cd neevv-app

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your values
nano .env.local
```

### Step 2: Set Your API Key

```bash
# Set the Gemini API key as environment variable
export GEMINI_API_KEY="AIzaSyDkBoNsiNMWeBdriH3_UqTyJovZs6vMdDg"
```

### Step 3: Deploy!

```bash
chmod +x deploy.sh
./deploy.sh
```

That's it! Your app will be live on a `.run.app` URL in ~3 minutes.

---

## 📋 Detailed Setup

### A. Firebase Setup (Auth + Database)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your **Neev** project (it should already be linked)
3. Enable **Authentication**:
   - Click Authentication → Sign-in Method
   - Enable **Google** provider
   - Add your domain to Authorized Domains
4. Enable **Firestore**:
   - Click Firestore Database → Create Database
   - Choose **asia-south1** region
   - Start in Production mode
5. Get your **Firebase config**:
   - Project Settings → General → Your apps → Web app
   - Copy the config values to your `.env.local`

### B. Google Cloud Storage (Renders)

```bash
# Create bucket
gsutil mb -l asia-south1 gs://neevv-renders

# Set CORS policy
gsutil cors set cors.json gs://neevv-renders

# Make renders publicly readable
gsutil iam ch allUsers:objectViewer gs://neevv-renders
```

### C. Custom Domain (neevv.com)

```bash
# Map your domain
gcloud run domain-mappings create \
  --service neevv-app \
  --domain neevv.com \
  --region asia-south1

# You'll get DNS records to add:
# Type: CNAME, Name: www, Value: ghs.googlehosted.com
# Type: A, Name: @, Values: (provided IPs)
```

Add DNS records at your domain registrar (GoDaddy, Namecheap, etc.)

---

## 🔄 Continuous Deployment (CI/CD)

### Option A: Cloud Build (Recommended)

1. Push your code to GitHub
2. Go to [Cloud Build](https://console.cloud.google.com/cloud-build) in GCP Console
3. Click **Triggers** → **Create Trigger**:
   - Name: `neevv-deploy`
   - Event: Push to branch
   - Branch: `^main$`
   - Configuration: `cloudbuild.yaml`
4. Done! Every push to `main` = auto-deploy in ~2 min

### Option B: GitHub Actions (Alternative)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Run
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud builds submit --tag gcr.io/${{ secrets.GCP_PROJECT_ID }}/neevv-app
          gcloud run deploy neevv-app \
            --image gcr.io/${{ secrets.GCP_PROJECT_ID }}/neevv-app \
            --region asia-south1 \
            --platform managed
```

---

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

---

## 📱 PWA (Mobile Install)

The app is a Progressive Web App. Users can:
1. Visit neevv.com on their phone
2. Chrome will show "Add to Home Screen" prompt
3. App installs with the neevv icon
4. Opens in full-screen mode like a native app

No Play Store or App Store needed initially!

---

## 💰 Cost Estimate (Google Cloud)

| Service | Usage | Monthly Cost |
|---|---|---|
| Cloud Run | ~10K requests/month | **Free** (free tier: 2M requests) |
| Cloud Storage | ~5GB renders | **~$0.10** |
| Firestore | ~10K reads/writes/day | **Free** (free tier: 50K/day) |
| Cloud Build | ~30 builds/month | **Free** (free tier: 120 min/day) |
| Gemini API | ~500 renders/month | **~$20** |
| **Total** | | **~$20/month** |

With $300 free credits, you're covered for **15+ months**!

---

## 🛡️ Security Checklist

- [x] API keys in environment variables (never in client code)
- [x] Firebase Auth for user authentication
- [x] Firestore security rules (set up after deployment)
- [x] CORS configured for GCS bucket
- [x] HTTPS enforced (Cloud Run default)
- [x] Gemini API key server-side only
- [ ] Add rate limiting (recommended for production)
- [ ] Set up Firebase App Check (recommended)
- [ ] Enable Cloud Armor DDoS protection (when traffic grows)

---

## 📊 Monitoring

```bash
# View logs
gcloud run services logs read neevv-app --region asia-south1

# View metrics
# Go to: https://console.cloud.google.com/run/detail/asia-south1/neevv-app/metrics
```

---

## 🆘 Troubleshooting

| Issue | Fix |
|---|---|
| "Permission denied" during deploy | `gcloud auth login` and check IAM roles |
| Renders not loading | Check GCS bucket CORS and public access |
| Auth not working | Verify Firebase config and authorized domains |
| Build timeout | Increase Cloud Build timeout in `cloudbuild.yaml` |
| Cold start slow | Set `--min-instances 1` (costs ~$15/month) |
