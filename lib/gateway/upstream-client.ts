/**
 * DNS-rebinding-safe upstream transport.
 *
 * The connection is pinned to an address that was already validated as
 * public (`resolvePublicAddresses`): Node connects directly to the IP while
 * the TLS SNI/certificate check and the HTTP Host header still use the
 * real hostname (`servername` + `host` header). A post-validation DNS
 * rebinding therefore cannot redirect the connection to a private
 * destination, and the certificate is still verified against the
 * hostname.
 *
 * Redirects are never followed (manual response). Injecting a transport is
 * possible for tests; production uses node:https / node:http directly.
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import type { RequestOptions as HttpsRequestOptions } from "node:https";

export type UpstreamTransportResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

export type UpstreamTransportResult =
  | { ok: true; response: UpstreamTransportResponse }
  | { ok: false; errorCode: string };

export type UpstreamTransport = (params: {
  hostname: string;
  pinnedAddress: string;
  port: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Buffer | null;
  timeoutMs: number;
  maxResponseBytes: number;
  rejectHttp?: boolean;
}) => Promise<UpstreamTransportResult>;

export const UPSTREAM_ERROR_CODES = {
  TIMEOUT: "UPSTREAM_TIMEOUT",
  UNREACHABLE: "UPSTREAM_UNREACHABLE",
  RESPONSE_TOO_LARGE: "UPSTREAM_RESPONSE_TOO_LARGE",
  INVALID_RESPONSE: "UPSTREAM_INVALID_RESPONSE",
} as const;

function nodeRequest(protocol: "https:" | "http:", options: HttpsRequestOptions) {
  return protocol === "https:" ? httpsRequest(options) : httpRequest(options);
}

/** Production transport: pinned-IP request via node:https/node:http. */
export const pinnedUpstreamTransport: UpstreamTransport = (params) => {
  return new Promise((resolve) => {
    const protocol = params.rejectHttp === false ? "http:" : "https:";
    const requestOptions = {
      hostname: params.pinnedAddress,
      port: params.port,
      servername: params.hostname,
      method: params.method,
      path: params.path,
      headers: params.headers,
    };

    const req = nodeRequest(protocol, requestOptions);

    let settled = false;
    let timedOut = false;
    const settle = (result: UpstreamTransportResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      req.destroy();
      settle({ ok: false, errorCode: UPSTREAM_ERROR_CODES.TIMEOUT });
    }, params.timeoutMs);

    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let oversized = false;
      res.on("data", (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > params.maxResponseBytes) {
          oversized = true;
          req.destroy();
          clearTimeout(timeout);
          settle({ ok: false, errorCode: UPSTREAM_ERROR_CODES.RESPONSE_TOO_LARGE });
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (settled || oversized) return;
        clearTimeout(timeout);
        settle({
          ok: true,
          response: {
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          },
        });
      });
      res.on("error", () => {
        if (settled) return;
        clearTimeout(timeout);
        settle({ ok: false, errorCode: UPSTREAM_ERROR_CODES.INVALID_RESPONSE });
      });
    });

    req.on("error", () => {
      if (settled) return;
      clearTimeout(timeout);
      settle({
        ok: false,
        errorCode: timedOut
          ? UPSTREAM_ERROR_CODES.TIMEOUT
          : UPSTREAM_ERROR_CODES.UNREACHABLE,
      });
    });

    if (params.body !== null) {
      req.write(params.body);
    }
    req.end();
  });
};
