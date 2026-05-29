import { i18n } from '@lingui/core';
import { DEFAULT_LOCALE } from '~/lib/locale';
import { messages as enMessages } from '~/locales/en/messages.po';
import { messages as idMessages } from '~/locales/id/messages.po';

i18n.load({ id: idMessages, en: enMessages });
// Always activate the default locale at module load so that the server render
// and the client first render both start from the same locale ('id').
// LocaleProvider will switch to the user's persisted locale after mount.
i18n.activate(DEFAULT_LOCALE);

export { i18n };
