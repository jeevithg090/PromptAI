import { serve } from '@hono/node-server';
import { buildApp } from './handlers/routes';
import { config } from './config/env';
import { logger } from './utils/logger';

/**
 * Entry point — spec §23.2.
 * Deployed as a single Lambda behind a Function URL ("Lambdalith").
 * Locally runs as a plain Node server; in Lambda, the handler below adapts
 * Function URL events to Hono's Fetch API.
 */
export const app = buildApp();

/**
 * Lambda Function URL handler — invoked by AWS Lambda when a request hits the Function URL.
 * Converts Lambda's event format to a Web standard Request, routes through Hono, returns Response.
 */
export async function handler(event: any): Promise<any> {
  try {
    logger.info({ type: 'lambda:handler_invoked', path: event.rawPath, method: event.requestContext?.http?.method });

    const url = new URL(event.rawPath || event.path || '/', `https://${event.headers?.host || 'localhost'}`);
    if (event.rawQueryString) {
      url.search = event.rawQueryString;
    }

    const request = new Request(url.toString(), {
      method: event.requestContext?.http?.method || event.httpMethod || 'GET',
      headers: event.headers || {},
      body: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : undefined,
    });

    const response = await app.fetch(request);
    const responseBody = await response.text();

    logger.info({ type: 'lambda:handler_response', status: response.status, size: responseBody.length });

    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers),
      body: responseBody,
      isBase64Encoded: false,
    };
  } catch (err) {
    logger.error({ type: 'lambda:handler_error', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

if (require.main === module) {
  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ type: 'server:started', port: info.port, env: config.NODE_ENV });
  });
}
