/**
 * catalog/routes.yaml: one route per LLM function (blueprint §6 "Routing").
 * The schema is strict, so a key the adapter doesn't know (such as `temperature`) fails here.
 */
import { parse } from 'yaml';
import { z } from 'zod';

const effort = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
/** `off` is thinking disabled; `between_tools` is Claude Sonnet 5.5's way to turn it off. */
const thinkingMode = z.enum(['adaptive', 'off', 'between_tools']);
const role = z.enum(['cheap', 'standard', 'frontier']);
/** A gateway model id: `<creator>/<model>`. The creator is the model family. */
const modelId = z.string().regex(/^[a-z0-9-]+\/[a-z0-9.-]+$/);

const modelSchema = z.strictObject({
  /** $ per million tokens */
  price: z.strictObject({ in: z.number().nonnegative(), out: z.number().nonnegative() }),
  thinking: z.array(thinkingMode).min(1),
});

const routeSchema = z.strictObject({
  role,
  models: z.array(modelId).min(1),
  thinking: z.strictObject({ mode: thinkingMode, effort }),
  /** Includes thinking tokens. */
  maxOutputTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  capUsd: z.number().positive(),
});

const LOW_EFFORT = ['low', 'medium', 'high'];
const family = (id: string) => id.slice(0, id.indexOf('/'));

export const routesSchema = z
  .strictObject({
    version: z.literal(1),
    caps: z.strictObject({ cheap: z.number().positive(), standard: z.number().positive(), frontier: z.number().positive() }),
    models: z.record(modelId, modelSchema),
    functions: z.strictObject({
      understand: routeSchema,
      compose: routeSchema,
      verify: routeSchema,
      clean: routeSchema,
      answer: routeSchema,
      learn: routeSchema,
    }),
  })
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    for (const [fn, route] of Object.entries(r.functions)) {
      const at = ['functions', fn];
      const { mode, effort } = route.thinking;
      if (new Set(route.models).size !== route.models.length) issue([...at, 'models'], 'a model is listed twice');
      if (mode !== 'adaptive' && !LOW_EFFORT.includes(effort)) issue([...at, 'thinking'], `thinking ${mode} needs effort high or below`);
      if (route.capUsd > r.caps[route.role]) issue([...at, 'capUsd'], `above the ${route.role} cap of $${r.caps[route.role]}`);
      let outPrice = 0;
      route.models.forEach((id, i) => {
        const m = r.models[id];
        if (!m) {
          issue([...at, 'models', i], `${id} is not in models`);
          return;
        }
        if (!m.thinking.includes(mode)) issue([...at, 'models', i], `${id} does not accept thinking ${mode}`);
        outPrice = Math.max(outPrice, m.price.out);
      });
      if ((route.maxOutputTokens * outPrice) / 1e6 >= route.capUsd) issue([...at, 'capUsd'], 'maxOutputTokens alone reaches the cap');
    }
    const composeFamilies = new Set(r.functions.compose.models.map(family));
    r.functions.verify.models.forEach((id, i) => {
      if (composeFamilies.has(family(id))) issue(['functions', 'verify', 'models', i], `verify must come from a different family than compose (${family(id)})`);
    });
  });

export type Routes = z.output<typeof routesSchema>;
export type Route = Routes['functions']['understand'];
export type LlmFunction = keyof Routes['functions'];
export type Price = Routes['models'][string]['price'];

/** Parse and validate the text of catalog/routes.yaml. Throws on an invalid file. */
export function parseRoutes(yamlText: string): Routes {
  return routesSchema.parse(parse(yamlText));
}

export const costUsd = (price: Price, tokensIn: number, tokensOut: number) => (tokensIn * price.in + tokensOut * price.out) / 1e6;
