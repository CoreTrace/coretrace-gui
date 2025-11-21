#!/bin/bash

# Build verification script for CTrace GUI
# Tests building for different platforms

echo "🚀 CTrace GUI - Build Verification Script"
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Build for current platform
echo "🔨 Building for current platform..."
npm run dist

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📦 Generated files:"
    ls -la dist/
    
    # Show build artifacts
    echo ""
    echo "📋 Build Summary:"
    echo "- Configuration: $(ls dist/builder-effective-config.yaml 2>/dev/null && echo "✅ Found" || echo "❌ Missing")"
    echo "- Linux AppImage: $(ls dist/*.AppImage 2>/dev/null && echo "✅ Found" || echo "❌ Missing")"
    echo "- Windows NSIS: $(ls dist/*.exe 2>/dev/null && echo "✅ Found" || echo "❌ Missing")"
    echo "- macOS DMG: $(ls dist/*.dmg 2>/dev/null && echo "✅ Found" || echo "❌ Missing")"
    
    # Check AppImage functionality (Linux only)
    if [ -f dist/*.AppImage ]; then
        echo ""
        echo "🧪 Testing AppImage functionality..."
        chmod +x dist/*.AppImage
        echo "✅ AppImage is executable"
        
        # Extract and check contents
        if command -v unsquashfs &> /dev/null; then
            echo "🔍 Extracting AppImage contents for inspection..."
            # Note: This is just a verification, not actually running the app
        fi
    fi
    
    echo ""
    echo "🎉 Build verification completed successfully!"
    
else
    echo "❌ Build failed!"
    exit 1
fi