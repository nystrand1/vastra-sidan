import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { env } from "~/env.mjs";

const inputSchema = z.object({
  paths: z.array(z.string().startsWith("/")).min(1).max(50)
});

/**
 * On-demand ISR: regenerates the given pages. Called by `revalidatePages`
 * (~/server/utils/revalidate.ts) after something changes what they show.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  if (req.headers.authorization !== `Bearer ${env.CRON_KEY}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const input = inputSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({ message: "Invalid input" });
  }

  const revalidated: string[] = [];
  const failed: string[] = [];
  for (const path of input.data.paths) {
    try {
      await res.revalidate(path);
      revalidated.push(path);
    } catch (err) {
      // e.g. a trip page that is now a 404. It's left to its own revalidate time.
      console.error(`Could not revalidate ${path}`, err);
      failed.push(path);
    }
  }
  return res.status(200).json({ revalidated, failed });
}
