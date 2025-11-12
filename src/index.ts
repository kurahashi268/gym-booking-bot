import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { isMainThread } from 'worker_threads';

import type { ConfigData } from './types';
import { log, setProductionMode, writeLogBufferToFile } from './log';
import { getTokyoTime, formatDateTime, parseDateTime, sleep, rgbToRgba } from './helpers';

// 設定ファイルを読み込む
function parseConfig() {
  // Try config.json first, fallback to example-config.json
  const configPath = path.join(__dirname, '../config.json');
  const exampleConfigPath = path.join(__dirname, '../example-config.json');
  
  let configFilePath: string;
  if (fs.existsSync(configPath)) {
    configFilePath = configPath;
  } else if (fs.existsSync(exampleConfigPath)) {
    configFilePath = exampleConfigPath;
  } else {
    throw new Error(`設定ファイルが見つかりません: ${configPath} または ${exampleConfigPath}`);
  }
  
  const configData: ConfigData = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
  return configData;
}

// テスト用
async function test(isProduction: boolean): Promise<number> {
  const configData = parseConfig();
  return await run(configData, isProduction);
}

// 待機処理
async function waitUntil(targetDate: Date): Promise<void> {
  const now = new Date();
  const timeToWait = targetDate.getTime() - now.getTime();
  await sleep(timeToWait);
}

