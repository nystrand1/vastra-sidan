import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Role } from "~/generated/prisma/browser";
import { type AppSession } from "~/utils/appSession";
import { authClient, useAppSession } from "~/utils/authClient";
import { featureFlags } from "~/utils/featureFlags";
import { Button } from "../ui/button";

interface UserMenuProps {
  className?: string;
}
/** Signed in, and allowed to see the account menu: everyone with login on, else admins only. */
const showsAccountMenu = (user: AppSession["user"] | null): user is AppSession["user"] =>
  !!user && (featureFlags.ENABLE_LOGIN || user.role === Role.ADMIN);

const useSignOut = () => {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    await router.push("/");
  };
};

const UserMenu = ({ className }: UserMenuProps) => {
  const { user } = useAppSession();
  const signOut = useSignOut();
  return (
    <div
      className={`z-50 my-4 hidden list-none divide-y divide-gray-600 rounded-lg bg-gray-700 text-base shadow md:block ${className || ""}`}
      id="user-dropdown"
    >
      <div className="px-4 py-3">
        {user && (
          <>
            <span className="block text-sm text-white">
              {user.name}
            </span>
            <span className="block truncate text-sm text-gray-400">
              {user.email}
            </span>
            {featureFlags.ENABLE_MEMBERSHIPS && (
              <span className="block truncate text-sm text-gray-400">
                {user.isMember ? "Medlem" : "Inte medlem"}
              </span>
            )}
          </>
        )}
      </div>
      <ul
        className="divide-ybg-gray-700 divide-gray-600 rounded-b-lg shadow"
        aria-labelledby="user-menu-button"
      >
        {featureFlags.ENABLE_MEMBERSHIPS && featureFlags.ENABLE_LOGIN && (
          <li>
            <Link prefetch={false}
              href="/mina-medlemskap"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
            >
              Mina medlemskap
            </Link>
          </li>
        )}
        {featureFlags.ENABLE_LOGIN && (
          <li>
            <Link prefetch={false}
              href="/mina-bussresor"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
            >
              Mina bussresor
            </Link>
          </li>
        )}
        {user?.role === Role.ADMIN && (
          <li>
            <Link prefetch={false}
              href="/admin"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
            >
              Admin
            </Link>
          </li>
        )}
        {featureFlags.ENABLE_LOGIN && (
          <li>
            <Link prefetch={false}
              href="/profil"
              className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
            >
              Profil
            </Link>
          </li>
        )}
        <li>
          <p
            onClick={signOut}
            className="block rounded-b-lg px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
          >
            Logga ut
          </p>
        </li>
      </ul>
    </div>
  );
};

