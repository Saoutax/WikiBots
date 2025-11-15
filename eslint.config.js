import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		files: ["**/*.{js,mjs,cjs}"],
		plugins: { js },
		extends: ["js/recommended"],
		languageOptions: {
			globals: globals.browser,
		},
		rules: {
			"indent": ["error", "tab"],
			"quotes": ["error", "double"],
			"semi": ["error", "always"],
			"dot-notation": "error",
			"no-duplicate-imports": "error",
			"no-unused-vars": "error",
			"prefer-const": "warn",
			"no-template-curly-in-string": "error",
			"no-unmodified-loop-condition": "warn",
			"no-unreachable-loop": "error",
			"curly": ["error", "all"],
			"linebreak-style": ["error", "unix"],
		},
	},
]);
