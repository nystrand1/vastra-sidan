import { type VastraEvent } from "@prisma/client";

export const getParticipantPrice = (member: boolean, youth: boolean, event: VastraEvent) => {
  if (member && youth) {
    return event.youthMemberPrice;
  }
  if (youth) {
    return event.youthPrice;
  }
  if (member) {
    return event.memberPrice;
  }
  return event.defaultPrice
};