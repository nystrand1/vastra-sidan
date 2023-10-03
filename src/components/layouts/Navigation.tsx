import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Button } from "../atoms/Button/Button";


export const Navigation = () => {
  const [open, setOpen] = useState(false);
  const { data: sessionData } = useSession();

  const [firstNameInitial, lastNameInitial] = sessionData?.user?.name?.split(" ") || [];

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
        <Button className="mb-0 mr-3" onClick={() => signIn()}>
          <span className="sr-only">Open user menu</span>
          {firstNameInitial && lastNameInitial && (
            <div className="w-8 h-8 rounded-full bg-blue-900">
              {`${firstNameInitial}${lastNameInitial}`}
            </div>
          )}
          <p>Logga In</p>
        </Button>
          <div className="z-50 hidden my-4 text-base list-none bg-white divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700 dark:divide-gray-600" id="user-dropdown">
            <div className="px-4 py-3">
              {sessionData?.user && (
                <>
                  <span className="block text-sm text-gray-900 dark:text-white">{sessionData.user.name}</span>
                  <span className="block text-sm  text-gray-500 truncate dark:text-gray-400">{sessionData.user.email}</span>
                </>
              )}
            </div>
            <ul className="py-2" aria-labelledby="user-menu-button">
              <li>
                <p onClick={() => signOut()} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white">Logga ut</p>
              </li>
            </ul>
          </div>
          <button onClick={() => setOpen(!open)} type="button" className="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600" aria-controls="navbar-user" aria-expanded="false">
            <span className="sr-only">Öppna huvudmenyn</span>
            <svg className="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 14">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 1h15M1 7h15M1 13h15"/>
            </svg>
        </button>
      </div>
      <div className={`items-center justify-between w-full md:flex md:hidden md:w-auto md:order-1 ${open ? '' : 'hidden'}`} id="navbar-user">
        <ul className="flex flex-col font-medium p-4 md:p-0 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:flex-row md:space-x-8 md:mt-0 md:border-0 md:bg-white dark:bg-gray-800 md:dark:bg-gray-900 dark:border-gray-700">
          <li>
            <a href="#" className="block py-2 pl-3 pr-4 text-white bg-blue-700 rounded md:bg-transparent md:text-blue-700 md:p-0 md:dark:text-blue-500" aria-current="page">Bussresor</a>
          </li>
          <li>
            <a href="#" className="block py-2 pl-3 pr-4 text-gray-900 rounded hover:bg-gray-100 md:hover:bg-transparent md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent dark:border-gray-700">Bli Medlem</a>
          </li>
          <li>
            <a href="#" className="block py-2 pl-3 pr-4 text-gray-900 rounded hover:bg-gray-100 md:hover:bg-transparent md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent dark:border-gray-700">Mina bussresor</a>
          </li>
        </ul>
      </div>
      </div>
    </nav>
  )
}