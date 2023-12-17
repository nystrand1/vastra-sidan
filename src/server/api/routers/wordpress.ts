import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { GetChroniclesDocument } from "~/types/wordpresstypes/graphql";


export const wordpressRouter = createTRPCRouter({
  getChronicles: publicProcedure
    .query(async ({ ctx }) => {
      console.log("asdkljasdklasjd");
      console.log(ctx.apolloClient);
      const res = await ctx.apolloClient.query({
        query: GetChroniclesDocument
      });

      return res.data.chronicles.nodes;
    }),
});
