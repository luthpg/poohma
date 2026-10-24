// デフォルト（ローカル開発・ステージング環境用）: poohma-staging
// 本番デプロイ時は CI ワークフロー（scripts/switch-auth-config.ts）により本番専用（poohma）へ切り替えられます。
export default {
  providers: [
    {
      domain: "https://securetoken.google.com/poohma-staging",
      applicationID: "poohma-staging",
    },
  ],
};
