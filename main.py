#!/usr/bin/env python3
"""
Vanta Vulnerability Statistics - Main Entry Point

This is the main entry point for the Vanta Vulnerability Statistics utility.
It allows users to choose between CLI and GUI modes.
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(
        description='Vanta Vulnerability Statistics Utility',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Mode Selection:
  By default, the CLI mode is used. To launch the GUI, use --gui flag.

Examples:
  # Run in CLI mode (default)
  python main.py --sync

  # Run in GUI mode
  python main.py --gui

  # Run CLI with filters
  python main.py --severity CRITICAL HIGH

  # Show help for CLI mode
  python main.py --help
        """
    )

    parser.add_argument(
        '--gui',
        action='store_true',
        help='Launch the graphical user interface'
    )

    # Parse only known args to allow passing through to CLI or GUI
    args, remaining_args = parser.parse_known_args()

    if args.gui:
        # Launch GUI mode
        try:
            import vanta_vuln_gui
            # Remove --gui flag from sys.argv for GUI parser
            sys.argv = [sys.argv[0]] + remaining_args
            vanta_vuln_gui.main()
        except ImportError as e:
            print("Error: GUI dependencies not installed.", file=sys.stderr)
            print("Please install GUI requirements:", file=sys.stderr)
            print("  pip install -r requirements-gui.txt", file=sys.stderr)
            print(f"\nDetails: {str(e)}", file=sys.stderr)
            sys.exit(1)
    else:
        # Launch CLI mode
        import vanta_vuln_stats
        # Remove script name and pass remaining args to CLI
        sys.argv = [sys.argv[0]] + remaining_args
        vanta_vuln_stats.main()


if __name__ == '__main__':
    main()
