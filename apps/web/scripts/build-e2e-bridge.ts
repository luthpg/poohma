import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type BuildOptions } from "esbuild";

const dirname =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));

const options: BuildOptions = {
	entryPoints: [
		path.resolve(dirname, "../e2e/support/firebase-browser-bridge.ts"),
	],
	outfile: path.resolve(dirname, "../e2e/.gen/firebase-bridge.iife.js"),
	bundle: true,
	format: "iife",
	platform: "browser",
	target: "es2020",
	sourcemap: false,
};

await build(options);
console.log("Built e2e/.gen/firebase-bridge.iife.js successfully.");
