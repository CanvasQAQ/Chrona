export const AGENT_GUIDE = `Chrona is an interactive timing-diagram editor, not a static timing analyzer.
Read chrona_read before editing. The user may edit at any time. The live app is the authority.
All times are picoseconds (ps). Periods are at least 1 ps. A clock dutyCycle is a fraction (0.05 to 0.95), not a percentage.
Use stable IDs, never names or array positions. Choose IDs for new objects; a later operation in the same batch may reference them.
chrona_read returns sessionId and revision. Pass both as sessionId and expectedRevision to chrona_apply,
and a unique requestId. On REVISION_CONFLICT or SESSION_MISMATCH, read again, reconsider the changes,
then submit a new requestId. Never blindly retry a conflict with a newer revision.
After a network timeout only, retry the exact original request with the SAME requestId.
A replay returns the original result and currentRevision; it does not mean the original effects still exist after undo.
Successful request IDs are cached for up to 256 writes / 8 MiB in this editing session.
Each apply is atomic and is one Undo step. User and agent edits share the same Undo history.
Default read is a summary. Use signalIds for full signal definitions, includeProject for the full project,
or waveform {startPs,endPs} for resolved points/events in a time range. Read dependency sources too when relevant.
create_signal accepts kind clock, data, or derived. A derived signal is stored as Data with sourceType sequential.
For derived Q, edit derivation or input sources, never its pattern. DFF triggers rising/falling; latch triggers high/low and requires d2q.
Delay ranges require minPs <= currentPs <= maxPs. Delay edge indexes are ONE-BASED.
put_delay/put_constraint replace a relation by ID. Only one source delay is allowed per target signal.
Deleting referenced signals requires deleting/updating dependent relations and derived signals in the same batch.
create_bus generates channel IDs; read them before editing channels. update_bus updates non-overridden channel defaults.
Editing a bus channel's pattern/startPs/periodPs creates its local override. Individual channels cannot be deleted.
Bus resizing, groups, arbitrary file access and saving/export are not exposed in this first API.
Automation limits: 100 operations per batch, 1024 signals, 4096 pattern items and relations, 100000 estimated waveform steps, 5000 returned waveform points/events, 1 MiB HTTP request. Narrow the range/IDs when a waveform read is too large.
There are no push subscriptions in this version. Refresh before writes and after conflicts.
Do not claim timing violations establish real hardware correctness; Chrona draws explanatory diagrams.
Example batch after reading an empty project (replace the session/revision):
{"sessionId":"FROM_READ","expectedRevision":0,"requestId":"example-1","operations":[
{"type":"create_signal","signal":{"id":"clk","kind":"clock","name":"CLK","periodPs":1000}},
{"type":"create_signal","signal":{"id":"data","kind":"data","name":"D","periodPs":500,"pattern":["0","1","1","0"]}}
]}`;
