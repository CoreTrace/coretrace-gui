class AssistantPanel {
  constructor(ui) {
    this.ui = ui;
  }

/**
   * Tools panel management
   */
  showToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      toolsPanel.style.display = 'flex';
      toolsPanel.offsetHeight; // Force reflow
      toolsPanel.classList.add('active');
    }
  }

  hideToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      toolsPanel.classList.remove('active');
      setTimeout(() => {
        toolsPanel.style.display = 'none';
      }, 200);
    }
  }

  toggleToolsPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (toolsPanel) {
      if (toolsPanel.style.display === 'none' || !toolsPanel.classList.contains('active')) {
        this.ui.showToolsPanel();
      } else {
        this.ui.hideToolsPanel();
      }
    }
  }

  openAssistantPanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    
    // If already in assistant mode and panel is visible, hide it
    if (this.ui._toolsPanelMode === 'assistant' && toolsPanel && toolsPanel.classList.contains('active')) {
      this.ui.hideToolsPanel();
      return;
    }
    
    // Ensure assistant is configured at least once before opening
    const ensure = this.ui.ensureAssistantConfigured();
    Promise.resolve(ensure).then(() => {
      if (toolsPanel) {
        // Mark that we're in assistant mode
        this.ui._toolsPanelMode = 'assistant';
        this.ui.showToolsPanel();
        // Inject assistant chat UI into tools panel
        this.ui.renderAssistantUI();
      }
    });
  }

/**
   * Open CTrace Tools panel with original content
   */
  openCtracePanel() {
    const toolsPanel = document.getElementById('toolsPanel');
    
    // If already in ctrace mode and panel is visible, hide it
    if (this.ui._toolsPanelMode === 'ctrace' && toolsPanel && toolsPanel.classList.contains('active')) {
      this.ui.hideToolsPanel();
      return;
    }
    
    if (toolsPanel) {
      // Mark that we're in ctrace mode
      this.ui._toolsPanelMode = 'ctrace';
      // Restore original CTrace content if we have it saved
      if (this.ui._toolsPanelOriginal) {
        const header = toolsPanel.querySelector('.tools-panel-header');
        const content = toolsPanel.querySelector('.tools-panel-content');
        if (header && this.ui._toolsPanelOriginal.headerHTML) {
          header.innerHTML = this.ui._toolsPanelOriginal.headerHTML;
        }
        if (content && this.ui._toolsPanelOriginal.contentHTML) {
          content.innerHTML = this.ui._toolsPanelOriginal.contentHTML;
        }
      }
      this.ui.showToolsPanel();
    }
  }

