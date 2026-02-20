const http = require('http');
const fs = require('fs');
const path = require('path');
const { addFiles, listFiles, getFileById, DATA_FILE } = require('./file-store');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MCP_STDIO_PATH = path.join(__dirname, 'claude-desktop-mcp.js');

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function summarize(file) {
  return {
    id: file.id,
    createdAt: file.createdAt,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    contentType: file.content.type
  };
}

function buildClaudePayload(fileIds) {
  const files = listFiles();
  const selected = Array.isArray(fileIds) && fileIds.length > 0
    ? files.filter((file) => fileIds.includes(file.id))
    : files.slice(-5);

  const blocks = selected.map((file) => {
    const header = `### ${file.name} (${file.mimeType}, ${file.size} bytes)`;
    if (file.content.type === 'text') {
      const preview = String(file.content.value || '').slice(0, 14000);
      return `${header}\n${preview}`;
    }

    return `${header}\n${file.content.value}\nbase64Preview=${file.content.base64Preview || ''}`;
  });

  return [
    'Use the following uploaded files as context:',
    '',
    ...blocks
  ].join('\n\n');
}

function handleMcp(body, res) {
  const { id, method, params } = body || {};
  const ok = (result) => json(res, 200, { jsonrpc: '2.0', id, result });
  const fail = (message) => json(res, 400, { jsonrpc: '2.0', id, error: { code: -32602, message } });

  if (method === 'initialize') {
    return ok({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'file-ingest-mcp-ui-http', version: '2.0.0' },
      capabilities: { tools: {} }
    });
  }

  if (method === 'tools/list') {
    return ok({
      tools: [
        {
          name: 'list_uploaded_files',
          description: 'List uploaded files available to Claude Desktop.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_file_content',
          description: 'Return file metadata and extracted content by file id.',
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

    if (toolName === 'list_uploaded_files') {
      const list = listFiles().map(summarize);
      return ok({ content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] });
    }

    if (toolName === 'get_file_content') {
      const file = getFileById(args.id);
      if (!file) return fail('Unknown file id');
      return ok({ content: [{ type: 'text', text: JSON.stringify(file, null, 2) }] });
    }

    return fail(`Unknown tool: ${toolName}`);
  }

  return fail(`Unsupported method: ${method}`);
}

function serveStatic(req, res) {
  const target = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(PUBLIC_DIR, target);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const ext = path.extname(filePath);
    const mime = ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.css'
        ? 'text/css; charset=utf-8'
        : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/upload') {
      const body = await parseBody(req);
      const uploadedFiles = Array.isArray(body.files) ? body.files : [];
      if (uploadedFiles.length === 0) return json(res, 400, { error: 'No files uploaded' });
      return json(res, 200, { uploaded: addFiles(uploadedFiles).map(summarize) });
    }

    if (req.method === 'GET' && req.url === '/api/files') {
      return json(res, 200, { files: listFiles().map(summarize) });
    }

    if (req.method === 'GET' && req.url.startsWith('/api/files/')) {
      const id = decodeURIComponent(req.url.replace('/api/files/', ''));
      const file = getFileById(id);
      if (!file) return json(res, 404, { error: 'File not found' });
      return json(res, 200, file);
    }

    if (req.method === 'GET' && req.url === '/api/claude-desktop-config') {
      return json(res, 200, {
        message: 'Paste this into Claude Desktop config under mcpServers.',
        configSnippet: {
          'file-ingest-ui': {
            command: 'node',
            args: [MCP_STDIO_PATH],
            env: {
              FILE_INGEST_STORE: DATA_FILE
            }
          }
        }
      });
    }

    if (req.method === 'POST' && req.url === '/mcp') {
      const body = await parseBody(req);
      return handleMcp(body, res);
    }

    if (req.method === 'POST' && req.url === '/api/claude/send') {
      const body = await parseBody(req);
      const payload = buildClaudePayload(body.fileIds);
      return json(res, 200, {
        message: 'Payload prepared for Claude Desktop deep-link and clipboard fallback.',
        payload,
        claudeDeepLink: `claude://new?prompt=${encodeURIComponent(payload)}`
      });
    }

    if (req.method === 'GET') return serveStatic(req, res);

    res.writeHead(405);
    return res.end('Method not allowed');
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`MCP UI server running at http://localhost:${PORT}`);
});
