/* eslint-disable import/no-extraneous-dependencies */
import { type CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: (process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://api.vastrasidan.se') + '/graphql',
  // this assumes that all your source files are in a top-level `src/` directory - you might need to adjust this to your file structure
  documents: ['src/**/*.gql'],
  generates: {
    './src/types/wordpresstypes/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typed-document-node',
        {
          add: {
            content: '/* eslint-disable */',
          },
        },
      ],
      config: {
        maybeValue: 'T',
        avoidOptionals: true,
      },
      presetConfig: {
        gqlTagName: 'gql',
        fragmentMasking: false,
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
