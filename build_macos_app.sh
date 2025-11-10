#!/bin/bash
#
# Build script for creating macOS app bundle
# Usage: ./build_macos_app.sh
#

set -e  # Exit on error

echo "================================================"
echo "Vanta Vulnerability Stats - macOS App Builder"
echo "================================================"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "Warning: This script is designed for macOS."
    echo "You can still run it to prepare the build, but the final .app bundle"
    echo "will need to be built on a macOS system."
    echo ""
fi

# Check Python version
echo "Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
echo "Found Python $PYTHON_VERSION"

if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 14 ]; then
    echo ""
    echo "ERROR: Python $PYTHON_VERSION is not supported for building the GUI."
    echo "PySide6 has not yet published wheels for Python 3.14, so the dependency"
    echo "installation will fail. Please install Python 3.12 or 3.13 and re-run"
    echo "this script using that interpreter."
    echo ""
    echo "Recommended steps on macOS:"
    echo "  1. brew install python@3.12"
    echo "  2. python3.12 -m venv venv"
    echo "  3. source venv/bin/activate"
    echo "  4. ./build_macos_app.sh"
    exit 1
fi
echo ""

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "Virtual environment created."
else
    echo "Virtual environment already exists."
fi
echo ""

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate
echo ""

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
pip install py2app
echo ""

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build dist
echo "Clean complete."
echo ""

# Build the app
echo "Building macOS app bundle..."
python3 setup.py py2app
echo ""

# Check if build was successful
if [ -d "dist/vanta_vuln_gui.app" ]; then
    echo "================================================"
    echo "SUCCESS! App bundle created at:"
    echo "  dist/vanta_vuln_gui.app"
    echo ""
    echo "You can now:"
    echo "  1. Open the app: open dist/vanta_vuln_gui.app"
    echo "  2. Copy to Applications: cp -r dist/vanta_vuln_gui.app /Applications/"
    echo "  3. Create DMG for distribution (see create_dmg.sh)"
    echo "================================================"
else
    echo "================================================"
    echo "ERROR: Build failed. Check the output above for errors."
    echo "================================================"
    exit 1
fi
