#!/bin/bash
PROJECT_DIR="/Users/jenny/.openclaw/workspace-bd-api/xiaohongshu-scraper"
echo "Starting Login Mode..."
echo "A browser window will open. Please log in to Xiaohongshu."
echo "The session will be saved to session.json when login is detected."

# Use npx to run the built main.js with mode=login
cd $PROJECT_DIR
npm run build
node dist/main.js --mode=login
