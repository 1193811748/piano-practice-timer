/**
 * 个性化练琴计时器与专注度检测 - JavaScript 逻辑
 *
 * 功能概览：
 * 1. 自定义添加练习/休息阶段
 * 2. 倒计时器（开始/暂停/继续/重置）
 * 3. 阶段自动切换 / 手动切换模式
 * 4. 阶段切换语音播报
 * 5. 麦克风音量检测专注度
 * 6. 练习完成总结弹窗
 */

// ============================================================
// 一、数据管理
// ============================================================

/** 存储所有阶段的数组，每个元素：{ name, minutes, type } */
let stages = [];

/** 当前正在执行的阶段索引（从 0 开始） */
let currentStageIndex = 0;

/** 当前阶段剩余的秒数 */
let remainingSeconds = 0;

/** 计时器的定时器 ID（用于清除定时器） */
let timerInterval = null;

/** 计时器状态：'idle' | 'running' | 'paused' | 'completed' | 'manual_waiting' */
let timerState = 'idle';

/** 阶段切换模式：'auto' 自动切换 / 'manual' 手动切换 */
let switchMode = 'auto';

/** 专注提醒次数（用于总结弹窗） */
let focusReminderCount = 0;

/** 练习开始时间（用于计算总练习时长） */
let practiceStartTime = null;

/** 总练习时长（秒） */
let totalPracticeSeconds = 0;

// ============================================================
// 二、DOM 元素引用
// ============================================================

// 表单
const stageNameInput = document.getElementById('stageName');
const stageMinutesInput = document.getElementById('stageMinutes');
const stageTypeSelect = document.getElementById('stageType');
const addBtn = document.getElementById('addBtn');

// 计时器显示
const currentStageNameEl = document.getElementById('currentStageName');
const currentStageTypeEl = document.getElementById('currentStageType');
const currentIndexEl = document.getElementById('currentIndex');
const totalStagesEl = document.getElementById('totalStages');
const countdownEl = document.getElementById('countdown');

// 控制按钮
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

// 切换模式单选按钮
const switchModeRadios = document.querySelectorAll('input[name="switchMode"]');

// 手动切换模式按钮
const manualControls = document.getElementById('manualControls');
const nextManualBtn = document.getElementById('nextManualBtn');
const retryBtn = document.getElementById('retryBtn');
const endBtn = document.getElementById('endBtn');

// 阶段列表
const stageListEl = document.getElementById('stageList');

// 专注度检测
const micBtn = document.getElementById('micBtn');
const micStatus = document.getElementById('micStatus');
const volumeBar = document.getElementById('volumeBar');
const focusStatus = document.getElementById('focusStatus');

// 检测模式
const modeSimple = document.getElementById('modeSimple');
const modePiano = document.getElementById('modePiano');

// 实时检测数据显示
const focusDb = document.getElementById('focusDb');
const focusPianoRatio = document.getElementById('focusPianoRatio');
const focusModeLabel = document.getElementById('focusModeLabel');
const focusIdleTime = document.getElementById('focusIdleTime');
const focusReminderDisplay = document.getElementById('focusReminderDisplay');

// 高级检测设置
const settingVolumeThreshold = document.getElementById('settingVolumeThreshold');
const settingFreqLow = document.getElementById('settingFreqLow');
const settingFreqHigh = document.getElementById('settingFreqHigh');
const settingRatioThreshold = document.getElementById('settingRatioThreshold');
const settingSilentTimeout = document.getElementById('settingSilentTimeout');


