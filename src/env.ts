function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  hydraHttpUrl: required("HYDRADB_HTTP_URL", "http://127.0.0.1:8443"),
  hydraGraphId: required("HYDRADB_GRAPH_ID", "default"),
  hydraNamespace: required("HYDRADB_NAMESPACE", "default"),
  hydraCellId: required("HYDRADB_CELL_ID", "cell-0"),
  hydraAuthToken: required(
    "HYDRADB_AUTH_TOKEN",
    "local-development-token-32-bytes",
  ),
};
