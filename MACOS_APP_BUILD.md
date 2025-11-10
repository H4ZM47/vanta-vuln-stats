# Building the macOS App Bundle

This guide explains how to package the Vanta Vulnerability Statistics utility as a macOS app bundle.

## Prerequisites

- **macOS** system (for final build)
- **Python 3.8-3.13** installed (Python 3.12 or 3.13 recommended)
- **Xcode Command Line Tools** (install via: `xcode-select --install`)

> **Note:** Python 3.14+ is not yet supported due to PySide6 compatibility.

## Quick Start

### Option 1: Automated Installation (Recommended)

First, run the installation script to set up your environment:

```bash
./install_macos.sh
```

This ensures all dependencies are properly installed. Then build the app:

```bash
./build_macos_app.sh
```

### Option 2: Direct Build

If you already have dependencies installed, use the build script directly:

```bash
./build_macos_app.sh
```

This will:
1. Create a Python virtual environment (if needed)
2. Install all dependencies including py2app
3. Build the macOS app bundle
4. Output the app to `dist/vanta_vuln_gui.app`

## Step-by-Step Manual Build

If you prefer to build manually or need to customize the process:

### 1. Install Dependencies

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. (Optional) Create App Icon

If you want a custom icon for your app:

1. Create a 1024x1024 PNG icon
2. Convert it to .icns format (see `create_icon.md` for detailed instructions)
3. Save as `app_icon.icns` in the project root

The build will automatically include the icon if `app_icon.icns` exists.

### 3. Build the App

```bash
# Clean previous builds
rm -rf build dist

# Build the app
python3 setup.py py2app
```

### 4. Test the App

```bash
# Run the app
open dist/vanta_vuln_gui.app
```

## Installing the App

### For Personal Use

Copy the app to your Applications folder:

```bash
cp -r dist/vanta_vuln_gui.app /Applications/
```

### For Distribution

Create a DMG installer:

```bash
./create_dmg.sh
```

This creates `VantaVulnStats-1.0.0.dmg` that users can:
1. Download and open
2. Drag the app to their Applications folder

## Configuration

### App Bundle Settings

The app bundle configuration is defined in `setup.py`. Key settings:

- **Bundle Name**: Vanta Vuln Stats
- **Bundle ID**: com.vanta.vuln-stats
- **Version**: 1.0.0
- **Minimum macOS**: 10.13 (High Sierra)

### Customization

To customize the app, edit `setup.py`:

```python
'plist': {
    'CFBundleName': 'Your App Name',
    'CFBundleDisplayName': 'Your Display Name',
    'CFBundleIdentifier': 'com.yourcompany.yourapp',
    'CFBundleVersion': '1.0.0',
    # ... other settings
}
```

## Included Files

The app bundle includes:

- `vanta_vuln_gui.py` - Main GUI application
- `vanta_vuln_stats.py` - Core statistics module
- `VANTA_API_CREDENTIALS.env` - Credentials template
- `README.md` - Documentation
- `requirements.txt` - Python dependencies

## Troubleshooting

### Build Fails with "No module named 'PySide6'"

Make sure you've installed dependencies:
```bash
pip install -r requirements.txt
```

If the dependency installation fails with messages about unsupported Python
versions, ensure you are using Python 3.12 or 3.13. PySide6 does not yet ship
prebuilt wheels for Python 3.14, so installing with a newer interpreter will
fail. Install an older Python (for example via `brew install python@3.12`) and
rerun the build.

### App Won't Open: "App is damaged"

This happens on macOS Catalina+ when the app isn't signed. To bypass for testing:
```bash
xattr -cr dist/vanta_vuln_gui.app
```

For distribution, you'll need to sign the app with an Apple Developer certificate.

### Missing Icon

If you see a generic Python icon:
- The `app_icon.icns` file wasn't found during build
- Follow instructions in `create_icon.md` to create one
- Rebuild the app

### Import Errors at Runtime

If the app crashes with import errors:
1. Check that all required packages are listed in `setup.py` under `'packages'` or `'includes'`
2. Verify the package is installed in your virtual environment
3. Rebuild the app

### App Bundle Size is Large

The app includes Python and all dependencies (~100-200 MB). To reduce size:
1. Remove unused packages from `requirements.txt`
2. Add more packages to `'excludes'` in `setup.py`
3. Use `'semi_standalone': True` for smaller size (requires Python on target system)

## Code Signing (Optional)

For distribution outside of personal use, sign your app:

### 1. Get Developer Certificate

Sign up for the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).

### 2. Sign the App

```bash
codesign --deep --force --verify --verbose \
    --sign "Developer ID Application: Your Name (TEAM_ID)" \
    dist/vanta_vuln_gui.app
```

### 3. Notarize (macOS 10.15+)

```bash
# Create a zip for notarization
ditto -c -k --keepParent dist/vanta_vuln_gui.app vanta_vuln_gui.zip

# Submit for notarization
xcrun notarytool submit vanta_vuln_gui.zip \
    --apple-id "your@email.com" \
    --team-id "TEAM_ID" \
    --wait

# Staple the notarization ticket
xcrun stapler staple dist/vanta_vuln_gui.app
```

## Building on Non-macOS Systems

You can prepare the build on Linux/Windows, but the final build must be done on macOS:

1. Run the build script on your current system (it will warn but continue)
2. Copy the entire project to a macOS system
3. Run `./build_macos_app.sh` on macOS

## Directory Structure

After building, you'll have:

```
vanta-vuln-stats/
├── build/                      # Temporary build files (can be deleted)
├── dist/
│   └── vanta_vuln_gui.app     # Your macOS app bundle
├── venv/                       # Virtual environment (for building)
├── setup.py                    # py2app configuration
├── build_macos_app.sh          # Build script
├── create_dmg.sh               # DMG creation script
└── ... (source files)
```

## Next Steps

After building:

1. **Test thoroughly**: Open the app and test all functionality
2. **Check credentials**: Ensure `VANTA_API_CREDENTIALS.env` is properly configured
3. **Test on clean macOS**: Verify the app works on a Mac without Python installed
4. **Create DMG**: Use `create_dmg.sh` for easy distribution
5. **Sign & notarize**: Required for distribution outside personal use

## Advanced Configuration

### Multiple Apps

To build both GUI and CLI as separate apps, modify `setup.py`:

```python
APP = ['vanta_vuln_gui.py']  # GUI app
# Also could add CLI wrapper if needed
```

### Custom Launch Options

Create a wrapper script that sets environment variables or custom paths before launching the Python app.

### Database Location

By default, the app looks for the database in the same directory as the app. To change this, modify the default path in `vanta_vuln_gui.py`.

## Resources

- [py2app Documentation](https://py2app.readthedocs.io/)
- [Apple App Distribution Guide](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [macOS Code Signing Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)

## Getting Help

If you encounter issues:

1. Check the error messages in the build output
2. Review `setup.py` configuration
3. Verify all dependencies are installed
4. Check Python version compatibility (3.8+)
5. Try rebuilding in a fresh virtual environment
