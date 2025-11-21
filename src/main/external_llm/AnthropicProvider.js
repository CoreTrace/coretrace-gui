/**
 * @fileoverview Anthropic API Provider (Claude)
 * 
 * Implements Anthropic's messages API for Claude models.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const https = require('https');
const BaseProvider = require('./BaseProvider');

/**
 * Anthropic API Provider
 * @extends BaseProvider
 */
class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'https://api.anthropic.com/v1/messages';
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.apiKey = config.apiKey;
  }

  getName() {
    return 'Anthropic (Claude)';
  }

  getConfigFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-ant-...',
        help: 'Get your API key from https://console.anthropic.com/settings/keys'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        default: 'claude-3-5-sonnet-20241022',
        options: [
          { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
          { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
          { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
          { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
        ],
        help: 'Choose the Claude model to use'
      },
      {
        name: 'endpoint',
        label: 'API Endpoint (Advanced)',
        type: 'text',
        required: false,
        default: 'https://api.anthropic.com/v1/messages',
        placeholder: 'https://api.anthropic.com/v1/messages',
        help: 'Custom endpoint URL'
      }
    ];
  }

  async chat(message, options = {}) {
    if (!this.apiKey) {
      return { success: false, error: 'API key is required' };
    }

    // Anthropic uses a different format - system prompt is separate
    const systemPrompt = options.systemPrompt || 'You are a helpful coding assistant.';

    const body = JSON.stringify({
      model: this.model,
      max_tokens: options.maxTokens || 2000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message }
      ],
      temperature: options.temperature !== undefined ? options.temperature : 0.7
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
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
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
            if (parsed.content && parsed.content[0] && parsed.content[0].text) {
              resolve({ success: true, reply: parsed.content[0].text });
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

module.exports = AnthropicProvider;
