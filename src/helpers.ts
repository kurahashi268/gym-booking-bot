// 東京タイムゾーン用のヘルパー関数
export function getTokyoTime(): Date {
    const now = new Date();
    const tokyoOffset = 9 * 60; // UTC+9 in minutes
    const localOffset = now.getTimezoneOffset();
    const tokyoTime = new Date(now.getTime() + (localOffset + tokyoOffset) * 60000);
    return tokyoTime;
}

export function getRegularDatetimeString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function formatDateTime(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(Math.floor(date.getMilliseconds() / 1000) * 1000).padStart(3, '0');
    return `${month}/${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function parseDateTime(dateStr: string): Date {
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

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}



// RGB値を文字列に変換（Playwrightのrgb()形式からrgba形式へ）
export function rgbToRgba(rgbStr: string): string {
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