// 总结弹窗
const summaryModal = document.getElementById('summaryModal');
const summaryTotalTime = document.getElementById('summaryTotalTime');
const summaryStageCount = document.getElementById('summaryStageCount');
const summaryFocusCount = document.getElementById('summaryFocusCount');
const summaryStatus = document.getElementById('summaryStatus');
const restartBtn = document.getElementById('restartBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// ============================================================
// 三、语音播报工具函数
// ============================================================

/**
 * 使用浏览器 SpeechSynthesis API 播报文字
 * @param {string} text - 要播报的文字
 */
function speak(text) {
    if (!window.speechSynthesis) {
        console.warn('浏览器不支持语音播报');
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

// ============================================================
// 四、计时器核心逻辑
// ============================================================

/**
 * 格式化秒数为 MM:SS 格式
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 更新页面上的所有显示信息
 */
function updateDisplay() {
    // 更新阶段信息
    if (stages.length > 0 && currentStageIndex < stages.length) {
        const stage = stages[currentStageIndex];
        currentStageNameEl.textContent = stage.name;
        currentStageTypeEl.textContent = stage.type;
        // 设置 data-type 属性用于 CSS 区分类型颜色
        currentStageTypeEl.setAttribute('data-type', stage.type);
    } else {
        currentStageNameEl.textContent = '--';
        currentStageTypeEl.textContent = '--';
        currentStageTypeEl.removeAttribute('data-type');
    }

    // 更新进度
    currentIndexEl.textContent = stages.length > 0 ? currentStageIndex + 1 : 0;
    totalStagesEl.textContent = stages.length;

    // 更新倒计时
    countdownEl.textContent = formatTime(remainingSeconds);

    // 更新阶段列表
    renderStageList();
}

/**
 * 开始倒计时
 */
function startTimer() {
    if (stages.length === 0) {
        alert('请先添加练习阶段！');
        return;
    }

    if (timerState === 'running') return;

    // 如果从空闲状态开始，记录练习开始时间
    if (timerState === 'idle') {
        currentStageIndex = 0;
        remainingSeconds = stages[0].minutes * 60;
        practiceStartTime = Date.now();
        totalPracticeSeconds = 0;
        focusReminderCount = 0;
        speak(`开始：${stages[0].name}`);
    }

    // 如果从暂停状态继续，remainingSeconds 保持不变

    timerState = 'running';
    updateButtonStates();
    hideManualControls();

    timerInterval = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds <= 0) {
            // 根据切换模式决定行为
            if (switchMode === 'auto') {
                nextStage();
            } else {
                // 手动模式：暂停在完成状态，显示手动控制按钮
                clearInterval(timerInterval);
                timerInterval = null;
                timerState = 'manual_waiting';
                remainingSeconds = 0;
                updateDisplay();
                updateButtonStates();
                showManualControls();
                speak(`${stages[currentStageIndex].name}已完成，请选择操作`);
            }
        }

        updateDisplay();
    }, 1000);
}

/**
 * 暂停计时器
 */
function pauseTimer() {
    if (timerState !== 'running') return;

    timerState = 'paused';
    clearInterval(timerInterval);
    timerInterval = null;
    updateButtonStates();
}

/**
 * 重置计时器到初始状态
 */
function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;

    timerState = 'idle';
    currentStageIndex = 0;
    remainingSeconds = stages.length > 0 ? stages[0].minutes * 60 : 0;
    practiceStartTime = null;
    totalPracticeSeconds = 0;
    focusReminderCount = 0;

    hideManualControls();
    updateButtonStates();
    updateDisplay();
}

/**
 * 自动切换到下一个阶段（自动模式使用）
 */
function nextStage() {
    // 播报当前阶段结束
    if (currentStageIndex < stages.length) {
        speak(`${stages[currentStageIndex].name}结束`);
    }

    currentStageIndex++;

    // 如果所有阶段都已完成
    if (currentStageIndex >= stages.length) {
        finishPractice();
        return;
    }

    // 设置下一个阶段的剩余时间
    remainingSeconds = stages[currentStageIndex].minutes * 60;
    speak(`开始：${stages[currentStageIndex].name}`);

    updateDisplay();
}

/**
 * 手动模式：进入下一阶段
 */
