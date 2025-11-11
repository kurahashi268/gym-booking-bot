import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

//==================================================== コマンドライン引数解析 =======================================================

// --production フラグのチェック
const isProduction = process.argv.includes('--production');

//==========================================================================================================================

//==================================================== パラメータ設定 =======================================================

// 設定ファイルを読み込む
const configPath = path.join(__dirname, '../config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// ①ログイン情報
const LOGIN_ID = configData.login.id;
const PASSWORD = configData.login.password;

// ②予約日時を設定
const reservation_time = configData.reservation.time;

// ③フライングの時間を設定
const flying_time = configData.reservation.flying_time;

// ④店舗設定
const selected_store_index = configData.store.selected_store_index;

// 長岡京: 1
// KRP: 5
// 二条: 6
// 桃六: 9
// 松井山手: 10
// 住道: 14
// 吹田: 16

// ⑤レッスン日時を選択
const lesson_date = configData.lesson.date_selector;

//【listcontainerの後の数字が何行目（何時限目）か、td:nth-child()が何日目（日付）か】
//【2週間前からの予約なので、td:nth-child(15)で固定】

// ⑥レッスン場所を選択
const lesson_no = configData.lesson.location_selector;

//【tr:nth-child()が行、例えば前列から２列目(番号23の列)なら１足して３を入れる。】
//【td:nth-child()が列、左から何番目か（空欄を含む）】
//【松井山手:5=2-9,6=2-11,7=2-13】
//【KRP:4=2-4, 12=3-4】
//【二条 RITMOS&Baila 3=2-3,13=3-4,14=3-5,25=4-6 B Street 3=2-3,4=2-6,11=3-5】
//【住道 Ritmos,Street & Baila 5=2-5,6=2-8,7=2-9,17=3-6,18=3-7 Combat5=2-5】

//「予約する」確定するかのフラグ
const confirm_reservation = configData.reservation.confirm_reservation;

//【True：「予約する」ボタンを押下する。False：「予約する」ボタンは押下しない＝テスト用】

//==========================================================================================================================

// 東京タイムゾーン用のヘルパー関数
function getTokyoTime(): Date {
  const now = new Date();
  const tokyoOffset = 9 * 60; // UTC+9 in minutes
  const localOffset = now.getTimezoneOffset();
  const tokyoTime = new Date(now.getTime() + (localOffset + tokyoOffset) * 60000);
  return tokyoTime;
}

function formatDateTime(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(Math.floor(date.getMilliseconds() / 1000) * 1000).padStart(3, '0');
  return `${month}/${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function parseDateTime(dateStr: string): Date {
  // "2025-10-22 11:45:00" 形式をパース
  // 東京タイムゾーン（UTC+9）として扱う
  // システムが東京時間で動いていることを前提とする
  const [datePart, timePart] = dateStr.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
  // ローカル時間として解釈（システムが東京時間なら正しく動作）
  // Pythonのtime.mktime()と同様に、ローカル時間として扱う
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  
  return date;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitUntil(targetDate: Date): Promise<void> {
  return new Promise((resolve) => {
    const now = new Date();
    const timeToWait = targetDate.getTime() - now.getTime();
    
    if (timeToWait > 0) {
      const dateStr = targetDate.toISOString().replace('T', ' ').substring(0, 19);
      log(`${dateStr} までウェイト`);
      setTimeout(resolve, timeToWait);
    } else {
      resolve();
    }
  });
}

// RGB値を文字列に変換（Playwrightのrgb()形式からrgba形式へ）
function rgbToRgba(rgbStr: string): string {
  // Playwrightは "rgb(0, 0, 0)" または "rgba(0, 0, 0, 1)" 形式を返す可能性がある
  if (rgbStr.startsWith('rgb(') && !rgbStr.startsWith('rgba(')) {
    const values = rgbStr.match(/\d+/g);
    if (values && values.length >= 3) {
      return `rgba(${values[0]}, ${values[1]}, ${values[2]}, 1)`;
    }
  }
  // すでにrgba形式の場合はそのまま返す
  return rgbStr;
}

// グローバルスコープでプログラム開始時刻を記録（エラー処理用）
let programStartTime: Date;

//==================================================== ログ機能 =======================================================

// ログバッファ変数（文字列）
let logBuffer: string = '';

// ログファイル名を取得（YYYYMMDD形式）
function getLogFileName(): string {
  const date = getTokyoTime();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}.log`;
}

// ログファイルのパスを取得
function getLogFilePath(): string {
  const logsDir = path.join(__dirname, '../logs');
  const fileName = getLogFileName();
  return path.join(logsDir, fileName);
}

// ログディレクトリが存在することを確認
function ensureLogsDirectory(): void {
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// ログ関数（コンソールとバッファに書き込み）
function log(message: string): void {
  // コンソールに出力（productionモードでは無効化）
  if (!isProduction) {
    console.log(message);
  }
  // バッファに追加（常に実行）
  logBuffer += message + '\n';
}

// ログバッファをファイルに書き込む
function writeLogBufferToFile(): void {
  try {
    ensureLogsDirectory();
    const logFilePath = getLogFilePath();
    
    // 既存のファイルがあれば読み込んで、新しいログを追加
    if (fs.existsSync(logFilePath)) {
      const existingContent = fs.readFileSync(logFilePath, 'utf-8');
      fs.writeFileSync(logFilePath, existingContent + logBuffer, 'utf-8');
    } else {
      // ファイルが存在しない場合は新規作成
      fs.writeFileSync(logFilePath, logBuffer, 'utf-8');
    }
    
    // バッファをクリア
    logBuffer = '';
  } catch (error) {
    // productionモードではコンソールエラーを出力しない
    if (!isProduction) {
      console.error('ログファイルの書き込みに失敗しました:', error);
    }
    // エラーはバッファに記録（次回の書き込み時に記録される）
    logBuffer += `ログファイルの書き込みに失敗しました: ${error}\n`;
  }
}

//==========================================================================================================================

async function main() {
  // ログディレクトリを初期化
  ensureLogsDirectory();
  
  // 実行開始時刻を記録
  programStartTime = getTokyoTime();
  log(`${formatDateTime(programStartTime)}  プログラム開始`);
  
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
  
  while (!lessonSelected && attemptCount < maxAttempts) {
    try {
      attemptCount++;
      
      // 「次週」関数を呼び出した後の日時出力
      const current_dt = getTokyoTime();
      log(`${formatDateTime(current_dt)}  「次週」表示後：${(current_dt.getTime() - start_dt.getTime()) / 1000}秒`);
      
      // ★レッスン日時を選択、lesson_select がクリック可能になるのを待機（タイムアウト短縮）
      const lesson_select = page.locator(lesson_date);
      await lesson_select.waitFor({ state: 'visible', timeout: 5000 });
      
      // レッスンボタンまでスクロール（非同期で実行）
      lesson_select.scrollIntoViewIfNeeded().catch(() => {}); // エラーは無視
      
      // レッスンの背景色を見て、予約可能か判定（並列実行を試みる）
      const background_color = await lesson_select.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });
      
      const rgbaColor = rgbToRgba(background_color);
      const current_dt2 = getTokyoTime();
      log(`${formatDateTime(current_dt2)}  ${attemptCount}回目 レッスン背景色：${rgbaColor}`);
      
      if (rgbaColor === 'rgba(119, 119, 119, 1)' || rgbaColor === 'rgb(119, 119, 119)' || rgbaColor.includes('119, 119, 119')) {
        // 予約不可の場合、画面リフレッシュして、次週を読み込む
        const current_dt3 = getTokyoTime();
        log(`${formatDateTime(current_dt3)}  ${attemptCount}回目 レッスン背景色が「灰色」の為、選択できず。お手付きと判定。再読み込みを実行。背景色：${rgbaColor}`);
        
        // リロードを最適化（domcontentloadedで高速化）
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
        
        // scheduleNext関数が有効となるまでウェイト（タイムアウト短縮）
        await page.waitForFunction(() => typeof (window as any).scheduleNext !== 'undefined', { timeout: 10000 });
        
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
    log("レッスンの指定でループアウトが発生、プログラムを終了");
    await browser.close();
    
    // 実行終了時刻を記録
    const programEndTime = getTokyoTime();
    const totalExecutionTime = (programEndTime.getTime() - programStartTime.getTime()) / 1000;
    log(`${formatDateTime(programEndTime)}  プログラム終了（ループアウト）`);
    log(`総実行時間: ${totalExecutionTime.toFixed(3)}秒 (${(totalExecutionTime / 60).toFixed(2)}分)`);
    
    // ログバッファをファイルに書き込む
    writeLogBufferToFile();
    
    process.exit(0);
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
  
  // 実行終了時刻を記録
  const programEndTime = getTokyoTime();
  const totalExecutionTime = (programEndTime.getTime() - programStartTime.getTime()) / 1000;
  log(`${formatDateTime(programEndTime)}  プログラム終了`);
  log(`総実行時間: ${totalExecutionTime.toFixed(3)}秒 (${(totalExecutionTime / 60).toFixed(2)}分)`);
  
  // ログバッファをファイルに書き込む
  writeLogBufferToFile();
  
  // PCシャットダウン
  // import { exec } from 'child_process';
  // exec('shutdown /s /t 1'); // Windows用
  // exec('shutdown -h now'); // Linux用
}

main().then(() => {
  // 正常終了時の処理はmain()内で既に処理済み
}).catch((error) => {
  log(`エラーが発生しました: ${error.toString()}`);
  if (error instanceof Error) {
    log(`エラースタック: ${error.stack || ''}`);
  }
  
  // エラー時も実行時間を記録（programStartTimeが設定されていれば）
  if (programStartTime) {
    const programEndTime = getTokyoTime();
    const totalExecutionTime = (programEndTime.getTime() - programStartTime.getTime()) / 1000;
    log(`${formatDateTime(programEndTime)}  プログラム終了（エラー）`);
    log(`総実行時間: ${totalExecutionTime.toFixed(3)}秒 (${(totalExecutionTime / 60).toFixed(2)}分)`);
  }
  
  // ログバッファをファイルに書き込む
  writeLogBufferToFile();
  
  process.exit(1);
});
