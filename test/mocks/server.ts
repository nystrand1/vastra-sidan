import { setupServer } from "msw/node";
import { sesHandlers } from "./ses";
import { stripeHandlers } from "./stripe";

export const server = setupServer(...stripeHandlers, ...sesHandlers);
