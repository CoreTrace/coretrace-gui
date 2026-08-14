import net from 'node:net';
import { decodeLines, encodeMessage } from './protocol.js';

function handleRequest(request, registry) {
  switch (request.type) {
    case 'ping':
      return { type: 'pong' };
    case 'invoke_command':
      try {
        const result = registry.invoke(request.command, request.args ?? []);
        return { type: 'command_result', command: request.command, result };
      } catch (err) {
        return { type: 'error', message: err.message };
      }
    default:
      return { type: 'error', message: `unknown request type: ${request.type}` };
  }
}

export function startServer(port, registry) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = decodeLines(buffer, (request) => {
        const response = handleRequest(request, registry);
        socket.write(encodeMessage(response));
      });
    });
  });

  server.listen(port, '127.0.0.1');
  return server;
}