function goToNextStage() {
    if (currentStageIndex < stages.length) {
        speak(`${stages[currentStageIndex].name}结束`);
    }

    currentStageIndex++;

    if (currentStageIndex >= stages.length) {
        finishPractice();
        return;
    }

    remainingSeconds = stages[currentStageIndex].minutes * 60;
    timerState = 'running';
    hideManualControls();
    updateButtonStates();
    speak(`开始：${stages[currentStageIndex].name}`);

    // 重新开始倒计时
    timerInterval = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerState = 'manual_waiting';
            remainingSeconds = 0;
            updateDisplay();
            updateButtonStates();
            showManualControls();
            speak(`${stages[currentStageIndex].name}已完成，请选择操作`);
        }

        updateDisplay();
    }, 1000);

    updateDisplay();
}

/**
 * 手动模式：再练一次当前阶段
 */
function retryCurrentStage() {
    remainingSeconds = stages[currentStageIndex].minutes * 60;
    timerState = 'running';
    hideManualControls();
    updateButtonStates();
    speak(`重新开始：${stages[currentStageIndex].name}`);

    timerInterval = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerState = 'manual_waiting';
            remainingSeconds = 0;
            updateDisplay();
            updateButtonStates();
            showManualControls();
            speak(`${stages[currentStageIndex].name}已完成，请选择操作`);
        }

        updateDisplay();
    }, 1000);

    updateDisplay();
}

/**
 * 手动模式：结束练习
 */
function endPractice() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerState = 'idle';
    hideManualControls();

    // 计算已完成的练习时间
    calculateTotalPracticeTime();

    // 显示总结弹窗（提前结束）
    showSummaryModal(false);
}

/**
 * 完成所有练习
 */
function finishPractice() {
    clearInterval(timerInterval);
    timerInterval = null;
    timerState = 'idle';
    remainingSeconds = 0;
    hideManualControls();

    calculateTotalPracticeTime();
    updateDisplay();
    updateButtonStates();
    speak('所有练习阶段已完成，太棒了！');

    // 显示总结弹窗（全部完成）
    showSummaryModal(true);
}

/**
 * 计算总练习时长（只计算练习类型，不包含休息）
 */
function calculateTotalPracticeTime() {
    if (practiceStartTime) {
        // 计算从开始到现在的总时间
        const elapsed = Math.floor((Date.now() - practiceStartTime) / 1000);
        totalPracticeSeconds = elapsed;
    }
}

/**
 * 显示手动切换模式的控制按钮
 */
function showManualControls() {
    manualControls.style.display = 'block';
}

/**
 * 隐藏手动切换模式的控制按钮
 */
function hideManualControls() {
    manualControls.style.display = 'none';
}

/**
 * 更新按钮的启用/禁用状态
 */
function updateButtonStates() {
    switch (timerState) {
        case 'idle':
            startBtn.disabled = false;
            startBtn.textContent = '▶ 开始练习';
            pauseBtn.disabled = true;
            resetBtn.disabled = true;
            break;
        case 'running':
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.textContent = '⏸ 暂停';
            resetBtn.disabled = false;
            break;
        case 'paused':
            startBtn.disabled = false;
            startBtn.textContent = '▶ 继续练习';
            pauseBtn.disabled = true;
            resetBtn.disabled = false;
            break;
        case 'manual_waiting':
            startBtn.disabled = true;
            pauseBtn.disabled = true;
            resetBtn.disabled = false;
            break;
    }
}

// ============================================================
// 五、阶段管理（添加 / 删除 / 渲染）
// ============================================================

/**
 * 添加一个新阶段
 */
function addStage() {
    const name = stageNameInput.value.trim();
    const minutes = parseInt(stageMinutesInput.value);
    const type = stageTypeSelect.value;

    if (!name) {
        alert('请输入阶段名称');
        return;
    }

    if (!minutes || minutes < 1) {
        alert('请输入有效的分钟数（至少 1 分钟）');
        return;
    }

    stages.push({ name, minutes, type });

    stageNameInput.value = '';
    stageMinutesInput.value = '5';

    if (timerState === 'idle' && stages.length === 1) {
        currentStageIndex = 0;
        remainingSeconds = stages[0].minutes * 60;
    }

    renderStageList();
    updateDisplay();
}

