export interface WebAuthnSupportCheck {
  supported: boolean
  message?: string
}

export function checkWebAuthnSupport(): WebAuthnSupportCheck {
  if (!window?.PublicKeyCredential) {
    return {
      supported: false,
      message:
        'Your browser does not support passkeys. Please use a modern browser like Chrome, Safari, or Edge.'
    }
  }

  return { supported: true }
}
