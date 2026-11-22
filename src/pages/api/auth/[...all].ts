import { toNodeHandler } from "better-auth/node";
import { auth } from "~/server/auth";

// Better Auth reads the raw request body itself
export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth.handler);
