# Emoji Font Support for Linux AppImage

To ensure proper emoji rendering in Linux AppImage builds, this application includes several strategies:

## 1. Web Font Fallbacks
The application loads Google Fonts' Noto Color Emoji as a fallback:
- Primary: System emoji fonts (Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji)
- Fallback: Web-loaded Noto Color Emoji from Google Fonts

## 2. Font Stack
The CSS font stack includes multiple emoji font options:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji', 'Twemoji Mozilla';
```

## 3. Runtime Dependencies
For system-wide emoji support on Linux, users may need to install:

### Ubuntu/Debian:
```bash
sudo apt-get install fonts-noto-color-emoji
```

### Fedora/RHEL:
```bash
sudo dnf install google-noto-emoji-color-fonts
```

### Arch Linux:
```bash
sudo pacman -S noto-fonts-emoji
```

## 4. AppImage Bundle (Optional)
For complete self-contained distribution, consider bundling emoji fonts in the AppImage:

1. Download Noto Color Emoji font files
2. Place them in `assets/fonts/` directory
3. Update Electron Builder configuration to include fonts
4. Load fonts locally in CSS

## Implementation Notes
- The application uses web font loading as primary fallback
- System fonts are preferred when available
- Font loading is non-blocking to ensure app startup performance
- Cross-platform emoji rendering is normalized through CSS font stacks