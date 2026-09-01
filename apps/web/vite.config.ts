import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(async ({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	Object.assign(process.env, env);

	// ビルド時に必須環境変数（client / server）の存在を検証
	await import("./src/env/client.ts");
	await import("./src/env/server.ts");

	return {
		resolve: {
			tsconfigPaths: true,
		},
		plugins: [
			devtools(),
			nitro({
				preset: "vercel",
			}),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
			basicSsl(),
		],
		server: {
			proxy: {
				"/__/auth": {
					target: `https://${env.VITE_FIREBASE_AUTH_DOMAIN}`,
					changeOrigin: true,
				},
			},
		},
		ssr: {
			external: ["papaparse"],
		},
	};
});
