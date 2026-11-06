import { useCallback } from 'react';
import { translations } from './translations';

export const AVAILABLE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh_tw', label: '正體中文' },
  { code: 'zh_cn', label: '简体中文' },
  { code: 'es', label: 'Español' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'he', label: 'עברי' },
  { code: 'it', label: 'Italiano' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'ru', label: 'Русский' },
  { code: 'ua', label: 'Український' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'fa', label: 'فارسی' },
  { code: 'pl', label: 'Polski' },
];

export function translate(lang: string, key: string, params?: Record<string, string | number>): string {
  const dict = translations[lang] || translations.en || {};
  let template = dict[key] ?? translations.en?.[key] ?? key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      template = template.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
    });
  }
  return template;
}

export function useTranslation(lang: string) {
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang]
  );
  return { t };
}

