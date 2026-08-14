import net from 'node:net';
import { decodeLines, encodeMessage } from './protocol.js';
import { handleRequest } from './requestHandlers.js';

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
