import { isBefore, subDays } from "date-fns";

export const isEventCancelable = (eventDate: Date) => {
  // You can't cancel within 48 hours of the departure
  const twoDaysBeforeDeparture = subDays(eventDate, 2);
  const today = new Date();

  const isWithin48Hours = isBefore(today, twoDaysBeforeDeparture);
  
  return isWithin48Hours;

}