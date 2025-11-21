/**
 * @fileoverview Provider Registry
 * 
 * Central registry for all available LLM providers.
 * Handles provider registration, instantiation, and discovery.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

const OpenAIProvider = require('./OpenAIProvider');
const DeepseekProvider = require('./DeepseekProvider');
const AnthropicProvider = require('./AnthropicProvider');
const GenericOpenAIProvider = require('./GenericOpenAIProvider');
const GroqProvider = require('./GroqProvider');
const PerplexityProvider = require('./PerplexityProvider');

/**
 * Registry of available LLM providers
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.registerDefaultProviders();
  }

  /**
   * Register default built-in providers
   */
  registerDefaultProviders() {
    this.register('openai', OpenAIProvider);
    this.register('deepseek', DeepseekProvider);
    this.register('anthropic', AnthropicProvider);
    this.register('groq', GroqProvider);
    this.register('perplexity', PerplexityProvider);
    this.register('generic', GenericOpenAIProvider);
  }

  /**
   * Register a provider class
   * @param {string} id - Unique provider identifier
   * @param {Function} ProviderClass - Provider class constructor
   */
  register(id, ProviderClass) {
    this.providers.set(id, ProviderClass);
  }

  /**
   * Get all available providers
   * @returns {Array<Object>} Array of provider info { id, name, fields }
   */
  getAllProviders() {
    const providers = [];
    for (const [id, ProviderClass] of this.providers.entries()) {
      try {
        const instance = new ProviderClass({});
        providers.push({
          id: id,
          name: instance.getName(),
          fields: instance.getConfigFields()
        });
      } catch (err) {
        console.error(`Error getting info for provider ${id}:`, err);
      }
    }
    return providers;
  }

  /**
   * Create a provider instance
   * @param {string} id - Provider identifier
   * @param {Object} config - Provider configuration
   * @returns {BaseProvider} Provider instance
   */
  createProvider(id, config) {
    const ProviderClass = this.providers.get(id);
    if (!ProviderClass) {
      throw new Error(`Provider not found: ${id}`);
    }
    return new ProviderClass(config);
  }

  /**
   * Check if a provider exists
   * @param {string} id - Provider identifier
   * @returns {boolean}
   */
  hasProvider(id) {
    return this.providers.has(id);
  }
}

// Export singleton instance
module.exports = new ProviderRegistry();
