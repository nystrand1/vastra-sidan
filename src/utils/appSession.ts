import { Role } from "~/generated/prisma/browser";

/** The signed-in user, as tRPC procedures and pages see it. */
export type AppSession = {
  user: {
    id: string;
    role: Role;
    firstName: string;
    lastName: string;
    name: string;
    email: string;
    phone: string;
    isMember: boolean;
  };
};

type AuthSessionUser = {
  id: string;
  email: string;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  isMember: boolean;
};

/** Maps what Better Auth's get-session returns to the session the app uses. */
export const toAppSession = (session: { user: AuthSessionUser } | null): AppSession | null => {
  if (!session) return null;
  const { id, email, role, firstName, lastName, phone, isMember } = session.user;
  return {
    user: {
      id,
      email,
      role: role === Role.ADMIN ? Role.ADMIN : Role.USER,
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      name: `${firstName ?? ""} ${lastName ?? ""}`.trim(),
      phone: phone ?? "",
      isMember
    }
  };
};
