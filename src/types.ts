/**
 * Extended form of a resolver contract.
 * Allows future fields (e.g. description, deprecated) to be added
 * without breaking the shorthand string syntax.
 */
export interface ResolverContract {
  returnType: string;
}

/**
 * Accepted value in the `resolvers` map.
 * Shorthand:  'User'
 * Extended:   { returnType: 'User' }
 */
export type ResolverContractValue = string | ResolverContract;

/**
 * Options accepted by the `resolver-must-be-typed` rule.
 */
export interface RuleOptions {
  /**
   * Emit a warning when a resolver is an inline anonymous function
   * rather than a named ResolveFn<T> constant.
   * @default false
   */
  warnOnInlineResolvers?: boolean;

  /**
   * Enable TypeScript type checker integration.
   * Requires `parserOptions.project` to be configured.
   * When disabled, named resolver references (identifiers) cannot be validated.
   * @default true
   */
  useTypeChecker?: boolean;

  /**
   * Per-key type contracts keyed by resolver name as it appears
   * in the route's `resolve` map.
   * The type string is resolved against the TypeScript scope of the
   * file being linted, so all referenced types must be imported there.
   */
  resolvers?: Record<string, ResolverContractValue>;
}