/**
 * 删除指定索引的阶段
 * @param {number} index - 要删除的阶段索引
 */
function deleteStage(index) {
    if (timerState === 'running') {
        alert('请先暂停或重置计时器后再删除阶段');
        return;
    }

    stages.splice(index, 1);

    if (currentStageIndex >= stages.length) {
        currentStageIndex = Math.max(0, stages.length - 1);
    }

    if (stages.length > 0 && timerState === 'idle') {
        remainingSeconds = stages[currentStageIndex].minutes * 60;
    } else if (stages.length === 0) {
        remainingSeconds = 0;
        currentStageIndex = 0;
    }

    renderStageList();
    updateDisplay();
}

/**
 * 渲染阶段列表到页面
 *
 * 三种状态：
 * - 已完成（completed）：显示绿色勾选标记，半透明
 * - 进行中（active）：金色高亮边框
 * - 未开始：普通样式
 * 练习和休息类型用不同颜色标签区分
 */
function renderStageList() {
    stageListEl.innerHTML = '';

    if (stages.length === 0) {
        stageListEl.innerHTML = '<li class="empty-hint">还没有添加阶段，请在上方添加 🎵</li>';
        return;
    }

    stages.forEach((stage, index) => {
        const li = document.createElement('li');

        // 标记已完成阶段（索引小于当前索引，或者所有阶段已完成）
        const isCompleted = index < currentStageIndex ||
            (timerState === 'idle' && currentStageIndex >= stages.length);

        // 标记当前正在执行的阶段
        const isActive = (index === currentStageIndex) &&
            (timerState === 'running' || timerState === 'paused' || timerState === 'manual_waiting');

        if (isCompleted) {
            li.classList.add('completed');
        }
        if (isActive) {
            li.classList.add('active');
        }

        // 阶段名称
        const nameSpan = document.createElement('span');
        nameSpan.className = 'stage-item-name';
        nameSpan.textContent = stage.name;

        // 阶段类型标签（使用 data-type 属性让 CSS 区分颜色）
        const typeSpan = document.createElement('span');
        typeSpan.className = 'stage-item-type';
        typeSpan.textContent = stage.type;
        typeSpan.setAttribute('data-type', stage.type);

        // 阶段时长
        const timeSpan = document.createElement('span');
        timeSpan.className = 'stage-item-time';
        timeSpan.textContent = `${stage.minutes} 分钟`;

        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.title = '删除此阶段';
        deleteBtn.addEventListener('click', () => deleteStage(index));

        li.appendChild(nameSpan);
        li.appendChild(typeSpan);
        li.appendChild(timeSpan);
        li.appendChild(deleteBtn);
        stageListEl.appendChild(li);
    });
}

// ============================================================
// 六、练习完成总结弹窗
// ============================================================

/**
 * 显示练习完成总结弹窗
 * @param {boolean} allCompleted - 是否全部完成
 */
function showSummaryModal(allCompleted) {
    // 计算总练习时长（格式化为分钟）
    const totalMinutes = Math.ceil(totalPracticeSeconds / 60);
    summaryTotalTime.textContent = `${totalMinutes} 分钟`;

    // 完成阶段数（当前索引即为已完成的阶段数）
    summaryStageCount.textContent = `${currentStageIndex} / ${stages.length}`;

    // 专注提醒次数
    summaryFocusCount.textContent = `${focusReminderCount} 次`;

    // 完成状态
    summaryStatus.textContent = allCompleted ? '✅ 全部完成' : '⏹ 提前结束';
    summaryStatus.style.color = allCompleted ? '#27ae60' : '#e67e22';

    // 显示弹窗
    summaryModal.style.display = 'flex';
}

