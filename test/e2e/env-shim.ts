// Clever obfuscation to prevent the build system from inlining the value of `NODE_ENV`.
/** Whether the generated client is running in development mode. */
export const __DEV__: boolean = /* @__PURE__ */ (() =>
    (process as unknown as { env: { NODE_ENV?: string } })['env'].NODE_ENV === 'development')();
