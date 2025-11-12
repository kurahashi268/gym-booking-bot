# Logic Review of Bot Script (index.ts)

## Critical Issues

### 1. **Infinite Loop Risk (Line 197-272)**
- **Issue**: `maxAttempts = 1000000` with no timeout mechanism
- **Risk**: If the lesson never becomes available, the loop runs for a very long time
- **Impact**: Resource waste, potential memory leaks
- **Recommendation**: Add a maximum execution time limit (e.g., 60 seconds after reservation time)

### 2. **Browser Closed but Code Continues (Line 274-277)**
- **Issue**: When `lessonSelected` is false, browser is closed but function continues
- **Risk**: Lines 279-310 will fail with "Target closed" errors
- **Impact**: Unhandled exceptions, incomplete error logging
- **Fix**: Return early after closing browser:
```typescript
if (!lessonSelected) {
  log("レッスンの指定でループアウトが発生、プログラムを終了");
  await browser.close();
  return; // Add return statement
}
```

### 3. **Incorrect Log Message (Line 337)**
- **Issue**: Logs "プログラム終了（エラー）" even on success
- **Impact**: Misleading logs
- **Fix**: Only log error message when there's actually an error:
```typescript
if (totalExecutionTime < 0) {
  log(`${formatDateTime(programEndTime)}  プログラム終了（エラー）`);
} else {
  log(`${formatDateTime(programEndTime)}  プログラム終了`);
}
```

### 4. **Time Zone Handling Inconsistency**
- **Issue**: `parseDateTime` assumes system is in Tokyo time, but `getTokyoTime()` manually calculates offset
- **Risk**: Incorrect timing if system is not in Tokyo timezone
- **Impact**: Bot may start too early or late
- **Note**: `parseDateTime` is called with `toISOString()` output (UTC) but parsed as local time

### 5. **Color Matching Logic Issue (Line 223)**
- **Issue**: Uses `includes('119, 119, 119')` which could match unintended colors
- **Risk**: False positives (e.g., `rgba(119, 119, 119, 0.5)` or `rgba(211, 119, 119, 1)`)
- **Recommendation**: Use more precise matching:
```typescript
const isGray = rgbaColor === 'rgba(119, 119, 119, 1)' || 
               rgbaColor === 'rgb(119, 119, 119)' ||
               (rgbaColor.startsWith('rgba(119, 119, 119') && rgbaColor.includes('1)'));
```

## Medium Issues

### 6. **Config File Path Hardcoded (Line 12)**
- **Issue**: Uses `example-config.json` instead of `config.json`
- **Impact**: Requires renaming config file or may not find config in production
- **Recommendation**: Check for `config.json` first, fallback to `example-config.json`

### 7. **No Error Handling for Config Parsing (Line 13)**
- **Issue**: `JSON.parse` can throw if config is malformed
- **Impact**: Unhandled exception crashes program
- **Fix**: Add try-catch around config parsing

### 8. **Race Condition in Retry Logic (Line 229-234)**
- **Issue**: After reload, calls `scheduleNext` in error handler but not in gray color handler
- **Impact**: Inconsistent behavior - gray handler expects page to already be on correct week
- **Recommendation**: Both paths should call `scheduleNext` after reload

### 9. **Application Time Variable Confusion (Line 184, 296)**
- **Issue**: `application_time` is set to `start_dt` but then modified with `setTime()`
- **Impact**: Variable name doesn't reflect actual usage
- **Recommendation**: Rename or clarify purpose

### 10. **Missing Error Handling for Browser Operations**
- **Issue**: Many browser operations (click, fill, etc.) can fail but aren't wrapped in try-catch
- **Impact**: Unhandled exceptions crash program
- **Recommendation**: Add error handling for critical operations

## Minor Issues

### 11. **Unused Import (Line 4)**
- **Issue**: `isMainThread` from `worker_threads` is imported but only used in condition
- **Impact**: Minor - could be removed if not using workers

### 12. **Magic Numbers**
- **Issue**: Hardcoded values like `2 * 60 * 1000`, `1 * 1000`, `500`, `100`
- **Recommendation**: Extract to constants with descriptive names

### 13. **Inconsistent Error Messages**
- **Issue**: Some errors log in Japanese, others in mixed languages
- **Recommendation**: Standardize on one language or use constants

### 14. **Scroll Operations May Fail Silently (Line 212)**
- **Issue**: `scrollIntoViewIfNeeded().catch(() => {})` swallows all errors
- **Impact**: May hide real issues
- **Recommendation**: Log errors even if we continue

### 15. **Page Reload May Lose State**
- **Issue**: After reload, login state may be lost
- **Impact**: Bot may need to re-login (not handled)
- **Note**: This may be intentional if session persists, but should be verified

## Logic Flow Issues

### 16. **Timing Calculation Order**
- **Issue**: `reservation_time_str1` is calculated, then parsed back to Date (lines 52-63)
- **Impact**: Potential timezone conversion issues
- **Recommendation**: Work with Date objects directly, avoid string conversions

### 17. **Wait Until Logic (Line 24-37)**
- **Issue**: If `timeToWait` is negative, resolves immediately
- **Impact**: If bot starts late, it proceeds immediately (may be intentional)
- **Note**: Should log a warning if time has already passed

### 18. **Flying Time Calculation (Line 180)**
- **Issue**: Multiplies by 1000 (milliseconds) but config shows `0.65` seconds
- **Impact**: If `flying_time` is meant to be in seconds, this is correct
- **Note**: Verify this matches the Python version (which uses `time.sleep(flying_time)`)

## Recommendations Summary

1. **Add timeout mechanism** for the retry loop
2. **Fix browser cleanup** - return early when lesson not selected
3. **Fix log message** - don't log error on success
4. **Improve timezone handling** - use proper timezone library or document assumptions
5. **Add error handling** for config parsing and critical operations
6. **Standardize color matching** logic
7. **Add error recovery** for page reloads (re-login if needed)
8. **Extract magic numbers** to named constants
9. **Add validation** for config values
10. **Add warning logs** when timing calculations result in negative waits

## Positive Aspects

1. **Good retry logic** for handling transient failures
2. **Comprehensive browser optimization** settings
3. **Detailed logging** for debugging
4. **Color-based availability checking** is clever
5. **Resource blocking** for performance optimization
6. **Proper async/await** usage throughout

