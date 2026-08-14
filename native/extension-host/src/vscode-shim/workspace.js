export function createWorkspaceApi() {
  return {
    getConfiguration() {
      return { get: (_key, defaultValue) => defaultValue };
    },
  };
}
