import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { decodeLines, encodeMessage } from './protocol.js';
import { handleRequest } from './requestHandlers.js';

// Largest request a client may send before it is authenticated -- and a
// sanity bound afterwards. Keeps an unauthenticated peer from filling memory.
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

function tokenMatches(expected, candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// port 0 asks the OS for any free port -- avoids the fixed-port
// collisions the Phase 0 spike had. onListening(actualPort) is how the
// caller (index.js) learns which port the OS actually picked.
//
// The listener is loopback-only but any local process (or a browser tab
// via fetch) can reach loopback, so each connection must first present the
// shared `token` before any request is served.
export function startServer(port, registry, onListening, token) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let authenticated = false;

    const reject = (message) => {
      socket.write(encodeMessage({ type: 'error', message }));
      socket.end();
    };

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_BUFFERED_BYTES) {
        reject('request too large');
        return;
      }
      buffer = decodeLines(buffer, (request) => {
        if (!authenticated) {
          if (request && request.type === 'auth' && tokenMatches(token, request.token)) {
            authenticated = true;
            socket.write(encodeMessage({ type: 'auth_ok' }));
          } else {
            reject('unauthenticated');
          }
          return;
        }
        const response = handleRequest(request, registry);
        socket.write(encodeMessage(response));
      }, () => reject('invalid JSON'));
    });
    socket.on('error', () => {});
  });

  server.listen(port, '127.0.0.1', () => {
    onListening?.(server.address().port);
  });
  return server;
}
