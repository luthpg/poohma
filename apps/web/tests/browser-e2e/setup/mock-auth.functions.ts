export const syncUser = async () => "mock-user-id";
export const refreshSessionCookie = async () => ({ success: true });
export const getAuthUser = async () => null;
export const logout = async () => ({ success: true });
export const getCustomTokenFromSession = async () => ({
	customToken: "mock-token",
});
