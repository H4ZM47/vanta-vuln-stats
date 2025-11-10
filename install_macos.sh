#!/bin/bash
#
# Vanta Vulnerability Statistics - macOS Installation Script
#
# This script sets up the complete environment for running the Vanta
# Vulnerability Statistics utility on macOS, including both CLI and GUI modes.
#
# Usage: ./install_macos.sh
#

set -e  # Exit immediately on error

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "================================================================"
    echo "$1"
    echo "================================================================"
    echo ""
}

# Start installation
print_header "Vanta Vulnerability Statistics - Installation Script"

print_info "This script will set up the complete environment for the Vanta"
print_info "Vulnerability Statistics utility, including:"
print_info "  - Python virtual environment"
print_info "  - All required dependencies"
print_info "  - Credentials template"
print_info "  - Installation verification"
echo ""

# Check if running on macOS
print_info "Checking operating system..."
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This installation script is designed for macOS."
    print_error "You are running: $OSTYPE"
    print_error ""
    print_error "For other operating systems, please install manually:"
    print_error "  1. Create virtual environment: python3 -m venv venv"
    print_error "  2. Activate it: source venv/bin/activate"
    print_error "  3. Install dependencies: pip install -r requirements.txt -r requirements-gui.txt"
    exit 1
fi
print_success "Running on macOS"

# Check if Xcode Command Line Tools are installed
print_info "Checking for Xcode Command Line Tools..."
if ! xcode-select -p &> /dev/null; then
    print_warning "Xcode Command Line Tools not found"
    print_info "Installing Xcode Command Line Tools..."
    print_info "Please follow the prompts to complete the installation"
    xcode-select --install
    print_info "After installation completes, please run this script again"
    exit 0
fi
print_success "Xcode Command Line Tools installed"

# Check for Python 3
print_info "Checking for Python 3..."
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed"
    print_error ""
    print_error "Please install Python 3 using one of these methods:"
    print_error "  1. Homebrew (recommended): brew install python@3.13"
    print_error "  2. Official installer: https://www.python.org/downloads/"
    print_error ""
    exit 1
fi

# Get Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
print_success "Found Python $PYTHON_VERSION"

# Check Python version compatibility
print_info "Verifying Python version compatibility..."
if [ "$PYTHON_MAJOR" -ne 3 ]; then
    print_error "Python 3.x is required (found Python $PYTHON_VERSION)"
    exit 1
fi

# Warn if Python 3.14+ is detected (PySide6 compatibility issue)
if [ "$PYTHON_MINOR" -ge 14 ]; then
    print_error "Python $PYTHON_VERSION is not supported for the GUI components"
    print_error ""
    print_error "PySide6 (required for the GUI) does not yet support Python 3.14+"
    print_error "Please install Python 3.12 or 3.13 and run this script again"
    print_error ""
    print_error "Recommended installation using Homebrew:"
    print_error "  brew install python@3.13"
    print_error "  /opt/homebrew/bin/python3.13 -m venv venv"
    print_error "  source venv/bin/activate"
    print_error "  ./install_macos.sh"
    print_error ""
    exit 1
fi

# Warn if Python version is too old
if [ "$PYTHON_MINOR" -lt 8 ]; then
    print_warning "Python 3.8+ is recommended (you have $PYTHON_VERSION)"
    print_warning "The installation may fail with older Python versions"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Installation cancelled"
        exit 0
    fi
fi

print_success "Python version $PYTHON_VERSION is compatible"

# Check for pip
print_info "Checking for pip..."
if ! python3 -m pip --version &> /dev/null; then
    print_error "pip is not available"
    print_error "Please install pip: python3 -m ensurepip --upgrade"
    exit 1
fi
print_success "pip is available"

# Create virtual environment
print_info "Creating virtual environment..."
if [ -d "venv" ]; then
    print_warning "Virtual environment already exists at ./venv"
    read -p "Remove and recreate? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Removing existing virtual environment..."
        rm -rf venv
        print_info "Creating new virtual environment..."
        python3 -m venv venv
        print_success "Virtual environment created"
    else
        print_info "Using existing virtual environment"
    fi
else
    python3 -m venv venv
    print_success "Virtual environment created at ./venv"
fi

# Activate virtual environment
print_info "Activating virtual environment..."
source venv/bin/activate
print_success "Virtual environment activated"

# Upgrade pip
print_info "Upgrading pip..."
python -m pip install --upgrade pip --quiet
print_success "pip upgraded to $(pip --version | awk '{print $2}')"

