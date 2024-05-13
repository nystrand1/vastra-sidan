import { type OptionsWithTZ, formatInTimeZone } from "date-fns-tz";

export const formatSwedishTime = (date: string | Date | number, format: string, options?: OptionsWithTZ) => {
  return formatInTimeZone(date, 'Europe/Stockholm', format, options);
}