/**
 * 关闭总结弹窗
 */
function closeSummaryModal() {
    summaryModal.style.display = 'none';
}

/**
 * 从总结弹窗重新开始练习
 */
function restartFromSummary() {
    closeSummaryModal();
    resetTimer();
}

// ============================================================
// 七、专注度检测（Web Audio API 麦克风音量 + 频谱分析）
// ============================================================

/** 麦克风是否正在检测中 */
let isMicActive = false;

/** Web Audio API 相关对象 */
let audioContext = null;
let analyser = null;
let microphone = null;
let mediaStream = null;
let animationFrameId = null;

/** 上次检测到练琴活动的时间戳（钢琴模式用） */
let lastActivityTime = Date.now();

/** 静音检测定时器 ID */
let silentCheckInterval = null;

/** 标记是否已经播报过静音提醒（避免重复播报） */
let lastSilentWarningSpoken = false;

/** 当前检测模式：'simple' 或 'piano' */
let currentFocusMode = 'piano';

/** 钢琴频段检测持续满足条件的帧计数（用于判断持续 >= 1 秒） */
let pianoActiveFrameCount = 0;
const PIANO_HOLD_FRAMES = 10; // 约 1 秒（按 10fps 估算）

/** 上次更新实时数据的时间（节流用） */
let lastDataUpdateTime = 0;

/**
 * 获取当前检测模式
 * @returns {'simple' | 'piano'}
 */
function getFocusMode() {
    return modePiano.checked ? 'piano' : 'simple';
}

/**
 * 切换麦克风检测的开启/关闭
 */
async function toggleMic() {
    if (isMicActive) {
        stopMicDetection();
    } else {
        await startMicDetection();
    }
}

/**
 * 检查当前页面是否在 HTTPS 或 localhost 环境下
 * @returns {boolean}
 */
function isSecureContext() {
    return window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
}

/**
 * 开启麦克风检测
 */
async function startMicDetection() {
    // 检查是否 HTTPS 环境
    if (!isSecureContext() && !navigator.mediaDevices) {
        focusStatus.textContent = '⚠️ 麦克风检测通常需要 HTTPS 安全网页环境。请使用正式发布链接访问。';
        focusStatus.className = 'focus-status warning';
        return;
    }

    // 检查浏览器是否支持 getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        focusStatus.textContent = '⚠️ 您的浏览器不支持麦克风检测功能，请使用最新版 Chrome 或 Edge 浏览器。';
        focusStatus.className = 'focus-status warning';
        return;
    }

    try {
        focusStatus.textContent = '⏳ 正在请求麦克风权限，请在浏览器弹窗中点击"允许"...';
        focusStatus.className = 'focus-status idle';

        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(mediaStream);

        // 使用 1024 的 fftSize 以获得更好的频率分辨率
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;

        source.connect(analyser);

        isMicActive = true;
        currentFocusMode = getFocusMode();
        micBtn.textContent = '🔴 关闭专注度检测';
        micStatus.textContent = '已开启';
        micStatus.style.color = '#27ae60';
        focusStatus.textContent = '正在检测中...';
        focusStatus.className = 'focus-status idle';

        lastActivityTime = Date.now();
        lastSilentWarningSpoken = false;
        pianoActiveFrameCount = 0;

        // 更新检测模式标签
        focusModeLabel.textContent = currentFocusMode === 'piano' ? '钢琴频段' : '简单音量';

        // 开始检测循环（使用 requestAnimationFrame 驱动）
        updateVolume();

        // 每秒检查一次是否停止练习
        silentCheckInterval = setInterval(checkSilent, 1000);
    } catch (err) {
        console.error('麦克风访问被拒绝:', err);
        // 用户拒绝权限时的友好提示
        focusStatus.textContent = '⚠️ 麦克风权限未开启，专注度检测无法使用。你仍然可以使用练琴计时器。';
        focusStatus.className = 'focus-status warning';
        micBtn.textContent = '🎙️ 开启专注度检测';
        micStatus.textContent = '已拒绝';
        micStatus.style.color = '#e74c3c';
    }
}


