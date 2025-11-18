# Logic Review of Bot Script (index.ts)
**Review Date:** 2025-01-XX  
**Version:** Current (TypeScript/Playwright)

## Executive Summary

This bot automates lesson reservations for the COSPA Wellness booking system. It waits until a specific time, logs in, navigates to the booking page, and attempts to reserve a lesson slot. The code has been improved since the previous review, but several issues remain.

---

## Critical Issues

### 1. **Variable Shadowing Bug in log.ts (Line 15-16)**
- **Location:** `src/log.ts:15-16`
- **Issue:** The `setProfile` function parameter shadows the module-level `profile` variable
- **Code:**
  ```typescript
  export function setProfile(profile: string): void {
      profile = profile;  // ❌ This assigns parameter to itself, not updating module variable
  }
  ```
- **Impact:** Profile name is never actually set, logs will always show "test" profile
- **Fix:**
  ```typescript
  export function setProfile(newProfile: string): void {
      profile = newProfile;
  }
  ```

### 2. **Timezone Handling Inconsistency**
- **Location:** `src/helpers.ts:31-44`, `src/index.ts:47-58`
- **Issue:** Mixed timezone handling approaches:
  - `parseDateTime()` assumes system is in Tokyo timezone (line 34 comment)
  - `getTokyoTime()` manually calculates UTC+9 offset
  - `parseDateTime()` is called with `toISOString()` output (UTC) but parsed as local time
- **Risk:** If system is not in Tokyo timezone, timing will be incorrect
- **Impact:** Bot may start too early or late, missing reservation window
- **Example Problem:**
  ```typescript
  // Line 51: Converts to UTC ISO string
  const reservation_time_str1 = reservation_time2.toISOString().replace('T', ' ').substring(0, 19);
  // Line 58: Parses as local time (assumes Tokyo)
  const startTime = parseDateTime(reservation_time_str1);
  ```
- **Recommendation:** 
  - Use a proper timezone library (e.g., `date-fns-tz` or `luxon`)
  - Or document that system MUST be in Tokyo timezone
  - Or consistently use UTC and convert at boundaries

### 3. **Negative Wait Time Not Handled**
- **Location:** `src/index.ts:28-32`
- **Issue:** If `timeToWait` is negative (bot started late), `sleep()` is called with negative value
- **Impact:** Behavior is undefined (may resolve immediately or throw error)
- **Current Code:**
  ```typescript
  async function waitUntil(targetDate: Date): Promise<void> {
    const now = new Date();
    const timeToWait = targetDate.getTime() - now.getTime();
    await sleep(timeToWait);  // ❌ Can be negative
  }
  ```
- **Fix:**
  ```typescript
  async function waitUntil(targetDate: Date): Promise<void> {
    const now = new Date();
    const timeToWait = targetDate.getTime() - now.getTime();
    if (timeToWait > 0) {
      await sleep(timeToWait);
    } else {
      log(`警告: 予約時刻を過ぎています。${formatDateTime(now)} (目標: ${formatDateTime(targetDate)})`);
    }
  }
  ```

### 4. **Application Time Variable Confusion**
- **Location:** `src/index.ts:179, 318`
- **Issue:** `application_time` is set to `start_dt` but then modified with `setTime()`, making it confusing
- **Code:**
  ```typescript
  const application_time = start_dt;  // Line 179
  // ... later ...
  application_time.setTime(Date.now());  // Line 318
  ```
- **Impact:** Variable name doesn't reflect actual usage, could cause confusion
- **Recommendation:** Use separate variables:
  ```typescript
  const reservation_start_time = start_dt;
  // ... later ...
  const confirmation_click_time = getTokyoTime();
  ```

---

## Medium Issues

### 5. **Config File Path Hardcoded**
- **Location:** `src/index.ts:22`
- **Issue:** Test function uses `test-config.json` which may not exist
- **Impact:** Requires specific file naming, unclear error if missing
- **Recommendation:** Check for existence and provide clear error message

### 6. **No Error Handling for Config Parsing**
- **Location:** `src/index.ts:11-18`
- **Issue:** `JSON.parse` can throw if config is malformed
- **Impact:** Unhandled exception crashes program
- **Fix:**
  ```typescript
  function parseConfig(configPath: string): ConfigData {
    if (!fs.existsSync(configPath)) {
      throw new Error(`設定ファイルが見つかりません: ${configPath}`);
    }
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as ConfigData;
    } catch (error) {
      throw new Error(`設定ファイルの解析に失敗しました: ${configPath}\n${error}`);
    }
  }
  ```

