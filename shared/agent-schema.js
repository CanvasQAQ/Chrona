import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const name = z.string().trim().min(1).max(200);
const time = z.number().finite().min(0).max(1e9);
const period = time.min(1);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const pattern = z.array(z.string().min(1).max(128)).min(1).max(4096);
const range = z.object({ minPs: time, currentPs: time, maxPs: time }).strict();
const derivation = z.object({
  device: z.enum(["dff", "latch"]), clockSignalId: id, dataSignalId: id,
  trigger: z.enum(["rising", "falling", "high", "low"]), c2q: range,
  d2q: range.optional(), initialValue: z.string().min(1).max(128),
}).strict();
const base = {
  id, name, startPs: time.default(0), visible: z.boolean().default(true),
  color: color.default("#7950f2"), periodPs: period,
};
const clock = z.object({ ...base, kind: z.literal("clock"), phasePs: time.default(0),
  dutyCycle: z.number().finite().min(0.05).max(0.95).default(0.5) }).strict();
const data = z.object({ ...base, kind: z.literal("data"), pattern }).strict();
const derived = z.object({ ...base, kind: z.literal("derived"), derivation }).strict();
const patch = z.object({
  name: name.optional(), startPs: time.optional(), visible: z.boolean().optional(),
  color: color.optional(), periodPs: period.optional(), phasePs: time.optional(),
  dutyCycle: z.number().finite().min(0.05).max(0.95).optional(), pattern: pattern.optional(),
  derivation: derivation.optional(),
}).strict();
const rule = z.object({ prefix: z.string().max(64), start: z.number().finite(),
  channelStep: z.number().finite(), timeStep: z.number().finite(),
  length: z.number().int().min(1).max(4096) }).strict();
const edge = z.number().int().min(1).max(100000);
const polarity = z.enum(["rising", "falling", "both", "transition"]);
const relation = { id, sourceSignalId: id, targetSignalId: id, sourceEdge: edge, targetEdge: edge };
export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_signal"), signal: z.discriminatedUnion("kind", [clock, data, derived]) }).strict(),
  z.object({ type: z.literal("update_signal"), id, patch }).strict(),
  z.object({ type: z.literal("delete_signal"), id }).strict(),
  z.object({ type: z.literal("create_bus"), bus: z.object({ id, name, width: z.number().int().min(1).max(256),
    startPs: time.default(0), periodPs: period, rule: rule.optional() }).strict() }).strict(),
  z.object({ type: z.literal("update_bus"), id, patch: z.object({ name: name.optional(),
    startPs: time.optional(), periodPs: period.optional(), rule: rule.optional(),
    visible: z.boolean().optional(), displayMode: z.enum(["collapsed", "selected", "all"]).optional(),
    selectedChannels: z.array(z.number().int().min(0).max(255)).max(256).optional(),
  }).strict() }).strict(),
  z.object({ type: z.literal("delete_bus"), id }).strict(),
  z.object({ type: z.literal("put_delay"), delay: z.object({ ...relation,
    label: name.optional(), minPs: time, currentPs: time, maxPs: time }).strict() }).strict(),
  z.object({ type: z.literal("delete_delay"), id }).strict(),
  z.object({ type: z.literal("put_constraint"), constraint: z.object({ ...relation,
    sourceEdges: z.array(edge).max(4096).optional(), targetEdges: z.array(edge).max(4096).optional(),
    sourceEdgeKind: polarity.optional(), targetEdgeKind: polarity.optional(), setupPs: time, holdPs: time,
  }).strict() }).strict(),
  z.object({ type: z.literal("delete_constraint"), id }).strict(),
  z.object({ type: z.literal("update_project"), patch: z.object({ name: name.optional(), durationPs: period.optional() }).strict() }).strict(),
]);
export const transactionSchema = z.object({
  sessionId: z.string().min(1).max(128), expectedRevision: z.number().int().nonnegative(),
  requestId: id, operations: z.array(operationSchema).min(1).max(100),
}).strict();
export const readSchema = z.object({
  sessionId: z.string().min(1).max(128).optional(),
  signalIds: z.array(id).max(256).optional(), includeProject: z.boolean().default(false),
  waveform: z.object({ startPs: time, endPs: period }).strict().optional(),
}).strict();
