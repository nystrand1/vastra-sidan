export const isSamePhoneNumber = (phoneNumber1: string, phoneNumber2: string) => {
  // remove whitespace and +46  
  const phone1 = phoneNumber1.replace(/\s/g, '').replace('+46', '0');
  const phone2 = phoneNumber2.replace(/\s/g, '').replace('+46', '0');
  return phone1 === phone2;
};

export const toUTCDate = (date: Date) => {
  const utcDate = Date.UTC(
    date.getUTCFullYear(), 
    date.getUTCMonth(),
    date.getUTCDate(), 
    date.getUTCHours(),
    date.getUTCMinutes(), 
    date.getUTCSeconds()
  );
  return utcDate
}
