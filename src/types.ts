export type ConfigData = {
    // ①ログイン情報
    login: {
        id: string;
        password: string;
    };
    reservation: {
        // ②予約日時を設定
        time: string;
        // ③フライングの時間を設定
        flying_time: number;
        //「予約する」確定するかのフラグ
        //【True：「予約する」ボタンを押下する。False：「予約する」ボタンは押下しない＝テスト用】
        confirm_reservation: boolean;
    };
    store: {
        // ④店舗設定
        // 長岡京: 1
        // KRP: 5
        // 二条: 6
        // 桃六: 9
        // 松井山手: 10
        // 住道: 14
        // 吹田: 16
        selected_store_index: number;
    };
    lesson: {
        // ⑤レッスン日時を選択
        date_selector: string;
        // ⑥レッスン場所を選択
        //【listcontainerの後の数字が何行目（何時限目）か、td:nth-child()が何日目（日付）か】
        //【2週間前からの予約なので、td:nth-child(15)で固定】
        location_selector: string;
    };
};