# Install core dependencies
print_header "Installing Dependencies"

print_info "Installing core dependencies (requests)..."
pip install --upgrade requests --quiet
print_success "Core dependencies installed"

print_info "Installing GUI dependencies (PySide6, matplotlib, etc.)..."
print_info "This may take a few minutes..."
pip install --upgrade -r requirements.txt --quiet
print_success "GUI dependencies installed"

print_info "Installing additional GUI requirements..."
pip install --upgrade -r requirements-gui.txt --quiet
print_success "Additional GUI requirements installed"

print_info "Installing build tools (py2app)..."
pip install --upgrade py2app --quiet
print_success "Build tools installed"

# Create credentials template if it doesn't exist
print_header "Setting Up Credentials"

CREDS_FILE="VANTA_API_CREDENTIALS.env"
if [ ! -f "$CREDS_FILE" ]; then
    print_info "Creating credentials template..."
    cat > "$CREDS_FILE" << 'EOF'
{
  "client_id": "your_client_id_here",
  "client_secret": "your_client_secret_here"
}
EOF
    print_success "Credentials template created: $CREDS_FILE"
    print_warning "Please edit $CREDS_FILE with your Vanta API credentials"
else
    print_success "Credentials file already exists: $CREDS_FILE"
fi

# Verify installation
print_header "Verifying Installation"

print_info "Testing Python imports..."

# Create a temporary test script
cat > /tmp/vanta_install_test.py << 'EOF'
#!/usr/bin/env python3
import sys

def test_import(module_name, display_name=None):
    if display_name is None:
        display_name = module_name
    try:
        __import__(module_name)
        print(f"✓ {display_name}")
        return True
    except ImportError as e:
        print(f"✗ {display_name}: {e}")
        return False

print("Testing required modules:")
success = True
success &= test_import("requests", "requests (HTTP client)")
success &= test_import("PySide6", "PySide6 (Qt framework)")
success &= test_import("matplotlib", "matplotlib (plotting)")
success &= test_import("sqlite3", "sqlite3 (database)")

print("\nTesting optional modules:")
test_import("pyqtgraph", "pyqtgraph (real-time plotting)")
test_import("keyring", "keyring (credential storage)")
test_import("openpyxl", "openpyxl (Excel export)")
test_import("reportlab", "reportlab (PDF reports)")
test_import("py2app", "py2app (macOS app builder)")

sys.exit(0 if success else 1)
EOF

if python /tmp/vanta_install_test.py; then
    print_success "All required modules imported successfully"
else
    print_error "Some required modules failed to import"
    print_error "Please check the error messages above"
    rm /tmp/vanta_install_test.py
    exit 1
fi

rm /tmp/vanta_install_test.py

# Test that the CLI script runs
print_info "Testing CLI script..."
if python vanta_vuln_stats.py --help &> /dev/null; then
    print_success "CLI script is working"
else
    print_warning "CLI script test failed (this might be OK if credentials aren't set up)"
fi

# Test that the GUI script imports
print_info "Testing GUI script..."
if python -c "import vanta_vuln_gui" &> /dev/null; then
    print_success "GUI script imports successfully"
else
    print_warning "GUI script import failed"
fi

# Installation complete
print_header "Installation Complete!"

print_success "The Vanta Vulnerability Statistics utility is now installed"
echo ""
print_info "Next Steps:"
echo ""
echo "  1. Configure your API credentials:"
echo "     Edit $CREDS_FILE with your Vanta API credentials"
echo ""
echo "  2. Activate the virtual environment (in new terminal sessions):"
echo "     ${GREEN}source venv/bin/activate${NC}"
echo ""
echo "  3. Run the CLI tool:"
echo "     ${GREEN}python vanta_vuln_stats.py --sync${NC}"
echo ""
echo "  4. Or run the GUI:"
echo "     ${GREEN}python vanta_vuln_gui.py${NC}"
echo ""
echo "  5. Or use the main entry point:"
echo "     ${GREEN}python main.py${NC}              # CLI mode"
echo "     ${GREEN}python main.py --gui${NC}        # GUI mode"
echo ""
echo "  6. (Optional) Build a standalone macOS app:"
echo "     ${GREEN}./build_macos_app.sh${NC}"
echo ""

print_info "For more information, see:"
print_info "  - README.md (usage guide)"
print_info "  - MACOS_APP_BUILD.md (app bundle creation)"
echo ""

print_success "Happy vulnerability tracking!"
echo ""
