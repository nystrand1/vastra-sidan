import {
  ApolloClient,
  InMemoryCache,
  type DefaultOptions
} from '@apollo/client';

/**
 * Disable InMemoryCache at the moment
 * since we have frontend running on multiple pods
 */
const defaultOptions: DefaultOptions = {
  watchQuery: {
    fetchPolicy: 'no-cache',
    errorPolicy: 'ignore',
  },
  query: {
    fetchPolicy: 'no-cache',
    errorPolicy: 'all',
  },
};

const createApolloClient = () => new ApolloClient({
  // Replace rest endpoint with GraphQL
  uri: "https://cmsdev.vastrasidan.se/graphql",
  ssrMode: true,
  cache: new InMemoryCache(),
  defaultOptions,
});

export const apolloClient = createApolloClient();
