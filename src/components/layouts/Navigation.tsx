import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Button } from "../atoms/Button/Button";
import { ButtonLink } from "../atoms/ButtonLink/ButtonLink";

interface UserMenuProps {
  className?: string
}
const UserMenu = ({ className }: UserMenuProps) => {
  const { data: sessionData } = useSession();
  return (
    <div className={`z-50 my-4 text-base list-none bg-white divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700 dark:divide-gray-600 hidden md:block ${className || ''}`} id="user-dropdown">
      <div className="px-4 py-3">
        {sessionData?.user && (
          <>
            <span className="block text-sm text-gray-900 dark:text-white">{sessionData.user.name}</span>
            <span className="block text-sm  text-gray-500 truncate dark:text-gray-400">{sessionData.user.email}</span>
            <span className="block text-sm  text-gray-500 truncate dark:text-gray-400">{sessionData.user.isMember ? 'Medlem' : 'Inte medlem'}</span>
          </>
        )}
      </div>
      <ul className="divide-y divide-gray-100 dark:bg-gray-700 dark:divide-gray-600 shadow rounded-b-lg" aria-labelledby="user-menu-button">
        <li>
          <Link href="/mina-medlemskap" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white">Mina medlemskap</Link>
        </li>
        <li>
          <p onClick={() => signOut()} className="rounded-b-lg block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white">Logga ut</p>
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
    <nav className="bg-white border-gray-200 dark:bg-gray-900 fixed z-50 w-full">
      <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <Link href="/" className="flex items-center">
          <div className="h-8 w-8 mr-3 relative">
            <Image src="/favicon/android-icon-192x192.png" alt="Västra Sidan Logo" fill />
          </div>
          <span className="self-center text-2xl font-semibold whitespace-nowrap dark:text-white">Västra Sidan</span>
        </Link>
        <div className="flex items-center md:order-2">
          {!sessionData?.user.isMember && (
            <ButtonLink className="!mb-0 mr-3 hidden md:block" href="/bli-medlem">
              <p>Bli medlem</p>
            </ButtonLink>
          )}
          {!sessionData?.user && (
            <Button className="!mb-0 mr-3" onClick={() => signIn()}>
              <p>Logga In</p>
            </Button>
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
          <button onClick={() => setOpen(!open)} type="button" className="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600" aria-controls="navbar-user" aria-expanded="false">
            <span className="sr-only">Öppna huvudmenyn</span>
            <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 14">
              <path stroke="currentColor" d="M1 1h15M1 7h15M1 13h15" />
            </svg>
          </button>
        </div>
        <div className={`items-center justify-between w-full md:hidden md:w-auto md:order-1 ${open ? '' : 'hidden'}`} id="navbar-user">
          <ul onClick={() => setOpen(false)} className="divide-y flex flex-col font-medium mt-4 border rounded-lg bg-gray-800 border-gray-700">
            <li className="divide-y divide-gray-100">
              <Link href="/" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Bussresor</Link>
            </li>
            {sessionData?.user.isMember && (
              <li>
                <Link href="/mina-medlemskap" className="block py-4 pl-3 pr-4 rounded md:p-0 text-white" aria-current="page">Mina medlemskap</Link>
              </li>
            )}
            {!sessionData?.user.isMember && (
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