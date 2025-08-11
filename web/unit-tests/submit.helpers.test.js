import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Load the script content and eval it in this context to populate window.* functions via happy-dom
const submitJsPath = path.join(process.cwd(), 'web/public/submit.js');
const scriptContent = fs.readFileSync(submitJsPath, 'utf-8');

describe('web/public/submit.js helpers', () => {
  beforeEach(() => {
    global.window = {};
    // eslint-disable-next-line no-eval
    eval(scriptContent);
  });

  it('bundlesForActivity should return bundles for an activity', () => {
    const catalog = { activities: [{ id: 'foo', bundles: ['a', 'b'] }] };
    expect(window.bundlesForActivity(catalog, 'foo')).toEqual(['a', 'b']);
    expect(window.bundlesForActivity(catalog, 'bar')).toEqual([]);
  });

  it('activitiesForBundle should return activity ids for a bundle', () => {
    const catalog = { activities: [
      { id: 'x', bundles: ['a'] },
      { id: 'y', bundles: ['b', 'a'] },
      { id: 'z', bundles: [] },
    ]};
    expect(window.activitiesForBundle(catalog, 'a').sort()).toEqual(['x','y']);
    expect(window.activitiesForBundle(catalog, 'c')).toEqual([]);
  });

  it('isActivityAvailable should check availability', () => {
    const catalog = { activities: [{ id: 'foo', bundles: ['a'] }] };
    expect(window.isActivityAvailable(catalog, 'foo', 'a')).toBe(true);
    expect(window.isActivityAvailable(catalog, 'foo', 'b')).toBe(false);
  });

  it('fetchCatalogText should fetch TOML text', async () => {
    const fakeToml = 'version = "1.0.0"';
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => fakeToml }));
    const txt = await window.fetchCatalogText('/product-catalog.toml');
    expect(txt).toBe(fakeToml);
  });
});
