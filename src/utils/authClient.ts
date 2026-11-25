import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { customSessionClient, emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";
import { type auth } from "~/server/auth";
import { toAppSession, type AppSession } from "~/utils/appSession";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), passkeyClient(), customSessionClient<typeof auth>(), inferAdditionalFields<typeof auth>()]
});

/** The signed-in user (null when signed out), whether the session is still loading, and a reload. */
export const useAppSession = (): {
  user: AppSession["user"] | null;
  isPending: boolean;
  refetch: () => Promise<void>;
} => {
  const { data, isPending, refetch } = authClient.useSession();
  return {
    user: toAppSession(data)?.user ?? null,
    isPending,
    refetch: async () => {
      await refetch();
    }
  };
};
