import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "~/components/ui/breadcrumb";

/** Current page segment shown in the header — pass a nav item or `{ title, icon? }`. */
export type AppBreadcrumbPage = {
	title: MessageDescriptor;
	icon?: ReactNode;
};

export function AppBreadcrumbs({ page }: { page?: AppBreadcrumbPage | null }) {
	const { i18n } = useLingui();

	if (!page?.title) {
		return null;
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbPage className="flex items-center gap-2 [&>svg]:size-3.5">
						{page.icon}
						{i18n._(page.title)}
					</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}
