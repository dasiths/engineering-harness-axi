import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.ts"],
  extends: [...tseslint.configs.recommended],
  rules: {
    "no-debugger": "error",
    "no-constant-condition": "error",
    "eqeqeq": "error"
  }
});
