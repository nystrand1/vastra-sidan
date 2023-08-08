import { z } from "zod";

export const participantSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  consent: z.literal("on"),
  note: z.string().optional(),
  busId: z.string(),
  member: z.boolean(),
  youth: z.boolean(),
});