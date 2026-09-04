import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserAvatarProps {
	displayName?: string | null;
	email?: string | null;
	photoURL?: string | null;
	className?: string;
	fallbackClassName?: string;
}

export function UserAvatar({
	displayName,
	email,
	photoURL,
	className = "h-8 w-8",
	fallbackClassName = "bg-orange-500 text-white text-[12px] font-semibold",
}: UserAvatarProps) {
	return (
		<Avatar className={className}>
			<AvatarImage src={photoURL ?? undefined} alt={displayName ?? ""} />
			<AvatarFallback className={fallbackClassName}>
				{(displayName || email || "U").slice(0, 1).toUpperCase()}
			</AvatarFallback>
		</Avatar>
	);
}
