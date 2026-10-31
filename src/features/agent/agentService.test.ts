/// <reference types="node" />
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAgentService } from "../../../electron/agent-service.cjs";
import { ProjectSession } from "./projectSession";
import { request as httpRequest } from "node:http";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup() {
  const session = new ProjectSession({ version: 3, name: "MCP Test", durationPs: 6000, signals: [],
    constraintDraft: { setupPs: 10, holdPs: 10, status: "awaiting-definition" } });
  const service = await createAgentService(async (method: string, args: unknown) => session.handle(method, args));
  cleanups.push(() => service.close());
  const client = new Client({ name: "chrona-integration-test", version: "1.0.0" });
  cleanups.push(() => client.close());
  return { session, service, client, headers: { Authorization: `Bearer ${service.status.token}` } };
}
describe("actual MCP Streamable HTTP service", () => {
  it("initializes, discovers schemas and guide, reads, edits, detects conflicts and retries", async () => {
    const { session, service, client, headers } = await setup();
    await client.connect(new StreamableHTTPClientTransport(new URL(service.status.endpoint), { requestInit: { headers } }));
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["chrona_read", "chrona_apply"]);
    expect((await client.readResource({ uri: "chrona://guide" })).contents[0]).toHaveProperty("text");
    const read = await client.callTool({ name: "chrona_read", arguments: {} });
    const info = read.structuredContent as { sessionId: string; revision: number };
    expect(info.revision).toBe(0);
    const args = { sessionId: info.sessionId, expectedRevision: info.revision, requestId: "mcp-create-1",
      operations: [{ type: "create_signal", signal: { id: "clk", kind: "clock", name: "CLK", periodPs: 1000 } }] };
    expect((await client.callTool({ name: "chrona_apply", arguments: args })).structuredContent).toMatchObject({ revision: 1 });
    expect((await client.callTool({ name: "chrona_apply", arguments: args })).structuredContent).toMatchObject({ replayed: true });
    session.update((p) => ({ ...p, name: "User changed this" }));
    const conflict = await client.callTool({ name: "chrona_apply", arguments: { ...args, requestId: "mcp-create-2" } });
    expect(conflict.isError).toBe(true);
    expect(conflict.structuredContent).toMatchObject({ error: { code: "REVISION_CONFLICT" }, revision: 2 });
    expect(session.getSnapshot().project.signals).toHaveLength(1);
    const invalid = await client.callTool({ name: "chrona_apply", arguments: { ...args, operations: [{ type: "shell", cmd: "echo no" }] } });
    expect(invalid.isError).toBe(true);
  });
  it("guards authorization, origin, host, size, JSON and endpoint", async () => {
    const { service, headers } = await setup();
    const url = service.status.endpoint;
    expect((await fetch(url, { method: "POST" })).status).toBe(401);
    expect((await fetch(url, { headers: { ...headers, Origin: "https://example.com" } })).status).toBe(403);
    // fetch owns the Host header; use raw HTTP to exercise DNS rebinding protection.
    const hostStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(url, { headers: { ...headers, Host: "example.com" } }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.end();
    });
    expect(hostStatus).toBe(403);
    expect((await fetch(url, { headers })).status).toBe(405);
    expect((await fetch(url + "/other", { headers })).status).toBe(404);
    expect((await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "not json" })).status).toBe(400);
    expect((await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(1024 * 1024) }) })).status).toBe(413);
  });
  it("serializes competing writes at the authoritative session", async () => {
    const { session, service, headers } = await setup();
    const clientA = new Client({ name: "a", version: "1" });
    const clientB = new Client({ name: "b", version: "1" });
    cleanups.push(() => clientA.close(), () => clientB.close());
    await Promise.all([clientA, clientB].map((c) => c.connect(new StreamableHTTPClientTransport(new URL(service.status.endpoint), { requestInit: { headers } }))));
    const args = { sessionId: session.getSnapshot().sessionId, expectedRevision: 0,
      operations: [{ type: "update_project", patch: { name: "Updated" } }] };
    const results = await Promise.all([clientA.callTool({ name: "chrona_apply", arguments: { ...args, requestId: "a" } }),
      clientB.callTool({ name: "chrona_apply", arguments: { ...args, requestId: "b" } })]);
    expect(results.filter((r) => r.isError)).toHaveLength(1);
    expect(session.getSnapshot().revision).toBe(1);
  });
});
