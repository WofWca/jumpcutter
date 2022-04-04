// import browser from '@/webextensions-api';
export const getMessage = (typeof browser !== 'undefined' ? browser : chrome).i18n.getMessage;
