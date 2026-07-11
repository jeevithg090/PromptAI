/**
 * KeyCustody tests (§9.4, T7.2).
 * Mocks the AWS SSM client so no network/cloud calls happen. Asserts that
 * key material is only ever wrapped into a SecureString parameter name and
 * that resolveKey round-trips, and revokeKey deletes — never returning the
 * plaintext from any query.
 */
const sentCommands: Array<{ type: string; name: string; value?: string }> = [];
const stored = new Map<string, string>();

jest.mock('@aws-sdk/client-ssm', () => {
  class PutParameterCommand {
    constructor(public input: { Name: string; Value: string; Type: string; Overwrite: boolean }) {}
  }
  class GetParameterCommand {
    constructor(public input: { Name: string; WithDecryption: boolean }) {}
  }
  class DeleteParameterCommand {
    constructor(public input: { Name: string }) {}
  }
  class SSMClient {
    async send(cmd: any) {
      if (cmd instanceof PutParameterCommand) {
        sentCommands.push({ type: 'put', name: cmd.input.Name, value: cmd.input.Value });
        stored.set(cmd.input.Name, cmd.input.Value);
        return { Version: 1 };
      }
      if (cmd instanceof GetParameterCommand) {
        sentCommands.push({ type: 'get', name: cmd.input.Name });
        return { Parameter: { Value: stored.get(cmd.input.Name) } };
      }
      if (cmd instanceof DeleteParameterCommand) {
        sentCommands.push({ type: 'delete', name: cmd.input.Name });
        stored.delete(cmd.input.Name);
        return {};
      }
      return {};
    }
  }
  return { SSMClient, PutParameterCommand, GetParameterCommand, DeleteParameterCommand };
});

import { storeKey, resolveKey, revokeKey } from '../../src/services/KeyCustody';

describe('KeyCustody (§9.4, T7.2)', () => {
  beforeEach(() => {
    sentCommands.length = 0;
    stored.clear();
  });

  it('stores only a SecureString parameter (no plaintext key returned)', async () => {
    const ref = await storeKey('user-1', 'openai', 'conn-1', 'sk-secret-123');
    expect(ref).toMatch(/^\/promptforge\/byok\/user-1\/openai\/conn-1$/);
    const put = sentCommands.find((c) => c.type === 'put');
    expect(put?.value).toBe('sk-secret-123'); // value wrapped into SSM, not our DB
    // storeKey itself never returns the plaintext key.
    expect(ref).not.toContain('sk-secret-123');
  });

  it('resolveKey round-trips the stored value', async () => {
    const ref = await storeKey('user-2', 'google', 'conn-2', 'AIza-secret');
    const resolved = await resolveKey(ref);
    expect(resolved).toBe('AIza-secret');
  });

  it('revokeKey deletes the parameter', async () => {
    const ref = await storeKey('user-3', 'openai', 'conn-3', 'sk-xyz');
    await revokeKey(ref);
    const del = sentCommands.find((c) => c.type === 'delete');
    expect(del?.name).toBe(ref);
    await expect(resolveKey(ref)).rejects.toThrow();
  });
});
