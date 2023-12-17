import { env } from "~/env.mjs";

export const featureFlags = {
  ENABLE_MEMBERSHIPS: env.NEXT_PUBLIC_ENABLE_MEMBERSHIPS === 'true',
}