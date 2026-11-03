const { randomUUID } = require("node:crypto");
const { createAgentService } = require("./agent-service.cjs");

function installAgentIpc(ipcMain, app) {
  const states = new Map();
  const pending = new Map();
  const disabled = { enabled: false };
  const stateFor = (sender) => {
    if (!states.has(sender.id)) {
      const state = { service: null, busy: false, sender, generation: 0 };
      states.set(sender.id, state);
      sender.on("did-start-loading", () => { void stop(state); });
      sender.once("destroyed", () => { void stop(state); states.delete(sender.id); });
    }
    return states.get(sender.id);
  };
  async function stop(state) {
    state.generation++;
    const service = state.service; state.service = null;
    for (const [id, item] of pending) if (item.senderId === state.sender.id) {
      clearTimeout(item.timer); pending.delete(id);
      item.resolve({ error: { code: "DISCONNECTED", message: "Agent access stopped. Read the project again after reconnecting." } });
    }
    if (!state.sender.isDestroyed()) state.sender.send("agent:status", disabled);
    if (service) await service.close();
  }
  ipcMain.handle("agent:status", (event) => stateFor(event.sender).service?.status ?? disabled);
  ipcMain.handle("agent:set-enabled", async (event, enabled) => {
    if (typeof enabled !== "boolean") throw new Error("Expected boolean");
    const sender = event.sender;
    const state = stateFor(sender);
    if (state.busy) throw new Error("Agent connection is changing. Try again.");
    state.busy = true;
    try {
      if (!enabled) { await stop(state); return disabled; }
      if (state.service) return state.service.status;
      const generation = state.generation;
      const service = await createAgentService((method, args) => new Promise((resolve) => {
        if (sender.isDestroyed() || !state.service) return resolve({ error: { code: "DISCONNECTED", message: "Chrona is unavailable" } });
        const id = randomUUID(); const deadline = Date.now() + 15000;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ error: { code: "TIMEOUT", message: "Renderer did not respond. Retry the exact requestId after reconnecting; do not issue a duplicate create." } });
        }, 15000);
        pending.set(id, { senderId: sender.id, resolve, timer });
        sender.send("agent:request", { id, method, args, deadline });
      }));
      if (sender.isDestroyed() || state.generation !== generation) { await service.close(); return disabled; }
      state.service = service;
      sender.send("agent:status", service.status);
      return service.status;
    } finally { state.busy = false; }
  });
  ipcMain.on("agent:response", (event, id, result) => {
    const item = pending.get(id);
    if (!item || item.senderId !== event.sender.id) return;
    pending.delete(id); clearTimeout(item.timer); item.resolve(result);
  });
  app.on("will-quit", () => { for (const state of states.values()) void stop(state); });
}
module.exports = { installAgentIpc };
