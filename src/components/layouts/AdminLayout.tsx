import { Role } from "~/generated/prisma/browser";
import { useAppSession } from "~/utils/authClient";
import { type PropsWithChildren } from "react";
import LoginPage from "~/pages/loggain";

export default function AdminLayout({ children } : PropsWithChildren) {
  const { user } = useAppSession();
  const title = user?.role === Role.ADMIN ? `Admin - ${user?.name || ''}` : "Logga in för att se adminsidan";

  if (!user) {
    return <LoginPage adminLogin />
  }

  return (
    <div>
      <h1 className="text-center text-3xl mb-8 mt-10">
        {title}
      </h1>
      {children}
    </div>
  )
}