/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/guardrail.json`.
 */
export type Guardrail = {
  "address": "HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS",
  "metadata": {
    "name": "guardrail",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "agent"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executePayment",
      "discriminator": [
        86,
        4,
        7,
        7,
        120,
        139,
        232,
        139
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true
        },
        {
          "name": "agentAuthority",
          "signer": true
        },
        {
          "name": "recipient",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeAgent",
      "discriminator": [
        212,
        81,
        156,
        211,
        212,
        110,
        21,
        28
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "agentAuthority",
          "type": "pubkey"
        },
        {
          "name": "maxPerTransaction",
          "type": "u64"
        },
        {
          "name": "dailyLimit",
          "type": "u64"
        },
        {
          "name": "allowedRecipient",
          "type": "pubkey"
        },
        {
          "name": "expiry",
          "type": "i64"
        }
      ]
    },
    {
      "name": "pauseAgent",
      "discriminator": [
        148,
        32,
        1,
        26,
        147,
        122,
        178,
        140
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "agent"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "resetDailySpend",
      "discriminator": [
        174,
        162,
        143,
        213,
        170,
        123,
        48,
        42
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "agent"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "resumeAgent",
      "discriminator": [
        124,
        252,
        120,
        140,
        221,
        125,
        85,
        247
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "agent"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updatePolicy",
      "discriminator": [
        212,
        245,
        246,
        7,
        163,
        151,
        18,
        57
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "agent"
          ]
        }
      ],
      "args": [
        {
          "name": "maxPerTransaction",
          "type": "u64"
        },
        {
          "name": "dailyLimit",
          "type": "u64"
        },
        {
          "name": "allowedRecipient",
          "type": "pubkey"
        },
        {
          "name": "expiry",
          "type": "i64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agent",
      "discriminator": [
        47,
        166,
        112,
        147,
        155,
        197,
        86,
        7
      ]
    }
  ],
  "events": [
    {
      "name": "paymentExecuted",
      "discriminator": [
        153,
        165,
        141,
        18,
        246,
        20,
        204,
        227
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorizedOwner",
      "msg": "Only the agent owner can perform this action"
    },
    {
      "code": 6001,
      "name": "unauthorizedAgent",
      "msg": "Unauthorized agent authority"
    },
    {
      "code": 6002,
      "name": "invalidAmount",
      "msg": "Transaction amount must be greater than zero"
    },
    {
      "code": 6003,
      "name": "invalidTransactionLimit",
      "msg": "Invalid per-transaction limit"
    },
    {
      "code": 6004,
      "name": "invalidDailyLimit",
      "msg": "Daily limit must be greater than or equal to the transaction limit"
    },
    {
      "code": 6005,
      "name": "invalidExpiry",
      "msg": "Policy expiry must be in the future"
    },
    {
      "code": 6006,
      "name": "agentPaused",
      "msg": "The agent is paused"
    },
    {
      "code": 6007,
      "name": "policyExpired",
      "msg": "The policy has expired"
    },
    {
      "code": 6008,
      "name": "recipientNotAllowed",
      "msg": "Recipient is not allowed by policy"
    },
    {
      "code": 6009,
      "name": "perTransactionLimitExceeded",
      "msg": "Per-transaction spending limit exceeded"
    },
    {
      "code": 6010,
      "name": "dailyLimitExceeded",
      "msg": "Daily spending limit exceeded"
    },
    {
      "code": 6011,
      "name": "insufficientVaultBalance",
      "msg": "Insufficient vault balance"
    }
  ],
  "types": [
    {
      "name": "agent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agentAuthority",
            "type": "pubkey"
          },
          {
            "name": "maxPerTransaction",
            "type": "u64"
          },
          {
            "name": "dailyLimit",
            "type": "u64"
          },
          {
            "name": "spentToday",
            "type": "u64"
          },
          {
            "name": "dayStart",
            "type": "i64"
          },
          {
            "name": "allowedRecipient",
            "type": "pubkey"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "paymentExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
