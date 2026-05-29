import { Hammer } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";

/** Placeholder for nav destinations that are scaffolded but not built yet. */
export function ComingSoon({ title }: { title: string }) {
	return (
		<div className="flex flex-1 items-center justify-center p-10">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Hammer />
					</EmptyMedia>
					<EmptyTitle>{title}</EmptyTitle>
					<EmptyDescription>
						Halaman ini sedang dalam pengembangan.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
