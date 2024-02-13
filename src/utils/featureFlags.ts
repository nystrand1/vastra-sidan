import { env } from "~/env.mjs";

export const featureFlags = {
  ENABLE_MEMBERSHIPS: env.NEXT_PUBLIC_ENABLE_MEMBERSHIPS === 'true',
  ENABLE_LOGIN: env.NEXT_PUBLIC_ENABLE_LOGIN === 'true',
  ENABLE_AWAYGAMES: env.NEXT_PUBLIC_ENABLE_AWAYGAMES === 'true',
}