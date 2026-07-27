export type SettingCategory = 'GENERAL' | 'NOTIFICATIONS' | 'INTEGRATIONS' | 'SECURITY' | 'APPEARANCE';

/** Mirrors the backend `SettingDto` record exactly. */
export interface SettingDto {
  key: string;
  value: string;
  category: SettingCategory;
}

export interface SettingUpdateItem {
  key: string;
  value: string;
}
