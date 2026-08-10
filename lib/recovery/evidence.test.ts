import { describe, expect, it } from "vitest";

import { assessSettlementEvidence, type AssessmentInput } from "./evidence";

const EXPECTED = {
  asset: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
  payer: "0xAaE584e729EDa3D3bB2eCb3b6Fb8C1dC4a9E5f7B",
  payTo: "0x21E5Fc03E4305CC8CFb874253c6d66A8bdB0bcDa",
  valueMicroUsdc: BigInt(1000),
  nonceHex: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

const AUTH_USED = {
  authorizer: EXPECTED.payer,
  nonce: EXPECTED.nonceHex,
  transactionHash: "0xsettletx",
};

const MATCHING_TRANSFER = {
  from: EXPECTED.payer,
  to: EXPECTED.payTo,
  value: BigInt(1000),
};

function baseInput(overrides: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    expected: EXPECTED,
    authUsed: AUTH_USED,
    transferLogs: [MATCHING_TRANSFER],
    txStatus: "success",
    calldata: {
      from: EXPECTED.payer,
      to: EXPECTED.payTo,
      value: BigInt(1000),
      nonce: EXPECTED.nonceHex,
    },
    ...overrides,
  };
}

describe("assessSettlementEvidence", () => {
  it("AuthorizationUsed + matching Transfer + matching calldata → SETTLED", () => {
    expect(assessSettlementEvidence(baseInput())).toEqual({
      status: "settled",
      transactionHash: "0xsettletx",
    });
  });

  it("no AuthorizationUsed → not found (never inferred from Transfer alone)", () => {
    expect(assessSettlementEvidence(baseInput({ authUsed: null }))).toEqual({
      status: "not_found",
    });
  });

  it("AuthorizationUsed with wrong recipient → NOT settled", () => {
    const result = assessSettlementEvidence(
      baseInput({
        transferLogs: [{ ...MATCHING_TRANSFER, to: "0x00000000000000000000000000000000000000EE" }],
        calldata: { ...baseInput().calldata!, to: "0x00000000000000000000000000000000000000EE" },
      })
    );
    expect(result.status).toBe("conflict");
  });

  it("AuthorizationUsed with wrong amount → NOT settled", () => {
    const result = assessSettlementEvidence(
      baseInput({
        transferLogs: [{ ...MATCHING_TRANSFER, value: BigInt(999) }],
        calldata: { ...baseInput().calldata!, value: BigInt(999) },
      })
    );
    expect(result.status).toBe("conflict");
  });

  it("wrong token → NOT settled", () => {
    const result = assessSettlementEvidence(
      baseInput({ expected: { ...EXPECTED, asset: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e" } })
    );
    expect(result.status).toBe("conflict");
  });

  it("wrong payer (event authorizer mismatch) → NOT settled", () => {
    const result = assessSettlementEvidence(
      baseInput({
        authUsed: { ...AUTH_USED, authorizer: "0x00000000000000000000000000000000000000AA" },
      })
    );
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.reason).toContain("payer_nonce");
  });

  it("wrong nonce (event nonce mismatch) → NOT settled", () => {
    const result = assessSettlementEvidence(
      baseInput({
        authUsed: { ...AUTH_USED, nonce: "0x0000000000000000000000000000000000000000000000000000000000000002" },
      })
    );
    expect(result.status).toBe("conflict");
  });

  it("matching Transfer without AuthorizationUsed → NOT settled", () => {
    // No auth-used event: recovery cannot bind the transfer to this
    // authorization (a generic Transfer alone is never sufficient).
    const result = assessSettlementEvidence(baseInput({ authUsed: null }));
    expect(result.status).toBe("not_found");
  });

  it("reverted transaction → NOT settled", () => {
    const result = assessSettlementEvidence(baseInput({ txStatus: "reverted" }));
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.reason).toBe("tx_reverted");
  });

  it("calldata mismatch → NOT settled even with matching events", () => {
    const result = assessSettlementEvidence(
      baseInput({
        calldata: { ...baseInput().calldata!, value: BigInt(5000) },
      })
    );
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.reason).toBe("calldata_mismatch");
  });

  it("missing expected transfer with no payer transfer at all → conflict (absent)", () => {
    const result = assessSettlementEvidence(baseInput({ transferLogs: [] }));
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.reason).toBe("expected_transfer_absent");
  });

  it("transfer exists but from a different payer → conflict", () => {
    const result = assessSettlementEvidence(
      baseInput({
        transferLogs: [{ ...MATCHING_TRANSFER, from: "0x00000000000000000000000000000000000000BB" }],
      })
    );
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.reason).toBe("expected_transfer_absent");
  });

  it("values compare bigint-safe", () => {
    const huge = BigInt("1000000000000000000000");
    const result = assessSettlementEvidence(
      baseInput({
        transferLogs: [{ ...MATCHING_TRANSFER, value: huge }],
        calldata: { ...baseInput().calldata!, value: huge },
      })
    );
    expect(result.status).toBe("conflict");
  });

  it("undecodable calldata still settles when events match (event evidence is binding)", () => {
    const result = assessSettlementEvidence(baseInput({ calldata: null }));
    expect(result.status).toBe("settled");
  });
});
