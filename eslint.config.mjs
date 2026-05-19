import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "android/**",
      "ios/**",
      ".android-*/**",
      "www/**",
    ],
  },
  {
    rules: {
      // Production readiness: keep lint focused on correctness, not banning `any` across the codebase.
      "@typescript-eslint/no-explicit-any": "off",

      // Too noisy for this codebase; not a correctness blocker.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
