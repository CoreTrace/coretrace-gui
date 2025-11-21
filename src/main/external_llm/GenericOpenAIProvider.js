/**
 * @fileoverview Generic OpenAI-Compatible Provider
 * 
 * A flexible provider for any LLM service that implements the OpenAI chat completions API.
 * This includes services like:
 * - Together AI
 * - Groq
 * - Perplexity
 * - Local deployments (LM Studio, Ollama with OpenAI compatibility)
 * - Azure OpenAI
 * - And many others
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const https = require('https');
const http = require('http');
const BaseProvider = require('./BaseProvider');

/**
 * Generic OpenAI-Compatible Provider
 * @extends BaseProvider
 */
class GenericOpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint;
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.name = config.name || 'Custom Provider';
  }

  getName() {
    return this.name;
  }

  getConfigFields() {
    return [
      {
        name: 'name',
        label: 'Provider Name',
        type: 'text',
        required: true,
        placeholder: 'My Custom LLM',
        help: 'A friendly name for this provider'
      },
      {
        name: 'endpoint',
        label: 'API Endpoint',
        type: 'text',
        required: true,
        placeholder: 'https://api.example.com/v1/chat/completions',
        help: 'Full URL to the chat completions endpoint'
      },
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: false,
        placeholder: 'Optional API key',
        help: 'API key if required by the service (leave blank for local/public endpoints)'
      },
      {
        name: 'model',
        label: 'Model Name',
        type: 'text',
        required: true,
        placeholder: 'gpt-3.5-turbo',
        help: 'Model identifier (e.g., "mistralai/Mixtral-8x7B-Instruct-v0.1" for Together AI)'
      }
    ];
  }

  async chat(message, options = {}) {
    if (!this.endpoint) {
      return { success: false, error: 'API endpoint is required' };
    }

    if (!this.model) {
      return { success: false, error: 'Model name is required' };
    }

    const messages = [];
    
    // Add system prompt
    const systemPrompt = options.systemPrompt || 'You are a helpful coding assistant.';
    messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: message });

    const body = JSON.stringify({
      model: this.model,
      messages: messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: options.maxTokens || 2000
    });

    return new Promise((resolve) => {
      const url = new URL(this.endpoint);
      const isHttps = url.protocol === 'https:';
      const protocol = isHttps ? https : http;
      
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 60000
      };

      // Add authorization header if API key is provided
      if (this.apiKey) {
        requestOptions.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const req = protocol.request(requestOptions, (res) => {
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
}

module.exports = GenericOpenAIProvider;
