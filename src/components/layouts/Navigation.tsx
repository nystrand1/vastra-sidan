import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { featureFlags } from "~/utils/featureFlags";
import { Button } from "../ui/button";

interface UserMenuProps {
  className?: string
}
const UserMenu = ({ className }: UserMenuProps) => {
  const { data: sessionData } = useSession();
  return (
    <div className={`z-50 my-4 text-base list-none divide-y rounded-lg shadow bg-gray-700 divide-gray-600 hidden md:block ${className || ''}`} id="user-dropdown">
      <div className="px-4 py-3">
        {sessionData?.user && (
          <>
            <span className="block text-sm text-white">{sessionData.user.name}</span>
            <span className="block text-sm truncate text-gray-400">{sessionData.user.email}</span>
            {featureFlags.ENABLE_MEMBERSHIPS && (
              <span className="block text-sm truncate text-gray-400">{sessionData.user.isMember ? 'Medlem' : 'Inte medlem'}</span>
            )}
          </>
        )}
      </div>
      <ul className="divide-ybg-gray-700 divide-gray-600 shadow rounded-b-lg" aria-labelledby="user-menu-button">
        {featureFlags.ENABLE_MEMBERSHIPS && featureFlags.ENABLE_LOGIN && (
          <li>
            <Link href="/mina-medlemskap" className="block px-4 py-2 text-sm hover:bg-gray-600 text-gray-200 hover:text-white">Mina medlemskap</Link>
          </li>
        )}
        <li>
          <Link href="/mina-bussresor" className="block px-4 py-2 text-sm hover:bg-gray-600 text-gray-200 hover:text-white">Mina bussresor</Link>
        </li>
        {sessionData?.user.role === 'ADMIN' && (
          <li>
            <Link href="/admin" className="block px-4 py-2 text-sm hover:bg-gray-600 text-gray-200 hover:text-white">Admin</Link>
          </li>
        )}
        <li>
          <Link href="/profil" className="rounded-b-lg block px-4 py-2 text-sm hover:bg-gray-600 text-gray-200 hover:text-white">Profil</Link>
        </li>
        <li>
          <p onClick={() => signOut()} className="rounded-b-lg block px-4 py-2 text-sm hover:bg-gray-600 text-gray-200 hover:text-white">Logga ut</p>
        </li>
      </ul>
    </div>
  )
}


