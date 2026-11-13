/**
 * BYOK key custody — AWS SSM SecureString (§9.4, T7.2).
 * Keys are envelope-encrypted at rest by SSM, decrypted only ephemerally
 * at call time. No key material is ever stored in the database or logs.
 *
 * IAM policy required (documented in README):
 * {
 *   "Version": "2012-10-17",
 *   "Statement": [{
 *     "Effect": "Allow",
 *     "Action": ["ssm:PutParameter","ssm:GetParameter","ssm:DeleteParameter"],
 *     "Resource": "arn:aws:ssm:*:*:parameter/promptforge/byok/*"
 *   }]
 * }
 */

import { SSMClient, PutParameterCommand, GetParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import { logger } from '../utils/logger';

const SSM_PATH_PREFIX = '/promptforge/byok';

const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

function paramName(userId: string, provider: string, connId: string): string {
  return `${SSM_PATH_PREFIX}/${userId}/${provider}/${connId}`;
}

/**
 * Store a provider API key as an SSM SecureString parameter.
 * Returns the secret reference string (server-internal, not exposed to clients).
 */
export async function storeKey(userId: string, provider: string, connId: string, plaintextKey: string): Promise<string> {
  const name = paramName(userId, provider, connId);
  await ssm.send(new PutParameterCommand({
    Name: name,
    Value: plaintextKey,
    Type: 'SecureString',
    Overwrite: false, // fail if already exists (use revoke+re-create cycle)
  }));
  logger.info({ type: 'byok:key_stored', userId, provider });
  return name;
}

/**
 * Resolve a secret reference to a plaintext API key.
 * Decrypted in-memory — never cached beyond the request, never logged.
 */
export async function resolveKey(secretRef: string): Promise<string> {
  const res = await ssm.send(new GetParameterCommand({
    Name: secretRef,
    WithDecryption: true,
  }));
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${secretRef} returned no value`);
  return value;
}

/**
 * Revoke a key by deleting the SSM parameter. Idempotent: a parameter that is
 * already gone (a retried revoke or account deletion) counts as revoked.
 */
export async function revokeKey(secretRef: string): Promise<void> {
  try {
    await ssm.send(new DeleteParameterCommand({ Name: secretRef }));
  } catch (error) {
    if ((error as { name?: string }).name !== 'ParameterNotFound') throw error;
  }
  logger.info({ type: 'byok:key_revoked', secretRef: secretRef.replace(/\/[^/]+$/, '/***') });
}