// メイン処理
async function work(configData: ConfigData, isProduction: boolean): Promise<void> {
  // 設定データを展開
  const LOGIN_ID = configData.login.id;
  const PASSWORD = configData.login.password;
  const reservation_time = configData.reservation.time;
  const flying_time = configData.reservation.flying_time;
  const confirm_reservation = configData.reservation.confirm_reservation;
  const selected_store_index = configData.store.selected_store_index;
  const lesson_date = configData.lesson.date_selector;
  const lesson_no = configData.lesson.location_selector;

  // 文字列をDateオブジェクトに変換
  const reservation_time1 = parseDateTime(reservation_time);

  // 2分前の時間を計算
  const reservation_time2 = new Date(reservation_time1.getTime() - 2 * 60 * 1000);
  const reservation_time_str1 = reservation_time2.toISOString().replace('T', ' ').substring(0, 19);

  // 1秒前の時間を計算
  const reservation_time4 = new Date(reservation_time1.getTime() - 1 * 1000);
  const reservation_time_str2 = reservation_time4.toISOString().replace('T', ' ').substring(0, 19);

  // ★起動日時を設定
  const startTime = parseDateTime(reservation_time_str1);
  await waitUntil(startTime);

  // ブラウザ起動（画像読み込み無効化、パフォーマンス最適化）
  const browser: Browser = await chromium.launch({
    headless: isProduction,
    args: [
      '--blink-settings=imagesEnabled=false',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-features=TranslateUI',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--disable-web-resources',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-pings',
      '--no-zygote',
      '--password-store=basic',
      '--use-mock-keychain',
      '--enable-features=NetworkService,NetworkServiceLogging',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      '--mute-audio'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    // パフォーマンス最適化
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true
  });

  const page: Page = await context.newPage();

  // 画像、メディア、フォントをブロックして高速化（CSSはレイアウトに必要なので除外）
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const resourceType = route.request().resourceType();
    // 画像、メディア、フォントをブロック（CSSはレイアウトに必要）
    if (['image', 'media', 'font'].includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  // ページ読み込み戦略を設定（リソース読み込み待機なし）
  await page.goto('https://member.cospa-wellness.co.jp/COSPAWELLNESSWebUser/Account/LogIn', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // ログインフォームが表示されるまで待機
  await page.waitForSelector('#UserName', { state: 'visible', timeout: 10000 });

  // ログインID入力
  await page.fill('#UserName', LOGIN_ID);

  // パスワード入力
  await page.fill('#Password', PASSWORD);

  // ログインボタンをクリック
  await page.click('#main > ul > li:nth-child(1) > input');

  // ログイン後のページ遷移を待機（メインメニューが表示されるまで）
  await page.waitForSelector('body > div.atomsv-wrap.ui-page.ui-body-bbb.ui-page-active > div.ca.ui-content.ui-body-bbb > main', {
    state: 'visible',
    timeout: 15000
  });

  // 画面を下へスクロール（必要に応じて）
  await page.evaluate(() => window.scrollTo(0, 500));

  // レッスン予約ボタンを待機してクリック
  const lessonReservationBtn = page.locator('body > div.atomsv-wrap.ui-page.ui-body-bbb.ui-page-active > div.ca.ui-content.ui-body-bbb > main > div > div > div:nth-child(3) > div.atomsv-main-menu > div > ul > li:nth-child(1) > a > span');
  await lessonReservationBtn.waitFor({ state: 'visible', timeout: 10000 });
  await lessonReservationBtn.click({ timeout: 10000 });

  // 予約ボタンを待機してクリック
  const reservationBtn = page.locator('body > div.atomsv-wrap.ui-page.ui-body-bbb.ui-page-active > div.ca.ui-content.ui-body-bbb > p:nth-child(1) > a > span > span.ui-btn-text');
  await reservationBtn.waitFor({ state: 'visible', timeout: 10000 });
  await reservationBtn.click({ timeout: 10000 });

  // 店舗選択ドロップダウンが表示されるまで待機
  const storeSelect = page.locator('#TmpoCd');
  await storeSelect.waitFor({ state: 'visible', timeout: 10000 });
  await storeSelect.selectOption({ index: selected_store_index });

  // レッスン日時セクションが読み込まれるまで待機（次へボタンが表示されるまで）
  await page.waitForFunction(() => typeof (window as any).scheduleNext !== 'undefined', { timeout: 15000 });

  // レッスン日時までスクロール。画面を下までスクロール（必要に応じて）
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  // 最小限の待機（DOM更新のため）
  await sleep(100);

  // ★予約日時を設定
  const reservationTime = parseDateTime(reservation_time_str2);
  await waitUntil(reservationTime);

  // 待機時間
  await sleep(flying_time * 1000);

  // 予約開始時刻を記録
  const start_dt = getTokyoTime();
  const application_time = start_dt;
  log(`${formatDateTime(start_dt)}  予約処理開始`);

  // 次へボタン押下(「次へ」の関数呼出し）
  await page.evaluate(() => {
    if (typeof (window as any).scheduleNext === 'function') {
      (window as any).scheduleNext();
    }
  });

  // レッスン日を押下する際、画面ロード中で黒い画面が表示され、ボタン押下に失敗することがあるため、リトライ処理を追加
  let lessonSelected = false;
  let attemptCount = 0;
  const maxAttempts = 1000000;
  let timeoutReached = false;
  // Add timeout: maximum 60 seconds after reservation start time
  const maxRetryTime = start_dt.getTime() + 60000; // 60 seconds timeout

  while (!lessonSelected && attemptCount < maxAttempts) {
    // Check timeout
    const currentTime = getTokyoTime().getTime();
    if (currentTime > maxRetryTime) {
      log(`${formatDateTime(getTokyoTime())}  リトライタイムアウト（60秒経過）`);
      timeoutReached = true;
      break;
    }
    try {
      attemptCount++;

      // 「次週」関数を呼び出した後の日時出力
      const current_dt = getTokyoTime();
      log(`${formatDateTime(current_dt)}  「次週」表示後：${(current_dt.getTime() - start_dt.getTime()) / 1000}秒`);

      // ★レッスン日時を選択、lesson_select がクリック可能になるのを待機（タイムアウト短縮）
      const lesson_select = page.locator(lesson_date);
      await lesson_select.waitFor({ state: 'visible', timeout: 5000 });

      // レッスンボタンまでスクロール（非同期で実行）
      lesson_select.scrollIntoViewIfNeeded().catch(() => { }); // エラーは無視

      // レッスンの背景色を見て、予約可能か判定（並列実行を試みる）
      const background_color = await lesson_select.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      const rgbaColor = rgbToRgba(background_color);
      const current_dt2 = getTokyoTime();
      log(`${formatDateTime(current_dt2)}  ${attemptCount}回目 レッスン背景色：${rgbaColor}`);

      // Check if lesson is gray (unavailable) - more precise matching
      const isGray = rgbaColor === 'rgba(119, 119, 119, 1)' || 
                     rgbaColor === 'rgb(119, 119, 119)' ||
                     (rgbaColor.startsWith('rgba(119, 119, 119') && rgbaColor.includes('1)'));
      
      if (isGray) {
        // 予約不可の場合、画面リフレッシュして、次週を読み込む
        const current_dt3 = getTokyoTime();
        log(`${formatDateTime(current_dt3)}  ${attemptCount}回目 レッスン背景色が「灰色」の為、選択できず。お手付きと判定。再読み込みを実行。背景色：${rgbaColor}`);

        // リロードを最適化（domcontentloadedで高速化）
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });

        // scheduleNext関数が有効となるまでウェイト（タイムアウト短縮）
        await page.waitForFunction(() => typeof (window as any).scheduleNext !== 'undefined', { timeout: 10000 });

        // Call scheduleNext after reload to navigate to correct week
        await page.evaluate(() => {
          if (typeof (window as any).scheduleNext === 'function') {
            (window as any).scheduleNext();
          }
        });

        continue;
      }

      // レッスン日を押下（タイムアウト短縮）
      await lesson_select.click({ timeout: 5000 });
      lessonSelected = true;
      break;

    } catch (error: any) {
      // エラーの場合、リトライする
      const current_dt4 = getTokyoTime();

      if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
        log(`${formatDateTime(current_dt4)}  ${attemptCount}回目：対象レッスンがクリックできず。リトライする`);
        // 短い待機後にリトライ（ページが応答するまで）
        await sleep(100);
        continue;
      } else {
        // その他の例外の場合、ページをリフレッシュ
        log(`${formatDateTime(current_dt4)}  ${attemptCount}回目：対象レッスンがクリックで想定外の例外エラー発生。再読み込み＆リトライする`);
        log(`エラー詳細: ${error.toString()}`);

        // リロードを最適化
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });

        // scheduleNext関数が有効となるまでウェイト（タイムアウト短縮）
        await page.waitForFunction(() => typeof (window as any).scheduleNext !== 'undefined', { timeout: 10000 });

        // 次週を呼ぶ
        await page.evaluate(() => {
          if (typeof (window as any).scheduleNext === 'function') {
            (window as any).scheduleNext();
          }
        });

        continue;
      }
    }
  }

  if (!lessonSelected) {
    if (timeoutReached) {
      log("レッスン選択タイムアウト（60秒経過）、プログラムを終了");
    } else {
      log("レッスンの指定でループアウトが発生、プログラムを終了");
    }
    await browser.close();
    return; // Early return to prevent execution of code below with closed browser
  }

  const current_dt5 = getTokyoTime();
  log(`${formatDateTime(current_dt5)}  レッスン日押下後：${(current_dt5.getTime() - start_dt.getTime()) / 1000}秒`);

  // ★レッスン場所を選択（タイムアウト短縮）
  const lesson_position = page.locator(lesson_no);
  await lesson_position.waitFor({ state: 'visible', timeout: 10000 });
  await lesson_position.click({ timeout: 10000 });

  const current_dt6 = getTokyoTime();
  log(`${formatDateTime(current_dt6)}  座席ボタン押下後：${(current_dt6.getTime() - start_dt.getTime()) / 1000}秒`);

  // 次へをクリック（タイムアウト短縮）
  const next_button2 = page.locator('#confirmsubmit > span');
  await next_button2.waitFor({ state: 'visible', timeout: 10000 });
  await next_button2.click({ timeout: 10000 });

  // 「確定」ボタンの押下時間
  application_time.setTime(Date.now());

  // ★予約するをクリック（タイムアウト短縮）
  if (confirm_reservation) {
    const confirmsubmit_button = page.locator('#confirmsubmit');
    await confirmsubmit_button.waitFor({ state: 'visible', timeout: 10000 });
    await confirmsubmit_button.click({ timeout: 10000 });

    // 予約完了の確認を待機（最小限の待機）
    await sleep(2000);
  } else {
    log("confirm_reservation = False のため、予約せず");
  }

  await browser.close(); // ブラウザを閉じる

  // PCシャットダウン
  // import { exec } from 'child_process';
  // exec('shutdown /s /t 1'); // Windows用
  // exec('shutdown -h now'); // Linux用
}

