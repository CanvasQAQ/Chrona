import { ActionIcon, Alert, Badge, Button, Code, Group, Modal, PasswordInput, Stack, Text, Tooltip } from "@mantine/core";
import { Bot, Copy, Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectSession, SessionSnapshot } from "./projectSession";

export function AgentPanel({ session, snapshot }: { session: ProjectSession; snapshot: SessionSnapshot }) {
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<AgentConnectionStatus>({ enabled: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const bridge = window.chronaAgent;
  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge.getStatus().then((value) => { if (live) setStatus(value); }).catch((e) => { if (live) setError(String(e)); });
    const off = bridge.onStatus(setStatus);
    return () => { live = false; off(); };
  }, [bridge]);
  const changeEnabled = async () => {
    if (!bridge) return;
    setBusy(true); setError(""); setCopied(false);
    try { setStatus(await bridge.setEnabled(!status.enabled)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const config = JSON.stringify({ mcpServers: { chrona: {
    url: status.endpoint, headers: { Authorization: `Bearer ${status.token}` },
  } } }, null, 2);
  return <>
    <Tooltip label="Undo last project edit"><ActionIcon variant="subtle" color="gray" size="lg" aria-label="Undo last project edit" disabled={!snapshot.canUndo} onClick={session.undo}><Undo2 size={18} /></ActionIcon></Tooltip>
    <Tooltip label="Redo project edit"><ActionIcon variant="subtle" color="gray" size="lg" aria-label="Redo project edit" disabled={!snapshot.canRedo} onClick={session.redo}><Redo2 size={18} /></ActionIcon></Tooltip>
    <Tooltip label={status.enabled ? `Agent access enabled · ${snapshot.activity}` : "Agent connection"}>
      <Button variant={status.enabled ? "light" : "subtle"} size="sm" leftSection={<Bot size={17} />} onClick={() => setOpened(true)}>Agent{status.enabled ? " · On" : ""}</Button>
    </Tooltip>
    <Modal opened={opened} onClose={() => setOpened(false)} title="Agent connection" centered size="lg">
      <Stack gap="md">
        <Text size="sm">Connect a local MCP client to edit this live project. Changes appear on the canvas and can be undone with the toolbar controls.</Text>
        <Group justify="space-between"><Badge color={status.enabled ? "green" : "gray"}>{status.enabled ? "Access enabled" : "Access disabled"}</Badge>
          <Button disabled={!bridge} loading={busy} variant={status.enabled ? "light" : "filled"} onClick={() => void changeEnabled()}>{status.enabled ? "Disable access" : "Enable local access"}</Button></Group>
        {!bridge && <Alert title="Desktop app required">Open the Electron desktop app to enable MCP. Browser preview supports editing but does not open a local agent service.</Alert>}
        {error && <Alert color="red" title="Connection error">{error}</Alert>}
        {status.enabled && <>
          <Text size="sm" fw={600}>Streamable HTTP endpoint</Text><Code block>{status.endpoint}</Code>
          <PasswordInput label="Connection token" readOnly value={status.token ?? ""} description="New address and token each time access is enabled. Configuration contains this token; share only with your local agent." />
          <Button variant="light" leftSection={<Copy size={15} />} onClick={() => {
            void navigator.clipboard.writeText(config).then(() => setCopied(true)).catch(() => setError("Could not copy configuration. Copy the endpoint and token manually."));
          }}>{copied ? "Configuration copied" : "Copy MCP configuration"}</Button>
          <Text size="xs" c="dimmed">Generic JSON configuration uses mcpServers.chrona.url and an Authorization header (Bearer token). Adapt the configuration keys to your client's format. Start by asking the agent to read chrona://guide and chrona_read.</Text>
        </>}
        <Stack gap={4}><Text size="sm" fw={600}>Current editing session · revision {snapshot.revision}</Text>
          <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>{snapshot.sessionId}</Text>
          <Text size="sm">{snapshot.activity}</Text>
          <Text size="xs" c="dimmed">Writes based on an old revision are rejected. Opening a project starts a new session. Undo history stays in memory.</Text>
        </Stack>
      </Stack>
    </Modal>
  </>;
}
