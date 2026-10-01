#!/bin/bash
set -e

echo "=========================================================="
echo "  Launching OutGrow WhatsApp Validator ULTRA (macOS)..."
echo "=========================================================="

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "📦 First-time launch detected. Installing dependencies..."
    npm install
fi

# Start the desktop application
echo "🚀 Launching Electron Desktop App..."
npm run app