/**
 * 关闭麦克风检测
 */
function stopMicDetection() {
    isMicActive = false;
    micBtn.textContent = '🎙️ 开启麦克风检测';
    micStatus.textContent = '已关闭';
    micStatus.style.color = '#8899aa';
    focusStatus.textContent = '等待开始检测...';
    focusStatus.className = 'focus-status idle';

    volumeBar.style.width = '0%';
    focusDb.textContent = '-- dB';
    focusPianoRatio.textContent = '--%';
    focusIdleTime.textContent = '0 秒';

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (silentCheckInterval) {
        clearInterval(silentCheckInterval);
        silentCheckInterval = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    analyser = null;
    microphone = null;
}

/**
 * 将时域数据的振幅值转换为分贝（dB）
 * @param {number} amplitude - 振幅值（0-128）
 * @returns {number} 分贝值（约 -80 到 0 dB）
 */
function amplitudeToDb(amplitude) {
    if (amplitude <= 0) return -80;
    // 归一化到 0-1 范围，然后转 dB
    const normalized = amplitude / 128;
    return Math.max(-80, Math.round(20 * Math.log10(normalized) * 10) / 10);
}

/**
 * 钢琴频段检测 - 核心检测函数
 *
 * 逻辑：
 * 1. 从 AnalyserNode 获取频谱数据（getByteFrequencyData）
 * 2. 根据 sampleRate 和 fftSize 计算每个频率 bin 对应的频率
 * 3. 计算总频谱能量 totalEnergy
 * 4. 计算用户设置的钢琴频率范围内的能量 pianoBandEnergy
 * 5. 计算 pianoBandRatio = pianoBandEnergy / totalEnergy
 * 6. 同时计算当前音量 dB
 * 7. 只有当：
 *    a) 当前音量高于用户设置的分贝阈值
 *    b) pianoBandRatio 高于用户设置的钢琴频段能量占比阈值
 *    c) 该状态持续至少 1 秒（约 10 帧）
 *    才判断为"检测到练琴活动"
 *
 * @returns {{ isActive: boolean, db: number, ratio: number }}
 */
function detectPianoActivity() {
    if (!analyser || !audioContext) {
        return { isActive: false, db: -80, ratio: 0 };
    }

    // 获取频谱数据（频域）
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    // 获取时域数据用于计算音量
    const timeData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeData);

    // ---- 计算当前音量 dB ----
    let maxAmplitude = 0;
    for (let i = 0; i < timeData.length; i++) {
        const amp = Math.abs(timeData[i] - 128);
        if (amp > maxAmplitude) maxAmplitude = amp;
    }
    const currentDb = amplitudeToDb(maxAmplitude);

    // ---- 计算频谱能量 ----
    // 每个 bin 对应的频率 = binIndex * sampleRate / fftSize
    const sampleRate = audioContext.sampleRate;
    const fftSize = analyser.fftSize;
    const freqPerBin = sampleRate / fftSize;

    // 读取用户设置
    const pianoLowHz = parseFloat(settingFreqLow.value) || 80;
    const pianoHighHz = parseFloat(settingFreqHigh.value) || 4200;
    const ratioThreshold = (parseFloat(settingRatioThreshold.value) || 45) / 100;
    const dbThreshold = parseFloat(settingVolumeThreshold.value) || -45;

    // 计算总能量和钢琴频段能量
    let totalEnergy = 0;
    let pianoBandEnergy = 0;

    for (let i = 0; i < freqData.length; i++) {
        const frequency = i * freqPerBin;
        const energy = freqData[i]; // 0-255

        totalEnergy += energy;

        // 判断是否在钢琴频率范围内
        if (frequency >= pianoLowHz && frequency <= pianoHighHz) {
            pianoBandEnergy += energy;
        }
    }

    // 计算钢琴频段能量占比
    const pianoBandRatio = totalEnergy > 0 ? pianoBandEnergy / totalEnergy : 0;

    // ---- 判断是否检测到练琴活动 ----
    const volumeOk = currentDb > dbThreshold;
    const ratioOk = pianoBandRatio > ratioThreshold;

    // 持续计数：需要连续多帧满足条件才算活跃
    if (volumeOk && ratioOk) {
        pianoActiveFrameCount++;
    } else {
        pianoActiveFrameCount = 0;
    }

    // 需要持续约 1 秒（~10 帧）才判定为练琴活动
    const isActive = pianoActiveFrameCount >= PIANO_HOLD_FRAMES;

    return {
        isActive: isActive,
        db: currentDb,
        ratio: pianoBandRatio,
        volumeOk: volumeOk,
        ratioOk: ratioOk,
        frameCount: pianoActiveFrameCount
    };
}

