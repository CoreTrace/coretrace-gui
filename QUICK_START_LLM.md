# Quick Start: Using External LLM Providers

## 🚀 Get Started in 3 Steps

### 1. Open Assistant Settings
- Click the **Assistant** icon in the activity bar (left side)
- Click the **Settings** button in the assistant panel

### 2. Choose Your Provider
Select "External API" and pick from:

| Provider | Best For | API Key From |
|----------|----------|--------------|
| **OpenAI** | General purpose, highest quality | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Deepseek** | Coding, cost-effective | [platform.deepseek.com](https://platform.deepseek.com/api-keys) |
| **Claude** | Advanced reasoning | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Groq** | Ultra-fast responses | [console.groq.com](https://console.groq.com/keys) |
| **Perplexity** | Current info + search | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) |
| **Generic** | Any OpenAI-compatible API | Varies by service |

### 3. Enter Your API Key & Save
- Paste your API key
- Select your preferred model
- Click **Save**

## 💡 Quick Tips

### Free Tiers & Trials
- **Groq**: Free tier with generous limits
- **OpenAI**: $5 free credit for new accounts
- **Perplexity**: Limited free requests
- **Deepseek**: Very affordable pricing

### Best Models for Coding
```
OpenAI:      gpt-4 or gpt-4-turbo
Deepseek:    deepseek-coder
Claude:      claude-3-5-sonnet-20241022
Groq:        mixtral-8x7b-32768
```

### Customize Behavior
Add a system prompt like:
```
You are an expert C++ developer. 
Provide concise, secure code examples.
Always explain your reasoning.
```

### Temperature Guide
- **0.0-0.3**: Precise, deterministic (for code generation)
- **0.7**: Balanced (default, recommended)
- **1.0-2.0**: Creative (for brainstorming)

## 🔧 Using Local/Private Models

### LM Studio (Local)
```
Provider: Custom Provider
Name: LM Studio
Endpoint: http://localhost:1234/v1/chat/completions
API Key: (leave blank)
Model: (whatever you loaded in LM Studio)
```

### Together AI
```
Provider: Custom Provider  
Name: Together AI
Endpoint: https://api.together.xyz/v1/chat/completions
API Key: (your Together AI key)
Model: mistralai/Mixtral-8x7B-Instruct-v0.1
```

### Ollama (with OpenAI compatibility)
```
Provider: Custom Provider
Name: Ollama
Endpoint: http://localhost:11434/v1/chat/completions
API Key: (leave blank)
Model: llama2
```

## ❓ Common Issues

**"API key is required"**
→ Make sure you entered your API key and saved

**"Invalid API response"**  
→ Check your API key is valid and has credits
→ Verify endpoint URL is correct

**"Connection timeout"**
→ Check internet connection
→ For local models, ensure server is running

## 💰 Cost Comparison (Approximate)

| Provider | Input | Output | Notes |
|----------|-------|--------|-------|
| OpenAI GPT-4 | $30/1M | $60/1M | Highest quality |
| Claude Sonnet 3.5 | $3/1M | $15/1M | Great balance |
| Deepseek | $0.14/1M | $0.28/1M | Very affordable |
| Groq | Free tier | Free tier | Limited free usage |

*Prices in USD per million tokens (approximate, check provider websites)*

## 🎯 Feature Support

| Feature | All Providers | Notes |
|---------|---------------|-------|
| Chat | ✅ | Core functionality |
| Code context | ✅ | Select code → ask question |
| System prompts | ✅ | Customize behavior |
| Temperature | ✅ | Control creativity |
| Streaming | ❌ | Coming soon |
| Function calling | ❌ | Provider-specific |

## 🔐 Privacy & Security

✅ API keys stored locally only  
✅ No data sent to CTrace servers  
✅ Direct provider communication  
✅ You control your data  

## 📚 Learn More

- Full documentation: `EXTERNAL_LLM_PROVIDERS.md`
- Implementation details: `LLM_INTEGRATION_SUMMARY.md`
- Add your own provider: See documentation

## 🆘 Need Help?

1. Check provider documentation for API key setup
2. Verify your API key has credits/quota
3. Try the "Generic" provider for maximum flexibility
4. Open an issue on GitHub with error details

---

**Tip**: Start with Groq's free tier to test the assistant features, then upgrade to your preferred provider for production use!
