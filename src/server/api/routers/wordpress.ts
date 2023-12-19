import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { GetAwayGuidesDocument, GetChronicleDocument, GetChroniclesDocument } from "~/types/wordpresstypes/graphql";
import { format, parseISO } from 'date-fns'
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { bandyDivisions, fotballDivisions } from "~/server/utils/awayGuideSorter";

const parseDateString = (dateString: string, dateFormat = "d MMMM yyyy HH:mm") => {
  const date = parseISO(dateString);
  return format(date, dateFormat);
}

const stripHtmlTags = (html: string) => {
  return html.replace(/(<([^>]+)>)/gi, "");
};

export const wordpressRouter = createTRPCRouter({
  getChronicles: publicProcedure
    .query(async ({ ctx }) => {
      console.log("asdkljasdklasjd");
      console.log(ctx.apolloClient);
      const res = await ctx.apolloClient.query({
        query: GetChroniclesDocument
      });

      return res.data.chronicles.nodes.map((chronicle) => ({
        ...chronicle,
        excerpt: stripHtmlTags(chronicle.chronicle.text).split(".").splice(0, 3).join(" ") + ".",
        date: parseDateString(chronicle.date),
      }));
    }),
  getChronicleBySlug: publicProcedure
    .input(z.object({ slug: z.string()}))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.apolloClient.query({
        query: GetChronicleDocument,
        variables: { slug: input.slug }
      });

      if (!data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chronicle not found",
        });
      }
      const { chronicle } = data;

      return {
        ...chronicle,
        date: parseDateString(chronicle.date),
      };
    }),
    getAwayGuides: publicProcedure
    .query(async ({ ctx }) => {
      const res = await ctx.apolloClient.query({
        query: GetAwayGuidesDocument
      });

      const fotballGuides = res.data.awayguides.nodes.filter((guide) => guide.awayGuide.sport === "Fotboll");
      const bandyGuides = res.data.awayguides.nodes.filter((guide) => guide.awayGuide.sport === "Bandy");

      const fotballByDivision = fotballDivisions.map((division) => {
        return {
          division,
          guides: fotballGuides.filter((guide) => guide.awayGuide.division === division)
        }
      }).filter((division) => division.guides.length > 0);

      const bandyByDivision = bandyDivisions.map((division) => {
        return {
          division,
          guides: bandyGuides.filter((guide) => guide.awayGuide.division === division)
        }
      }).filter((division) => division.guides.length > 0);

      return {
        fotball: fotballByDivision,
        bandy: bandyByDivision,
      }
    }),
});