/**
 * 简单音量检测 - 只根据音量判断是否有声音
 * @returns {{ isActive: boolean, db: number }}
 */
function detectSimpleActivity() {
    if (!analyser) {
        return { isActive: false, db: -80 };
    }

    const timeData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeData);

    let maxAmplitude = 0;
    for (let i = 0; i < timeData.length; i++) {
        const amp = Math.abs(timeData[i] - 128);
        if (amp > maxAmplitude) maxAmplitude = amp;
    }

    const currentDb = amplitudeToDb(maxAmplitude);
    const dbThreshold = parseFloat(settingVolumeThreshold.value) || -45;

    return {
        isActive: currentDb > dbThreshold,
        db: currentDb
    };
}

/**
 * 更新音量可视化和检测数据（使用 requestAnimationFrame 驱动）
 */
function updateVolume() {
    if (!isMicActive || !analyser) return;

    const mode = getFocusMode();
    currentFocusMode = mode;

    // 更新检测模式标签
    focusModeLabel.textContent = mode === 'piano' ? '钢琴频段' : '简单音量';

    // 根据模式执行检测
    let isActive = false;
    let currentDb = -80;
    let pianoRatio = 0;

    if (mode === 'piano') {
        const result = detectPianoActivity();
        isActive = result.isActive;
        currentDb = result.db;
        pianoRatio = result.ratio;

        // 更新音量条（基于 dB 映射到 0-100%）
        const barPercent = Math.min(100, Math.max(0, ((currentDb + 80) / 80) * 100));
        volumeBar.style.width = barPercent + '%';

        // 更新实时数据显示（节流到约 10fps）
        const now = Date.now();
        if (now - lastDataUpdateTime > 100) {
            focusDb.textContent = currentDb.toFixed(1) + ' dB';
            focusPianoRatio.textContent = (pianoRatio * 100).toFixed(1) + '%';
            lastDataUpdateTime = now;
        }

        // 更新状态显示
        if (isActive) {
            // 检测到练琴活动 → 重置计时
            lastActivityTime = Date.now();
            lastSilentWarningSpoken = false;
            focusStatus.textContent = '🎹 可能正在练琴';
            focusStatus.className = 'focus-status practicing';
        } else if (result.volumeOk && !result.ratioOk) {
            // 有声音但不符合钢琴频段特征
            focusStatus.textContent = '⚠️ 检测到声音但不符合钢琴频段特征';
            focusStatus.className = 'focus-status not-piano';
        } else if (!result.volumeOk) {
            // 声音不足
            focusStatus.textContent = '🔇 声音不足';
            focusStatus.className = 'focus-status low-volume';
        }
    } else {
        // 简单音量检测模式
        const result = detectSimpleActivity();
        isActive = result.isActive;
        currentDb = result.db;

        // 更新音量条
        const barPercent = Math.min(100, Math.max(0, ((currentDb + 80) / 80) * 100));
        volumeBar.style.width = barPercent + '%';

        const now = Date.now();
        if (now - lastDataUpdateTime > 100) {
            focusDb.textContent = currentDb.toFixed(1) + ' dB';
            focusPianoRatio.textContent = '-- (简单模式)';
            lastDataUpdateTime = now;
        }

        if (isActive) {
            lastActivityTime = Date.now();
            lastSilentWarningSpoken = false;
            focusStatus.textContent = '🔊 检测到声音（简单模式易受环境噪音影响）';
            focusStatus.className = 'focus-status practicing';
        } else {
            focusStatus.textContent = '🔇 声音不足';
            focusStatus.className = 'focus-status low-volume';
        }
    }

    // 更新未检测时间显示
    const idleSeconds = Math.floor((Date.now() - lastActivityTime) / 1000);
    focusIdleTime.textContent = idleSeconds + ' 秒';

    // 更新专注提醒次数显示
    focusReminderDisplay.textContent = focusReminderCount;

    // 继续下一帧
    animationFrameId = requestAnimationFrame(updateVolume);
}

