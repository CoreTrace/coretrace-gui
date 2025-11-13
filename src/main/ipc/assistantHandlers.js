/**
 * @fileoverview IPC handlers for AI assistant (Ollama, External API, Local GGUF)
 * 
 * This module provides IPC handlers for chatting with various LLM providers.
 * Note: Local GGUF models are handled directly in the renderer via window.electronAi
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const { ipcMain } = require('electron');
const https = require('https');
const http = require('http');

// Local GGUF state
let localLLM = null;
let loadedModelPath = null;
let loadedGpuLayers = null;

/**
 * Setup IPC handlers for assistant chat
 * @param {BrowserWindow} mainWindow - Main window reference
 */
function setupAssistantHandlers(mainWindow) {
  /**
   * Handle assistant chat request
   * Input: { provider, message, config }
   * config contains: ollamaHost, apiKey, externalProvider, localModelPath
   */
  ipcMain.handle('assistant-chat', async (event, { provider, message, config }) => {
    try {
      if (provider === 'ollama') {
        return await handleOllamaChat(message, config);
      } else if (provider === 'external') {
        return await handleExternalChat(message, config);
      } else if (provider === 'local') {
        return await handleLocalChat(message, config);
      } else {
        return {
          success: false,
          error: 'Unknown provider or assistant not configured'
        };
      }
    } catch (error) {
      console.error('Error in assistant-chat handler:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  });

  /**
   * Unload local model when requested
   */
  ipcMain.handle('assistant-unload-local', async () => {
    try {
      if (localLLM) {
        if (localLLM.context) await localLLM.context.dispose();
        if (localLLM.model) await localLLM.model.dispose();
        localLLM = null;
        loadedModelPath = null;
        loadedGpuLayers = null;
        return { success: true };
      }
      return { success: true };
    } catch (error) {
      console.error('Error unloading local model:', error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Handle Ollama chat request
 * @param {string} message - User message
 * @param {Object} config - Config with ollamaHost
 * @returns {Promise<Object>}
 */
async function handleOllamaChat(message, config) {
  const host = config.ollamaHost || 'http://localhost:11434';
  const url = new URL('/api/chat', host);
  
  const messages = [];
  
  // Add system prompt if provided
  if (config.systemPrompt) {
    messages.push({ role: 'system', content: config.systemPrompt });
  }
  
  messages.push({ role: 'user', content: message });
  
  const body = JSON.stringify({
    model: 'llama2', // default model, can be made configurable
    messages: messages,
    stream: false
  });

  return new Promise((resolve) => {
    const protocol = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.message && parsed.message.content) {
            resolve({ success: true, reply: parsed.message.content });
          } else {
            resolve({ success: false, error: 'Invalid response from Ollama' });
          }
        } catch (err) {
          resolve({ success: false, error: 'Failed to parse Ollama response: ' + err.message });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: 'Ollama request failed: ' + err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Ollama request timed out' });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Handle external API chat (OpenAI-compatible, Deepseek, etc.)
 * @param {string} message - User message
 * @param {Object} config - Config with apiKey, externalProvider
 * @returns {Promise<Object>}
 */
async function handleExternalChat(message, config) {
  const provider = config.externalProvider || 'ChatGPT5';
  const apiKey = config.apiKey;

  if (!apiKey) {
    return { success: false, error: 'API key is required for external providers' };
  }

  // Map provider to endpoint
  let endpoint = 'https://api.openai.com/v1/chat/completions';
  let model = 'gpt-4';

  if (provider === 'Deepseek') {
    endpoint = 'https://api.deepseek.com/v1/chat/completions';
    model = 'deepseek-chat';
  } else if (provider === 'ChatGPT5') {
    endpoint = 'https://api.openai.com/v1/chat/completions';
    model = 'gpt-4';
  }
  // 'Other' uses OpenAI endpoint by default

  const messages = [];
  
  // Add system prompt (use custom if provided, otherwise default)
  const systemPrompt = config.systemPrompt || 'You are a helpful coding assistant.';
  messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: message });

  const body = JSON.stringify({
    model: model,
    messages: messages,
    temperature: 0.7
  });

  return new Promise((resolve) => {
    const url = new URL(endpoint);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve({ success: true, reply: parsed.choices[0].message.content });
          } else if (parsed.error) {
            resolve({ success: false, error: parsed.error.message || 'API error' });
          } else {
            resolve({ success: false, error: 'Invalid API response' });
          }
        } catch (err) {
          resolve({ success: false, error: 'Failed to parse API response: ' + err.message });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: 'API request failed: ' + err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'API request timed out' });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Handle local GGUF model chat using node-llama-cpp
 * @param {string} message - User message
 * @param {Object} config - Config with localModelPath and gpuLayers
 * @returns {Promise<Object>}
 */
async function handleLocalChat(message, config) {
  const modelPath = config.localModelPath;

  if (!modelPath) {
    return { success: false, error: 'Local model path is required' };
  }

  try {
    // Dynamic import of node-llama-cpp (ESM module)
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

    // Get GPU layers setting (default to 0 if not specified)
    const gpuLayers = config.gpuLayers !== undefined && config.gpuLayers !== null ? config.gpuLayers : 0;
    
    // Get context size setting (default to 8192 if not specified)
    const contextSize = config.contextSize !== undefined && config.contextSize !== null ? config.contextSize : 8192;

    // Load model if not loaded, if path changed, OR if GPU layers setting changed
    if (!localLLM || loadedModelPath !== modelPath || loadedGpuLayers !== gpuLayers) {
      console.log('Loading local GGUF model from:', modelPath);
      
      // Dispose old instance if any
      if (localLLM) {
        console.log('Disposing previous model instance...');
        try {
          if (localLLM.context) await localLLM.context.dispose();
          if (localLLM.model) await localLLM.model.dispose();
        } catch (disposeErr) {
          console.warn('Error during disposal:', disposeErr);
        }
        localLLM = null;
      }

      // Initialize llama
      const llama = await getLlama({
        // Enable verbose logging to see GPU initialization
        logLevel: 'debug'
      });
      
      console.log('=== GPU Detection ===');
      console.log('Attempting to load model with GPU layers:', gpuLayers);
      
      if (gpuLayers === -1) {
        console.log('Mode: Offloading ALL layers to GPU');
      } else if (gpuLayers === 0) {
        console.log('Mode: CPU only (no GPU acceleration)');
      } else {
        console.log(`Mode: Offloading ${gpuLayers} layers to GPU`);
      }
      
      console.log('Note: Watch for [node-llama-cpp] logs below for GPU/Vulkan device info');
      console.log('=====================');
      
      // Load the model with GPU configuration
      // The underlying llama.cpp will log GPU information like:
      // "ggml_vulkan: Using Vulkan1 (NVIDIA GeForce RTX 4070) | vulkan"
      const model = await llama.loadModel({
        modelPath: modelPath,
        gpuLayers: gpuLayers, // 0 = CPU only, -1 = all layers, or specific number
        // Try to enable verbose output
        onLoadProgress: (progress) => {
          console.log(`Loading model: ${(progress * 100).toFixed(1)}%`);
        }
      });
      
      console.log('✓ Model loaded');
      console.log('  GPU layers used:', gpuLayers === -1 ? 'All layers' : gpuLayers);
      console.log('  Model size:', model.size, 'parameters');
      console.log('  Model default context:', model.trainContextSize, 'tokens');
      console.log('  Using context size:', contextSize, 'tokens (saves VRAM)');

      // Create context with custom size to reduce VRAM usage
      const context = await model.createContext({
        contextSize: contextSize // Use configured context size instead of model default (40960)
      });
      
      // Create chat session
      const session = new LlamaChatSession({
        contextSequence: context.getSequence()
      });

      localLLM = { model, context, session };
      loadedModelPath = modelPath;
      loadedGpuLayers = gpuLayers;
      console.log('✓ Model ready for inference');
      console.log('=====================');
    } else {
      console.log('Using cached model (same path and GPU layers)');
    }

    // Generate response
    console.log('Generating response for:', message);
    
    // Prepend system prompt to the message if provided
    let fullMessage = message;
    if (config.systemPrompt) {
      fullMessage = `System: ${config.systemPrompt}\n\nUser: ${message}`;
    }
    
    const response = await localLLM.session.prompt(fullMessage);
    
    return {
      success: true,
      reply: response || '(no response)'
    };
  } catch (error) {
    console.error('Error with local GGUF model:', error);
    console.error('Error stack:', error.stack);
    
    // Clean up on error
    if (localLLM) {
      try {
        await localLLM.context?.dispose();
        await localLLM.model?.dispose();
      } catch (disposeError) {
        console.error('Error disposing model:', disposeError);
      }
    }
    localLLM = null;
    loadedModelPath = null;
    loadedGpuLayers = null;

    return {
      success: false,
      error: 'Local model error: ' + error.message
    };
  }
}

module.exports = { setupAssistantHandlers };
