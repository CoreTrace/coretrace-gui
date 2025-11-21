/**
 * @fileoverview Deepseek API Provider
 * 
 * Implements Deepseek's chat completions API.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const https = require('https');
const BaseProvider = require('./BaseProvider');

/**
 * Deepseek API Provider
 * @extends BaseProvider
 */
class DeepseekProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'https://api.deepseek.com/v1/chat/completions';
    this.model = config.model || 'deepseek-chat';
    this.apiKey = config.apiKey;
  }

  getName() {
    return 'Deepseek';
  }

  getConfigFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-...',
        help: 'Get your API key from https://platform.deepseek.com/api-keys'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        default: 'deepseek-chat',
        options: [
          { value: 'deepseek-chat', label: 'Deepseek Chat' },
          { value: 'deepseek-coder', label: 'Deepseek Coder' }
        ],
        help: 'Choose the Deepseek model to use'
      },
      {
        name: 'endpoint',
        label: 'API Endpoint (Advanced)',
        type: 'text',
        required: false,
        default: 'https://api.deepseek.com/v1/chat/completions',
        placeholder: 'https://api.deepseek.com/v1/chat/completions',
        help: 'Custom endpoint URL'
      }
    ];
  }

  async chat(message, options = {}) {
    if (!this.apiKey) {
      return { success: false, error: 'API key is required' };
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
      const requestOptions = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
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

module.exports = DeepseekProvider;
