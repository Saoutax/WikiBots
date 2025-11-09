import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{ files: ["**/*.{js,mjs,cjs}"],
		plugins: { js },
		extends: ["js/recommended"],
		languageOptions: { globals: globals.browser },
		rules: {
			"indent": ["error", "tab"],
			"quotes": ["error", "double"],
			"semi": ["error", "always"],
			"comma-spacing": ["error", { "before": false, "after": true }],
			"no-unused-vars": "warn",
			"no-undef": "error",
			"no-dupe-keys": "error",
			"no-dupe-args": "error",
			"no-duplicate-case": "error",
			"eqeqeq": ["error", "always"],
			"curly": ["error", "all"],
			"default-case": "warn",
			"dot-notation": "error",
			"prefer-const": "warn",
			"no-var": "error",
			"arrow-spacing": ["error", { "before": true, "after": true }],
			"func-call-spacing": ["error", "never"],
			"no-spaced-func": "error",
			"array-bracket-spacing": ["error", "never"],
			"object-curly-spacing": ["error", "always"],
			"brace-style": ["error", "1tbs"],
			"no-trailing-spaces": "error",
			"eol-last": ["error", "always"],
			"no-multiple-empty-lines": ["error", { "max": 2, "maxEOF": 1 }]
		}
	},
]);