// メイン処理
export default async function run(configData: ConfigData, isProduction: boolean): Promise<number> {
  // プログラム開始時刻を記録
  const programStartTime: Date = getTokyoTime();
  log(`${formatDateTime(programStartTime)}  プログラム開始`);

  try {
    await work(configData, isProduction);
  } catch (error: any) {
    log(`エラーが発生しました: ${error.toString()}`);
    if (error instanceof Error) {
      log(`エラースタック: ${error.stack}`);
    }
    return -1;
  }

  // 実行時間を記録
  const programEndTime = getTokyoTime();
  const totalExecutionTime = (programEndTime.getTime() - programStartTime.getTime()) / 1000;
  log(`${formatDateTime(programEndTime)}  プログラム終了`);
  log(`総実行時間: ${totalExecutionTime.toFixed(3)}秒 (${(totalExecutionTime / 60).toFixed(2)}分)`);

  // ログバッファをファイルに書き込む
  writeLogBufferToFile();

  // 実行時間を返す
  return totalExecutionTime;
}

// メインスレッドの場合のみ実行
if (isMainThread) {
  // --production フラグのチェック
  const isProduction = process.argv.includes('--production');

  // テスト実行
  test(isProduction)
    .then((totalExecutionTime: number) => {
      if (totalExecutionTime < 0) {
        process.exit(1);
      }
    })
    .catch((error: any) => {
      log(`エラーが発生しました: ${error.toString()}`);
      process.exit(1);
    });
}