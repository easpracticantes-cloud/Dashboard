/**
 * Tipos mínimos para Google Identity Services (GIS), cargado desde
 * https://accounts.google.com/gsi/client en index.html.
 */
export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

export interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  ux_mode?: 'popup' | 'redirect';
}

export interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number | string;
  locale?: string;
}

export interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: GoogleTokenError) => void;
  prompt?: '' | 'none' | 'consent' | 'select_account';
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleTokenError {
  type?: string;
  message?: string;
}

export interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}

export interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  prompt(): void;
  disableAutoSelect(): void;
  revoke(hint: string, callback?: (response: { successful: boolean }) => void): void;
}

export interface GoogleAccountsOauth2 {
  initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
}

export interface GoogleAccounts {
  id: GoogleAccountsId;
  oauth2: GoogleAccountsOauth2;
}

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccounts;
    };
  }
}

export {};
