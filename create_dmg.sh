#!/bin/bash
#
# Create a DMG installer for the macOS app
# Usage: ./create_dmg.sh
#
# Note: This script requires the app to be built first (run build_macos_app.sh)
#       and should be run on macOS
#

set -e  # Exit on error

APP_NAME="Vanta Vuln Stats"
APP_BUNDLE="dist/vanta_vuln_gui.app"
DMG_NAME="VantaVulnStats-1.0.0.dmg"
VOLUME_NAME="Vanta Vuln Stats Installer"
DMG_TEMP="dmg_temp"

echo "================================================"
echo "Creating DMG Installer"
echo "================================================"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "ERROR: This script must be run on macOS."
    exit 1
fi

# Check if app bundle exists
if [ ! -d "$APP_BUNDLE" ]; then
    echo "ERROR: App bundle not found at $APP_BUNDLE"
    echo "Please run build_macos_app.sh first."
    exit 1
fi

# Clean up any previous DMG
echo "Cleaning up previous DMG..."
rm -f "$DMG_NAME"
rm -rf "$DMG_TEMP"
echo ""

# Create temporary directory
echo "Creating temporary directory..."
mkdir -p "$DMG_TEMP"
echo ""

# Copy app bundle to temp directory
echo "Copying app bundle..."
cp -r "$APP_BUNDLE" "$DMG_TEMP/"
echo ""

# Create symbolic link to Applications folder
echo "Creating Applications symlink..."
ln -s /Applications "$DMG_TEMP/Applications"
echo ""

# Create DMG
echo "Creating DMG..."
hdiutil create -volname "$VOLUME_NAME" \
    -srcfolder "$DMG_TEMP" \
    -ov -format UDZO \
    "$DMG_NAME"
echo ""

# Clean up
echo "Cleaning up..."
rm -rf "$DMG_TEMP"
echo ""

echo "================================================"
echo "SUCCESS! DMG created at:"
echo "  $DMG_NAME"
echo ""
echo "You can now distribute this DMG file."
echo "Users can drag the app to their Applications folder."
echo "================================================"
