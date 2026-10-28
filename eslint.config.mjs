import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Flat config doesn't read .gitignore, so local build output and worktrees must be listed here
    ignores: ["src/types/wordpresstypes/**", "src/generated/**", ".react-email/**", ".claude/**"]
  },
  ...nextCoreWebVitals,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler rules added in eslint-plugin-react-hooks 7; warn until the existing code is migrated
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn"
    }
  },
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports"
        }
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    files: ["tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    // Vitest asymmetric matchers such as expect.stringContaining() are typed as any
    files: ["test/**"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off"
    }
  }
);