/**
 * 检查是否连续未检测到练琴活动超过设定时间（每秒执行一次）
 *
 * 注意：在钢琴频段检测模式下，只有符合钢琴频段检测条件的声音才能重置计时
 * 不是只要有环境声音就重置
 */
function checkSilent() {
    if (!isMicActive) return;

    const silentTimeout = parseFloat(settingSilentTimeout.value) || 20;
    const elapsed = (Date.now() - lastActivityTime) / 1000;

    if (elapsed >= silentTimeout) {
        // 连续未检测到练琴活动超过设定时间
        const mode = getFocusMode();
        const modeText = mode === 'piano' ? '钢琴频段' : '简单音量';
        focusStatus.textContent = `⚠️ 检测到你可能停止练习了，已 ${Math.floor(elapsed)} 秒未检测到练琴活动（${modeText}）！`;
        focusStatus.className = 'focus-status warning';

        // 语音播报提醒（每 5 秒播报一次）
        if (!lastSilentWarningSpoken || Math.floor(elapsed) % 5 === 0) {
            speak('检测到你可能停止练习了，请继续练习');
            lastSilentWarningSpoken = true;
            focusReminderCount++;
            focusReminderDisplay.textContent = focusReminderCount;
        }
    }
}


// ============================================================
// 八、事件绑定
// ============================================================

// 添加阶段
addBtn.addEventListener('click', addStage);
stageNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addStage();
});

// 计时器控制
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

// 切换模式选择
switchModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.checked) {
            switchMode = e.target.value;
            // 如果当前处于 manual_waiting 状态且切换到自动模式，自动进入下一阶段
            if (switchMode === 'auto' && timerState === 'manual_waiting') {
                goToNextStage();
            }
        }
    });
});

// 手动切换模式按钮
nextManualBtn.addEventListener('click', goToNextStage);
retryBtn.addEventListener('click', retryCurrentStage);
endBtn.addEventListener('click', endPractice);

// 麦克风
micBtn.addEventListener('click', toggleMic);

// 总结弹窗
restartBtn.addEventListener('click', restartFromSummary);
closeModalBtn.addEventListener('click', closeSummaryModal);

// 点击弹窗外部关闭
summaryModal.addEventListener('click', (e) => {
    if (e.target === summaryModal) {
        closeSummaryModal();
    }
});

// ============================================================
// 九、初始化
// ============================================================

// 添加示例阶段
stages.push({ name: '音阶练习', minutes: 5, type: '练习' });
stages.push({ name: '休息一下', minutes: 2, type: '休息' });
stages.push({ name: '曲目练习', minutes: 10, type: '练习' });

// 设置初始倒计时
currentStageIndex = 0;
remainingSeconds = stages[0].minutes * 60;

// 渲染界面
renderStageList();
updateDisplay();
updateButtonStates();
