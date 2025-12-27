import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import * as clientModule from "../client";

describe("connectWithRetry", () => {
  let consoleLogs: string[] = [];
  let consoleErrors: string[] = [];
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let pingDatabaseMock: ReturnType<typeof mock>;

  beforeEach(() => {
    consoleLogs = [];
    consoleErrors = [];

    // Spy on console methods
    consoleLogSpy = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        consoleLogs.push(args.join(" "));
      },
    );
    consoleErrorSpy = spyOn(console, "error").mockImplementation(
      (...args: unknown[]) => {
        consoleErrors.push(args.join(" "));
      },
    );

    // Mock pingDatabase on the module
    pingDatabaseMock = mock();
    spyOn(clientModule, "pingDatabase").mockImplementation(pingDatabaseMock);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    mock.restore();
  });

  it("should succeed on first attempt", async () => {
    pingDatabaseMock.mockResolvedValueOnce("2024-12-27 12:00:00");

    await clientModule.connectWithRetry(5, 10);

    expect(pingDatabaseMock).toHaveBeenCalledTimes(1);
    expect(consoleLogs).toContain("[DB] Connection attempt 1/5...");
    expect(consoleLogs).toContain("[DB] Connection successful");
    expect(consoleErrors).toHaveLength(0);
  });

  it("should retry on failure and eventually succeed", async () => {
    pingDatabaseMock
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValueOnce("2024-12-27 12:00:00");

    await clientModule.connectWithRetry(5, 10);

    expect(pingDatabaseMock).toHaveBeenCalledTimes(3);
    expect(consoleLogs).toContain("[DB] Connection attempt 1/5...");
    expect(consoleLogs).toContain("[DB] Connection attempt 2/5...");
    expect(consoleLogs).toContain("[DB] Connection attempt 3/5...");
    expect(consoleLogs).toContain("[DB] Connection successful");
    expect(consoleErrors).toContain(
      "[DB] Connection attempt 1 failed: Connection refused",
    );
    expect(consoleErrors).toContain(
      "[DB] Connection attempt 2 failed: Connection refused",
    );
  });

  it("should throw error after max retries exhausted", async () => {
    pingDatabaseMock.mockRejectedValue(new Error("Connection refused"));

    await expect(clientModule.connectWithRetry(3, 10)).rejects.toThrow(
      "Failed to connect to database after 3 attempts: Connection refused",
    );

    expect(pingDatabaseMock).toHaveBeenCalledTimes(3);
    expect(consoleErrors).toContain("[DB] Max retries reached, giving up");
  });

  it("should use exponential backoff timing", async () => {
    // Mock setTimeout to execute immediately while capturing delays
    const originalSetTimeout = globalThis.setTimeout;
    const capturedDelays: number[] = [];
    globalThis.setTimeout = ((fn: () => void, delay: number) => {
      capturedDelays.push(delay);
      fn(); // Execute immediately
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      pingDatabaseMock
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockResolvedValueOnce("2024-12-27 12:00:00");

      await clientModule.connectWithRetry(5, 100);

      expect(pingDatabaseMock).toHaveBeenCalledTimes(4);
      // Verify exponential backoff delays: 100ms, 200ms, 400ms
      expect(capturedDelays[0]).toBe(100);
      expect(capturedDelays[1]).toBe(200);
      expect(capturedDelays[2]).toBe(400);
      // Also verify log messages
      expect(consoleLogs).toContain("[DB] Retrying in 0.1s...");
      expect(consoleLogs).toContain("[DB] Retrying in 0.2s...");
      expect(consoleLogs).toContain("[DB] Retrying in 0.4s...");
      expect(consoleLogs).toContain("[DB] Connection successful");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it("should cap delay at max delay (60s)", async () => {
    // Mock setTimeout to execute immediately
    const originalSetTimeout = globalThis.setTimeout;
    const capturedDelays: number[] = [];
    globalThis.setTimeout = ((fn: () => void, delay: number) => {
      capturedDelays.push(delay);
      fn(); // Execute immediately
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      // Mock to fail 5 times then succeed
      pingDatabaseMock
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockResolvedValueOnce("2024-12-27 12:00:00");

      // Start at 10s delay - will grow: 10s, 20s, 40s, 80s->60s(capped), 160s->60s(capped)
      await clientModule.connectWithRetry(6, 10000);

      expect(pingDatabaseMock).toHaveBeenCalledTimes(6);
      // Verify delays cap at 60s via captured setTimeout calls
      expect(capturedDelays[0]).toBe(10000); // 10s
      expect(capturedDelays[1]).toBe(20000); // 20s
      expect(capturedDelays[2]).toBe(40000); // 40s
      expect(capturedDelays[3]).toBe(60000); // 60s (capped from 80s)
      expect(capturedDelays[4]).toBe(60000); // 60s (capped from 160s)
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
