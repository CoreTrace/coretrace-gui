import net from 'node:net';
import { decodeLines, encodeMessage } from './protocol.js';
import { handleRequest } from './requestHandlers.js';

// port 0 asks the OS for any free port -- avoids the fixed-port
// collisions the Phase 0 spike had. onListening(actualPort) is how the
// caller (index.js) learns which port the OS actually picked.
export function startServer(port, registry, onListening) {
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

  server.listen(port, '127.0.0.1', () => {
    onListening?.(server.address().port);
  });
  return server;
}
