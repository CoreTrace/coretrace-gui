/**
 * @fileoverview Base class for LLM providers
 * 
 * This defines the interface that all LLM providers must implement,
 * ensuring consistent behavior across different services.
 * 
 * @author CTrace GUI Team
 * @version 1.0.0
 */

/**
 * Base class for all LLM providers
 * @abstract
 */
class BaseProvider {
  /**
   * Create a provider instance
   * @param {Object} config - Provider configuration
   */
  constructor(config) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Get provider name
   * @abstract
   * @returns {string} Provider name
   */
  getName() {
    throw new Error('getName() must be implemented by provider');
  }

  /**
   * Get required configuration fields
   * @abstract
   * @returns {Array<Object>} Array of field definitions with { name, label, type, required, placeholder, default }
   */
  getConfigFields() {
    throw new Error('getConfigFields() must be implemented by provider');
  }

  /**
   * Validate configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} { valid: boolean, errors: Array<string> }
   */
  validateConfig(config) {
    const errors = [];
    const fields = this.getConfigFields();

    for (const field of fields) {
      if (field.required && !config[field.name]) {
        errors.push(`${field.label} is required`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Send a chat message to the LLM
   * @abstract
   * @param {string} message - User message
   * @param {Object} options - Additional options (systemPrompt, temperature, etc.)
   * @returns {Promise<Object>} { success: boolean, reply?: string, error?: string }
   */
  async chat(message, options = {}) {
    throw new Error('chat() must be implemented by provider');
  }

  /**
   * Test provider connection
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  async testConnection() {
    try {
      const result = await this.chat('Hello', { temperature: 0.1 });
      return {
        success: result.success,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = BaseProvider;
