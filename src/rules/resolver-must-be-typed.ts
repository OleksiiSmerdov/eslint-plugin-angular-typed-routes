import {AST_NODE_TYPES, ESLintUtils, TSESTree} from '@typescript-eslint/utils';
import ts from 'typescript';
import type {RuleOptions} from '../types.js';

type MessageIds =
  | 'missingReturnType'
  | 'weakReturnType'
  | 'wrongReturnType'
  | 'unresolvedExpectedType'
  | 'preferNamedResolver';

// RuleCreator attaches a documentation URL to every rule,
// which ESLint surfaces in error output and editor tooltips.
const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/OleksiiSmerdov/eslint-plugin-angular-typed-routes/blob/main/docs/rules/${name}.md`
);

// All known Angular Route interface keys except `resolve`.
// An object is treated as a Route only if it contains at least one of these.
// `resolve` is intentionally excluded to prevent false positives on plain
// objects that happen to have a `resolve` property.
const ROUTE_KEYS = new Set([
  'title',
  'path',
  'pathMatch',
  'matcher',
  'component',
  'loadComponent',
  'redirectTo',
  'outlet',
  'canActivate',
  'canMatch',
  'canActivateChild',
  'canDeactivate',
  'canLoad',
  'data',
  'children',
  'loadChildren',
  'runGuardsAndResolvers',
  'providers',
]);

/**
 * Normalises both contract forms to a plain return-type string.
 * 'User'               → 'User'
 * { returnType: 'User' } → 'User'
 */
function normalizeReturnType(
  value: NonNullable<RuleOptions['resolvers']>[string]
): string {
  return typeof value === 'string' ? value : value.returnType;
}

/**
 * Primary check: uses TypeScript's contextual type to determine whether
 * the object literal is typed as Angular's `Route`.
 * Returns null if the type checker is unavailable or the type cannot be resolved.
 */
function isRouteObjectByType(
  node: TSESTree.ObjectExpression,
  services: ReturnType<typeof ESLintUtils.getParserServices>,
  checker: ts.TypeChecker
): boolean | null {
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  const contextualType = checker.getContextualType(tsNode as ts.Expression);
  if (!contextualType) return null;

  // Handle union types (e.g. Route | undefined) by checking each constituent
  const types = contextualType.isUnion()
    ? contextualType.types
    : [contextualType];

  return types.some((t) => {
    const symbol = t.getSymbol();
    return (
      symbol?.getName() === 'Route' &&
      // Ensure it's from @angular/router and not an unrelated `Route` type
      symbol
        .getDeclarations()
        ?.some((d) => d.getSourceFile().fileName.includes('@angular/router'))
    );
  });
}

/**
 * Fallback heuristic: treats an object as a Route if it contains
 * at least one well-known Angular Route property key (excluding `resolve`
 * to avoid false positives on plain objects).
 * Used when the type checker is unavailable or returns no contextual type.
 */
function isRouteObjectByHeuristic(node: TSESTree.ObjectExpression): boolean {
  return node.properties.some(
    (prop) =>
      prop.type === AST_NODE_TYPES.Property &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      ROUTE_KEYS.has((prop.key as TSESTree.Identifier).name)
  );
}

/**
 * Returns true if the type node is `any` or `unknown` —
 * both are rejected as resolver return types.
 */
function isWeakTypeNode(typeNode: TSESTree.TypeNode): boolean {
  return (
    typeNode.type === AST_NODE_TYPES.TSAnyKeyword ||
    typeNode.type === AST_NODE_TYPES.TSUnknownKeyword
  );
}

export const resolverMustBeTyped = createRule<[RuleOptions], MessageIds>({
  name: 'resolver-must-be-typed',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce explicit return types on Angular route resolvers',
    },
    schema: [
      {
        type: 'object',
        properties: {
          warnOnInlineResolvers: {type: 'boolean'},
          useTypeChecker: {type: 'boolean'},
          resolvers: {
            type: 'object',
            additionalProperties: {
              oneOf: [
                {type: 'string'},
                {
                  type: 'object',
                  properties: {returnType: {type: 'string'}},
                  required: ['returnType'],
                  additionalProperties: false,
                },
              ],
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingReturnType:
        'Resolver for "{{key}}" must have an explicit return type annotation.',
      weakReturnType:
        'Resolver for "{{key}}" must not use `any` or `unknown` as return type.',
      wrongReturnType:
        'Resolver for "{{key}}" returns {{actual}} but expected {{expected}}.',
      unresolvedExpectedType:
        'Expected type "{{type}}" for resolver "{{key}}" could not be resolved in the current file scope.',
      preferNamedResolver:
        'Resolver for "{{key}}" should be a named ResolveFn<T> constant rather than an inline function.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const {
      warnOnInlineResolvers = false,
      useTypeChecker = true,
      resolvers: resolverContracts = {},
    } = options;

    // TypeChecker is only initialised when useTypeChecker is true and
    // parserOptions.project is configured. Named resolver references
    // cannot be validated without it.
    const services = useTypeChecker
      ? ESLintUtils.getParserServices(context)
      : null;
    const checker = services?.program.getTypeChecker() ?? null;

    // ─── Helpers ────────────────────────────────────────────────────────────

    /**
     * Returns the string name of a property key, or null for computed keys.
     * Computed keys (e.g. `[someVar]: resolver`) are silently skipped
     * because the key value cannot be statically determined.
     */
    function getPropertyKeyName(prop: TSESTree.Property): string | null {
      if (prop.key.type === AST_NODE_TYPES.Identifier) {
        return (prop.key as TSESTree.Identifier).name;
      }
      if (
        prop.key.type === AST_NODE_TYPES.Literal &&
        typeof (prop.key as TSESTree.Literal).value === 'string'
      ) {
        return (prop.key as TSESTree.Literal & { value: string }).value;
      }
      return null;
    }

    /**
     * Resolves the return type of named resolver reference using
     * TypeChecker.getSignaturesOfType() — requires parserOptions.project.
     */
    function getIdentifierReturnType(node: TSESTree.Identifier): string | null {
      if (!checker || !services) return null;
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      const sigs = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
      if (sigs.length === 0) return null;
      return checker.typeToString(checker.getReturnTypeOfSignature(sigs[0]));
    }

    // ─── Checkers ───────────────────────────────────────────────────────────

    /**
     * Validates an inline arrow function or function expression resolver.
     * Reads the return type annotation directly from the AST —
     * does not require the TypeScript type checker.
     */
    function checkInlineResolver(
      node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
      key: string
    ): void {
      if (warnOnInlineResolvers) {
        context.report({node, messageId: 'preferNamedResolver', data: {key}});
      }

      if (!node.returnType) {
        context.report({node, messageId: 'missingReturnType', data: {key}});
        return;
      }

      const typeNode = node.returnType.typeAnnotation;

      if (isWeakTypeNode(typeNode)) {
        context.report({node: node.returnType, messageId: 'weakReturnType', data: {key}});
        return;
      }

      const contract = resolverContracts[key];
      if (contract) {
        const expected = normalizeReturnType(contract);
        const actual = context.sourceCode.getText(typeNode);
        if (actual !== expected) {
          context.report({
            node: node.returnType,
            messageId: 'wrongReturnType',
            data: {key, actual, expected},
          });
        }
      }
    }

    /**
     * Validates a named resolver reference (identifier).
     * Uses TypeChecker.getSignaturesOfType() to extract the actual
     * return type of the referenced function.
     */
    function checkNamedResolver(node: TSESTree.Identifier, key: string): void {
      const actual = getIdentifierReturnType(node);
      if (!actual) return;

      if (actual === 'any' || actual === 'unknown') {
        context.report({node, messageId: 'weakReturnType', data: {key}});
        return;
      }

      const contract = resolverContracts[key];
      if (contract) {
        const expected = normalizeReturnType(contract);
        if (actual !== expected) {
          context.report({
            node,
            messageId: 'wrongReturnType',
            data: {key, actual, expected},
          });
        }
      }
    }

    /**
     * Dispatches to the appropriate checker based on the resolver value type.
     * Inline functions → checkInlineResolver
     * Identifier references → checkNamedResolver
     */
    function checkResolverEntry(prop: TSESTree.Property): void {
      const key = getPropertyKeyName(prop);
      if (!key) return;

      const value = prop.value;

      if (
        value.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        value.type === AST_NODE_TYPES.FunctionExpression
      ) {
        checkInlineResolver(value, key);
      } else if (value.type === AST_NODE_TYPES.Identifier) {
        checkNamedResolver(value, key);
      }
    }

    // ─── Visitor ────────────────────────────────────────────────────────────

    return {
      /**
       * Entry point: fires on every object literal in the file.
       * Skips non-Route objects, then locates the `resolve` property
       * and validates each resolver entry inside it.
       */
      ObjectExpression(node) {
        // Prefer type-checker-based detection when available,
        // fall back to heuristic when contextual type cannot be resolved.
        if (services && checker) {
          const byType = isRouteObjectByType(node, services, checker);
          if (byType === false) return;       // type checker says: definitely not a Route
          if (byType === null) {              // type checker inconclusive — use heuristic
            if (!isRouteObjectByHeuristic(node)) return;
          }
          // byType === true → confirmed Route, proceed
        } else {
          if (!isRouteObjectByHeuristic(node)) return;
        }

        const resolveProp = node.properties.find(
          (p): p is TSESTree.Property =>
            p.type === AST_NODE_TYPES.Property &&
            p.key.type === AST_NODE_TYPES.Identifier &&
            (p.key as TSESTree.Identifier).name === 'resolve'
        );

        if (!resolveProp) return;
        if (resolveProp.value.type !== AST_NODE_TYPES.ObjectExpression) return;

        for (const prop of resolveProp.value.properties) {
          if (prop.type !== AST_NODE_TYPES.Property) continue;
          checkResolverEntry(prop);
        }
      },
    };
  },
});
