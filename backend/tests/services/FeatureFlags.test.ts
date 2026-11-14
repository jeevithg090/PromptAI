const mockQuery = jest.fn();
jest.mock('../../src/utils/db', () => ({ getPool: () => ({ query: mockQuery }) }));

import { isEnabled, invalidateCache } from '../../src/services/FeatureFlags';

describe('FeatureFlags', () => {
  beforeEach(() => {
    invalidateCache();
    mockQuery.mockReset().mockResolvedValue({
      rows: [
        { key: 'drafting', value: false },
        { key: 'preview', value: 'true' },
      ],
    });
  });

  it('reads explicit flag values from the table', async () => {
    expect(await isEnabled('drafting')).toBe(false);
    expect(await isEnabled('preview')).toBe(true);
  });

  it('defaults flags absent from the table to enabled', async () => {
    expect(await isEnabled('not-a-flag')).toBe(true);
  });

  it('caches defaults for absent flags instead of querying on every call', async () => {
    await isEnabled('not-a-flag');
    await isEnabled('not-a-flag');
    await isEnabled('drafting');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('fails open when the DB is unavailable', async () => {
    mockQuery.mockRejectedValue(new Error('no db'));
    expect(await isEnabled('drafting')).toBe(true);
  });

  it('re-reads the table after invalidateCache()', async () => {
    await isEnabled('drafting');
    invalidateCache();
    await isEnabled('drafting');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
