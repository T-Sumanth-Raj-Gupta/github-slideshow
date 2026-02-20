# Your GitHub Learning Lab Repository for Introducing GitHub

Welcome to **your** repository for your GitHub Learning Lab course. This repository will be used during the different activities that I will be guiding you through. See a word you don't understand? We've included an emoji 📖 next to some key terms. Click on it to see its definition.

Oh! I haven't introduced myself...

I'm the GitHub Learning Lab bot and I'm here to help guide you in your journey to learn and master the various topics covered in this course. I will be using Issue and Pull Request comments to communicate with you. In fact, I already added an issue for you to check out.

![issue tab](https://lab.github.com/public/images/issue_tab.png)

I'll meet you over there, can't wait to get started!

This course is using the :sparkles: open source project [reveal.js](https://github.com/hakimel/reveal.js/). In some cases we’ve made changes to the history so it would behave during class, so head to the original project repo to learn more about the cool people behind this project.

## MCP upload studio + Claude Desktop integration

`mcp-ui/` now includes:

- A polished web UI for multi-file uploads and previews.
- A local JSON data store used by both the UI server and Claude Desktop MCP server.
- A Claude Desktop MCP stdio server (`mcp-ui/claude-desktop-mcp.js`) that can read all uploaded files.

### Start the UI server

```bash
npm start
```

Open `http://localhost:3000`.

### Connect to Claude Desktop

1. In the UI, use **Send to Claude Desktop → Load Claude config snippet**.
2. Copy the snippet into your Claude Desktop `mcpServers` config.
3. Restart Claude Desktop.
4. Use **Send selected files to Claude** in the UI to directly open Claude Desktop with a prepared prompt; payload is also copied as fallback.

The MCP server exposed to Claude Desktop has tools:

- `list_uploaded_files`
- `get_file_content`
