import * as path from 'path';
import * as fs from 'fs';
import {getTokyoTime, getRegularDatetimeString} from './helpers'

// ベースディレクトリを取得
const baseDir = process.cwd();

// ログディレクトリを取得
const logsDir = path.join(baseDir, 'logs');

// ログバッファ変数（文字列）
let logBuffer: string = '';

// プロダクションモードフラグ
let productionMode: boolean = false;

// プロファイル名
let profile: string = 'test';

// プロファイル名を設定
export function setProfile(newProfile: string): void {
    profile = newProfile;
}

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
    const fileName = getLogFileName();
    return path.join(logsDir, fileName);
}

// ログディレクトリが存在することを確認
function ensureLogsDirectory(): void {
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
}


// プロダクションモードフラグを設定
export function setProductionMode(mode: boolean): void {
    productionMode = mode;
}


// ログ関数（コンソールとバッファに書き込み）
export function log(message: string): void {
    //
    const logMessage = `[${getRegularDatetimeString(getTokyoTime())}] [${profile}] ${message}`;

    // コンソールに出力（productionモードでは無効化）
    if (!productionMode) {
        console.log(logMessage);
    }
    // バッファに追加（常に実行）
    logBuffer += logMessage + '\n';
}

// ログバッファをファイルに書き込む
export function writeLogBufferToFile(): void {
    try {
        ensureLogsDirectory();
        const logFilePath = getLogFilePath();

        // 既存のファイルがあれば読み込んで、新しいログを追加
        fs.appendFileSync(logFilePath, logBuffer + '\n', 'utf-8');

        // バッファをクリア
        logBuffer = '';
    } catch (error) {
        // productionモードではコンソールエラーを出力しない
        if (!productionMode) {
            console.error('ログファイルの書き込みに失敗しました:', error);
        }
        // エラーはバッファに記録（次回の書き込み時に記録される）
        logBuffer += `ログファイルの書き込みに失敗しました: ${error}\n`;
    }
}

// ログディレクトリが存在することを確認
ensureLogsDirectory();