/**
 * @fileoverview Perplexity API Provider (Example)
 * 
 * Perplexity offers LLMs with real-time internet search capabilities,
 * perfect for getting up-to-date information and current best practices.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const https = require('https');
const BaseProvider = require('./BaseProvider');

/**
 * Perplexity API Provider - Search-augmented responses
 * @extends BaseProvider
 */
class PerplexityProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.endpoint = 'https://api.perplexity.ai/chat/completions';
    this.model = config.model || 'llama-3.1-sonar-small-128k-online';
    this.apiKey = config.apiKey;
  }

  getName() {
    return 'Perplexity (Search-Augmented)';
  }

  getConfigFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'pplx-...',
        help: 'Get your API key from https://www.perplexity.ai/settings/api'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        default: 'llama-3.1-sonar-small-128k-online',
        options: [
          { value: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small (Online, 128K)' },
          { value: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large (Online, 128K)' },
          { value: 'llama-3.1-sonar-huge-128k-online', label: 'Sonar Huge (Online, 128K)' },
          { value: 'llama-3.1-8b-instruct', label: 'LLaMA 3.1 8B (Offline)' },
          { value: 'llama-3.1-70b-instruct', label: 'LLaMA 3.1 70B (Offline)' }
        ],
        help: 'Online models have internet search, offline models don\'t'
      }
    ];
  }

  async chat(message, options = {}) {
    if (!this.apiKey) {
      return { success: false, error: 'API key is required' };
    }

    const messages = [];
    
    // Add system prompt
    const systemPrompt = options.systemPrompt || 'You are a helpful coding assistant with access to current information.';
    messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: message });

    const body = JSON.stringify({
      model: this.model,
      messages: messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: options.maxTokens || 2000
    });

    return new Promise((resolve) => {
      const requestOptions = {
        hostname: 'api.perplexity.ai',
        port: 443,
        path: '/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 60000
      };

      const req = https.request(requestOptions, (res) => {
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

module.exports = PerplexityProvider;
