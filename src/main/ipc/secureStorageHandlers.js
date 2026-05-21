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

  // ── Conversation history persistence ──────────────────────────────────────

  function getConversationsDir() {
    return path.join(app.getPath('userData'), 'assistant-conversations');
  }

  /**
   * Save (create or overwrite) a conversation.
   * Data: { id, title, history, createdAt }
   */
  ipcMain.handle('assistant-conversations-save', async (_event, data) => {
    try {
      const dir = getConversationsDir();
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${data.id}.json`);
      await fs.writeFile(filePath, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
      return { success: true };
    } catch (error) {
      console.error('[SecureStorage] Error saving conversation:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * List all saved conversations, sorted newest first.
   * Returns: { success, conversations: [{ id, title, createdAt, updatedAt }] }
   */
  ipcMain.handle('assistant-conversations-list', async () => {
    try {
      const dir = getConversationsDir();
      let files;
      try {
        files = await fs.readdir(dir);
      } catch (e) {
        if (e.code === 'ENOENT') return { success: true, conversations: [] };
        throw e;
      }
      const conversations = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(dir, f), 'utf8');
          const { id, title, createdAt, updatedAt } = JSON.parse(raw);
          conversations.push({ id, title, createdAt, updatedAt });
        } catch (_) { /* skip corrupt files */ }
      }
      conversations.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      return { success: true, conversations };
    } catch (error) {
      console.error('[SecureStorage] Error listing conversations:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Load a single saved conversation by id.
   * Returns: { success, conversation: { id, title, history, createdAt, updatedAt } }
   */
  ipcMain.handle('assistant-conversations-load', async (_event, id) => {
    try {
      const filePath = path.join(getConversationsDir(), `${id}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      return { success: true, conversation: JSON.parse(raw) };
    } catch (error) {
      console.error('[SecureStorage] Error loading conversation:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Delete a saved conversation by id.
   */
  ipcMain.handle('assistant-conversations-delete', async (_event, id) => {
    try {
      await fs.unlink(path.join(getConversationsDir(), `${id}.json`));
      return { success: true };
    } catch (error) {
      if (error.code === 'ENOENT') return { success: true };
      console.error('[SecureStorage] Error deleting conversation:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupSecureStorageHandlers };
