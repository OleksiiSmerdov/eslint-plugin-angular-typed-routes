import path from 'path';
import { fileURLToPath } from 'url';

import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import { resolverMustBeTyped } from '../src/rules/resolver-must-be-typed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// RuleTester must use vitest's it/describe to integrate
// with vitest's test runner and reporting.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parser: await import('@typescript-eslint/parser'),
    parserOptions: {
      // projectService is required for named resolver validation
      projectService: {
        allowDefaultProject: ['*.ts'],
      },
      tsconfigRootDir: path.resolve(__dirname, '..'),
    },
  },
});

tester.run('resolver-must-be-typed', resolverMustBeTyped, {
  valid: [
    // ✅ Inline resolver with explicit return type
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            user: (route: ActivatedRouteSnapshot): User => ({} as User),
          },
        }];
      `,
      options: [{}],
    },
    // ✅ Inline resolver with matching contract
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            user: (route: ActivatedRouteSnapshot): User => ({} as User),
          },
        }];
      `,
      options: [{ resolvers: { user: 'User' } }],
    },
    // ✅ Non-route object with resolve property — must not be flagged
    {
      code: `
        const config = {
          resolve: { something: () => true },
        };
      `,
      options: [{}],
    },
    // ✅ useTypeChecker: false — bypasses type checker entirely (covers line 81)
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            profile: (route): User => ({} as User),
          },
        }];
      `,
      options: [{ useTypeChecker: false }],
    },
    // ✅ Named resolver reference with no contract
    {
      code: `
        const userResolver = (route: unknown): User => ({} as User);
        const routes = [{
          path: 'profile',
          resolve: { user: userResolver },
        }];
      `,
      options: [{}],
    },
    // ✅ Contextual type Route confirmed via type checker (covers isRouteObjectByType)
    {
      code: `
        import { Routes } from '@angular/router';
        const routes: Routes = [{
          path: 'dashboard',
          resolve: {
            currentUser: (route): User => ({} as User),
          },
        }];
      `,
      options: [{}],
    },
    // ✅ Covers line 81: useTypeChecker: false with heuristic fallback
    {
      code: `
    const routes = [{
      path: 'settings',
      resolve: {
        settings: (route): Config => ({} as Config),
      },
    }];
  `,
      options: [{ useTypeChecker: false }],
    },

    // ✅ Covers 183-189: object without contextual type — null branch → heuristic
    {
      code: `
    const routes = [
      {
        canActivate: [],
        resolve: {
          data: (route): Data => ({} as Data),
        },
      },
    ];
  `,
      options: [{}],
    },

    // ✅ Covers 256-257: identifier that is not a callable function
    {
      code: `
    const notAFunction = 42;
    const routes = [{
      path: 'profile',
      resolve: { user: notAFunction },
    }];
  `,
      options: [{}],
    },
  ],

  invalid: [
    // ❌ missingReturnType — no annotation at all
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            user: (route) => ({}),
          },
        }];
      `,
      options: [{}],
      errors: [{ messageId: 'missingReturnType' }],
    },
    // ❌ weakReturnType — `any`
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            user: (route): any => ({}),
          },
        }];
      `,
      options: [{}],
      errors: [{ messageId: 'weakReturnType' }],
    },
    // ❌ weakReturnType — `unknown`
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            user: (route): unknown => ({}),
          },
        }];
      `,
      options: [{}],
      errors: [{ messageId: 'weakReturnType' }],
    },
    // ❌ wrongReturnType — annotated type does not match contract
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            user: (route): NavItem[] => [],
          },
        }];
      `,
      options: [{ resolvers: { user: 'User' } }],
      errors: [{ messageId: 'wrongReturnType' }],
    },
    // ⚠️ preferNamedResolver — inline function when warnOnInlineResolvers: true
    {
      code: `
        const routes = [{
          path: 'profile',
          resolve: {
            user: (route): User => ({} as User),
          },
        }];
      `,
      options: [{ warnOnInlineResolvers: true }],
      errors: [{ messageId: 'preferNamedResolver' }],
    },
    // ❌ wrongReturnType — named resolver returns wrong type (covers checkNamedResolver)
    {
      code: `
        const postsResolver = (route: unknown): Post[] => [];
        const routes = [{
          path: 'profile',
          resolve: { user: postsResolver },
        }];
      `,
      options: [{ resolvers: { user: 'User' } }],
      errors: [{ messageId: 'wrongReturnType' }],
    },
  ],
});
