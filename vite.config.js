import { defineConfig } from "vite";
import { playtestLogPlugin } from "./scripts/playtest-log-plugin.mjs";
export default defineConfig({
    base: "./",
    plugins: [playtestLogPlugin()],
    build: {
        target: "es2022",
    },
});
