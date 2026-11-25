import { type AppSession } from "~/utils/appSession";

/** A profile is complete once first name, last name and phone are all filled in. */
export const isProfileComplete = (user: AppSession["user"]): boolean =>
  [user.firstName, user.lastName, user.phone].every((value) => value.trim() !== "");
