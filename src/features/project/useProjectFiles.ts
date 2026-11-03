import { useEffect, useRef, useState } from "react";
import type { TimingProject } from "../../domain/timing";
import type { ProjectSession } from "../agent/projectSession";
import { downloadTextFile, parseTimingProject } from "./projectSerialization";

const pickerOptions = { types: [{ description: "Chrona project", accept: { "application/json": [".json"] } }] };
type ProjectFile = ProjectFileInfo & { handle?: FileSystemFileHandle };
type Candidate = { project: TimingProject; file: ProjectFile };

export function useProjectFiles(session: ProjectSession, defaults: Parameters<typeof parseTimingProject>[1],
  onOpened: (project: TimingProject) => void, status: (message: string) => void) {
  const [file, setFile] = useState<ProjectFile | null>(null);
  const [pending, setPending] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const { project, isDirty } = session.getSnapshot();
  const label = file?.name ?? project.name;
  const canWrite = Boolean(window.chronaFiles || window.showSaveFilePicker || file?.handle);

  useEffect(() => { document.title = `${isDirty ? "* " : ""}${label} — Chrona`; }, [label, isDirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (session.getSnapshot().isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [session]);

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        status(error instanceof Error ? error.message : "Project file operation failed");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function accept(candidate: Candidate) {
    session.open(candidate.project);
    setFile(candidate.file);
    setPending(null);
    onOpened(candidate.project);
    status(`Opened ${candidate.file.name}`);
  }
  function read(text: string, source: ProjectFile) {
    const result = parseTimingProject(text, defaults);
    if (!result.ok) {
      status(result.reason === "unsupported" ? "This project uses an unsupported schema" : "Could not read this project file");
      return;
    }
    const candidate = { project: result.project, file: source };
    if (session.getSnapshot().isDirty) setPending(candidate);
    else accept(candidate);
  }
  function open() {
    return run(async () => {
      if (window.chronaFiles) {
        const opened = await window.chronaFiles.open();
        if (opened) read(opened.text, { name: opened.name, path: opened.path });
      } else if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker(pickerOptions);
        const selected = await handle.getFile();
        read(await selected.text(), { name: selected.name, handle });
      } else {
        input.current?.click();
      }
    });
  }
  function importFile(selected: File) {
    return run(async () => read(await selected.text(), { name: selected.name }));
  }
  function save(saveAs = false) {
    return run(async () => {
      const current = session.getSnapshot().project;
      const name = file?.name ?? `${current.name.toLowerCase().replace(/\s+/g, "-")}.chrona.json`;
      const text = JSON.stringify(current, null, 2);
      let target: ProjectFile;
      if (window.chronaFiles) {
        const saved = await window.chronaFiles.save({ currentPath: file?.path, saveAs, name, text });
        if (!saved) return;
        target = saved;
      } else {
        const handle = (!saveAs && file?.handle) || await window.showSaveFilePicker?.({
          ...pickerOptions, suggestedName: name, ...(file?.handle && { startIn: file.handle }),
        });
        if (!handle) {
          downloadTextFile(name, text, "application/json");
          status(`Downloading a copy of ${name} · this browser cannot write back to the original file`);
          return;
        }
        const writer = await handle.createWritable();
        await writer.write(text);
        await writer.close();
        target = { name: handle.name, handle };
      }
      setFile(target);
      session.markSaved(current);
      status(`Saved ${target.name}`);
    });
  }
  return { label, path: file?.path, isDirty, input, busy, canWrite, open, importFile, save, pending,
    cancelOpen: () => setPending(null), discardAndOpen: () => { if (pending) accept(pending); } };
}