export const Navigation = () => {
  const [open, setOpen] = useState(false);
  const [openUserMenu, setOpenUserMenu] = useState(false);
  const { user } = useAppSession();
  const router = useRouter();
  const signOut = useSignOut();
  // "?" until the profile has a name, so the menu (and "Logga ut") is always reachable
  const initials = `${user?.firstName[0] ?? ""}${user?.lastName[0] ?? ""}` || "?";
  return (
    <nav className="fixed z-50 w-full border-gray-200 bg-gray-900">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between p-4">
        <Link prefetch={false} href="/" className="flex items-center">
          <div className="relative mr-3 h-8 w-8">
            <Image
              src="/favicon/android-icon-192x192.png"
              alt="Västra Sidan Logo"
              fill
            />
          </div>
          <span className="self-center whitespace-nowrap text-xl font-semibold text-white">
            Västra Sidan
          </span>
        </Link>
        <div className="ml-10 hidden flex-1 flex-row space-x-4 md:flex">
          <Link prefetch={false} className="hover:text-gray-200" href="/bortaresor">
            Bortaresor
          </Link>
          <Link prefetch={false} className="hover:text-gray-200" href="/nyheter">
            Nyheter
          </Link>
          <Link prefetch={false} className="hover:text-gray-200" href="/bortaguiden">
            Bortaguiden
          </Link>
          <Link prefetch={false} className="hover:text-gray-200" href="/kronikor">
            Krönikor
          </Link>
          <Link prefetch={false} className="hover:text-gray-200" href="/sasongforsasong">
            Säsong för säsong
          </Link>
          <Link prefetch={false}
            className="hover:text-gray-200"
            href="https://forum.vastrasidan.se"
            target="_blank"
          >
            Forum
          </Link>
          <Link prefetch={false}
            className="hover:text-gray-200"
            href="https://iksirius.github.io/index.html"
            target="_blank"
          >
            Sånger
          </Link>
          <Link prefetch={false} className="hover:text-gray-200" href="/omoss">
            Om oss
          </Link>
        </div>
        <div className="flex items-center md:order-2">
          {!user?.isMember && featureFlags.ENABLE_MEMBERSHIPS && (
            <Button asChild>
              <Link prefetch={false}
                href="/bli-medlem"
                className="!mb-0 mr-3 hidden md:flex md:items-center"
              >
                <p>Bli medlem</p>
              </Link>
            </Button>
          )}
          {!user && featureFlags.ENABLE_LOGIN && (
            <>
              <Button className="!mb-0 mr-3 hidden md:block">
                <Link prefetch={false} href="/skapakonto">
                  <p>Skapa konto</p>
                </Link>
              </Button>
              <Button
                className="!mb-0 mr-3"
                onClick={async (e) => {
                  e.preventDefault();
                  await router.push("/loggain");
                }}
              >
                <p>Logga in</p>
              </Button>
            </>
          )}
          {showsAccountMenu(user) && (
            <div
              onClick={() => setOpenUserMenu(!openUserMenu)}
              className="relative mr-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-blue-900 p-5 hover:bg-blue-800"
            >
              <p className="font-bold">
                {initials}
              </p>
              {openUserMenu && <UserMenu className="absolute right-0 top-8" />}
            </div>
          )}
          <button
            onClick={() => setOpen(!open)}
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg p-2 text-sm text-gray-400 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600 md:hidden"
            aria-controls="navbar-user"
            aria-expanded="false"
          >
            <span className="sr-only">Öppna huvudmenyn</span>
            <svg
              className="h-5 w-5"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 17 14"
            >
              <path stroke="currentColor" d="M1 1h15M1 7h15M1 13h15" />
            </svg>
          </button>
        </div>
        <div
          className={`w-full items-center justify-between md:order-1 md:hidden md:w-auto ${open ? "" : "hidden"}`}
          id="navbar-user"
        >
          <ul
            onClick={() => setOpen(false)}
            className="mt-4 flex flex-col divide-y rounded-lg border border-gray-700 bg-gray-800 font-medium"
          >
            {!user?.isMember && featureFlags.ENABLE_MEMBERSHIPS && (
              <li>
                <Link prefetch={false}
                  href="/bli-medlem"
                  className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                >
                  Bli medlem
                </Link>
              </li>
            )}
            <li>
              <Link prefetch={false}
                href="/medlem/glomt-lank"
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
              >
                Hämta medlemskap
              </Link>
            </li>
            {featureFlags.ENABLE_AWAYGAMES && (
              <li className="divide-y divide-gray-100">
                <Link prefetch={false}
                  className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                  href="/bortaresor"
                >
                  Bortaresor
                </Link>
              </li>
            )}
            <li className="divide-y divide-gray-100">
              <Link prefetch={false}
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                href="/nyheter"
              >
                Nyheter
              </Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link prefetch={false}
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                href="/kronikor"
              >
                Krönikor
              </Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link prefetch={false}
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                href="/bortaguiden"
              >
                Bortaguiden
              </Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link prefetch={false}
                href="/sasongforsasong"
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                aria-current="page"
              >
                Säsong för säsong
              </Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link prefetch={false}
                href="https://forum.vastrasidan.se"
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                aria-current="page"
              >
                Forum
              </Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link prefetch={false}
                href="https://iksirius.github.io/index.html"
                target="_blank"
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                aria-current="page"
              >
                Sånger
              </Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link prefetch={false}
                href="/omoss"
                className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                aria-current="page"
              >
                Om oss
              </Link>
            </li>
            {!user && featureFlags.ENABLE_LOGIN && (
              <li className="divide-y divide-gray-100">
                <Link prefetch={false}
                  href="/loggain"
                  className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                >
                  Logga in
                </Link>
              </li>
            )}
            {!user && featureFlags.ENABLE_LOGIN && (
              <li className="divide-y divide-gray-100">
                <Link prefetch={false}
                  href="/skapakonto"
                  className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                  aria-current="page"
                >
                  Skapa konto
                </Link>
              </li>
            )}
            {showsAccountMenu(user) && (
              <>
                {featureFlags.ENABLE_LOGIN && featureFlags.ENABLE_MEMBERSHIPS && (
                  <li>
                    <Link prefetch={false}
                      href="/mina-medlemskap"
                      className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                      aria-current="page"
                    >
                      Mina medlemskap
                    </Link>
                  </li>
                )}
                {user.role === Role.ADMIN && (
                  <li>
                    <Link prefetch={false}
                      href="/admin"
                      className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                    >
                      Admin
                    </Link>
                  </li>
                )}
                {featureFlags.ENABLE_LOGIN && (
                  <>
                    <li>
                      <Link prefetch={false}
                        href="/mina-bussresor"
                        className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                        aria-current="page"
                      >
                        Mina bussresor
                      </Link>
                    </li>
                    <li>
                      <Link prefetch={false}
                        href="/profil"
                        className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                        aria-current="page"
                      >
                        Profil
                      </Link>
                    </li>
                  </>
                )}
                <li>
                  <div
                    onClick={signOut}
                    className="block rounded py-4 pl-3 pr-4 text-white md:p-0"
                    aria-current="page"
                  >
                    Logga ut
                  </div>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};
