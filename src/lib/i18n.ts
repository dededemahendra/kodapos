import { i18n } from '@lingui/core';
import { getStoredLocale } from '~/lib/locale';
import { messages as enMessages } from '~/locales/en/messages.po';
import { messages as idMessages } from '~/locales/id/messages.po';

i18n.load({ id: idMessages, en: enMessages });
i18n.activate(getStoredLocale());

export { i18n };
