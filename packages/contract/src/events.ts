import { z } from 'zod';

/**
 * POST /v1/events (blueprint §12). Content-free events, batched by the client
 * and retried until acknowledged. The client-generated `id` (UUIDv7) is the
 * idempotency key: a retried event is stored at most once.
 *
 * Acknowledgement rule: a permanently invalid event is acknowledged in
 * `rejected` (so queues never stall); a transient database error returns 503
 * for the whole batch so the client retries it.
 */
export const eventSchema = z.object({
  id: z.uuid(),
  type: z.string().min(1).max(64),
  at: z.iso.datetime(),
  props: z.record(z.string().max(64), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).default({}),
});
export type AppEvent = z.input<typeof eventSchema>;

export const eventBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(100),
});

export const eventBatchResponseSchema = z.object({
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string().nullable(), reason: z.string() })),
});
export type EventBatchResponse = z.infer<typeof eventBatchResponseSchema>;
