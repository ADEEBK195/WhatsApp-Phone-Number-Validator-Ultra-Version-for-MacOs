#!/bin/bash
set -e

echo "=========================================================="
echo "  OutGrow WhatsApp Validator ULTRA (macOS Edition) Build"
echo "=========================================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "📦 Checking and installing dependencies..."
npm install

echo "🚀 Building Universal macOS DMG & ZIP packages..."
npm run dist:mac

echo ""
echo "=========================================================="
echo "  ✅ Build Complete!"
echo "  Universal DMG and ZIP packages are located in: dist/"
echo "=========================================================="
