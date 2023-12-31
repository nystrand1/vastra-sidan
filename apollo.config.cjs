import { env } from "~/env.mjs";

module.exports = {
    client: {
      service: {
        name: "vastra-cms",
        url: env.NEXT_PUBLIC_WORDPRESS_URL + "/graphql",
      },
    },
  };
