import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { type PropsWithChildren } from "react";



export default function AdminLayout({ children } : PropsWithChildren) {
  const { data: sessionData } = useSession();
  const title = sessionData?.user?.role === Role.ADMIN ? `Admin - ${sessionData.user?.name || ''}` : "Logga in för att se adminsidan";

  return (
    <div>
      <h1 className="text-center text-3xl mb-8 mt-10">
        {title}
      </h1>
      {children}
    </div>
  )
}