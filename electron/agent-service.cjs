const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

/** No Electron dependency: the same HTTP service is exercised by real MCP client tests. */
async function createAgentService(dispatch) {
  const { readSchema, transactionSchema } = await import("../shared/agent-schema.js");
  const { AGENT_GUIDE } = await import("../shared/agent-guide.js");
  const token = randomBytes(32).toString("hex");
  const active = new Set();
  let closing = false;
  const resultFor = async (method, args) => {
    const data = await dispatch(method, args);
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, ...(data.error ? { isError: true } : {}) };
  };
  const buildServer = () => {
    const mcp = new McpServer({ name: "chrona", version: "1.0.0" }, { instructions: AGENT_GUIDE });
    mcp.registerTool("chrona_read", {
      description: "Read the live Chrona engineering session. Start with {} for summary/session/revision. Request signalIds for full definitions or waveform for resolved output. Refresh before edits.",
      inputSchema: readSchema, annotations: { readOnlyHint: true, openWorldHint: false },
    }, (args) => resultFor("read", args));
    mcp.registerTool("chrona_apply", {
      description: "Atomically apply a batch to the live project. Required sessionId, expectedRevision and unique requestId protect user edits. Read chrona://guide first. A conflict requires rereading and reconsidering, not blind replay. One batch is one Undo step.",
      inputSchema: transactionSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, (args) => resultFor("apply", args));
    mcp.registerResource("guide", "chrona://guide", { description: "Chrona agent editing rules and example", mimeType: "text/plain" },
      async (uri) => ({ contents: [{ uri: uri.href, text: AGENT_GUIDE }] }));
    mcp.registerResource("project", "chrona://project", { description: "Live project summary, editing session and revision", mimeType: "application/json" },
      async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(await dispatch("read", {})) }] }));
    return mcp;
  };
  const server = http.createServer(async (req, res) => {
    const fail = (code, message) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: message })); };
    // Native MCP clients send no Origin. Deliberately do not permit browser-origin access.
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}` || req.headers.origin) return fail(403, "Invalid host or origin");
    if (req.headers.authorization !== `Bearer ${token}`) return fail(401, "Invalid connection token");
    if (req.url !== "/mcp") return fail(404, "Not found");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return fail(405, "Use Streamable HTTP POST"); }
    if (closing) return fail(503, "Agent access is stopping");
    if (active.size >= 32) return fail(429, "Too many in-flight requests");
    if (!req.headers["content-type"]?.startsWith("application/json")) return fail(415, "Expected application/json");
    // Count body readers as active too, so slow/large requests cannot bypass the cap.
    const entry = { mcp: null, res };
    active.add(entry);
    res.on("close", () => { active.delete(entry); void entry.mcp?.close(); });
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) { fail(413, "Request exceeds 1 MiB"); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { return fail(400, "Invalid JSON"); }
      if (closing) return fail(503, "Agent access is stopping");
      const mcp = buildServer(); entry.mcp = mcp;
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) fail(500, "MCP request failed");
      else res.end();
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    status: { enabled: true, endpoint: `http://127.0.0.1:${server.address().port}/mcp`, token },
    async close() {
      closing = true;
      for (const entry of active) { entry.res.destroy(); await entry.mcp?.close(); }
      await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}
module.exports = { createAgentService };