export const Navigation = () => {
  const [open, setOpen] = useState(false);
  const [openUserMenu, setOpenUserMenu] = useState(false);
  const { data: sessionData } = useSession();
  const firstNameInitial = sessionData?.user.firstName[0];
  const lastNameInitial = sessionData?.user.lastName[0];
  return (
    <nav className="border-gray-200 bg-gray-900 fixed z-50 w-full">
      <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <Link href="/" className="flex items-center">
          <div className="h-8 w-8 mr-3 relative">
            <Image src="/favicon/android-icon-192x192.png" alt="Västra Sidan Logo" fill />
          </div>
          <span className="self-center text-xl font-semibold whitespace-nowrap text-white">Västra Sidan</span>
        </Link>
        <div className="hidden md:flex flex-1 ml-10 flex-row space-x-4">
          {!featureFlags.ENABLE_MEMBERSHIPS && (
            <Link className="hover:text-gray-200" href="https://apply.cardskipper.se/pxvo" target="_blank">Bli medlem</Link>
          )}
          {featureFlags.ENABLE_AWAYGAMES && (
            <Link className="hover:text-gray-200" href="/bortaresor">Bortaresor</Link>
          )}
          <Link className="hover:text-gray-200" href="/nyheter">Nyheter</Link>
          <Link className="hover:text-gray-200" href="/bortaguiden">Bortaguiden</Link>
          <Link className="hover:text-gray-200" href="/kronikor">Krönikor</Link>
          <Link className="hover:text-gray-200" href="/sasongforsasong">Säsong för säsong</Link>
          <Link className="hover:text-gray-200" href="https://api.vastrasidan.se" target="_blank">Forum</Link>
          <Link className="hover:text-gray-200" href="https://iksirius.github.io/index.html" target="_blank">Sånger</Link>
          <Link className="hover:text-gray-200" href="/omoss">Om oss</Link>
        </div>
        <div className="flex items-center md:order-2">
          {!sessionData?.user.isMember && featureFlags.ENABLE_MEMBERSHIPS && (
            <Button asChild>
              <Link href="/bli-medlem" className="!mb-0 mr-3 hidden md:flex md:items-center">
                <p>Bli medlem</p>
              </Link>
            </Button>
          )}
          {!sessionData?.user && featureFlags.ENABLE_LOGIN && (
            <>
              <Button className="!mb-0 hidden md:block mr-3">
                <Link href="/skapakonto">
                  <p>Skapa konto</p>
                </Link>
              </Button>
              <Button className="!mb-0 mr-3" onClick={async (e) => {
                e.preventDefault();
                await signIn();
              }}>
                <p>Logga In</p>
              </Button>
            </>
          )}
          {firstNameInitial && lastNameInitial && (
            <div
              onClick={() => setOpenUserMenu(!openUserMenu)}
              className="relative w-8 h-8 p-5 mr-3 rounded-full bg-blue-900 flex items-center justify-center cursor-pointer hover:bg-blue-800"
            >
              <p className="font-bold">
                {`${firstNameInitial}${lastNameInitial}`}
              </p>
              {openUserMenu && (
                <UserMenu className="absolute top-8 right-0" />
              )}
            </div>
          )}
          <button onClick={() => setOpen(!open)} type="button" className="inline-flex items-center p-2 w-10 h-10 justify-center text-sm rounded-lg md:hidden focus:outline-none focus:ring-2 text-gray-400 hover:bg-gray-700 focus:ring-gray-600" aria-controls="navbar-user" aria-expanded="false">
            <span className="sr-only">Öppna huvudmenyn</span>
            <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 14">
              <path stroke="currentColor" d="M1 1h15M1 7h15M1 13h15" />
            </svg>
          </button>
        </div>
        <div className={`items-center justify-between w-full md:hidden md:w-auto md:order-1 ${open ? '' : 'hidden'}`} id="navbar-user">
          <ul onClick={() => setOpen(false)} className="divide-y flex flex-col font-medium mt-4 border rounded-lg bg-gray-800 border-gray-700">
            {!featureFlags.ENABLE_MEMBERSHIPS && (
              <li className="divide-y divide-gray-100">
                <Link className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" href="https://apply.cardskipper.se/pxvo" target="_blank">Bli Medlem</Link>
              </li>
            )}
            {featureFlags.ENABLE_AWAYGAMES && (
              <li className="divide-y divide-gray-100">
                <Link className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" href="/bortaresor">Bortaresor</Link>
              </li>
            )}
            <li className="divide-y divide-gray-100">
              <Link className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" href="/nyheter">Nyheter</Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" href="/kronikor">Krönikor</Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" href="/bortaguiden">Bortaguiden</Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link href="/sasongforsasong" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Säsong för säsong</Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link href="https://api.vastrasidan.se" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Forum</Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link href="https://iksirius.github.io/index.html" target="_blank" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Sånger</Link>
            </li>
            <li className="divide-y divide-gray-100">
              <Link href="/omoss" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Om oss</Link>
            </li>
            {!sessionData?.user && featureFlags.ENABLE_LOGIN && (
              <li className="divide-y divide-gray-100">
                <Link href="/skapakonto" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Skapa konto</Link>
              </li>
            )}
            {sessionData?.user.isMember && featureFlags.ENABLE_MEMBERSHIPS && (
              <li>
                <Link href="/mina-medlemskap" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Mina medlemskap</Link>
              </li>
            )} 
            {sessionData?.user.role === 'ADMIN' && (
              <li>
                <Link href="/admin" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white">Admin</Link>
              </li>
            )}
            {sessionData?.user && (
              <>
                <li>
                  <Link href="/mina-bussresor" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Mina bussresor</Link>
                </li>
                <li>
                  <Link href="/profil" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Profil</Link>
                </li>
                <li>
                  <div onClick={() => signOut()} className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Logga ut</div>
                </li>
              </>
            )}
            {!sessionData?.user.isMember && featureFlags.ENABLE_MEMBERSHIPS && (
              <li>
                <Link href="/bli-medlem" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white">Bli Medlem</Link>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  )
}