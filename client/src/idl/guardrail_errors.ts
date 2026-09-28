
export const GuardrailErrorCode = {
  UnauthorizedOwner: 6000,
  UnauthorizedAgent: 6001,
  InvalidAmount: 6002,
  InvalidTransactionLimit: 6003,
  InvalidDailyLimit: 6004,
  InvalidExpiry: 6005,
  AgentPaused: 6006,
  PolicyExpired: 6007,
  RecipientNotAllowed: 6008,
  PerTransactionLimitExceeded: 6009,
  DailyLimitExceeded: 6010,
  InsufficientVaultBalance: 6011
};

export type GuardrailErrorName = keyof typeof GuardrailErrorCode;