### 7. **Missing Error Handling for Critical Browser Operations**
- **Location:** Multiple locations (login, navigation, clicks)
- **Issue:** Browser operations can fail but aren't wrapped in try-catch
- **Impact:** Unhandled exceptions crash program without proper cleanup
- **Examples:**
  - Line 129-135: Login operations
  - Line 147-154: Navigation clicks
  - Line 305-307: Lesson position selection
- **Recommendation:** Add try-catch around critical operations with proper error logging

### 8. **Page Reload May Lose Login State**
- **Location:** `src/index.ts:239, 274`
- **Issue:** After `page.reload()`, login session may be lost
- **Impact:** Bot may need to re-login (not handled)
- **Note:** This may work if session persists via cookies, but should be verified/tested
- **Recommendation:** 
  - Verify session persistence after reload
  - Add re-login logic if needed
  - Or use `page.goto()` with current URL instead of reload

### 9. **Race Condition in Retry Logic**
- **Location:** `src/index.ts:244-251`
- **Issue:** After reload in gray color handler, `scheduleNext` is called, but timing may be off
- **Impact:** May navigate to wrong week if page hasn't fully loaded
- **Current Code:** Has `waitForFunction` check, which is good, but could be more robust
- **Recommendation:** Add additional verification that correct week is displayed

### 10. **Scroll Operation Error Swallowed**
- **Location:** `src/index.ts:217`
- **Issue:** `scrollIntoViewIfNeeded().catch(() => {})` swallows all errors
- **Impact:** May hide real issues
- **Fix:**
  ```typescript
  lesson_select.scrollIntoViewIfNeeded().catch((err) => {
    log(`スクロールエラー（無視）: ${err}`);
  });
  ```

---

## Minor Issues

### 11. **Magic Numbers**
- **Location:** Throughout `index.ts`
- **Issue:** Hardcoded values without explanation
- **Examples:**
  - `2 * 60 * 1000` (2 minutes) - Line 50
  - `1 * 1000` (1 second) - Line 54
  - `500` (scroll position) - Line 144
  - `100` (sleep ms) - Line 168, 266
  - `60000` (60 seconds timeout) - Line 195
- **Recommendation:** Extract to named constants:
  ```typescript
  const BROWSER_START_OFFSET_MS = 2 * 60 * 1000;  // 2 minutes before reservation
  const RESERVATION_CLICK_OFFSET_MS = 1 * 1000;    // 1 second before reservation
  const RETRY_TIMEOUT_MS = 60000;                  // 60 seconds max retry time
  ```

### 12. **Inconsistent Error Messages**
- **Location:** Throughout codebase
- **Issue:** Mix of Japanese and English in error messages
- **Recommendation:** Standardize on one language or use constants

### 13. **Unused Import Check**
- **Location:** `src/index.ts:4`
- **Issue:** `isMainThread` is imported but only used in condition at bottom
- **Impact:** Minor - could be removed if not using workers, but harmless to keep

### 14. **Color Matching Logic Could Be More Robust**
- **Location:** `src/index.ts:229-231`
- **Current Code:** Has improved matching, but could be more precise
- **Current:**
  ```typescript
  const isGray = rgbaColor === 'rgba(119, 119, 119, 1)' || 
                 rgbaColor === 'rgb(119, 119, 119)' ||
                 (rgbaColor.startsWith('rgba(119, 119, 119') && rgbaColor.includes('1)'));
  ```
- **Issue:** The third condition could match `rgba(119, 119, 119, 0.1)` if it contains '1)'
- **Better:**
  ```typescript
  const isGray = rgbaColor === 'rgba(119, 119, 119, 1)' || 
                 rgbaColor === 'rgb(119, 119, 119)' ||
                 /^rgba\(119,\s*119,\s*119,\s*1\)$/.test(rgbaColor.replace(/\s/g, ''));
  ```

### 15. **String Conversion Inefficiency**
- **Location:** `src/index.ts:51, 55`
- **Issue:** Converting Date to ISO string, then parsing back to Date
- **Code:**
  ```typescript
  const reservation_time_str1 = reservation_time2.toISOString().replace('T', ' ').substring(0, 19);
  const startTime = parseDateTime(reservation_time_str1);
  ```
- **Impact:** Unnecessary conversion, potential timezone issues
- **Recommendation:** Work with Date objects directly:
  ```typescript
  const startTime = new Date(reservation_time1.getTime() - 2 * 60 * 1000);
  ```

