#!/bin/bash
# neevv — One-Command Deployment Script
# Usage: ./deploy.sh

set -e

echo "🏗️  neevv — Sapno Ka Nirman"
echo "=========================="
echo ""

PROJECT_ID="neev-491312"
REGION="asia-south1"
SERVICE_NAME="neevv-app"
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Step 1: Set project
echo "📌 Setting GCP project..."
gcloud config set project $PROJECT_ID

# Step 2: Enable required APIs
echo "🔧 Enabling APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com

# Step 3: Create GCS bucket for renders (if not exists)
echo "🪣 Setting up Cloud Storage..."
gsutil mb -l $REGION gs://neevv-renders 2>/dev/null || echo "Bucket already exists"
gsutil cors set cors.json gs://neevv-renders 2>/dev/null || true

# Step 4: Build and push Docker image
echo "🐳 Building Docker image..."
gcloud builds submit --tag $IMAGE:latest .

# Step 5: Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY:-AIzaSyDkBoNsiNMWeBdriH3_UqTyJovZs6vMdDg}" \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID}" \
  --set-env-vars "GCS_BUCKET_NAME=neevv-renders" \
  --set-env-vars "NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID}" \
  --set-env-vars "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${PROJECT_ID}.firebaseapp.com" \
  --set-env-vars "NEXT_PUBLIC_APP_URL=https://neevv.com"

# Step 6: Get the URL
URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo ""
echo "✅ neevv is LIVE!"
echo "🌐 URL: $URL"
echo ""
echo "Next steps:"
echo "  1. Map your domain: gcloud run domain-mappings create --service $SERVICE_NAME --domain neevv.com --region $REGION"
echo "  2. Set up Firebase Auth in the Firebase Console"
echo "  3. Enable Firestore in the Firebase Console"
echo ""
