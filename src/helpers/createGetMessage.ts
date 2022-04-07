import type { Settings } from '@/settings';
import { getMessageNative } from './getMessageNative';

const browserPolyfill = (typeof browser !== 'undefined' ? browser : chrome);

// TODO make an npm module of this.

// export default function createGetMessage(settings: Pick<Settings, 'language'>): {
// TODO cache (lodash/once)
export async function createGetMessage(overrideLanguage?: ReturnType<typeof browser.i18n.getUILanguage>) {
  if (!overrideLanguage) {
    return getMessageNative;
  }
  // TODO but this import call is gonna be processed by Webpack, so it's gonna try to bundle the i18n files twice.
  // Use `fetch`?
  // const locale = await import(`_locales/${overrideLanguage}`);
  // const localeP = import(`_locales/${overrideLanguage}/messages.json`);
  const localeP = fetch(browserPolyfill.runtime.getURL(`_locales/${overrideLanguage}/messages.json`));
  let locale: { [key: string]: { message: string }};
  try {
    locale = await (await localeP).json();
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to fetch i18n JSON, falling back to default', e);
    }
    return getMessageNative;
  }

  // TODO placeholder substitution.
  // TODO defaulting to `default_locale`.

  // // const transformed = locale
  // for (const [key, value] of Object.entries(locale)) {
  //   // locale[key] = (value as { message: string }).message;
  // }

  // const transformedEntries = Object.entries(locale).map(([key, value]) => [key, value.message])
  // const transformed = Object.fromEntries(transformedEntries);

  // return (messageName: string) => locale[mesageName];
  return (messageName: string) => locale[messageName].message;
}
