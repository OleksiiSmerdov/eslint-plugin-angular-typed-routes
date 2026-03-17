# eslint-plugin-angular-typed-routes

[![npm version](https://img.shields.io/npm/v/eslint-plugin-angular-typed-routes)](https://www.npmjs.com/package/eslint-plugin-angular-typed-routes)
[![CI](https://github.com/OleksiiSmerdov/eslint-plugin-angular-typed-routes/actions/workflows/ci.yml/badge.svg)](https://github.com/OleksiiSmerdov/eslint-plugin-angular-typed-routes/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/OleksiiSmerdov/eslint-plugin-angular-typed-routes)](https://codecov.io/gh/OleksiiSmerdov/eslint-plugin-angular-typed-routes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An ESLint plugin that enforces explicit, consistent return types on Angular route resolvers — catching type mismatches at lint time before they surface as runtime bugs.

---

## The Problem

Angular's `Route` type defines the `resolve` map as:
```ts
resolve?: ResolveData;
// where ResolveData = { [key: string]: ResolveFn<unknown> }
```

This means TypeScript silently accepts any resolver for any key, regardless of what the resolver actually returns. A resolver registered under `breadcrumbs` could return `User[]` and neither the compiler nor the IDE would warn you.

The downstream consequence is equally silent: `ActivatedRoute.snapshot.data` is typed as `{ [name: string]: any }`, so every consumer of resolver data works with `any` — effectively opting out of the type system for an entire data-loading layer of the application.

This plugin closes that gap at the **point of definition**: the route configuration file.

---

## What This Plugin Does

- Requires every resolver function to have an **explicit return type annotation**
- Rejects **weak types** (`any`, `unknown`) as resolver return types
- Optionally enforces that a given resolver key **always returns a specific type**, configured centrally in `eslint.config.ts`
- Optionally warns when resolvers are defined as **inline anonymous functions** rather than named, reusable `ResolveFn<T>` constants
- Works with both **inline arrow functions** and **named resolver references**
- Uses the **TypeScript compiler API** (via `@typescript-eslint/utils`) for accurate type resolution — not string matching

---

## Requirements

| Dependency                  | Version               |
|-----------------------------|-----------------------|
| ESLint                      | ≥ 9.0.0 (flat config) |
| `@typescript-eslint/parser` | ≥ 8.0.0               |
| TypeScript                  | ≥ 5.0.0               |
| Angular                     | ≥ 17.0.0              |

> **Note:** `parserOptions.project` must be configured to enable full TypeScript type checking. Without it, named resolver references (identifiers) cannot be validated.

---

## Installation
```bash
npm install --save-dev eslint-plugin-angular-typed-routes
```

---

## Configuration

Add the plugin to your `eslint.config.ts`:
```ts
import angularTypedRoutes from 'eslint-plugin-angular-typed-routes';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: { 'angular-typed-routes': angularTypedRoutes },
    rules: {
      'angular-typed-routes/resolver-must-be-typed': [
        'error',
        {
          warnOnInlineResolvers: true,
          resolvers: {
            breadcrumbs: 'Breadcrumb[]',
            user:        { returnType: 'User' },
            config:      'Observable<AppConfig>',
            items:       'Item[] | null',
          },
        },
      ],
    },
  }
);
```

Or use the bundled `recommended` configuration:
```ts
import angularTypedRoutes from 'eslint-plugin-angular-typed-routes';

export default [
  ...angularTypedRoutes.configs['recommended'],
];
```

---

## Rules

### `resolver-must-be-typed`

The plugin currently exposes one rule that covers all enforcement scenarios.

#### Options
```ts
{
  // Emit a warning when a resolver is an inline anonymous function
  // rather than a named ResolveFn<T> constant.
  // Default: false
  warnOnInlineResolvers?: boolean;

  // Enable TypeScript type checker integration.
  // Requires parserOptions.project to be configured.
  // Default: true
  useTypeChecker?: boolean;

  // Per-key type contracts. The key is the resolver name as it appears
  // in the route's resolve map. The value is either a plain string
  // (shorthand) or an object with a returnType field (extended form).
  resolvers?: {
    [resolverKey: string]: string | { returnType: string };
  };
}
```

#### Type string syntax
```ts
resolvers: {
  title:       'string',
  count:       'number',
  user:        'User',
  breadcrumbs: 'Breadcrumb[]',
  tags:        'Array<Tag>',
  config:      'Observable<AppConfig>',
  data:        'Promise<PageData>',
  value:       'Signal<string>',
  result:      'User | null',
  entity:      'Named & Timestamped',
}
```

---

## Error Messages

| Message ID               | When it fires                                                                         |
|--------------------------|---------------------------------------------------------------------------------------|
| `missingReturnType`      | Resolver function has no return type annotation at all                                |
| `weakReturnType`         | Resolver return type is `any` or `unknown`                                            |
| `wrongReturnType`        | Resolver return type does not match the configured contract for that key              |
| `unresolvedExpectedType` | The type string in `resolvers` config could not be resolved in the current file scope |
| `preferNamedResolver`    | Resolver is an inline anonymous function (only with `warnOnInlineResolvers: true`)    |

---

## Examples

Given this `resolvers` configuration:
```ts
resolvers: {
  breadcrumbs: 'Breadcrumb[]',
  user:        'User',
}
```
```ts
export const routes: Route[] = [
  {
    path: 'profile',
    loadComponent: () => import('./profile.component').then(m => m.ProfileComponent),
    resolve: {

      // ✅ OK — explicit type, matches contract
      breadcrumbs: (route: ActivatedRouteSnapshot): Breadcrumb[] => [],

      // ✅ OK — named resolver, TypeScript infers ResolveFn<User>
      user: userResolver,

      // ❌ missingReturnType — no annotation
      breadcrumbs: (route) => [],

      // ❌ weakReturnType — any is not acceptable
      breadcrumbs: (route): any => [],

      // ❌ wrongReturnType — NavItem[] is not assignable to Breadcrumb[]
      breadcrumbs: (route): NavItem[] => [],

      // ❌ wrongReturnType — userResolver returns Post[], not User
      user: postsResolver,

      // ⚠️ preferNamedResolver (if warnOnInlineResolvers: true)
      user: (route): User => ({} as User),
    },
  },
];
```

---

## How It Works

### Route detection

The plugin first attempts to determine whether an object literal is typed as Angular's `Route` using `TypeChecker.getContextualType()`. If the contextual type is unavailable (e.g. the array has no explicit type annotation), it falls back to a heuristic: an object is treated as a Route if it contains at least one well-known `Route` property key (`path`, `component`, `loadComponent`, etc.).

### Type resolution for inline functions

For inline arrow functions and function expressions, the plugin reads the TypeScript AST return type annotation directly. This is fast and does not require the full type checker.

### Type resolution for named references

For identifier references (e.g. `resolve: { user: userResolver }`), the plugin uses `TypeChecker.getTypeAtLocation()` and `getSignaturesOfType()` to extract the actual return type of the referenced function. This requires `parserOptions.project` to be configured.

### Contract verification

When a key has a configured contract in `resolvers`, the plugin resolves the expected type string against the TypeScript scope of the route file and compares it against the actual return type using assignability — the same check the TypeScript compiler performs for assignment expressions.

---

## Pairing with a Global Type Registry

For full end-to-end type safety — from resolver definition through to component consumption — this plugin works best alongside a project-wide resolver type registry based on declaration merging:
```ts
// src/types/route-data.d.ts
interface RouteDataMap {
  // Extended by each resolver's own file
}
```
```ts
// breadcrumbs.resolver.ts
declare global {
  interface RouteDataMap {
    breadcrumbs: Breadcrumb[];
  }
}

export const breadcrumbsResolver: ResolveFn<Breadcrumb[]> = ...;
```
```ts
// typed-route-data.service.ts
@Injectable({ providedIn: 'root' })
export class RouteDataService {
  private route = inject(ActivatedRoute);

  snapshot<K extends keyof RouteDataMap>(key: K): RouteDataMap[K] {
    return this.route.snapshot.data[key] as RouteDataMap[K];
  }

  observe<K extends keyof RouteDataMap>(key: K): Observable<RouteDataMap[K]> {
    return this.route.data.pipe(map(data => data[key] as RouteDataMap[K]));
  }
}
```

---

## Comparison With Alternative Approaches

| Approach                   | Detects wrong type at definition   | Typed consumption in components   | Works with standalone `ResolveFn`  | Enforces for whole team   |
|----------------------------|------------------------------------|-----------------------------------|------------------------------------|---------------------------|
| **This plugin**            | ✅                                  | ❌ (needs service wrapper)         | ✅                                  | ✅                         |
| `satisfies` operator       | ✅ (per-route, manual)              | ❌                                 | ✅                                  | ❌                         |
| `RouteDataMap` + factory   | ✅                                  | ✅ (via service)                   | ✅                                  | ⚠️ (opt-in)               |
| `ts-patch` transformer     | ✅                                  | ✅                                 | ✅                                  | ✅                         |
| TypeScript decorators      | ❌                                  | ❌                                 | ❌                                  | ❌                         |

---

## Limitations

- **`resolve` object must be an inline literal.** If `resolve` is assigned from a variable (`resolve: myResolveMap`), the plugin does not analyze the variable's contents.
- **Imported types must be present in the route file.** The type string in `resolvers` is resolved against the scope of the file being linted.
- **`isTypeAssignableTo` is an internal TypeScript API.** It is widely used by `typescript-eslint` and `angular-eslint`, but it is not part of the public `ts` surface.
- **Generic wrapper types** (`Observable<T>`, `Promise<T>`, `Signal<T>`) require the outer class or interface to be resolvable in scope.
- **Dynamic resolver keys** (computed properties, string variables) are reported as `<unknown>` and skipped.

---

## Contributing

Bug reports and pull requests are welcome.

### Development setup
```bash
git clone https://github.com/OleksiiSmerdov/eslint-plugin-angular-typed-routes.git
cd eslint-plugin-angular-typed-routes
npm install
```

### Useful commands
```bash
npm run build          # compile to dist/
npm test               # run tests
npm run test:coverage  # run tests with coverage report
npm run lint           # lint source files
```

### Submitting a pull request

1. Fork the repository and create a branch from `main`
2. Make your changes and add tests
3. Ensure `npm test` and `npm run build` pass
4. Open a pull request with a clear description of the change

When reporting a bug, please include a minimal reproduction showing the route configuration that triggers (or fails to trigger) the rule.

---

## License

MIT
