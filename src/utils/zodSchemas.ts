import { z } from "zod";

export const participantSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  consent: z.literal("on"),
});