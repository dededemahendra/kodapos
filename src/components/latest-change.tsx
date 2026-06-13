"use client";

import { Link } from "@tanstack/react-router";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { LATEST_CHANGE, localized } from "~/lib/changelog";
import type { Locale } from "~/lib/locale";
import { getDismissedChangelog, storeDismissedChangelog } from "~/lib/preferences";
import { cn } from "~/lib/utils";

export function LatestChange() {
	const { i18n } = useLingui();
	const latest = LATEST_CHANGE;
	// Start visible so SSR and the first client render agree; hide after mount if
	// this version was already dismissed (avoids a hydration mismatch).
	const [hidden, setHidden] = useState(false);
	useEffect(() => {
		if (getDismissedChangelog() === latest.version) setHidden(true);
	}, [latest.version]);

	if (hidden) return null;

	const locale: Locale = i18n.locale === "en" ? "en" : "id";

	function dismiss() {
		storeDismissedChangelog(latest.version);
		setHidden(true);
	}

	return (
		<div
			className={cn(
				"group/latest-change size-full min-h-27 justify-center border-t",
				"relative flex size-full flex-col gap-1 overflow-hidden px-4 pt-3 pb-1",
				"transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0"
			)}
		>
			<span className="font-light font-mono text-[10px] text-nowrap text-muted-foreground">
				<Trans>PEMBARUAN</Trans>
			</span>
			<p className="pr-6 font-medium text-xs">{localized(latest.title, locale)}</p>
			<span className="text-[10px] text-muted-foreground">
				{localized(latest.summary, locale)}
			</span>
			<Button
				asChild
				className="w-max px-0 font-light text-xs"
				size="sm"
				variant="link"
			>
				<Link to="/changelog"><Trans>Selengkapnya</Trans></Link>
			</Button>
			<Button
				className="absolute top-2 right-2 z-10 size-6 rounded-full opacity-0 transition-opacity group-hover/latest-change:opacity-100"
				onClick={dismiss}
				size="icon-sm"
				variant="ghost"
				aria-label="dismiss"
			>
				<XIcon className="size-3.5 text-muted-foreground" />
			</Button>
		</div>
	);
}
