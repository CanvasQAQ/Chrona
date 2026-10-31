import { useEffect, useState, useSyncExternalStore } from "react";
import type { TimingProject } from "../../domain/timing";
import { ProjectSession } from "./projectSession";

export function useProjectSession(initialProject: TimingProject) {
  const [session] = useState(() => new ProjectSession(initialProject));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    const bridge = window.chronaAgent;
    if (!bridge) return;
    return bridge.onRequest((request) => {
      const result = Date.now() >= request.deadline
        ? { error: { code: "TIMEOUT", message: "Expired before execution; read current state and retry." } }
        : session.handle(request.method, request.args);
      bridge.respond(request.id, result);
    });
  }, [session]);
  return { session, snapshot, project: snapshot.project, setProject: session.update };
}
