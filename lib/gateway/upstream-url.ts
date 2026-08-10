/**
 * Safe upstream URL composition for the gateway.
 *
 * The caller controls only the path segments after the Metron slug and the
 * query string. The upstream origin always comes from the persisted route;
 * path traversal / dot-segment attempts are rejected before any request is
 * built.
 */

export type UpstreamUrlComposition = {
  ok: true;
  url: URL;
  /** Path to send to the upstream (base path + safe caller path). */
  path: string;
} | {
  ok: false;
  reason: "path_traversal" | "unsafe_base_url";
};

function hasDotSegments(segments: string[]): boolean {
  return segments.some(
    (segment) => segment === "." || segment === ".." || segment === ""
  );
}

/**
 * Composes the upstream request URL from the persisted base and the
 * caller's request. Query parameters are preserved; fragments are never
 * forwarded (HTTP has no fragment). The caller can never alter the
 * upstream origin.
 */
export function composeUpstreamUrl(input: {
  upstreamBaseUrl: string;
  /** Path segments after the Metron slug (may be empty). */
  callerPathSegments: string[];
  callerQuery: URLSearchParams;
}): UpstreamUrlComposition {
  let base: URL;
  try {
    base = new URL(input.upstreamBaseUrl);
  } catch {
    return { ok: false, reason: "unsafe_base_url" };
  }

  const baseSegments = base.pathname.split("/").filter((s) => s !== "");
  const safeSegments = input.callerPathSegments.map((segment) => {
    try {
      // Preserve encoded semantics: decode for inspection, then re-encode.
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  if (hasDotSegments(safeSegments) || hasDotSegments(baseSegments)) {
    return { ok: false, reason: "path_traversal" };
  }
  if (safeSegments.some((s) => s.includes("\\") || s.includes("%2e"))) {
    return { ok: false, reason: "path_traversal" };
  }

  const path = "/" + [...baseSegments, ...safeSegments].map(encodeURIComponent).join("/");
  const query = input.callerQuery.toString();
  const url = new URL(base.origin + path + (query ? `?${query}` : ""));

  return { ok: true, url, path };
}
