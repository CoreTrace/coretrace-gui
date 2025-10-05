// Emoji test utility for cross-platform rendering
const os = require('os');

/**
 * Test emoji rendering and font availability
 */
function testEmojiSupport() {
  const platform = os.platform();
  const testEmojis = ['📁', '📄', '🔄', '🔍', '⚙️', '💾', '🎨', '🐍', '☕', '🦀'];
  
  console.log(`Testing emoji support on ${platform}:`);
  console.log('Test emojis:', testEmojis.join(' '));
  
  // Test if system has color emoji support
  const emojiTestDiv = document.createElement('div');
  emojiTestDiv.style.fontFamily = 'Noto Color Emoji, Segoe UI Emoji, Apple Color Emoji';
  emojiTestDiv.textContent = '📁';
  document.body.appendChild(emojiTestDiv);
  
  // Check computed style
  const computedStyle = window.getComputedStyle(emojiTestDiv);
  console.log('Font family resolved to:', computedStyle.fontFamily);
  
  document.body.removeChild(emojiTestDiv);
  
  return {
    platform: platform,
    supportedEmojis: testEmojis,
    fontFamily: computedStyle.fontFamily
  };
}

// Export for use in development
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testEmojiSupport };
}

// Auto-run in browser environment
if (typeof window !== 'undefined') {
  window.testEmojiSupport = testEmojiSupport;
}