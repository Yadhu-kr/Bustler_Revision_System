#!/usr/bin/env bash
# ==============================================================================
# Bustler Revision Brief Assistant — Cloud Run + Firestore Deployment Script
# ==============================================================================
# Prerequisites:
#   1. Google Cloud SDK (gcloud) installed and authenticated (`gcloud auth login`)
#   2. GCP project created with Firestore in Native mode enabled
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh [YOUR_GCP_PROJECT_ID] [REGION]
# ==============================================================================

set -e

PROJECT_ID=${1:-$GCP_PROJECT_ID}
REGION=${2:-"us-central1"}
SERVICE_NAME="bustler-revision-assistant"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: GCP Project ID is required."
  echo "Usage: ./deploy.sh <PROJECT_ID> [REGION]"
  echo "Or set GCP_PROJECT_ID environment variable."
  exit 1
fi

echo "🚀 Deploying Bustler to Google Cloud Run..."
echo "   Project ID: ${PROJECT_ID}"
echo "   Region:     ${REGION}"
echo "   Service:    ${SERVICE_NAME}"
echo ""

# 1. Set active gcloud project
gcloud config set project "$PROJECT_ID"

# 2. Enable necessary Google Cloud APIs
echo "📦 Enabling required Cloud APIs (Cloud Run, Container Registry, Firestore)..."
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com

# 3. Build & Deploy to Cloud Run using Source Deploy
echo "🔨 Building container image and deploying to Cloud Run..."
if [ -z "$API_SECRET" ]; then
  echo "⚠️  Warning: API_SECRET is not set. Generating a random one for this deploy."
  API_SECRET=$(openssl rand -hex 32)
  echo "   Generated API_SECRET: ${API_SECRET}"
  echo "   Save this value — you'll need it to access the API."
fi

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --dockerfile backend/Dockerfile \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID="$PROJECT_ID",API_SECRET="$API_SECRET"

echo ""
echo "✅ Deployment Complete!"
echo "   Your Bustler Revision Assistant is now live on Cloud Run."
echo "   Token-based access control is active and backed by Firestore."
