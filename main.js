// System logic remains identical as requested
const System = {
    isRunning: false, ms: 0, mets: 8.8, bpm: 110,
    timer: null, rhythm: null, audio: null,
    logs: JSON.parse(localStorage.getItem('stridex_infinity_final')) || [],
    pb: parseFloat(localStorage.getItem('stridex_pb')) || 0,
    xp: parseInt(localStorage.getItem('stridex_xp')) || 0,
    points: parseInt(localStorage.getItem('stridex_points')) || 0, // ショップ専用のポイント残高を保持する
    xpBoostActiveUntil: parseInt(localStorage.getItem('stridex_xp_boost_until')) || 0, // XPブーストの有効期限タイムスタンプを記憶する
    streak: parseInt(localStorage.getItem('stridex_streak')) || 0, // 連続継続日数
    lastSessionDate: localStorage.getItem('stridex_last_session') || null, // 最終実施日
    weekSessions: JSON.parse(localStorage.getItem('stridex_week_sessions')) || {}, // 週ごとの実施日管理
    lastWeekBonus: localStorage.getItem('stridex_last_week_bonus') || null, // 最終ボーナス付与週
    monthSessions: JSON.parse(localStorage.getItem('stridex_month_sessions')) || {}, // 月ごとの実施日管理
    lastMonthBonus: localStorage.getItem('stridex_last_month_bonus') || null, // 最終月間ボーナス付与月
    sessionXpEarned: 0, // セッション内で獲得済みのXPを追跡して重複加算を防ぐ
    sessionLevelRef: 1, // セッション開始時のレベルを保持して計算を安定させる

    toggle() {
        this.isRunning = !this.isRunning;
        const icon = document.getElementById('playIcon');
        const btn = document.getElementById('playBtn');
        if (this.isRunning) {
            icon.className = 'fas fa-pause';
            btn.classList.add('active-ring');
            btn.classList.replace('bg-slate-900', 'bg-blue-600');
            this.timer = setInterval(() => { this.ms += 100; this.update(); }, 100);
            this.startBeat();
            this.sessionXpEarned = 0; // セッション開始時に獲得量を初期化する
            this.sessionLevelRef = this.getLevelInfo().level; // 現在のレベルを基準値として保持する
            this.voiceCoach("トレーニングを開始。準備はいいですか？");
        } else {
            icon.className = 'fas fa-play';
            btn.classList.remove('active-ring');
            btn.classList.replace('bg-blue-600', 'bg-slate-900');
            clearInterval(this.timer); // 一時停止時はタイマーを停止する
            clearInterval(this.rhythm); // リズムも停止して再開時に復帰させる
            this.update(); // 表示を維持して一時停止状態を明確にする
        }
    },
    finishSession() {
        const icon = document.getElementById('playIcon'); // 再生アイコンを取得する
        const btn = document.getElementById('playBtn'); // 再生ボタンを取得する
        if(this.isRunning) {
            this.isRunning = false; // 実行中フラグを停止状態に戻す
            clearInterval(this.timer); // タイマーを停止する
            clearInterval(this.rhythm); // リズムを停止する
        }
        if(icon) icon.className = 'fas fa-play'; // 表示を再生アイコンに戻す
        if(btn) {
            btn.classList.remove('active-ring'); // アクティブ表示を外す
            btn.classList.replace('bg-blue-600', 'bg-slate-900'); // ボタン色を停止時に戻す
        }
        this.complete(); // セッションを完了して記録する
    },

    setMode(mets, bpm, btn) {
        this.mets = mets; this.bpm = bpm;
        document.getElementById('metsLabel').innerText = `${mets} METs`;
        document.getElementById('liveBpm').innerText = bpm;
        document.querySelectorAll('.mode-btn').forEach(b => {
            b.classList.remove('active-ring', 'text-blue-600');
            b.classList.add('text-slate-400');
        });
        btn.classList.add('active-ring', 'text-blue-600');
        if(this.isRunning) this.startBeat();
    },

    startBeat() {
        if(this.rhythm) clearInterval(this.rhythm);
        this.rhythm = setInterval(() => {
            this.beep();
            this.createRipple();
        }, 60000 / this.bpm);
    },

    beep() {
        if(!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
        const o = this.audio.createOscillator();
        const g = this.audio.createGain();
        o.frequency.setValueAtTime(1200, this.audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + 0.1);
        o.connect(g); g.connect(this.audio.destination);
        o.start(); o.stop(this.audio.currentTime + 0.1);
    },

    createRipple() {
        const hub = document.getElementById('mainHub');
        const r = document.createElement('div');
        r.className = 'anim-ripple w-64 h-64';
        r.style.left = '50%'; r.style.top = '50%';
        r.style.marginLeft = '-128px'; r.style.marginTop = '-128px';
        hub.appendChild(r);
        setTimeout(() => r.remove(), 800);
    },

    update() {
        this.clearExpiredBoost(); // 毎フレームで期限切れのブーストを掃除して状態を正しく保つ
        const sec = this.ms / 1000;
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = Math.floor(sec % 60).toString().padStart(2, '0');
        document.getElementById('timer').textContent = `${m}:${s}`;
        
        const weight = parseFloat(document.getElementById('cfgWeight').value) || Config.getWeight() || 65;
        const kcal = (this.mets * weight * (sec / 3600) * 1.05).toFixed(1);
        const kcalVal = parseFloat(kcal);
        document.getElementById('liveKcal').innerText = kcal;
        document.getElementById('liveJumps').innerText = Math.floor(sec * (this.bpm / 60));
        this.updateGoalProgress(kcalVal); // 1日の消費カロリー目標はセッション中に更新する
        if(this.isRunning) this.updateRealtimeXp(kcalVal); // 稼働中は消費カロリーに応じてXPを即時加算する
        
        if(this.bpm > 150) document.body.style.background = "#fff8f8";
        else if(this.bpm > 130) document.body.style.background = "#f8fff8";
        else document.body.style.background = "#f8fafc";
    },

    complete({ resetAfter = true } = {}) {
        const kcal = parseFloat(document.getElementById('liveKcal').innerText);
        if (kcal < 0.5) return;
        
        const log = { id: Date.now(), date: new Date().toISOString().split('T')[0], kcal };
        this.logs.unshift(log);
        localStorage.setItem('stridex_infinity_final', JSON.stringify(this.logs));
        
        const levelForSession = this.sessionLevelRef || this.getLevelInfo().level; // セッション基準レベルを取得する
        const targetXp = Math.max(10, Math.floor((kcal * 50) / levelForSession)); // 最終的に到達すべきXPを算出する
        if(this.sessionXpEarned < targetXp) {
            const bonus = targetXp - this.sessionXpEarned; // 未達分のみを加算して二重加算を防ぐ
            this.sessionXpEarned += bonus;
            this.grantXp(bonus);
        }
        
        const pointsGain = Math.max(1, Math.floor(kcal)); // 消費カロリーに応じて最低1ポイントを付与する
        this.addPoints(pointsGain); // セッション完了時にポイントを加算する
        this.applyStreakBonus(log.date); // 連続継続時のボーナスを反映する
        this.trackWeeklyBonus(log.date); // 週間ボーナス条件をチェックする
        this.trackMonthlyBonus(log.date); // 月間ボーナス条件をチェックする
        
        if(kcal > this.pb) {
            this.pb = kcal;
            localStorage.setItem('stridex_pb', kcal);
            this.voiceCoach("パーソナルベスト更新！素晴らしい成果です！");
        }
        
        this.render();
        if (resetAfter) {
            this.reset(); // 完了後に即リセットしたい場合のみ実行する
        }
    },

    reset() {
        if(this.isRunning) this.toggle();
        this.ms = 0;
        this.update();
        this.sessionXpEarned = 0; // セッション終了時にXPトラッカーを初期化する
    },

    render() {
        this.renderXp(); // レベルとXP表示を最新状態に更新する
        this.renderStreak(); // ストリーク表示も同期する

        document.getElementById('pbVal').innerText = this.pb.toFixed(1);

        const logArea = document.getElementById('logArea');
        logArea.innerHTML = this.logs.slice(0, 5).map(l => `
            <div class="flex justify-between items-center bg-white/50 p-4 rounded-2xl border border-white">
                <span class="text-sm font-bold text-slate-400 uppercase tracking-tighter">${l.date}</span>
                <span class="font-outfit font-black italic text-2xl">${l.kcal} <small class="text-sm text-blue-500 uppercase font-black">kcal</small></span>
            </div>
        `).join('');

        const heat = document.getElementById('heatmap');
        heat.innerHTML = "";
        const today = new Date();
        for (let i = 0; i < 28; i++) {
            const d = new Date(); d.setDate(today.getDate() - (27 - i));
            const iso = d.toISOString().split('T')[0];
            const count = this.logs.filter(l => l.date === iso).length;
            const div = document.createElement('div');
            div.className = "h-6 rounded-[6px]";
            div.style.background = count > 0 ? `rgba(0, 102, 255, ${Math.min(1, count * 0.4)})` : "#f1f5f9";
            heat.appendChild(div);
        }
        this.updateGoalProgress();
        this.updateLongTermProgress(); // 月間・年間の進捗を描画時に同期する
        if(typeof Shop !== 'undefined') Shop.render(); // レンダリング完了後にショップ表示も同期させる
    },

    updateRealtimeXp(currentKcal) {
        const levelForSession = this.sessionLevelRef || this.getLevelInfo().level; // セッション基準レベルを取得する
        const expectedXp = Math.floor((currentKcal * 50) / levelForSession); // 現在までの消費カロリーから理論XPを算出する
        if(expectedXp <= this.sessionXpEarned) return; // 既に同等以上のXPを付与済みなら処理しない
        const delta = expectedXp - this.sessionXpEarned; // 今回追加すべき差分のみを抜き出す
        this.sessionXpEarned += delta;
        this.grantXp(delta); // 差分を反映し、UIも最新に保つ
    },

    grantXp(amount) {
        if(!amount || amount <= 0) return; // 0以下は誤加算なので早期リターンする
        const multiplier = this.getXpMultiplier(); // 現在のXP倍率（ブースト）を取得する
        const adjusted = Math.ceil(amount * multiplier); // ブーストを乗算した値を切り上げる
        this.xp += adjusted;
        localStorage.setItem('stridex_xp', this.xp);
        this.renderXp(); // 永続化後に進捗表示を更新する
        if(typeof Shop !== 'undefined') Shop.render(); // XP関連UIに連動するショップ表示も更新する
    },

    renderXp() {
        const { level, xpIntoLevel, required } = this.getLevelInfo(); // 現在のレベル情報を取得する
        const progress = (xpIntoLevel / required) * 100; // 進捗率を算出してバー幅に反映する
        document.getElementById('userLevel').innerText = level;
        document.getElementById('xpBar').style.width = progress + "%";
        document.getElementById('xpText').innerText = `${xpIntoLevel} / ${required} XP`;
        this.updateLevelBackground(level); // レベル帯に応じた背景色を適用する
    },

    updateLevelBackground(level) {
        const wrapper = document.getElementById('levelIconWrapper'); // レベルアイコン枠を取得する
        if(!wrapper) return;
        const palettes = [
            { bg: 'linear-gradient(145deg, #0f172a, #1e293b)' },
            { bg: 'linear-gradient(145deg, #1e3a8a, #2563eb)' },
            { bg: 'linear-gradient(145deg, #0f766e, #14b8a6)' },
            { bg: 'linear-gradient(145deg, #1f2937, #4b5563)' },
            { bg: 'linear-gradient(145deg, #7c3aed, #a855f7)' },
            { bg: 'linear-gradient(145deg, #be123c, #f43f5e)' },
            { bg: 'linear-gradient(145deg, #c2410c, #ea580c)' },
            { bg: 'linear-gradient(145deg, #c026d3, #ec4899)' },
            { bg: 'linear-gradient(145deg, #b45309, #eab308)' },
            { bg: 'linear-gradient(145deg, #0d9488, #22d3ee)' }
        ]; // 10レベルごとに異なる雰囲気のグラデーションを用意する
        const index = Math.min(palettes.length - 1, Math.floor((level - 1) / 10)); // レベル帯を算出する
        const palette = palettes[index];
        wrapper.style.background = palette.bg;
        wrapper.style.boxShadow = 'none';
    },

    addPoints(amount) {
        if(!amount || amount <= 0) return; // 不正値の場合は変更しない
        this.points += amount;
        localStorage.setItem('stridex_points', this.points); // 残高を永続化する
        if(typeof Shop !== 'undefined') Shop.render(); // ショップ表示を即時更新する
    },

    spendPoints(cost) {
        if(!cost || cost <= 0) return false; // 無効な価格の場合は処理せずfalseを返す
        if(this.points < cost) return false; // 残高不足時は決済しない
        this.points -= cost;
        localStorage.setItem('stridex_points', this.points); // 新しい残高を保存する
        if(typeof Shop !== 'undefined') Shop.render(); // 表示を同期する
        return true; // 正常に減算できたことを伝える
    },

    getXpMultiplier() {
        return this.isBoostActive() ? 2 : 1; // ブースト中は倍率2、それ以外は1を返す
    },

    isBoostActive() {
        this.clearExpiredBoost(); // 判定前に期限切れ状態を整理する
        return this.xpBoostActiveUntil && Date.now() < this.xpBoostActiveUntil; // 有効期限内かどうかを返す
    },

    clearExpiredBoost() {
        if(this.xpBoostActiveUntil && Date.now() >= this.xpBoostActiveUntil) {
            this.xpBoostActiveUntil = 0;
            localStorage.setItem('stridex_xp_boost_until', this.xpBoostActiveUntil); // 期限切れなら記録をリセットする
        }
    },

    activateBoost(minutes) {
        const ms = minutes * 60 * 1000;
        const base = this.isBoostActive() ? this.xpBoostActiveUntil : Date.now(); // 既にブースト中なら延長、なければ現在時刻から開始する
        this.xpBoostActiveUntil = base + ms; // 有効期限を更新する
        localStorage.setItem('stridex_xp_boost_until', this.xpBoostActiveUntil);
        if(typeof Shop !== 'undefined') Shop.render(); // ブーストのステータスを即時反映する
    },

    getBoostRemainingMs() {
        if(!this.isBoostActive()) return 0; // ブースト中でなければ0ミリ秒を返す
        return Math.max(0, this.xpBoostActiveUntil - Date.now()); // 残り時間を計算する
    },

    getWeekKey(dateInput) {
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        const monday = new Date(d);
        const day = monday.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        monday.setDate(monday.getDate() + diff);
        monday.setHours(0,0,0,0);
        return monday.toISOString().split('T')[0];
    },

    getMonthKey(dateInput) {
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        monthStart.setHours(0,0,0,0);
        return monthStart.toISOString().split('T')[0];
    },

    applyStreakBonus(todayKey) {
        if(!todayKey) return;
        if(this.lastSessionDate === todayKey) {
            this.renderStreak();
            return;
        }
        const last = this.lastSessionDate ? new Date(this.lastSessionDate) : null;
        const today = new Date(todayKey);
        let consecutive = false;
        if(last) {
            const diff = (today - last) / (1000 * 60 * 60 * 24);
            consecutive = diff === 1;
        }
        this.streak = consecutive ? this.streak + 1 : 1;
        this.lastSessionDate = todayKey;
        localStorage.setItem('stridex_streak', this.streak);
        localStorage.setItem('stridex_last_session', this.lastSessionDate);
        const bonusXp = Math.min(150, this.streak * 5);
        const bonusPoints = Math.max(1, Math.floor(this.streak / 2));
        this.grantXp(bonusXp);
        this.addPoints(bonusPoints);
        this.renderStreak();
    },

    trackWeeklyBonus(todayKey) {
        if(!todayKey) return;
        const weekKey = this.getWeekKey(todayKey);
        if(!this.weekSessions[weekKey]) this.weekSessions[weekKey] = [];
        if(this.weekSessions[weekKey].includes(todayKey)) {
            this.renderStreak();
            return;
        }
        this.weekSessions[weekKey].push(todayKey);
        const entries = Object.entries(this.weekSessions).sort(([a],[b]) => a.localeCompare(b));
        while(entries.length > 6) entries.shift();
        this.weekSessions = Object.fromEntries(entries);
        localStorage.setItem('stridex_week_sessions', JSON.stringify(this.weekSessions));
        if(this.weekSessions[weekKey].length >= 3 && this.lastWeekBonus !== weekKey) {
            this.lastWeekBonus = weekKey;
            localStorage.setItem('stridex_last_week_bonus', this.lastWeekBonus);
            this.grantXp(1000);
            this.addPoints(50);
        }
        this.renderStreak();
    },

    trackMonthlyBonus(todayKey) {
        if(!todayKey) return;
        const monthKey = this.getMonthKey(todayKey);
        if(!this.monthSessions[monthKey]) this.monthSessions[monthKey] = [];
        if(!this.monthSessions[monthKey].includes(todayKey)) {
            this.monthSessions[monthKey].push(todayKey);
            const entries = Object.entries(this.monthSessions).sort(([a],[b]) => a.localeCompare(b));
            while(entries.length > 6) entries.shift();
            this.monthSessions = Object.fromEntries(entries);
            localStorage.setItem('stridex_month_sessions', JSON.stringify(this.monthSessions));
        }
        if(this.lastMonthBonus === monthKey) {
            this.renderStreak();
            return;
        }
        if(this.hasFullMonth(monthKey)) {
            this.lastMonthBonus = monthKey;
            localStorage.setItem('stridex_last_month_bonus', this.lastMonthBonus);
            const { level, required } = this.getLevelInfo();
            this.grantXp(required);
            this.renderStreak();
        } else {
            this.renderStreak();
        }
    },

    hasFullMonth(monthKey) {
        const dates = this.monthSessions[monthKey];
        if(!dates) return false;
        const unique = new Set(dates);
        const monthStart = new Date(monthKey);
        const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
        return unique.size >= daysInMonth;
    },

    renderStreak() {
        const el = document.getElementById('streakStatus');
        if(!el) return;
        if(this.streak <= 0) el.innerText = "ストリーク未開始";
        else el.innerText = `${this.streak}日連続継続中`;
        const weekEl = document.getElementById('weekBonusStatus');
        if(!weekEl) return;
        const currentWeek = this.getWeekKey(new Date());
        const sessions = this.weekSessions[currentWeek] || [];
        if(this.lastWeekBonus === currentWeek) {
            weekEl.innerText = "今週のボーナス獲得済み";
            weekEl.classList.remove('text-amber-500');
            weekEl.classList.add('text-green-500');
        } else {
            weekEl.innerText = `今週 ${sessions.length}/3 回`;
            weekEl.classList.remove('text-green-500');
            weekEl.classList.add('text-amber-500');
        }
        const monthEl = document.getElementById('monthBonusStatus');
        if(monthEl) {
            const currentMonth = this.getMonthKey(new Date());
            const monthData = this.monthSessions[currentMonth] || [];
            const daysCount = monthData.length;
            const nights = new Date(currentMonth);
            const daysInMonth = new Date(nights.getFullYear(), nights.getMonth() + 1, 0).getDate();
            if(this.lastMonthBonus === currentMonth) {
                monthEl.innerText = "月間ボーナス獲得済み";
                monthEl.classList.remove('text-rose-500');
                monthEl.classList.add('text-green-500');
            } else {
                monthEl.innerText = `今月 ${daysCount}/${daysInMonth} 日`;
                monthEl.classList.remove('text-green-500');
                monthEl.classList.add('text-rose-500');
            }
        }
    },

            getTodayTotal() {
                const today = new Date().toISOString().split('T')[0];
                return this.logs.reduce((sum, log) => {
                    return sum + (log.date === today ? parseFloat(log.kcal) : 0);
                }, 0);
            },

            saveWeight() {
                const input = document.getElementById('weightInput');
                const value = parseFloat(input.value);
                if(!value) return;
                const weightLogs = JSON.parse(localStorage.getItem('stridex_weight_logs')) || [];
                const today = new Date().toISOString().split('T')[0];
                if(weightLogs[0] && weightLogs[0].date === today) {
                    weightLogs[0].weight = value; // 既に今日の記録があれば上書きする
                } else {
                    weightLogs.unshift({ date: today, weight: value }); // 今日が未記録なら新規追加する
                }
                localStorage.setItem('stridex_weight_logs', JSON.stringify(weightLogs.slice(0, 120)));
                this.renderWeightLogs(weightLogs);
                this.updateGoalProgress(); // 体重目標の進捗を更新する
                this.updateLongTermProgress(); // 月間・年間の進捗も更新する
                input.value = "";
            },

            renderWeightLogs(existing = null) {
                const weightLogs = existing || JSON.parse(localStorage.getItem('stridex_weight_logs')) || [];
                const todayEl = document.getElementById('weightToday');
                const ydayEl = document.getElementById('weightYesterday');
                const indicator = document.getElementById('weightChange');

                if(weightLogs.length === 0) {
                    todayEl.innerText = "--";
                    ydayEl.innerText = "--";
                    indicator.innerText = "-";
                    indicator.className = "text-sm font-black tracking-[0.2em]";
                    return;
                }

                todayEl.innerText = `${weightLogs[0].weight} kg`;
                ydayEl.innerText = weightLogs[1] ? `${weightLogs[1].weight} kg` : "--";

                if(weightLogs.length >= 2) {
                    const diff = (weightLogs[0].weight - weightLogs[1].weight).toFixed(1);
                    indicator.innerText = diff > 0 ? `+${diff}` : diff;
                    indicator.className = `text-sm font-black tracking-[0.2em] ${diff > 0 ? 'weight-up' : diff < 0 ? 'weight-down' : ''}`;
                } else {
                    indicator.innerText = "0.0";
                    indicator.className = "text-sm font-black tracking-[0.2em]";
                }
            },

    getWeightLogs() {
        const logs = JSON.parse(localStorage.getItem('stridex_weight_logs')) || []; // 体重ログを取得して配列で返す
        return Array.isArray(logs) ? logs : []; // 配列以外は空配列として扱う
    },
    getLatestWeight() {
        const logs = this.getWeightLogs(); // 最新の体重ログを取得する
        if(logs.length === 0) return null; // ログが無ければnullを返す
        return parseFloat(logs[0].weight); // 最新値を数値として返す
    },
    getBaselineWeight() {
        const logs = this.getWeightLogs(); // 体重ログを取得する
        if(logs.length === 0) return null; // ログが無ければnullを返す
        return parseFloat(logs[logs.length - 1].weight); // 最初の記録を基準値として返す
    },
    calculateWeightProgress(startWeight, currentWeight, targetWeight) {
        if(startWeight === null || currentWeight === null || targetWeight === null) {
            return { percent: 0, remaining: null, isComplete: false }; // 必要な値が無い場合は未達成として返す
        }
        const totalDiff = Math.abs(targetWeight - startWeight); // 目標までの総差分を絶対値で算出する
        if(totalDiff === 0) {
            const isComplete = currentWeight === targetWeight; // 現在値が目標と一致しているか判定する
            return { percent: isComplete ? 100 : 0, remaining: Math.abs(targetWeight - currentWeight), isComplete }; // 開始値と目標が同じ場合は一致時のみ達成扱いにする
        }
        const isLoseMode = targetWeight < startWeight; // 目標が減量か増量かを判定する
        const progressDiff = isLoseMode ? (startWeight - currentWeight) : (currentWeight - startWeight); // 目標方向に進むほど増える差分を算出する
        const rawPercent = (progressDiff / totalDiff) * 100; // 達成率を算出する
        const percent = Math.min(100, Math.max(0, rawPercent)); // 0〜100に丸める
        const remaining = Math.abs(targetWeight - currentWeight); // 目標までの残り差分を算出する
        return { percent, remaining, isComplete: percent >= 100 }; // 進捗情報をまとめて返す
    },
    getWeightLogsByPeriod(periodType) {
        const logs = this.getWeightLogs(); // 体重ログ全体を取得する
        const now = new Date(); // 現在日時を取得する
        const key = periodType === 'month' ? this.getMonthId(now) : this.getYearId(now); // 期間キーを決定する
        const filtered = logs.filter(log => {
            return periodType === 'month'
                ? this.getMonthId(log.date) === key
                : this.getYearId(log.date) === key;
        }); // 指定期間のログだけ抽出する
        filtered.sort((a, b) => new Date(a.date) - new Date(b.date)); // 日付順に並べて開始/最新を取り出しやすくする
        return filtered; // 整列済みのログ配列を返す
    },
    getBaselineStorageKey(periodType) {
        return periodType === 'month' ? 'stridex_month_baseline' : 'stridex_year_baseline'; // 期間ごとの保存キーを返す
    },
    getPeriodKey(periodType) {
        return periodType === 'month' ? this.getMonthId(new Date()) : this.getYearId(new Date()); // 現在の期間キーを返す
    },
    getStoredBaseline(periodType) {
        const key = this.getBaselineStorageKey(periodType); // 保存キーを取得する
        const raw = localStorage.getItem(key); // 保存済みのベースラインを取得する
        if(!raw) return null; // 保存が無ければnullを返す
        try {
            const parsed = JSON.parse(raw); // JSONとして解釈する
            return parsed && typeof parsed === 'object' ? parsed : null; // オブジェクトなら返す
        } catch {
            return null; // 解析できない場合はnullにする
        }
    },
    setStoredBaseline(periodType, payload) {
        const key = this.getBaselineStorageKey(periodType); // 保存キーを取得する
        localStorage.setItem(key, JSON.stringify(payload)); // ベースライン情報を保存する
    },
    clearStoredBaseline(periodType) {
        const key = this.getBaselineStorageKey(periodType); // 保存キーを取得する
        localStorage.removeItem(key); // ベースラインを削除する
    },
    getPeriodBaselineWeight(periodType, periodLogs) {
        if(!Array.isArray(periodLogs) || periodLogs.length === 0) {
            this.clearStoredBaseline(periodType); // ログが無い場合はベースラインを削除する
            return null; // ベースラインは取得できない
        }
        const periodKey = this.getPeriodKey(periodType); // 現在の期間キーを取得する
        const stored = this.getStoredBaseline(periodType); // 保存済みベースラインを取得する
        const firstLog = periodLogs[0]; // 期間内の最初のログを取得する
        const firstWeight = parseFloat(firstLog.weight); // 最初の体重を数値化する
        if(isNaN(firstWeight)) return null; // 数値化できない場合は終了する
        if(periodLogs.length >= 2) {
            this.setStoredBaseline(periodType, { key: periodKey, date: firstLog.date, weight: firstWeight }); // 期間開始のログをベースラインとして保存する
            return firstWeight; // 期間の最初の体重を返す
        }
        if(stored && stored.key === periodKey && stored.date === firstLog.date && typeof stored.weight === 'number') {
            return stored.weight; // 同日で上書きされた場合は初回体重を維持して返す
        }
        this.setStoredBaseline(periodType, { key: periodKey, date: firstLog.date, weight: firstWeight }); // ベースラインを更新する
        return firstWeight; // 最新の基準値を返す
    },
    updateGoalProgress(activeKcal = null) {
        const target = Config.getDailyKcalTarget(); // 1日の消費カロリー目標を取得する
        const summaryEl = document.getElementById('goalSummary'); // 目標サマリー表示を取得する
        const barEl = document.getElementById('goalProgressBar'); // 進捗バー要素を取得する
        const motivationEl = document.getElementById('goalMotivation'); // 進捗メッセージ要素を取得する
        if(!summaryEl || !barEl || !motivationEl) return; // DOMが無い場合は処理しない
        if(!target) {
            summaryEl.innerText = "-- / -- kcal"; // 目標未設定時のプレースホルダーを表示する
            barEl.style.width = "0%"; // 進捗バーは空にする
            motivationEl.innerText = "カロリー目標を設定してください"; // ガイドメッセージを表示する
            return;
        }
        const completed = this.getTodayTotal(); // 今日の消費カロリー合計を取得する
        const active = typeof activeKcal === 'number' ? activeKcal : 0; // セッション中の消費カロリーを合算する
        const total = completed + active; // 今日の合計カロリーを算出する
        const percent = Math.min(100, (total / target) * 100); // 進捗率を算出する
        summaryEl.innerText = `${total.toFixed(1)} / ${target.toFixed(1)} kcal`; // 進捗サマリーを更新する
        barEl.style.width = percent + "%"; // 進捗バーの幅を更新する
        motivationEl.innerText = total >= target
            ? "ターゲット達成！"
            : `あと ${(target - total).toFixed(1)} kcal`;
    },
    getMonthId(dateInput) {
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput; // 文字列とDateを統一して扱う
        const year = d.getFullYear(); // 年を取得する
        const month = String(d.getMonth() + 1).padStart(2, '0'); // 月を2桁表記に揃える
        return `${year}-${month}`; // YYYY-MM形式のキーを返す
    },
    getYearId(dateInput) {
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput; // 文字列とDateを統一して扱う
        return `${d.getFullYear()}`; // 年キーを返す
    },
    updateLongTermProgress() {
        const monthTarget = Config.getMonthTarget(); // 月間目標体重を取得する
        const yearTarget = Config.getYearTarget(); // 年間目標体重を取得する
        const monthSummary = document.getElementById('monthGoalSummary'); // 月間サマリー表示を取得する
        const yearSummary = document.getElementById('yearGoalSummary'); // 年間サマリー表示を取得する
        const monthBar = document.getElementById('monthGoalProgressBar'); // 月間進捗バーを取得する
        const yearBar = document.getElementById('yearGoalProgressBar'); // 年間進捗バーを取得する
        const monthPercentEl = document.getElementById('monthGoalPercent'); // 月間進捗率を取得する
        const yearPercentEl = document.getElementById('yearGoalPercent'); // 年間進捗率を取得する
        if(!monthSummary || !yearSummary || !monthBar || !yearBar || !monthPercentEl || !yearPercentEl) return; // DOMが揃っていなければ終了する
        if(!monthTarget && !yearTarget) {
            monthSummary.innerText = "-- / -- kg"; // 目標未設定時の表示にする
            yearSummary.innerText = "-- / -- kg"; // 目標未設定時の表示にする
            monthBar.style.width = "0%"; // 月間バーを初期化する
            yearBar.style.width = "0%"; // 年間バーを初期化する
            monthPercentEl.innerText = "0%"; // 月間達成率を初期化する
            yearPercentEl.innerText = "0%"; // 年間達成率を初期化する
            return;
        }
        const monthLogs = this.getWeightLogsByPeriod('month'); // 当月の体重ログを取得する
        const yearLogs = this.getWeightLogsByPeriod('year'); // 当年の体重ログを取得する
        const monthBaseline = this.getPeriodBaselineWeight('month', monthLogs); // 月間ベースライン体重を取得する
        const yearBaseline = this.getPeriodBaselineWeight('year', yearLogs); // 年間ベースライン体重を取得する
        const monthCurrent = monthLogs.length > 0 ? parseFloat(monthLogs[monthLogs.length - 1].weight) : null; // 月間最新の体重を取得する
        const yearCurrent = yearLogs.length > 0 ? parseFloat(yearLogs[yearLogs.length - 1].weight) : null; // 年間最新の体重を取得する
        if(monthLogs.length === 0 || !monthTarget || monthBaseline === null || monthCurrent === null) {
            const targetLabel = monthTarget ? monthTarget.toFixed(1) : "--"; // 目標体重の表示値を用意する
            monthSummary.innerText = `-- / ${targetLabel} kg`; // 現在体重は未記録のまま表示する
            monthBar.style.width = "0%"; // 月間バーを初期化する
            monthPercentEl.innerText = "0%"; // 月間達成率を初期化する
        } else {
            const monthProgress = this.calculateWeightProgress(monthBaseline, monthCurrent, monthTarget); // 月間の進捗を算出する
            monthSummary.innerText = `${monthCurrent.toFixed(1)} / ${monthTarget.toFixed(1)} kg`; // 月間の数値を表示する
            monthBar.style.width = monthProgress.percent + "%"; // 月間バー幅を更新する
            monthPercentEl.innerText = `${Math.floor(monthProgress.percent)}%`; // 月間達成率を表示する
        }
        if(yearLogs.length === 0 || !yearTarget || yearBaseline === null || yearCurrent === null) {
            const targetLabel = yearTarget ? yearTarget.toFixed(1) : "--"; // 目標体重の表示値を用意する
            yearSummary.innerText = `-- / ${targetLabel} kg`; // 現在体重は未記録のまま表示する
            yearBar.style.width = "0%"; // 年間バーを初期化する
            yearPercentEl.innerText = "0%"; // 年間達成率を初期化する
        } else {
            const yearProgress = this.calculateWeightProgress(yearBaseline, yearCurrent, yearTarget); // 年間の進捗を算出する
            yearSummary.innerText = `${yearCurrent.toFixed(1)} / ${yearTarget.toFixed(1)} kg`; // 年間の数値を表示する
            yearBar.style.width = yearProgress.percent + "%"; // 年間バー幅を更新する
            yearPercentEl.innerText = `${Math.floor(yearProgress.percent)}%`; // 年間達成率を表示する
        }
    },
    addManualKcal() {
        const input = document.getElementById('manualKcalInput'); // 手動入力欄を取得する
        if(!input) return; // 入力欄が無い場合は何もしない
        const rawValue = parseFloat(input.value); // 入力値を数値として解釈する
        if(!rawValue || rawValue <= 0) return; // 不正値は追加しない
        const kcal = Math.round(rawValue * 10) / 10; // 小数1桁に丸めて記録する
        const today = new Date().toISOString().split('T')[0]; // 追加対象の日付キーを取得する
        const log = { id: Date.now(), date: today, kcal }; // 手動追加分のログを作成する
        this.logs.unshift(log); // 先頭に追加して最新ログとして扱う
        localStorage.setItem('stridex_infinity_final', JSON.stringify(this.logs)); // ログを保存する
        if(kcal > this.pb) { // 手動入力でもPB更新なら反映する
            this.pb = kcal; // PB値を更新する
            localStorage.setItem('stridex_pb', kcal); // PBの永続化を行う
        }
        this.render(); // 表示全体を最新状態に更新する
        this.updateGoalProgress(); // 1日の消費カロリー目標を更新する
        input.value = ""; // 入力欄をクリアする
    },
    xpNeededFor(level) {
        return 1000 + (level - 1) * 200;
    },
            getLevelInfo() {
                let xpRemaining = this.xp;
                let level = 1;
                while (true) {
                    const required = this.xpNeededFor(level);
                    if (xpRemaining < required) {
                        return { level, xpIntoLevel: xpRemaining, required };
                    }
                    xpRemaining -= required;
                    level++;
                }
            },

            voiceCoach(text) {
                if(!document.getElementById('cfgVoice').checked) return;
                const s = new SpeechSynthesisUtterance(text);
        s.lang = 'ja-JP'; s.rate = 1.1;
        speechSynthesis.speak(s);
    },

    voiceReport() {
        const k = document.getElementById('liveKcal').innerText;
        this.voiceCoach(`現在の消費エネルギーは${k}キロカロリーです。`);
    },

    export() {
        const csv = "Date,Kcal\n" + this.logs.map(l => `${l.date},${l.kcal}`).join("\n");
        const b = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], {type: 'text/csv'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'stride_x_data.csv'; a.click();
    }
};

const Config = {
    toggle() { document.getElementById('settingsOverlay').classList.toggle('hidden'); },
    load() {
        const cfg = JSON.parse(localStorage.getItem('stridex_config'));
        if(!cfg) return;
        if(cfg.weight) document.getElementById('cfgWeight').value = cfg.weight;
        if(cfg.monthTarget) document.getElementById('cfgMonthTarget').value = cfg.monthTarget; // 月間目標体重を復元する
        if(cfg.yearTarget) document.getElementById('cfgYearTarget').value = cfg.yearTarget; // 年間目標体重を復元する
        if(cfg.dailyKcal) document.getElementById('cfgDailyKcal').value = cfg.dailyKcal;
        if(typeof cfg.voice === 'boolean') document.getElementById('cfgVoice').checked = cfg.voice;
    },
    save() {
        localStorage.setItem('stridex_config', JSON.stringify({
            weight: document.getElementById('cfgWeight').value,
            monthTarget: document.getElementById('cfgMonthTarget').value,
            yearTarget: document.getElementById('cfgYearTarget').value,
            dailyKcal: document.getElementById('cfgDailyKcal').value,
            voice: document.getElementById('cfgVoice').checked
        }));
        this.toggle();
        System.voiceCoach("システムをアップデートしました。");
        System.updateGoalProgress();
        System.updateLongTermProgress(); // 月間・年間の目標も最新値で更新する
    },
    getWeight() {
        const val = parseFloat(document.getElementById('cfgWeight').value);
        return !val || val <= 0 ? 65 : val;
    },
    getMonthTarget() {
        const val = parseFloat(document.getElementById('cfgMonthTarget').value); // 月間目標体重の入力値を取得する
        if(val && val > 0) return val; // 正しい値ならそのまま返す
        return this.getWeight(); // 未設定時は現在体重を基準値として返す
    },
    getYearTarget() {
        const val = parseFloat(document.getElementById('cfgYearTarget').value); // 年間目標体重の入力値を取得する
        if(val && val > 0) return val; // 正しい値ならそのまま返す
        return this.getWeight(); // 未設定時は現在体重を基準値として返す
    },
    getDailyKcalTarget() {
        const val = parseFloat(document.getElementById('cfgDailyKcal').value); // 1日の消費カロリー目標を取得する
        return !val || val <= 0 ? 300 : val; // 未設定時は300kcalを初期値として返す
    },
    saveVolume(value) {
        const cfg = JSON.parse(localStorage.getItem('stridex_config')) || {};
        cfg.musicVolume = value;
        localStorage.setItem('stridex_config', JSON.stringify(cfg));
    },
    getVolume() {
        const cfg = JSON.parse(localStorage.getItem('stridex_config'));
        if(cfg && typeof cfg.musicVolume === 'number') return cfg.musicVolume;
        return 70;
    }
};

const Music = {
    tracks: [],
    defaultTracks: [
        { title: 'Focus Flow', url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_55dd7c19c8.mp3?filename=ambient-110734.mp3' },
        { title: 'Neon Pulse', url: 'https://cdn.pixabay.com/download/audio/2021/10/25/audio_7f45dac82d.mp3?filename=future-bass-11254.mp3' },
        { title: 'Soft Momentum', url: 'https://cdn.pixabay.com/download/audio/2022/10/31/audio_c255d6a36a.mp3?filename=calm-ambient-125566.mp3' }
    ],
    audio: null,
    currentIndex: 0,
    isPlaying: false,
    selectEl: null,
    nowPlayingEl: null,
    statusEl: null,
    seekEl: null,
    currentTimeEl: null,
    durationEl: null,
    volumeEl: null,
    volumeValueEl: null,
    loopBtn: null,
    isLooping: localStorage.getItem('stridex_music_loop') === 'true', // ループ再生状態を保持する

    async init() {
        if (!('Audio' in window)) return;
        this.selectEl = document.getElementById('musicSelect');
        this.nowPlayingEl = document.getElementById('musicNowPlaying');
        this.statusEl = document.getElementById('musicStatus');
        this.seekEl = document.getElementById('musicSeek');
        this.currentTimeEl = document.getElementById('musicCurrentTime');
        this.durationEl = document.getElementById('musicDuration');
        this.volumeEl = document.getElementById('musicVolume');
        this.volumeValueEl = document.getElementById('musicVolumeValue');
        this.loopBtn = document.getElementById('musicLoopBtn');
        await this.loadTracks();
        if(this.tracks.length === 0) this.tracks = this.defaultTracks;
        this.buildSelect();

        this.audio = new Audio(this.tracks[0].url);
        this.audio.preload = 'auto';
        this.audio.addEventListener('timeupdate', () => this.updateStatus());
        this.audio.addEventListener('loadedmetadata', () => this.updateStatus());
        this.audio.addEventListener('ended', () => this.handleEnded()); // 終了時の挙動を共通化する
        this.setVolumeSlider(Config.getVolume());

        if(this.selectEl) {
            this.selectEl.addEventListener('change', (e) => {
                const idx = parseInt(e.target.value, 10);
                if(!isNaN(idx)) this.setTrack(idx, this.isPlaying);
            });
        }
        document.getElementById('musicPlayBtn').addEventListener('click', () => this.toggle());
        document.getElementById('musicPrevBtn').addEventListener('click', () => this.prev());
        document.getElementById('musicNextBtn').addEventListener('click', () => this.next());
        if(this.seekEl) {
            this.seekEl.addEventListener('input', (e) => {
                if(!this.audio || isNaN(this.audio.duration)) return;
                const percent = parseInt(e.target.value, 10) / 100;
                this.audio.currentTime = this.audio.duration * percent;
                this.updateStatus();
            });
        }
        if(this.volumeEl) {
            this.volumeEl.addEventListener('input', (e) => {
                const value = parseInt(e.target.value, 10);
                this.setVolume(value);
                Config.saveVolume(value);
            });
        }
        if(this.loopBtn) {
            this.loopBtn.addEventListener('click', () => this.toggleLoop()); // ループボタン押下で状態を切り替える
            this.updateLoopVisual(); // 初期表示を反映する
        }

        this.updateTrackInfo();
        this.updatePlayState();
        this.updateStatus();
    },

    async loadTracks() {
        try {
            const res = await fetch('music/tracks.json', { cache: 'no-store' });
            if(!res.ok) return;
            const data = await res.json();
            this.tracks = (Array.isArray(data) ? data : [])
                .filter(item => item && item.file)
                .map(item => {
                    const encodedPath = item.file.split('/').map(segment => encodeURIComponent(segment)).join('/');
                    return {
                        title: item.title || this.formatTitle(item.file),
                        url: item.file.startsWith('http') ? item.file : `music/${encodedPath}`
                    };
                });
        } catch (e) {
            this.tracks = [];
        }
    },

    buildSelect() {
        if(!this.selectEl) return;
        this.selectEl.innerHTML = '';
        this.tracks.forEach((track, idx) => {
            const option = document.createElement('option');
            option.value = idx;
            option.textContent = track.title;
            this.selectEl.appendChild(option);
        });
        this.selectEl.disabled = this.tracks.length === 0;
    },

    toggle() {
        if(this.isPlaying) this.pause();
        else this.play();
    },

    play() {
        if(!this.audio) return;
        this.audio.play().then(() => {
            this.isPlaying = true;
            this.updatePlayState();
        }).catch(() => {});
    },

    pause() {
        if(!this.audio) return;
        this.audio.pause();
        this.isPlaying = false;
        this.updatePlayState();
    },

    setTrack(index, forcePlay = null) {
        if(index < 0 || index >= this.tracks.length || !this.audio) return;
        const shouldPlay = forcePlay !== null ? forcePlay : this.isPlaying;
        this.currentIndex = index;
        this.audio.src = this.tracks[index].url;
        this.audio.load();
        this.isPlaying = shouldPlay;
        if(shouldPlay) this.audio.play();
        this.updateTrackInfo();
        this.updatePlayState();
        if(this.selectEl) this.selectEl.value = index.toString();
    },

    next(auto = false) {
        if(!this.tracks.length) return;
        const nextIndex = (this.currentIndex + 1) % this.tracks.length;
        this.setTrack(nextIndex, auto ? true : null);
    },

    prev() {
        if(!this.tracks.length) return;
        const prevIndex = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
        this.setTrack(prevIndex, this.isPlaying);
    },

    updateTrackInfo() {
        if(this.nowPlayingEl) {
            this.nowPlayingEl.innerText = this.tracks[this.currentIndex]?.title || '-';
        }
    },

    updatePlayState() {
        const icon = document.getElementById('musicPlayIcon');
        if(icon) icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
    },

    updateStatus() {
        if(!this.audio || isNaN(this.audio.duration)) {
            if(this.statusEl) this.statusEl.innerText = "00:00 / 00:00";
            if(this.currentTimeEl) this.currentTimeEl.innerText = "00:00";
            if(this.durationEl) this.durationEl.innerText = "00:00";
            if(this.seekEl) this.seekEl.value = "0";
            return;
        }
        const current = this.formatTime(this.audio.currentTime);
        const total = this.formatTime(this.audio.duration);
        if(this.statusEl) this.statusEl.innerText = `${current} / ${total}`;
        if(this.currentTimeEl) this.currentTimeEl.innerText = current;
        if(this.durationEl) this.durationEl.innerText = total;
        if(this.seekEl) {
            const percent = (this.audio.currentTime / this.audio.duration) * 100;
            this.seekEl.value = percent.toString();
        }
    },

    handleEnded() {
        if(this.isLooping && this.audio) {
            this.audio.currentTime = 0; // ループONなら冒頭へ戻す
            this.audio.play();
        } else {
            this.next(true); // 通常は次の曲へ
        }
    },

    toggleLoop() {
        this.isLooping = !this.isLooping; // ループ状態を反転させる
        localStorage.setItem('stridex_music_loop', this.isLooping);
        this.updateLoopVisual();
    },

    updateLoopVisual() {
        if(!this.loopBtn) return;
        if(this.isLooping) this.loopBtn.classList.add('music-loop-active');
        else this.loopBtn.classList.remove('music-loop-active');
    },

    formatTime(time) {
        if(time === undefined || isNaN(time)) return "00:00";
        const minutes = Math.floor(time / 60).toString().padStart(2, '0');
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    },

    setVolume(percent) {
        if(!this.audio) return;
        const normalized = Math.min(100, Math.max(0, percent)) / 100;
        this.audio.volume = normalized;
        if(this.volumeValueEl) this.volumeValueEl.innerText = `${Math.round(normalized * 100)}%`;
    },

    setVolumeSlider(percent) {
        const value = percent ?? 70;
        if(this.volumeEl) this.volumeEl.value = value;
        this.setVolume(value);
    },

    formatTitle(name) {
        return name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    }
};

const Shop = {
    boostPrice: 200, // XPブーストの価格をポイントで定義する
    durationMinutes: 15, // ブースト継続時間（分）を設定する
    balanceEl: null,
    statusEl: null,
    messageEl: null,
    buttonEl: null,
    intervalId: null,
    overlayEl: null,
    closeBtn: null,

    init() {
        this.overlayEl = document.getElementById('shopOverlay'); // ショップ画面のラッパー要素を取得する
        this.closeBtn = document.getElementById('shopCloseBtn'); // 閉じるボタンを取得する
        this.balanceEl = document.getElementById('pointBalance'); // 残高表示要素をキャッシュする
        this.statusEl = document.getElementById('boostStatus'); // ブースト状況ラベルを取得する
        this.messageEl = document.getElementById('shopMessage'); // メッセージ表示欄を取得する
        this.buttonEl = document.getElementById('boostPurchaseBtn'); // 購入ボタンを取得する
        if(this.buttonEl) {
            this.buttonEl.addEventListener('click', () => this.buyXpBoost()); // クリック時に購入処理を呼ぶ
        }
        if(this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.toggle(false)); // 閉じるボタンで画面を隠す
        }
        if(this.overlayEl) {
            this.overlayEl.addEventListener('click', (event) => {
                if(event.target === this.overlayEl) this.toggle(false); // 背景部分を押した際にも閉じる
            });
        }
        this.render(); // 初期描画を実行する
        this.intervalId = setInterval(() => this.render(), 1000); // 残り時間を更新するために1秒ごと再描画する
    },

    toggle(force = null) {
        if(!this.overlayEl) return; // DOMが揃っていない場合は何もしない
        const isHidden = this.overlayEl.classList.contains('hidden');
        const shouldShow = force !== null ? force : isHidden; // 引数がある場合はそれを優先する
        this.overlayEl.classList.toggle('hidden', !shouldShow);
        if(shouldShow) this.render(); // 表示時には最新情報へ更新する
    },

    buyXpBoost() {
        if(!System.spendPoints(this.boostPrice)) {
            this.setMessage("ポイントが不足しています。"); // 所持ポイントが足りない旨を通知する
            return;
        }
        System.activateBoost(this.durationMinutes); // 指定分のXPブーストを発動させる
        this.setMessage(`XPブーストが${this.durationMinutes}分間有効になりました。`); // 購入成功を知らせる
        this.render(); // 最新状態を反映する
    },

    render() {
        if(this.balanceEl) this.balanceEl.innerText = `${System.points} pts`; // 現在のポイント残高を表示する
        if(this.buttonEl) {
            this.buttonEl.disabled = System.points < this.boostPrice; // 残高不足時は購入ボタンを無効にする
            this.buttonEl.innerText = `購入 (${this.boostPrice} pts)`; // ボタンに価格を明示する
        }
        if(this.statusEl) {
            if(System.isBoostActive()) {
                const remaining = System.getBoostRemainingMs(); // 残り時間を取得する
                const minutes = Math.floor(remaining / 60000).toString().padStart(2, '0');
                const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
                this.statusEl.innerText = `XPブースト残り ${minutes}:${seconds}`; // カウントダウン形式で表示する
            } else {
                this.statusEl.innerText = "ブースト未適用"; // ブーストが無いことを示す
            }
        }
    },

    setMessage(text) {
        if(!this.messageEl) return;
        this.messageEl.innerText = text; // 最新のショップメッセージを表示する
    }
};

Config.load();
System.render();
System.updateGoalProgress();
System.updateLongTermProgress(); // 起動時に月間・年間の進捗を初期表示する
System.renderWeightLogs();
Music.init();
Shop.init();

