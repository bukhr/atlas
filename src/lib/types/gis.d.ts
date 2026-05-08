/**
 * Type declarations for Google Identity Services (GIS) SDK
 * @see https://developers.google.com/identity/oauth2/web/reference/js-reference
 */

declare namespace google.accounts.oauth2 {
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string; hint?: string }): void;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: ErrorResponse) => void;
    prompt?: string;
    hint?: string;
  }

  interface TokenResponse {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
    error?: string;
    error_description?: string;
    error_uri?: string;
  }

  interface ErrorResponse {
    type: string;
    message: string;
  }

  interface CodeClient {
    requestCode(): void;
  }

  interface CodeClientConfig {
    client_id: string;
    scope: string;
    callback: (response: CodeResponse) => void;
    error_callback?: (error: ErrorResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    redirect_uri?: string;
    select_account?: boolean;
  }

  interface CodeResponse {
    code: string;
    scope: string;
    error?: string;
    error_description?: string;
    error_uri?: string;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function initCodeClient(config: CodeClientConfig): CodeClient;
  function revoke(token: string, callback?: () => void): void;
  function hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
}

declare namespace google.accounts.id {
  interface IdConfiguration {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: 'signin' | 'signup' | 'use';
  }

  interface CredentialResponse {
    credential: string; // JWT ID token
    select_by: string;
  }

  function initialize(config: IdConfiguration): void;
  function prompt(momentListener?: (notification: PromptMomentNotification) => void): void;
  function disableAutoSelect(): void;

  interface PromptMomentNotification {
    isDisplayMoment(): boolean;
    isDisplayed(): boolean;
    isNotDisplayed(): boolean;
    getNotDisplayedReason(): string;
    isSkippedMoment(): boolean;
    getSkippedReason(): string;
    isDismissedMoment(): boolean;
    getDismissedReason(): string;
  }
}
