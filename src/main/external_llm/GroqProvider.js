/**
 * @fileoverview Groq API Provider (Example)
 * 
 * This is an example provider showing how easy it is to add support
 * for new LLM services. Groq offers extremely fast inference.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const https = require('https');
const BaseProvider = require('./BaseProvider');

/**
 * Groq API Provider - Ultra-fast LLM inference
 * @extends BaseProvider
 */
class GroqProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = config.model || 'mixtral-8x7b-32768';
    this.apiKey = config.apiKey;
  }

  getName() {
    return 'Groq (Fast Inference)';
  }

  getConfigFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'gsk_...',
        help: 'Get your API key from https://console.groq.com/keys'
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        default: 'mixtral-8x7b-32768',
        options: [
          { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (32K context)' },
          { value: 'llama2-70b-4096', label: 'LLaMA2 70B (4K context)' },
          { value: 'gemma-7b-it', label: 'Gemma 7B (8K context)' }
        ],
        help: 'Choose the Groq model to use'
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
      const requestOptions = {
        hostname: 'api.groq.com',
        port: 443,
        path: '/openai/v1/chat/completions',
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

module.exports = GroqProvider;
