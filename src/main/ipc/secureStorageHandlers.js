/**
 * @fileoverview IPC handlers for secure assistant configuration storage
 *
 * Uses Electron's safeStorage API to encrypt/decrypt the API key at rest.
 * Non-sensitive fields (provider, model, systemPrompt, …) are stored as
 * plain JSON alongside an encrypted blob for the key so that only the OS
 * credential store can read it back.
 *
 * Storage location: <userData>/assistant-config.json
 *
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const { ipcMain, safeStorage, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');

/**
 * Return the path where the assistant config is persisted.
 * @returns {string}
 */
function getConfigPath() {
  return path.join(app.getPath('userData'), 'assistant-config.json');
}

/**
 * Register IPC handlers for secure config operations.
 *
 * Channels exposed:
 *  - assistant-config-save   (invoke) – persist config, encrypting the apiKey
 *  - assistant-config-load   (invoke) – load config, decrypting the apiKey
 *  - assistant-config-clear  (invoke) – delete stored config
 */
function setupSecureStorageHandlers() {
  /**
   * Persist assistant configuration.
   * If safeStorage encryption is available, the apiKey is encrypted and
   * stored as a base64 string under `_encryptedApiKey`; the plaintext
   * `apiKey` field is never written to disk.
   */
  ipcMain.handle('assistant-config-save', async (_event, config) => {
    try {
      const toStore = { ...config };

      if (toStore.apiKey) {
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(toStore.apiKey);
          toStore._encryptedApiKey = encrypted.toString('base64');
        }
        // Never persist the plaintext key regardless of encryption availability
        delete toStore.apiKey;
      }

      await fs.writeFile(getConfigPath(), JSON.stringify(toStore, null, 2), 'utf8');
      console.log('[SecureStorage] Assistant config saved');
      return { success: true };
    } catch (error) {
      console.error('[SecureStorage] Error saving config:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Load assistant configuration.
   * Decrypts `_encryptedApiKey` back into `apiKey` if present.
   */
  ipcMain.handle('assistant-config-load', async () => {
    try {
      const raw = await fs.readFile(getConfigPath(), 'utf8');
      const stored = JSON.parse(raw);

      if (stored._encryptedApiKey) {
        if (safeStorage.isEncryptionAvailable()) {
          const buf = Buffer.from(stored._encryptedApiKey, 'base64');
          stored.apiKey = safeStorage.decryptString(buf);
        }
        delete stored._encryptedApiKey;
      }

      return { success: true, config: stored };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'No config found' };
      }
      console.error('[SecureStorage] Error loading config:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete the stored assistant configuration.
   */
  ipcMain.handle('assistant-config-clear', async () => {
    try {
      await fs.unlink(getConfigPath());
      console.log('[SecureStorage] Assistant config cleared');
      return { success: true };
    } catch (error) {
      if (error.code === 'ENOENT') return { success: true };
      console.error('[SecureStorage] Error clearing config:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupSecureStorageHandlers };
