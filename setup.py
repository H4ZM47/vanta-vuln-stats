#!/usr/bin/env python3
"""
Setup script for building macOS app bundle using py2app.
"""

import os
from setuptools import setup

APP = ['vanta_vuln_gui.py']
DATA_FILES = [
    ('', ['VANTA_API_CREDENTIALS.env', 'README.md', 'requirements.txt']),
]

# Build OPTIONS dictionary
OPTIONS = {
    'argv_emulation': False,  # Disable for PySide6
    'plist': {
        'CFBundleName': 'Vanta Vuln Stats',
        'CFBundleDisplayName': 'Vanta Vulnerability Statistics',
        'CFBundleIdentifier': 'com.vanta.vuln-stats',
        'CFBundleVersion': '1.0.0',
        'CFBundleShortVersionString': '1.0.0',
        'CFBundleInfoDictionaryVersion': '6.0',
        'NSHighResolutionCapable': True,
        'NSRequiresAquaSystemAppearance': False,
        'LSMinimumSystemVersion': '10.13.0',
        'CFBundleDocumentTypes': [
            {
                'CFBundleTypeName': 'SQLite Database',
                'CFBundleTypeRole': 'Viewer',
                'LSItemContentTypes': ['public.database'],
                'LSHandlerRank': 'Alternate',
            }
        ],
    },
    'packages': ['PySide6', 'requests', 'sqlite3', 'certifi'],
    'includes': ['vanta_vuln_stats'],
    'excludes': ['tkinter', 'matplotlib', 'numpy', 'pandas'],
    'semi_standalone': False,
    'site_packages': True,
}

# Add icon if it exists
if os.path.exists('app_icon.icns'):
    OPTIONS['iconfile'] = 'app_icon.icns'

setup(
    name='VantaVulnStats',
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
    install_requires=[
        'requests>=2.31.0',
        'PySide6>=6.7.0',
    ],
)