/**
   * Inject a simple chat UI into the tools panel (like VSCode Copilot sidebar)
   */
  renderAssistantUI() {
    const toolsPanel = document.getElementById('toolsPanel');
    if (!toolsPanel) return;

    // Save original content so we can restore it later
    if (!this.ui._toolsPanelOriginal) {
      const header = toolsPanel.querySelector('.tools-panel-header');
      const content = toolsPanel.querySelector('.tools-panel-content');
      this.ui._toolsPanelOriginal = {
        headerHTML: header ? header.innerHTML : null,
        contentHTML: content ? content.innerHTML : null
      };
    }

    const header = toolsPanel.querySelector('.tools-panel-header');
    const content = toolsPanel.querySelector('.tools-panel-content');
    if (!header || !content) return;

    // Update header title
    const titleSpan = header.querySelector('span');
    if (titleSpan) titleSpan.textContent = 'Assistant';

    // Build assistant UI
    const cfg = this.ui.getAssistantConfig() || { provider: 'none' };
    
    // Get display name for the assistant
    let displayName = 'Not configured';
    if (cfg.provider === 'local' && cfg.localModelPath) {
      // Extract filename from path and remove .gguf extension
      const pathParts = cfg.localModelPath.replace(/\\/g, '/').split('/');
      const filename = pathParts[pathParts.length - 1];
      displayName = filename.replace(/\.gguf$/i, '');
    } else if (cfg.provider === 'external') {
      displayName = cfg.externalProvider || 'External';
    } else if (cfg.provider === 'ollama') {
      displayName = 'Ollama';
    } else if (cfg.provider !== 'none') {
      displayName = cfg.provider;
    }

    content.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%;">
        <div style="padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:space-between">
          <div style="font-size:13px; color:#c9d1d9">Assistant — ${displayName}</div>
          <div style="display:flex; gap:8px; align-items:center">
            <button id="assistant-settings" style="padding:6px 8px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:6px; cursor:pointer; font-size:12px">Settings</button>
          </div>
        </div>
        <div id="assistant-messages" style="flex:1; padding:12px; overflow:auto; background:linear-gradient(#0b0f14, #051018);">
          <!-- messages go here -->
        </div>
        <div style="padding:10px; border-top:1px solid rgba(255,255,255,0.03);">
          <div id="context-indicator" style="display:none; padding:6px 8px; margin-bottom:8px; background:#1a1f2e; border:1px solid #2b3036; border-radius:4px; font-size:11px; color:#8b949e; font-family:monospace;">
            <span id="context-text"></span>
            <button id="context-clear" style="margin-left:8px; padding:2px 6px; background:transparent; border:1px solid #30363d; color:#8b949e; border-radius:3px; cursor:pointer; font-size:10px;">✕</button>
          </div>
          <div style="display:flex; gap:8px; align-items:flex-end">
            <textarea id="assistant-input" placeholder="Ask the assistant..." style="flex:1; min-height:44px; max-height:120px; resize:none; padding:8px; border-radius:6px; border:1px solid #2b3036; background:#0d1117; color:#fff"></textarea>
            <button id="assistant-send" style="padding:10px; background:transparent; color:#8b949e; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:color 0.2s;" title="Send message (Enter)" onmouseover="this.ui.style.color='#c9d1d9'" onmouseout="this.ui.style.color='#8b949e'">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    // Helper to append messages with typing effect
    const addMessage = (who, text, options = {}) => {
      const container = document.getElementById('assistant-messages');
      if (!container) return;
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '12px';
      const bubble = document.createElement('div');
      bubble.style.padding = '10px 12px';
      bubble.style.borderRadius = '8px';
      bubble.style.maxWidth = '90%';
      bubble.style.lineHeight = '1.4';
      
      if (who === 'user') {
        bubble.style.background = '#0b5fff';
        bubble.style.color = '#fff';
        bubble.style.marginLeft = 'auto';
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.textContent = text;
        wrap.appendChild(bubble);
        container.appendChild(wrap);
        container.scrollTop = container.scrollHeight;
      } else {
        bubble.style.background = '#111319';
        bubble.style.color = '#e6edf3';
        bubble.style.marginRight = 'auto';
        wrap.appendChild(bubble);
        container.appendChild(wrap);
        
        // Return the bubble element for typing effects
        if (options.typing) {
          return bubble;
        }
        
        // Render markdown for assistant messages
        bubble.innerHTML = renderMarkdown(text);
        container.scrollTop = container.scrollHeight;
      }
    };

    // Typing effect for assistant messages
    const typeMessage = async (bubble, text, speed = 0.1) => { // Changed from 20 to 10ms (faster). Increase for slower, decrease for faster
      const container = document.getElementById('assistant-messages');
      let currentText = '';
      
      for (let i = 0; i < text.length; i++) {
        currentText += text[i];
        bubble.innerHTML = renderMarkdown(currentText);
        if (container) container.scrollTop = container.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, speed));
      }
    };

    // Animated thinking indicator
    const addThinkingMessage = () => {
      const bubble = addMessage('assistant', '', { typing: true });
      if (!bubble) return null;
      
      let dotCount = 0;
      const thinkingInterval = setInterval(() => {
        dotCount = (dotCount % 3) + 1;
        bubble.textContent = 'Thinking' + '.'.repeat(dotCount);
        const container = document.getElementById('assistant-messages');
        if (container) container.scrollTop = container.scrollHeight;
      }, 400);
      
      return { bubble, interval: thinkingInterval };
    };

    // Remove thinking message
    const removeThinkingMessage = (thinkingData) => {
      if (!thinkingData) return;
      clearInterval(thinkingData.interval);
      const container = document.getElementById('assistant-messages');
      if (container && thinkingData.bubble && thinkingData.bubble.parentElement) {
        container.removeChild(thinkingData.bubble.parentElement);
      }
    };

    // Simple markdown renderer
    const renderMarkdown = (text) => {
      // Trim leading/trailing whitespace to avoid extra newlines
      text = text.trim();
      
      // Store original code blocks before any processing
      const codeBlocks = [];
      let codeIndex = 0;
      
      // Extract and store original code blocks with language info
      const textWithPlaceholders = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const trimmedCode = code.trim();
        codeBlocks.push({ code: trimmedCode, lang: lang || '' });
        return `__CODE_BLOCK_${codeIndex++}__`;
      });
      
      // Escape HTML
      let html = textWithPlaceholders.replace(/&/g, '&amp;')
                                     .replace(/</g, '&lt;')
                                     .replace(/>/g, '&gt;');
      
      // Replace code block placeholders with rendered HTML
      codeIndex = 0;
      html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const blockData = codeBlocks[parseInt(index)];
        const originalCode = blockData.code;
        const lang = blockData.lang.toLowerCase();
        
        // Store original code in base64 to avoid any escaping issues
        const base64Code = btoa(unescape(encodeURIComponent(originalCode)));
        
        // Apply syntax highlighting for C/C++ code
        let displayCode;
        if (lang === 'c' || lang === 'cpp' || lang === 'c++') {
          // Use syntax highlighter
          const { applySyntaxHighlight } = window.syntaxHighlighter;
          const fileType = lang === 'c' ? 'C' : 'C++';
          displayCode = applySyntaxHighlight(originalCode, fileType);
        } else {
          // No highlighting - just escape HTML
          displayCode = originalCode.replace(/&/g, '&amp;')
                                     .replace(/</g, '&lt;')
                                     .replace(/>/g, '&gt;');
        }
        
        const langLabel = lang ? `<span style="position:absolute; top:8px; left:12px; font-size:10px; color:#7d8590; text-transform:uppercase; font-weight:600;">${lang}</span>` : '';
        
        return `<div style="position:relative; margin:8px 0;">
          ${langLabel}
          <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
            <button class="code-copy-btn" data-code-b64="${base64Code}" style="padding:4px 8px; background:#21262d; border:1px solid #30363d; color:#f0f6fc; border-radius:4px; cursor:pointer; font-size:11px;">Copy</button>
            <button class="code-replace-btn" data-code-b64="${base64Code}" style="padding:4px 8px; background:#238636; border:1px solid #2ea043; color:#fff; border-radius:4px; cursor:pointer; font-size:11px;">Replace</button>
          </div>
          <pre style="background:#0d1117; padding:12px; border-radius:6px; overflow-x:auto; padding-top:${lang ? '28px' : '12px'};"><code style="font-family:Consolas,Monaco,'Courier New',monospace; font-size:13px; color:#c9d1d9;">${displayCode}</code></pre>
        </div>`;
      });
      
      // Inline code (`code`)
      html = html.replace(/`([^`]+)`/g, '<code style="background:#21262d; padding:2px 6px; border-radius:3px; font-family:Consolas,Monaco,monospace; font-size:13px; color:#f0f6fc;">$1</code>');
      
      // Bold (**text** or __text__)
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      
      // Italic (*text* or _text_)
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
      
      // Headers (### text)
      html = html.replace(/^### (.+)$/gm, '<h3 style="margin:12px 0 8px 0; font-size:16px; font-weight:600; color:#f0f6fc;">$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2 style="margin:14px 0 10px 0; font-size:18px; font-weight:600; color:#f0f6fc;">$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1 style="margin:16px 0 12px 0; font-size:20px; font-weight:600; color:#f0f6fc;">$1</h1>');
      
      // Lists (- item or * item or 1. item)
      html = html.replace(/^- (.+)$/gm, '<li style="margin-left:20px;">$1</li>');
      html = html.replace(/^\* (.+)$/gm, '<li style="margin-left:20px;">$1</li>');
      html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px; list-style-type:decimal;">$1</li>');
      
      // Wrap consecutive <li> in <ul>
      html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
        return `<ul style="margin:8px 0; padding-left:0;">${match}</ul>`;
      });
      
      // Line breaks (preserve double newlines as paragraphs)
      html = html.replace(/\n\n/g, '<br><br>');
      
      return html;
    };

    // Prefill a small welcome message with typing effect (only first time)
    const providerName = cfg.provider === 'external' ? (cfg.externalProvider || 'External') : cfg.provider;
    const welcomeText = `Hi — I'm your assistant. Using: ${providerName}. Ask me something or open Settings to change providers.`;
    
    // Check if welcome message has been shown before
    const hasShownWelcome = sessionStorage.getItem('assistantWelcomeShown');
    
    if (!hasShownWelcome) {
      // First time - show typing effect (faster speed: 8ms per character)
      const welcomeBubble = addMessage('assistant', '', { typing: true });
      if (welcomeBubble) {
        typeMessage(welcomeBubble, welcomeText, 8);
      }
      sessionStorage.setItem('assistantWelcomeShown', 'true');
    } else {
      // Already shown - display instantly
      addMessage('assistant', welcomeText);
    }

    // Wire up send button
    const sendBtn = document.getElementById('assistant-send');
    const inputEl = document.getElementById('assistant-input');
    const settingsBtn = document.getElementById('assistant-settings');
    const contextIndicator = document.getElementById('context-indicator');
    const contextText = document.getElementById('context-text');
    const contextClearBtn = document.getElementById('context-clear');

    // Capture selection before it's lost when user clicks on input
    let capturedSelection = '';
    let capturedLineInfo = '';
    
    inputEl.addEventListener('focus', () => {
      try {
        const monacoEditor = this.ui.editorManager.getMonacoInstance ? this.ui.editorManager.getMonacoInstance() : null;
        if (monacoEditor) {
          const selection = monacoEditor.getSelection();
          const model = monacoEditor.getModel();
          if (selection && model) {
            const selectedText = model.getValueInRange(selection);
            if (selectedText) {
              capturedSelection = selectedText;
              const startLine = selection.startLineNumber;
              const endLine = selection.endLineNumber;
              const activeTab = this.ui.tabManager.getActiveTab();
              const fileName = activeTab && activeTab.fileName ? activeTab.fileName : 'Untitled';
              capturedLineInfo = startLine === endLine ? `${fileName}: ${startLine}` : `${fileName}: ${startLine}-${endLine}`;
              contextText.textContent = capturedLineInfo;
              contextIndicator.style.display = 'block';
            }
          }
        } else {
          // Fallback for legacy textarea editor
          const editor = this.ui.editorManager.editor;
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          const selection = editor.value.substring(start, end);
          if (selection) {
            capturedSelection = selection;
            const textBeforeStart = editor.value.substring(0, start);
            const textBeforeEnd = editor.value.substring(0, end);
            const startLine = (textBeforeStart.match(/\n/g) || []).length + 1;
            const endLine = (textBeforeEnd.match(/\n/g) || []).length + 1;
            const activeTab = this.ui.tabManager.getActiveTab();
            const fileName = activeTab && activeTab.fileName ? activeTab.fileName : 'Untitled';
            if (startLine === endLine) {
              capturedLineInfo = `${fileName}: ${startLine}`;
            } else {
              capturedLineInfo = `${fileName}: ${startLine}-${endLine}`;
            }
            contextText.textContent = capturedLineInfo;
            contextIndicator.style.display = 'block';
          }
        }
      } catch (err) {
        console.warn('Error capturing selection for assistant context:', err);
      }
    });

    // Handle Enter key to send message (Shift+Enter for new line)
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Clear captured selection when input loses focus without sending
    inputEl.addEventListener('blur', () => {
      // Small delay to allow send button click to process
      setTimeout(() => {
        if (!inputEl.value.trim()) {
          capturedSelection = '';
          capturedLineInfo = '';
          contextIndicator.style.display = 'none';
        }
      }, 200);
    });

    // Clear button handler
    contextClearBtn.onclick = () => {
      capturedSelection = '';
      capturedLineInfo = '';
      contextIndicator.style.display = 'none';
    };

    sendBtn.onclick = async () => {
      const text = (inputEl.value || '').trim();
      if (!text) return;
      
      // Use captured selection as context
      let context = '';
      if (capturedSelection) {
        context = `\n\n[Context - Selected Code]:\n\`\`\`\n${capturedSelection}\n\`\`\`\n\n`;
      }
      
      // Clear captured selection and hide indicator after using it
      capturedSelection = '';
      capturedLineInfo = '';
      contextIndicator.style.display = 'none';
      
      // Combine user message with context
      const fullMessage = context ? context + text : text;
      
      // Display only user's text in UI
      addMessage('user', text);
      inputEl.value = '';

      // Get current assistant config
      const cfg = this.ui.getAssistantConfig();
      if (!cfg || cfg.provider === 'none' || cfg.skipped) {
        const bubble = addMessage('assistant', '', { typing: true });
        if (bubble) {
          await typeMessage(bubble, 'Assistant not configured. Please click the settings icon ⚙️ to set up your provider.', 15);
        }
        return;
      }

      // Show animated thinking indicator
      const thinkingData = addThinkingMessage();

      try {
        // All providers go through IPC (main process)
        const result = await window.api.invoke('assistant-chat', {
          provider: cfg.provider,
          message: fullMessage,
          config: cfg
        });

        // Remove the thinking message
        removeThinkingMessage(thinkingData);

        if (result && result.success) {
          const bubble = addMessage('assistant', '', { typing: true });
          if (bubble) {
            await typeMessage(bubble, result.reply, 20);
            
            // Attach event listeners to code action buttons after rendering
            setTimeout(() => {
              attachCodeActionListeners();
            }, 100);
          }
        } else {
          const errorMsg = result && result.error ? result.error : 'Unknown error occurred';
          const bubble = addMessage('assistant', '', { typing: true });
          if (bubble) {
            await typeMessage(bubble, `❌ Error: ${errorMsg}`, 15);
          }
        }
      } catch (err) {
        // Remove thinking message
        removeThinkingMessage(thinkingData);
        
        console.error('Assistant chat error:', err);
        const bubble = addMessage('assistant', '', { typing: true });
        if (bubble) {
          await typeMessage(bubble, `❌ Error: ${err.message || 'Failed to communicate with assistant'}`, 15);
        }
      }
    };

    // Helper to attach event listeners to code action buttons
    const attachCodeActionListeners = () => {
      const container = document.getElementById('assistant-messages');
      if (!container) return;
      
      // Copy button handlers
      container.querySelectorAll('.code-copy-btn').forEach(btn => {
        btn.onclick = () => {
          const base64Code = btn.getAttribute('data-code-b64');
          const code = decodeURIComponent(escape(atob(base64Code)));
          
          try {
            window.api.clipboard.writeText(code);
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = 'Copy', 2000);
          } catch (_) {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(code)
                .then(() => {
                  btn.textContent = 'Copied!';
                  setTimeout(() => btn.textContent = 'Copy', 2000);
                })
                .catch(() => alert('Failed to copy code'));
            }
          }
        };
      });
      
      // Replace button handlers
      container.querySelectorAll('.code-replace-btn').forEach(btn => {
        btn.onclick = () => {
          const base64Code = btn.getAttribute('data-code-b64');
          const code = decodeURIComponent(escape(atob(base64Code)));
          try {
            const monacoEditor = this.ui.editorManager.getMonacoInstance ? this.ui.editorManager.getMonacoInstance() : null;
            if (monacoEditor) {
              const model = monacoEditor.getModel();
              const selection = monacoEditor.getSelection();
              let rangeObj = null;
              let actionLabel = 'Inserted!';

              if (selection && typeof selection.isEmpty === 'function' ? !selection.isEmpty() : (selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn)) {
                rangeObj = {
                  startLineNumber: selection.startLineNumber,
                  startColumn: selection.startColumn,
                  endLineNumber: selection.endLineNumber,
                  endColumn: selection.endColumn
                };
                actionLabel = 'Replaced!';
              } else {
                const pos = monacoEditor.getPosition();
                rangeObj = { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column };
                actionLabel = 'Inserted!';
              }

              monacoEditor.executeEdits('assistant', [{ range: rangeObj, text: code, forceMoveMarkers: true }]);
              // Update tab state
              if (this.ui.tabManager.activeTabId && model) {
                this.ui.tabManager.handleContentChange(this.ui.tabManager.activeTabId, model.getValue());
              }
              btn.textContent = actionLabel;
              setTimeout(() => btn.textContent = 'Replace', 2000);
              monacoEditor.focus();
            } else {
              // Fallback to legacy textarea editor
              const editor = this.ui.editorManager.editor;
              const start = editor.selectionStart;
              const end = editor.selectionEnd;
              if (start !== end) {
                // Replace selected text
                const before = editor.value.substring(0, start);
                const after = editor.value.substring(end);
                editor.value = before + code + after;
                if (this.ui.tabManager.activeTabId) {
                  this.ui.tabManager.handleContentChange(this.ui.tabManager.activeTabId, editor.value);
                }
                btn.textContent = 'Replaced!';
                setTimeout(() => btn.textContent = 'Replace', 2000);
              } else {
                const before = editor.value.substring(0, start);
                const after = editor.value.substring(start);
                editor.value = before + code + after;
                if (this.ui.tabManager.activeTabId) {
                  this.ui.tabManager.handleContentChange(this.ui.tabManager.activeTabId, editor.value);
                }
                btn.textContent = 'Inserted!';
                setTimeout(() => btn.textContent = 'Replace', 2000);
              }
              editor.focus();
            }
          } catch (err) {
            console.error('Error replacing/inserting code from assistant:', err);
            btn.textContent = 'Error';
            setTimeout(() => btn.textContent = 'Replace', 2000);
          }
        };
      });
    };

    settingsBtn.onclick = () => {
      // Open the assistant setup modal for reconfiguration
      this.ui.showAssistantSetupGuide((cfg) => {
        // Re-render assistant UI to reflect changes
        this.ui.renderAssistantUI();
      });
    };
  }

