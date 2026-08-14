import { setDocumentText, getDocumentText } from './fakeEditorState.js';

export function handleRequest(request, registry) {
  switch (request.type) {
    case 'ping':
      return { type: 'pong' };
    case 'set_document_text':
      setDocumentText(request.text, request.file_name, request.language_id);
      return { type: 'document_text', text: getDocumentText() };
    case 'get_document_text':
      return { type: 'document_text', text: getDocumentText() };
    case 'list_commands':
      return { type: 'commands', commands: registry.list() };
    case 'invoke_command':
      try {
        const result = registry.invoke(request.command, request.args ?? []);
        // JSON.stringify drops object keys whose value is `undefined`, and
        // most VSCode editor commands return nothing (they mutate state
        // instead) -- normalize to null so the `result` key always exists.
        return { type: 'command_result', command: request.command, result: result ?? null };
      } catch (err) {
        return { type: 'error', message: err.message };
      }
    default:
      return { type: 'error', message: `unknown request type: ${request.type}` };
  }
}
