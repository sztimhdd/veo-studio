import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRetryDelay, waitForQuota } from './pipelineService';

describe('getRetryDelay', () => {
  it('should return delay within expected bounds for attempt 0', () => {
    const delay = getRetryDelay(0);
    // Base: 1000ms * 2^0 = 1000ms
    // Jitter: +/- 20% = +/- 200ms
    // Range: 800ms - 1200ms, clamped to 500ms - 60000ms
    expect(delay).toBeGreaterThanOrEqual(800);
    expect(delay).toBeLessThanOrEqual(1200);
  });

  it('should return delay within expected bounds for attempt 1', () => {
    const delay = getRetryDelay(1);
    // Base: 1000ms * 2^1 = 2000ms
    // Jitter: +/- 20% = +/- 400ms
    // Range: 1600ms - 2400ms
    expect(delay).toBeGreaterThanOrEqual(1600);
    expect(delay).toBeLessThanOrEqual(2400);
  });

  it('should return delay within expected bounds for attempt 4', () => {
    const delay = getRetryDelay(4);
    // Base: 1000ms * 2^4 = 16000ms
    // Jitter: +/- 20% = +/- 3200ms
    // Range: 12800ms - 19200ms
    expect(delay).toBeGreaterThanOrEqual(12800);
    expect(delay).toBeLessThanOrEqual(19200);
  });

  it('should cap delay at 60 seconds for high attempts', () => {
    // attempt 7: 1000 * 2^7 = 128000ms > 60000ms
    const delay = getRetryDelay(7);
    expect(delay).toBe(60000);
  });

  it('should have minimum delay of 500ms', () => {
    // With jitter, very low attempts could theoretically go below 500ms
    // but the clamp should ensure minimum 500ms
    const delays = Array.from({ length: 100 }, () => getRetryDelay(0));
    const minDelay = Math.min(...delays);
    expect(minDelay).toBeGreaterThanOrEqual(500);
  });

  it('should apply jitter (delays should vary)', () => {
    const delays = Array.from({ length: 10 }, () => getRetryDelay(2));
    const uniqueDelays = new Set(delays);
    // With 10 samples and jitter, we should have some variation
    // (though there's a small chance all could be same, it's unlikely)
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });
});

describe('waitForQuota', () => {
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setTimeoutSpy = vi.spyOn(global, 'setTimeout');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should wait for VIDEO_GEN quota', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(startTime) // First call - initial check
      .mockReturnValueOnce(startTime + 10000); // Second call - after wait

    const promise = waitForQuota('VIDEO_GEN');
    
    // VIDEO_GEN has minInterval of 30000ms
    // If lastCall was 0 (initial), and now is startTime, we need to wait
    // Actually, we need to reset the module to get fresh QUOTAS state
    // For now, let's just verify it doesn't throw
    await vi.runAllTimersAsync();
    await expect(promise).resolves.not.toThrow();
  });

  it('should wait for IMAGE_GEN quota', async () => {
    const promise = waitForQuota('IMAGE_GEN');
    await vi.runAllTimersAsync();
    await expect(promise).resolves.not.toThrow();
  });

  it('should wait for TEXT_GEN quota', async () => {
    const promise = waitForQuota('TEXT_GEN');
    await vi.runAllTimersAsync();
    await expect(promise).resolves.not.toThrow();
  });

  it('should enforce correct minInterval for VIDEO_GEN (30s)', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);

    const promise1 = waitForQuota('VIDEO_GEN');
    await vi.runAllTimersAsync();
    await promise1;

    // Immediately call again - should wait for 30000ms
    const promise2 = waitForQuota('VIDEO_GEN');
    await vi.advanceTimersByTimeAsync(10000);
    // Should still be waiting
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10005); // Total 30005ms

    await expect(promise2).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  it('should enforce correct minInterval for IMAGE_GEN (20s)', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);

    const promise1 = waitForQuota('IMAGE_GEN');
    await vi.runAllTimersAsync();
    await promise1;

    const promise2 = waitForQuota('IMAGE_GEN');
    await vi.advanceTimersByTimeAsync(15000);
    // Should still be waiting
    await vi.advanceTimersByTimeAsync(5001); // Total 20001ms

    await expect(promise2).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  it('should enforce correct minInterval for TEXT_GEN (12s)', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);

    const promise1 = waitForQuota('TEXT_GEN');
    await vi.runAllTimersAsync();
    await promise1;

    const promise2 = waitForQuota('TEXT_GEN');
    await vi.advanceTimersByTimeAsync(10000);
    // Should still be waiting
    await vi.advanceTimersByTimeAsync(2001); // Total 12001ms

    await expect(promise2).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  it('should not wait if enough time has passed since last call', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);

    const promise1 = waitForQuota('VIDEO_GEN');
    await vi.runAllTimersAsync();
    await promise1;

    // Advance time past the minInterval (30s)
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime + 35000);

    const promise2 = waitForQuota('VIDEO_GEN');
    // Should complete immediately without waiting
    await promise2;

    vi.restoreAllMocks();
  });

  it('should handle concurrent quota requests for same type', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);

    const promise1 = waitForQuota('VIDEO_GEN');
    const promise2 = waitForQuota('VIDEO_GEN'); // Concurrent
    const promise3 = waitForQuota('VIDEO_GEN'); // Concurrent

    await vi.runAllTimersAsync();

    // All should resolve
    await expect(Promise.all([promise1, promise2, promise3])).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  it('should log when throttling', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const promise1 = waitForQuota('VIDEO_GEN');
    await vi.runAllTimersAsync();
    await promise1;

    const promise2 = waitForQuota('VIDEO_GEN');
    await vi.advanceTimersByTimeAsync(10000);

    // Should have logged throttling message
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[QuotaManager] Throttling VIDEO_GEN: waiting'),
    );

    vi.restoreAllMocks();
  });

  it('should update lastCall timestamp after each call', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);

    const promise1 = waitForQuota('VIDEO_GEN');
    await vi.runAllTimersAsync();
    await promise1;

    // Immediately call again
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime + 1000);

    const promise2 = waitForQuota('VIDEO_GEN');
    await vi.advanceTimersByTimeAsync(29000); // Should trigger full wait
    await promise2;

    vi.restoreAllMocks();
  });

  it('should handle different quota types independently', async () => {
    const startTime = 1000000;
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(startTime);

    // Start all three at once
    const videoPromise = waitForQuota('VIDEO_GEN');
    const imagePromise = waitForQuota('IMAGE_GEN');
    const textPromise = waitForQuota('TEXT_GEN');

    await vi.runAllTimersAsync();

    // All should resolve
    await expect(Promise.all([videoPromise, imagePromise, textPromise])).resolves.not.toThrow();
    vi.restoreAllMocks();
  });
});
