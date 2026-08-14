// Newline-delimited JSON framing, matching native/crates/ipc/src/transport.rs.
// Phase 0 spike only — see that file's doc comment for why TCP loopback
// was chosen and what has to replace it before Phase 3.

export function encodeMessage(message) {
  return `${JSON.stringify(message)}\n`;
}

export function decodeLines(buffer, onMessage) {
  let start = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x0a) {
      const line = buffer.slice(start, i).toString('utf8').trim();
      start = i + 1;
      if (line.length > 0) {
        onMessage(JSON.parse(line));
      }
    }
  }
  return buffer.slice(start);
}
