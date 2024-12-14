import {
  ApolloClient,
  InMemoryCache,
  type DefaultOptions
} from '@apollo/client';
import { env } from '~/env.mjs';

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
  uri: env.NEXT_PUBLIC_WORDPRESS_URL + '/graphql',
  ssrMode: true,
  cache: new InMemoryCache(),
  defaultOptions,
  headers: {
    'Authorization': `Bearer ${env.WORDPRESS_API_KEY}`,
  }
});

export const apolloClient = createApolloClient();
