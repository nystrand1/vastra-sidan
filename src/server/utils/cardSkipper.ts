import { TRPCError } from "@trpc/server";
import { XMLParser } from "fast-xml-parser";
import { env } from "~/env.mjs";

interface ICardSkipperResponse {
  Cardskipper: {
    Members: {
      Member: unknown[] // Don't care about the structure, just the length
    }
  }
}


export const getCardSkipperMemberCount = async () => {
  const basicCredentials = Buffer.from(`${env.CARDSKIPPER_USERNAME}:${env.CARDSKIPPER_PASSWORD}`).toString("base64");
    const res = await fetch("https://api.cardskipper.se/Member/Export", {
      method: "POST",
      headers: {
        "authorization": "Basic " + basicCredentials,
        'content-type': 'application/xml'
      },
      body: `
        <Cardskipper xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <SearchCriteriaMember>
            <OrganisationId value="${env.CARDSKIPPER_ORG_NUMBER}"/>
            <OnlyActive value="true"/>
          </SearchCriteriaMember>
        </Cardskipper>
      `
    })
    if (!res.ok) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR'
      })
    }
    const xml = await res.text();
    const xmlParser = new XMLParser();
    const { Cardskipper } = xmlParser.parse(xml) as ICardSkipperResponse;
    const memberCount = Cardskipper.Members.Member.length;
    return memberCount;
}