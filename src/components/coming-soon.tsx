import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { Hammer } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";

/** Placeholder for nav destinations that are scaffolded but not built yet. */
export function ComingSoon({ title }: { title: MessageDescriptor }) {
	const { i18n } = useLingui();
	return (
		<div className="flex flex-1 items-center justify-center p-10">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Hammer />
					</EmptyMedia>
					<EmptyTitle>{i18n._(title)}</EmptyTitle>
					<EmptyDescription>
						<Trans>Halaman ini sedang dalam pengembangan.</Trans>
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
