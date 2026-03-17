import {resolverMustBeTyped} from './rules/resolver-must-be-typed.js';

// .js extension is required for module: NodeNext —
// TypeScript enforces this even for .ts source files.

const plugin = {
  meta: {
    name: 'eslint-plugin-angular-typed-routes',
    version: '0.1.0',
  },
  rules: {
    'resolver-must-be-typed': resolverMustBeTyped,
  },
  // Initialised as an empty object and populated after the plugin
  // declaration to avoid a self-referential circular dependency.
  configs: {} as Record<string, unknown>,
};

// Enables the single rule at error level with no additional options.
// Consumers can override the severity or pass options in their own config.
plugin.configs['recommended'] = {
  plugins: {'angular-typed-routes': plugin},
  rules: {
    'angular-typed-routes/resolver-must-be-typed': 'error',
  },
};

export default plugin;
