const fs = require('fs');
const path = require('path');

const DEFAULT_STORE = path.join(__dirname, 'data', 'uploads.json');
const STORE_FILE = process.env.FILE_INGEST_STORE || DEFAULT_STORE;

function readStore() {
  if (!fs.existsSync(STORE_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}

function summarize(file) {
  return {
    id: file.id,
    createdAt: file.createdAt,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    contentType: file.content?.type || 'unknown'
  };
}

function makeResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id, message) {
  return { jsonrpc: '2.0', id, error: { code: -32602, message } };
}

function handleRequest(msg) {
  const { id, method, params } = msg || {};

  if (method === 'initialize') {
    return makeResponse(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'file-ingest-ui-stdio', version: '2.0.0' },
      capabilities: { tools: {} }
    });
  }

  if (method === 'tools/list') {
    return makeResponse(id, {
      tools: [
        {
          name: 'list_uploaded_files',
          description: 'List uploaded files from the UI ingestion store.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_file_content',
          description: 'Get complete metadata/content for an uploaded file by id.',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id']
          }
        }
      ]
    });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};
    const files = readStore();

    if (toolName === 'list_uploaded_files') {
      return makeResponse(id, {
        content: [{ type: 'text', text: JSON.stringify(files.map(summarize), null, 2) }]
      });
    }

    if (toolName === 'get_file_content') {
      const selected = files.find((file) => file.id === args.id);
      if (!selected) {
        return makeError(id, 'Unknown file id');
      }
      return makeResponse(id, {
        content: [{ type: 'text', text: JSON.stringify(selected, null, 2) }]
      });
    }

    return makeError(id, `Unknown tool: ${toolName}`);
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  return makeError(id, `Unsupported method: ${method}`);
}

function writeFramed(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  process.stdout.write(Buffer.concat([header, body]));
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const headerText = buffer.subarray(0, headerEnd).toString('utf8');
    const lenMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!lenMatch) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }

    const contentLength = Number(lenMatch[1]);
    const totalLength = headerEnd + 4 + contentLength;
    if (buffer.length < totalLength) break;

    const jsonPayload = buffer.subarray(headerEnd + 4, totalLength).toString('utf8');
    buffer = buffer.subarray(totalLength);

    try {
      const request = JSON.parse(jsonPayload);
      const response = handleRequest(request);
      if (response) writeFramed(response);
    } catch {
      writeFramed(makeError(null, 'Invalid JSON payload'));
    }
  }
});
