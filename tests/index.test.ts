import { describe, it, expect } from 'vitest';
import plugin from '../src/index.js';

describe('plugin', () => {
  it('exposes meta', () => {
    expect(plugin.meta.name).toBe('eslint-plugin-angular-typed-routes');
    expect(plugin.meta.version).toBe('0.1.0');
  });

  it('exposes resolver-must-be-typed rule', () => {
    expect(plugin.rules['resolver-must-be-typed']).toBeDefined();
  });

  it('exposes recommended config', () => {
    expect(plugin.configs['recommended']).toBeDefined();
  });
});
