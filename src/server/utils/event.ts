import { isBefore, subHours } from "date-fns";

export const isEventCancelable = (eventDate: Date) => {
  // You can't cancel within 36 hours of the departure
  const thirtySixHoursBeforeDeparture = subHours(eventDate, 36);
  const today = new Date();

  const isWithin36Hours = isBefore(today, thirtySixHoursBeforeDeparture);

  return isWithin36Hours;

}