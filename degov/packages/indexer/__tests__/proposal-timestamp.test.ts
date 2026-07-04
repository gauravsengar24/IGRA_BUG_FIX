import { ClockMode } from "../src/internal/chaintool";
import { calculateProposalVoteTimestamp } from "../src/handler/governor";

describe("calculateProposalVoteTimestamp", () => {
  describe("BlockNumber clock mode", () => {
    // Real on-chain data from Igra governance proposal:
    // Created at block 8,692,791 (timestamp 1780998096000 ms = Tue Jun 9, 12:41 PM)
    // voteStart block: 8,735,991 (votingDelay = 43,200 blocks)
    // voteEnd block: 8,865,591 (votingPeriod = 129,600 blocks)
    // Block interval: ~1.01 seconds

    const realProposal = {
      clockMode: ClockMode.BlockNumber,
      proposalCreatedBlock: 8692791,
      proposalVoteStart: 8735991,
      proposalVoteEnd: 8865591,
      proposalStartTimestamp: 1780998096000, // ms
      blockInterval: 1.01,
    };

    it("should calculate voteStart timestamp using voting delay, not creation time", () => {
      const result = calculateProposalVoteTimestamp(realProposal);

      // votingDelay = 43,200 blocks × 1.01s = 43,632 seconds
      const expectedDelay = 43200 * 1.01 * 1000; // in ms
      const expectedVoteStart =
        realProposal.proposalStartTimestamp + expectedDelay;

      // voteStart must NOT equal creation timestamp
      expect(result.voteStart).not.toBe(realProposal.proposalStartTimestamp);
      // voteStart should be ~12h after creation
      expect(result.voteStart).toBeCloseTo(expectedVoteStart, -3); // within 1 second
    });

    it("should calculate voteEnd timestamp using full block distance from creation", () => {
      const result = calculateProposalVoteTimestamp(realProposal);

      // Total blocks from creation to voteEnd = 8,865,591 - 8,692,791 = 172,800
      // 172,800 blocks × 1.01s = 174,528 seconds
      const totalBlocks =
        realProposal.proposalVoteEnd - realProposal.proposalCreatedBlock;
      const expectedVoteEnd =
        realProposal.proposalStartTimestamp +
        totalBlocks * realProposal.blockInterval * 1000;

      expect(result.voteEnd).toBeCloseTo(expectedVoteEnd, -3);
    });

    it("should produce a voting period duration matching the block count", () => {
      const result = calculateProposalVoteTimestamp(realProposal);

      const votingPeriodBlocks =
        realProposal.proposalVoteEnd - realProposal.proposalVoteStart;
      const expectedPeriodMs =
        votingPeriodBlocks * realProposal.blockInterval * 1000;
      const actualPeriodMs = result.voteEnd - result.voteStart;

      // The voting period (end - start) should be ~129,600 blocks × 1.01s ≈ 36.4 hours
      expect(actualPeriodMs).toBeCloseTo(expectedPeriodMs, -3);
      // Not 48 hours
      expect(actualPeriodMs).toBeLessThan(48 * 3600 * 1000);
      // At least 35 hours
      expect(actualPeriodMs).toBeGreaterThan(35 * 3600 * 1000);
    });

    it("should handle 1-second block interval", () => {
      const result = calculateProposalVoteTimestamp({
        ...realProposal,
        blockInterval: 1,
      });

      const delayMs = 43200 * 1 * 1000;
      expect(result.voteStart).toBeCloseTo(
        realProposal.proposalStartTimestamp + delayMs,
        -3
      );
    });

    it("should handle 12-second block interval (Ethereum mainnet)", () => {
      const opts = {
        clockMode: ClockMode.BlockNumber,
        proposalCreatedBlock: 1000,
        proposalVoteStart: 1100, // delay = 100 blocks
        proposalVoteEnd: 1600, // period = 500 blocks
        proposalStartTimestamp: 1700000000000,
        blockInterval: 12,
      };
      const result = calculateProposalVoteTimestamp(opts);

      const expectedVoteStart = 1700000000000 + 100 * 12 * 1000;
      const expectedVoteEnd = 1700000000000 + 600 * 12 * 1000;

      expect(result.voteStart).toBeCloseTo(expectedVoteStart, -3);
      expect(result.voteEnd).toBeCloseTo(expectedVoteEnd, -3);
    });
  });

  describe("Timestamp clock mode", () => {
    it("should use voteStart and voteEnd as direct timestamps", () => {
      const result = calculateProposalVoteTimestamp({
        clockMode: ClockMode.Timestamp,
        proposalCreatedBlock: 1000,
        proposalVoteStart: 1700001200, // seconds
        proposalVoteEnd: 1700087600, // seconds
        proposalStartTimestamp: 1700000000000, // ms
        blockInterval: 1,
      });

      expect(result.voteStart).toBe(1700001200 * 1000);
      expect(result.voteEnd).toBe(1700087600 * 1000);
    });
  });
});
