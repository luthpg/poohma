import { useContext } from "react";
import {
	AccountContext,
	type AccountContextValue,
} from "@/components/AccountProvider";

const fallbackValue: AccountContextValue = {
	accounts: [],
	activeAccount: null,
	activeAccountId: null,
	isLoading: false,
	switchAccount: async () => {},
	createAccount: async () => "" as never,
	deleteAccount: async () => {},
};

export function useAccount(): AccountContextValue {
	const context = useContext(AccountContext);
	return context || fallbackValue;
}
