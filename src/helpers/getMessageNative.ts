// import browser from '@/webextensions-api';
export const getMessageNative = (typeof browser !== 'undefined' ? browser : chrome).i18n.getMessage;
