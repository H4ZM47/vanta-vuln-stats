# Creating an App Icon

To create a custom icon for the macOS app, follow these steps:

## Option 1: Using iconutil (macOS only)

1. Create a folder structure with different icon sizes:
   ```
   VantaVulnStats.iconset/
   ├── icon_16x16.png
   ├── icon_16x16@2x.png
   ├── icon_32x32.png
   ├── icon_32x32@2x.png
   ├── icon_128x128.png
   ├── icon_128x128@2x.png
   ├── icon_256x256.png
   ├── icon_256x256@2x.png
   ├── icon_512x512.png
   └── icon_512x512@2x.png
   ```

2. Convert to .icns:
   ```bash
   iconutil -c icns VantaVulnStats.iconset -o app_icon.icns
   ```

## Option 2: Using Online Tools

1. Create or find a 1024x1024 PNG icon
2. Use an online converter like:
   - https://cloudconvert.com/png-to-icns
   - https://iconverticons.com/online/

3. Save the result as `app_icon.icns` in the project root

## Option 3: Use Default Icon

If you don't create a custom icon, comment out the `'iconfile'` line in `setup.py`:
```python
# 'iconfile': 'app_icon.icns',  # Optional: add your icon file
```

The app will use the default Python application icon.
