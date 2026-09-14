/**
 * MCP Apps contract, per the ext-apps specification (2026-01-26).
 *
 * We implement it directly rather than depending on `@modelcontextprotocol/ext-apps`,
 * because that package peers on the `@modelcontextprotocol/{core,client,server}@2.x`
 * line and zod 4, while this server is built on `@modelcontextprotocol/sdk@1.30.0` for
 * its Streamable HTTP transport — which the hackathon requires. See FL-005.
 *
 * The official helpers are thin: `registerAppTool` calls `registerTool` with
 * `_meta.ui.resourceUri`, and `registerAppResource` calls `registerResource` with this
 * MIME type. Both are reproduced faithfully below.
 */

/** MIME type hosts use to recognise an MCP App resource. */
export const APP_MIME_TYPE = 'text/html;profile=mcp-app';

/** Legacy flat metadata key. Hosts must accept both; we emit both. */
export const RESOURCE_URI_META_KEY = 'ui/resourceUri';

/** Build the `_meta` block that points a tool at its UI resource. */
export function uiMeta(resourceUri: string): Record<string, unknown> {
  return {
    ui: { resourceUri },
    [RESOURCE_URI_META_KEY]: resourceUri,
  };
}