/**
   * Retrieve assistant configuration from localStorage
   * @returns {Object|null}
   */
  getAssistantConfig() {
    try {
      const raw = localStorage.getItem('assistantConfig');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to parse assistantConfig from localStorage', err);
      return null;
    }
  }

/**
   * Save assistant configuration to localStorage
   * @param {Object} cfg
   */
  saveAssistantConfig(cfg) {
    try {
      localStorage.setItem('assistantConfig', JSON.stringify(cfg));
      this.ui.notificationManager.showSuccess('Assistant settings saved');
    } catch (err) {
      console.error('Failed to save assistantConfig', err);
      this.ui.notificationManager.showError('Failed to save assistant settings');
    }
  }

/**
   * Render a first-time setup modal for Assistant configuration.
   * Calls the done callback with saved config or null if cancelled.
   */
  showAssistantSetupGuide(done) {
    // Load existing config to pre-fill form
    const existingConfig = this.ui.getAssistantConfig() || {};
    
    // Modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10001;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      width: 720px; max-width: 95%; background: #fff; border-radius:8px; padding:20px; box-shadow:0 8px 30px rgba(0,0,0,0.3);
      font-family: sans-serif; color: #222;
    `;

    dialog.innerHTML = `
      <h2 style="margin-top:0">Assistant setup</h2>
      <p>Choose how you'd like to connect the Assistant. You can use Ollama, an external API (ChatGPT5, Deepseek, or other), or point to a local GGUF model on your machine.</p>
      <div style="display:flex; gap:12px; margin-top:12px;">
        <label style="flex:1; border:1px solid #e2e2e2; padding:12px; border-radius:6px; cursor:pointer;" id="assist-opt-ollama">
          <input type="radio" name="assist-provider" value="ollama" style="margin-right:8px"> Ollama (local or remote)
          <div style="font-size:12px; color:#555; margin-top:6px">Connect to an Ollama server (default: http://localhost:11434)</div>
        </label>
        <label style="flex:1; border:1px solid #e2e2e2; padding:12px; border-radius:6px; cursor:pointer;" id="assist-opt-external">
          <input type="radio" name="assist-provider" value="external" style="margin-right:8px"> External API
          <div style="font-size:12px; color:#555; margin-top:6px">Use ChatGPT5, Deepseek or other hosted APIs (requires API key)</div>
        </label>
        <label style="flex:1; border:1px solid #e2e2e2; padding:12px; border-radius:6px; cursor:pointer;" id="assist-opt-local">
          <input type="radio" name="assist-provider" value="local" style="margin-right:8px"> Local GGUF model
          <div style="font-size:12px; color:#555; margin-top:6px">Point to a GGUF model file on your computer</div>
        </label>
      </div>

      <div id="assist-extra" style="margin-top:16px"></div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
        <button id="assist-skip" style="padding:8px 12px; background:transparent; border:1px solid #cfcfcf; border-radius:6px; cursor:pointer">Skip for now</button>
        <button id="assist-cancel" style="padding:8px 12px; background:#ddd; border:none; border-radius:6px; cursor:pointer">Cancel</button>
        <button id="assist-save" style="padding:8px 12px; background:#007acc; color:white; border:none; border-radius:6px; cursor:pointer">Save</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const extra = dialog.querySelector('#assist-extra');

    const clearExtra = () => { extra.innerHTML = ''; };

    const makeInputRow = (labelText, inputId, placeholder = '') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-top:8px;';
      row.innerHTML = `
        <label style="font-size:13px; color:#333">${labelText}</label>
        <input id="${inputId}" style="padding:8px; border:1px solid #e2e2e2; border-radius:4px; font-size:13px" placeholder="${placeholder}">
      `;
      return row;
    };

    const providerRadios = dialog.querySelectorAll('input[name="assist-provider"]');
    const optOllama = dialog.querySelector('#assist-opt-ollama');
    const optExternal = dialog.querySelector('#assist-opt-external');
    const optLocal = dialog.querySelector('#assist-opt-local');

    const selectProvider = (value) => {
      providerRadios.forEach(r => r.checked = (r.value === value));
      optOllama.style.borderColor = value === 'ollama' ? '#007acc' : '#e2e2e2';
      optExternal.style.borderColor = value === 'external' ? '#007acc' : '#e2e2e2';
      optLocal.style.borderColor = value === 'local' ? '#007acc' : '#e2e2e2';

      clearExtra();
      if (value === 'ollama') {
        extra.appendChild(makeInputRow('Ollama host (include protocol)', 'ollama-host', 'http://localhost:11434'));
        extra.appendChild(makeInputRow('System prompt (optional)', 'system-prompt', 'You are a helpful assistant...'));
        
        // Pre-fill with saved values
        setTimeout(() => {
          const hostInput = document.getElementById('ollama-host');
          const systemInput = document.getElementById('system-prompt');
          if (hostInput && existingConfig.ollamaHost) {
            hostInput.value = existingConfig.ollamaHost;
          }
          if (systemInput && existingConfig.systemPrompt) {
            systemInput.value = existingConfig.systemPrompt;
          }
        }, 0);
      } else if (value === 'external') {
        const selRow = document.createElement('div');
        selRow.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:8px;';
        selRow.innerHTML = `
          <label style="font-size:13px">Provider</label>
          <select id="external-provider" style="padding:6px; border:1px solid #e2e2e2; border-radius:4px">
            <option value="ChatGPT5">ChatGPT5</option>
            <option value="Deepseek">Deepseek</option>
            <option value="Other">Other</option>
          </select>
        `;
        extra.appendChild(selRow);
        extra.appendChild(makeInputRow('API Key', 'external-api-key', 'sk-...'));
        extra.appendChild(makeInputRow('Model Name', 'external-model', 'gpt-4'));
        extra.appendChild(makeInputRow('System prompt (optional)', 'system-prompt', 'You are a helpful assistant...'));
        
        // Pre-fill with saved values
        setTimeout(() => {
          const providerSelect = document.getElementById('external-provider');
          const apiKeyInput = document.getElementById('external-api-key');
          const modelInput = document.getElementById('external-model');
          const systemInput = document.getElementById('system-prompt');
          if (providerSelect && existingConfig.externalProvider) {
            providerSelect.value = existingConfig.externalProvider;
          }
          if (apiKeyInput && existingConfig.apiKey) {
            apiKeyInput.value = existingConfig.apiKey;
          }
          if (modelInput && existingConfig.model) {
            modelInput.value = existingConfig.model;
          }
          if (systemInput && existingConfig.systemPrompt) {
            systemInput.value = existingConfig.systemPrompt;
          }
        }, 0);
      } else if (value === 'local') {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:8px;';
        row.innerHTML = `
          <input id="local-model-path" placeholder="Select GGUF model file..." style="flex:1; padding:8px; border:1px solid #e2e2e2; border-radius:4px" readonly>
          <button id="local-browse" style="padding:8px 10px; border-radius:4px; border:none; background:#007acc; color:white; cursor:pointer">Browse</button>
        `;
        extra.appendChild(row);

        // Browse handler using IPC
        setTimeout(() => {
          const browseBtn = document.getElementById('local-browse');
          const pathInput = document.getElementById('local-model-path');
          
          // Pre-fill with saved value
          if (pathInput && existingConfig.localModelPath) {
            pathInput.value = existingConfig.localModelPath;
          }
          
          if (browseBtn) {
            browseBtn.onclick = async () => {
              try {
                const result = await window.api.invoke('select-llm-file');
                if (result && result.filePath) {
                  pathInput.value = result.filePath;
                }
              } catch (err) {
                console.error('Error selecting model file', err);
                this.ui.notificationManager.showError('Unable to open file selector');
              }
            };
          }
        }, 0);
        
        // Add context size configuration
        const contextRow = document.createElement('div');
        contextRow.style.cssText = 'margin-top:12px;';
        contextRow.innerHTML = `
          <label style="display:block; margin-bottom:4px; color:#333; font-size:13px">Context Size (tokens):</label>
          <input id="context-size" type="number" placeholder="8192" style="width:100%; padding:8px; border:1px solid #e2e2e2; border-radius:4px" value="8192" min="512" max="32768">
          <div style="margin-top:4px; font-size:11px; color:#666">Lower values use less VRAM. Recommended: 2048-8192. Default model max: 40960</div>
        `;
        extra.appendChild(contextRow);
        
        // Add GPU layers configuration
        const gpuRow = document.createElement('div');
        gpuRow.style.cssText = 'margin-top:12px;';
        gpuRow.innerHTML = `
          <label style="display:block; margin-bottom:4px; color:#333; font-size:13px">GPU Layers (0 = CPU only, -1 = all layers):</label>
          <input id="gpu-layers" type="number" placeholder="0" style="width:100%; padding:8px; border:1px solid #e2e2e2; border-radius:4px" value="0">
          <div style="margin-top:4px; font-size:11px; color:#666">Higher values offload more layers to GPU for faster inference. Use -1 to offload all layers.</div>
        `;
        extra.appendChild(gpuRow);
        
        // Add system prompt field for local models too
        extra.appendChild(makeInputRow('System prompt (optional)', 'system-prompt', 'You are a helpful assistant...'));
        
        // Pre-fill all settings
        setTimeout(() => {
          const systemInput = document.getElementById('system-prompt');
          const gpuLayersInput = document.getElementById('gpu-layers');
          const contextSizeInput = document.getElementById('context-size');
          
          if (systemInput && existingConfig.systemPrompt) {
            systemInput.value = existingConfig.systemPrompt;
          }
          if (gpuLayersInput && existingConfig.gpuLayers !== undefined) {
            gpuLayersInput.value = existingConfig.gpuLayers;
          }
          if (contextSizeInput && existingConfig.contextSize !== undefined) {
            contextSizeInput.value = existingConfig.contextSize;
          }
        }, 0);
      }
    };

    // Click handlers for the option cards as well
    optOllama.onclick = () => selectProvider('ollama');
    optExternal.onclick = () => selectProvider('external');
    optLocal.onclick = () => selectProvider('local');

    // Pre-select provider based on saved config, or default to external
    const savedProvider = existingConfig.provider && existingConfig.provider !== 'none' 
      ? existingConfig.provider 
      : 'external';
    selectProvider(savedProvider);

    // Buttons
    const btnSave = dialog.querySelector('#assist-save');
    const btnCancel = dialog.querySelector('#assist-cancel');
    const btnSkip = dialog.querySelector('#assist-skip');

    const closeModal = (result) => {
      try { document.body.removeChild(modal); } catch (_) {}
      if (done) done(result);
    };

    btnCancel.onclick = () => closeModal(null);
    btnSkip.onclick = () => {
      // Save a lightweight config indicating user skipped
      const cfg = { provider: 'none', skipped: true };
      this.ui.saveAssistantConfig(cfg);
      closeModal(cfg);
    };

    btnSave.onclick = () => {
      const selected = Array.from(providerRadios).find(r => r.checked);
      if (!selected) {
        this.ui.notificationManager.showError('Please select a provider');
        return;
      }
      const provider = selected.value;
      const cfg = { provider };
      
      // Get system prompt if it exists
      const systemPromptEl = document.getElementById('system-prompt');
      if (systemPromptEl && systemPromptEl.value.trim()) {
        cfg.systemPrompt = systemPromptEl.value.trim();
      }
      
      if (provider === 'ollama') {
        const hostEl = document.getElementById('ollama-host');
        cfg.ollamaHost = hostEl && hostEl.value ? hostEl.value.trim() : 'http://localhost:11434';
      } else if (provider === 'external') {
        const prov = document.getElementById('external-provider');
        const key = document.getElementById('external-api-key');
        const model = document.getElementById('external-model');
        
        cfg.externalProvider = prov ? prov.value : 'ChatGPT5';
        cfg.apiKey = key ? key.value.trim() : '';
        cfg.model = model ? model.value.trim() : '';

        // Map UI selection to backend provider ID
        if (cfg.externalProvider === 'Deepseek') {
          cfg.providerId = 'deepseek';
          if (!cfg.model) cfg.model = 'deepseek-chat';
        } else if (cfg.externalProvider === 'ChatGPT5') {
          cfg.providerId = 'openai';
          if (!cfg.model) cfg.model = 'gpt-4';
        } else {
          // Default to openai for compatibility if not specified
          cfg.providerId = 'openai';
          if (!cfg.model) cfg.model = 'gpt-4';
        }

        if (!cfg.apiKey) {
          this.ui.notificationManager.showError('Please enter an API key for the external provider');
          return;
        }
      } else if (provider === 'local') {
        const pathEl = document.getElementById('local-model-path');
        const gpuLayersEl = document.getElementById('gpu-layers');
        const contextSizeEl = document.getElementById('context-size');
        
        cfg.localModelPath = pathEl ? pathEl.value : '';
        if (!cfg.localModelPath) {
          this.ui.notificationManager.showError('Please choose a local GGUF model file');
          return;
        }
        
        // Save GPU layers setting (default to 0 if not specified)
        cfg.gpuLayers = gpuLayersEl && gpuLayersEl.value !== '' ? parseInt(gpuLayersEl.value, 10) : 0;
        
        // Save context size setting (default to 8192 if not specified)
        cfg.contextSize = contextSizeEl && contextSizeEl.value !== '' ? parseInt(contextSizeEl.value, 10) : 8192;
      }

      // Persist and close
      this.ui.saveAssistantConfig(cfg);
      // Notify main process in case it needs to warm things up
      try { window.api.send('assistant-config-updated', cfg); } catch (_) {}
      closeModal(cfg);
    };

    // Dismiss modal when clicking outside the dialog
    modal.onclick = (e) => { if (e.target === modal) closeModal(null); };
  }

/**
   * Visualyzer panel management
   */
  toggleVisualyzerPanel() {
    // Open visualyzer in a separate window
    window.api.send('open-visualyzer');
  }

  closeVisualyzer() {
    // This method is no longer needed since visualyzer is in separate window
    // Kept for backward compatibility
  }

}

window.AssistantPanel = AssistantPanel;
