/**
 * Client-safe public environment accessors.
 *
 * Only NEXT_PUBLIC_* values live here. Nothing sensitive may be imported
 * into a client bundle.
 */

import { getPublicEnvValues } from "../env";

const publicEnv = getPublicEnvValues();

export const appUrl = publicEnv.appUrl;
export const walletConnectProjectId = publicEnv.walletConnectProjectId;
