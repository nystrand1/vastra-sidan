import { http, HttpResponse } from "msw";

export interface SentEmail {
  to: string | null;
  subject: string | null;
  html: string | null;
}

let sentEmails: SentEmail[] = [];

export const resetSentEmails = () => {
  sentEmails = [];
};

/** Emails the app sent through AWS SES, in order. */
export const getSentEmails = () => sentEmails;

const sendEmailResponse = `<?xml version="1.0" encoding="UTF-8"?>
<SendEmailResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/">
  <SendEmailResult><MessageId>test-message-id</MessageId></SendEmailResult>
  <ResponseMetadata><RequestId>test-request-id</RequestId></ResponseMetadata>
</SendEmailResponse>`;

export const sesHandlers = [
  http.post("https://email.eu-north-1.amazonaws.com/", async ({ request }) => {
    const params = new URLSearchParams(await request.text());
    sentEmails.push({
      to: params.get("Destination.ToAddresses.member.1"),
      subject: params.get("Message.Subject.Data"),
      html: params.get("Message.Body.Html.Data")
    });
    return new HttpResponse(sendEmailResponse, {
      headers: { "content-type": "text/xml" }
    });
  })
];
