import { type FormatOptionsWithTZ, formatInTimeZone } from "date-fns-tz";

export const formatSwedishTime = (date: string | Date | number, format: string, options?: FormatOptionsWithTZ) => {
  return formatInTimeZone(date, 'Europe/Stockholm', format, options);
}