---

## Logic Flow Analysis

### Timing Flow
1. ✅ **Browser Start:** Waits until 2 minutes before reservation time (Line 50-59)
2. ✅ **Reservation Click:** Waits until 1 second before reservation time (Line 171-172)
3. ✅ **Flying Time:** Adds configurable offset (Line 175)
4. ⚠️ **Issue:** Timezone handling is inconsistent (see Critical Issue #2)

### Retry Loop Flow
1. ✅ **Timeout Added:** 60-second maximum retry time (Line 195) - **FIXED from previous review**
2. ✅ **Early Return:** Returns when lesson not selected (Line 291-299) - **FIXED from previous review**
3. ✅ **Gray Color Detection:** Reloads and retries (Line 233-251)
4. ✅ **Error Handling:** Catches exceptions and retries (Line 259-288)
5. ⚠️ **Issue:** Could add more specific error types for better handling

### Browser State Management
1. ✅ **Cleanup:** Browser is closed on early exit (Line 297)
2. ✅ **Cleanup:** Browser is closed on success (Line 332)
3. ⚠️ **Issue:** No cleanup in catch block of `work()` function - browser may remain open on error

---

## Positive Aspects

1. ✅ **Timeout Mechanism:** Added 60-second timeout for retry loop (improved from previous review)
2. ✅ **Early Return:** Fixed browser cleanup issue (improved from previous review)
3. ✅ **Comprehensive Browser Optimization:** Excellent performance optimizations
4. ✅ **Detailed Logging:** Good logging for debugging and monitoring
5. ✅ **Color-based Availability Checking:** Clever approach to detect unavailable lessons
6. ✅ **Resource Blocking:** Smart blocking of images/media for performance
7. ✅ **Proper Async/Await:** Good use of async patterns throughout
8. ✅ **Retry Logic:** Robust retry mechanism for transient failures

---

## Recommendations Priority

### High Priority (Fix Immediately)
1. **Fix variable shadowing bug in log.ts** - Profile name never updates
2. **Fix timezone handling** - Critical for correct timing
3. **Handle negative wait times** - Prevent undefined behavior
4. **Add error handling for config parsing** - Prevent crashes on bad config

### Medium Priority (Fix Soon)
5. **Add error handling for browser operations** - Better error recovery
6. **Verify session persistence after reload** - Ensure login doesn't break
7. **Extract magic numbers to constants** - Improve maintainability
8. **Add browser cleanup in error cases** - Prevent resource leaks

### Low Priority (Nice to Have)
9. **Standardize error message language** - Consistency
10. **Improve color matching regex** - More robust
11. **Remove unnecessary string conversions** - Performance
12. **Add config validation** - Better error messages

---

## Testing Recommendations

1. **Test with system in different timezones** - Verify timezone handling
2. **Test with late start** - Verify negative wait time handling
3. **Test with invalid config** - Verify error handling
4. **Test session persistence** - Verify login survives page reload
5. **Test with unavailable lesson** - Verify retry logic and timeout
6. **Test profile name setting** - Verify log.ts fix works

---

## Comparison with Previous Review

### Issues Fixed ✅
- ✅ Infinite loop risk - Added 60-second timeout
- ✅ Browser closed but code continues - Added early return
- ✅ Color matching logic - Improved (though could be better)

### Issues Still Present ⚠️
- ⚠️ Timezone handling inconsistency - Still needs work
- ⚠️ Missing error handling - Still needs improvement
- ⚠️ Magic numbers - Still present
- ⚠️ Application time variable confusion - Still present

### New Issues Found 🔍
- 🔍 Variable shadowing bug in log.ts - Critical
- 🔍 Negative wait time not handled - Could cause issues
- 🔍 Browser cleanup missing in error cases - Resource leak risk

---

## Code Quality Metrics

- **Error Handling:** 6/10 - Some critical paths lack error handling
- **Code Clarity:** 7/10 - Generally clear, but magic numbers reduce clarity
- **Robustness:** 7/10 - Good retry logic, but some edge cases not handled
- **Maintainability:** 6/10 - Magic numbers and inconsistent patterns
- **Performance:** 9/10 - Excellent browser optimizations

---

## Conclusion

The bot has been improved since the previous review, with critical fixes for the infinite loop and browser cleanup. However, several important issues remain, particularly around timezone handling and error management. The variable shadowing bug in `log.ts` is critical and should be fixed immediately.

The core logic is sound, but edge cases and error scenarios need more attention for production reliability.

