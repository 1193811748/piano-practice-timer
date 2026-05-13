/**
 * 个性化练琴计时器与专注度检测 - JavaScript 逻辑
 *
 * 功能概览：
 * 1. 自定义添加练习/休息阶段
 * 2. 倒计时器（开始/暂停/继续/重置）
 * 3. 阶段自动切换 / 手动切换模式
 * 4. 任意时候可点击"下一阶段"提前切换
 * 5. 阶段切换语音播报
 * 6. 钢琴频谱检测专注度（含环境噪音校准、峰值计数）
 * 7. 节拍器（Web Audio API 生成点击音）
 * 8. 练习完成总结弹窗
 * 9. 调试面板
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

/** 提前切换次数 */
let skipCount = 0;

/** 节拍器是否使用过 */
let metronomeWasUsed = false;

/** 防止 goToNextStage 重复执行 */
let isNavigatingStage = false;

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
const nextStageBtn = document.getElementById('nextStageBtn');

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
const calibrateBtn = document.getElementById('calibrateBtn');
const calibrateStatus = document.getElementById('calibrateStatus');

// 检测模式
const modeSimple = document.getElementById('modeSimple');
const modePiano = document.getElementById('modePiano');

// 实时检测数据显示
const focusDb = document.getElementById('focusDb');
const focusPianoRatio = document.getElementById('focusPianoRatio');
const focusPeakCount = document.getElementById('focusPeakCount');
const focusModeLabel = document.getElementById('focusModeLabel');
const focusIdleTime = document.getElementById('focusIdleTime');
const focusReminderDisplay = document.getElementById('focusReminderDisplay');

// 高级检测设置
const settingVolumeThreshold = document.getElementById('settingVolumeThreshold');
const settingFreqLow = document.getElementById('settingFreqLow');
const settingFreqHigh = document.getElementById('settingFreqHigh');
const settingRatioThreshold = document.getElementById('settingRatioThreshold');
const settingPeakThreshold = document.getElementById('settingPeakThreshold');
const settingHoldTime = document.getElementById('settingHoldTime');
const settingSilentTimeout = document.getElementById('settingSilentTimeout');

// 节拍器
const metronomeBpm = document.getElementById('metronomeBpm');
const metronomeTimeSig = document.getElementById('metronomeTimeSig');
const metronomeToggleBtn = document.getElementById('metronomeToggleBtn');
const metronomeAutoToggle = document.getElementById('metronomeAutoToggle');
const beatIndicators = document.getElementById('beatIndicators');
const beatDisplay = document.getElementById('beatDisplay');
const bpmDisplay = document.getElementById('bpmDisplay');

// 总结弹窗
const summaryModal = document.getElementById('summaryModal');
const summaryTotalTime = document.getElementById('summaryTotalTime');
const summaryStageCount = document.getElementById('summaryStageCount');
const summarySkipCount = document.getElementById('summarySkipCount');
const summaryFocusCount = document.getElementById('summaryFocusCount');
const summaryMetronomeUsed = document.getElementById('summaryMetronomeUsed');
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

    // 更新调试面板
    updateDebugPanel();
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
        skipCount = 0;
        metronomeWasUsed = false;
        speak(`开始：${stages[0].name}`);
    }

    timerState = 'running';
    updateButtonStates();
    hideManualControls();

    // 如果节拍器设为练习阶段自动开启，且当前是练习阶段，则开启节拍器
    handleAutoMetronome();

    timerInterval = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds <= 0) {
            // 根据切换模式决定行为
            if (switchMode === 'auto') {
                goToNextStageInternal();
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
    // 暂停节拍器
    stopMetronome();
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
    skipCount = 0;
    metronomeWasUsed = false;

    stopMetronome();
    hideManualControls();
    updateButtonStates();
    updateDisplay();
}

/**
 * 内部使用的下一阶段切换（倒计时结束自动切换）
 */
function goToNextStageInternal() {
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

    // 处理节拍器自动切换
    handleAutoMetronome();

    updateDisplay();
}

/**
 * 用户主动点击"下一阶段"按钮
 * 可在任何时候提前切换到下一阶段
 * 修复：防止重复点击，确保在任何状态下都能正确切换
 */
function goToNextStage() {
    // 防止重复点击（300ms 内只执行一次）
    if (isNavigatingStage) return;
    isNavigatingStage = true;
    setTimeout(() => { isNavigatingStage = false; }, 300);

    // 如果还没有开始练习，显示提示
    if (timerState === 'idle') {
        alert('请先开始练习');
        isNavigatingStage = false;
        return;
    }

    // 如果练习已结束，不执行
    if (timerState === 'completed') return;

    // 清除当前倒计时定时器（关键修复：先清除再切换）
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // 如果当前是 manual_waiting 状态，隐藏手动控制
    if (timerState === 'manual_waiting') {
        hideManualControls();
    }

    // 记录提前切换（如果还有剩余时间且正在运行）
    if (timerState === 'running' && remainingSeconds > 0) {
        skipCount++;
    }

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

    // 如果之前是暂停状态，切换到下一阶段但保持暂停
    if (timerState === 'paused') {
        timerState = 'paused';
        updateDisplay();
        updateButtonStates();
        speak(`下一阶段：${stages[currentStageIndex].name}`);
        handleAutoMetronome();
        return;
    }

    // 重新开始倒计时
    timerState = 'running';
    updateButtonStates();
    speak(`开始：${stages[currentStageIndex].name}`);

    // 处理节拍器自动切换
    handleAutoMetronome();

    // 启动新的倒计时
    timerInterval = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds <= 0) {
            if (switchMode === 'auto') {
                goToNextStageInternal();
            } else {
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

    handleAutoMetronome();

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
    stopMetronome();

    calculateTotalPracticeTime();
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
    stopMetronome();

    calculateTotalPracticeTime();
    updateDisplay();
    updateButtonStates();
    speak('所有练习阶段已完成，太棒了！');

    showSummaryModal(true);
}

/**
 * 计算总练习时长
 */
function calculateTotalPracticeTime() {
    if (practiceStartTime) {
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
 * 修复：确保下一阶段按钮在 running/paused/manual_waiting 时可用
 */
function updateButtonStates() {
    switch (timerState) {
        case 'idle':
            startBtn.disabled = false;
            startBtn.textContent = '▶ 开始练习';
            pauseBtn.disabled = true;
            resetBtn.disabled = true;
            nextStageBtn.disabled = true;
            break;
        case 'running':
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            pauseBtn.textContent = '⏸ 暂停';
            resetBtn.disabled = false;
            nextStageBtn.disabled = false;
            break;
        case 'paused':
            startBtn.disabled = false;
            startBtn.textContent = '▶ 继续练习';
            pauseBtn.disabled = true;
            resetBtn.disabled = false;
            nextStageBtn.disabled = false;
            break;
        case 'manual_waiting':
            startBtn.disabled = true;
            pauseBtn.disabled = true;
            resetBtn.disabled = false;
            nextStageBtn.disabled = false;
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

        // 阶段类型标签
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
    const totalMinutes = Math.ceil(totalPracticeSeconds / 60);
    summaryTotalTime.textContent = `${totalMinutes} 分钟`;

    summaryStageCount.textContent = `${currentStageIndex} / ${stages.length}`;
    summarySkipCount.textContent = `${skipCount} 次`;
    summaryFocusCount.textContent = `${focusReminderCount} 次`;
    summaryMetronomeUsed.textContent = metronomeWasUsed ? '是' : '否';

    summaryStatus.textContent = allCompleted ? '✅ 全部完成' : '⏹ 提前结束';
    summaryStatus.style.color = allCompleted ? '#27ae60' : '#e67e22';

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

/** 上次检测到练琴活动的时间戳 */
let lastActivityTime = Date.now();

/** 静音检测定时器 ID */
let silentCheckInterval = null;

/** 标记是否已经播报过静音提醒（避免重复播报） */
let lastSilentWarningSpoken = false;

/** 当前检测模式：'simple' 或 'piano' */
let currentFocusMode = 'piano';

/** 钢琴频段检测持续满足条件的帧计数 */
let pianoActiveFrameCount = 0;

/** 上次更新实时数据的时间（节流用） */
let lastDataUpdateTime = 0;

/** 环境噪音校准数据 */
let backgroundNoiseLevel = null;
let isCalibrated = false;

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
    if (!isSecureContext() && !navigator.mediaDevices) {
        focusStatus.textContent = '⚠️ 麦克风检测通常需要 HTTPS 安全网页环境。请使用正式发布链接访问。';
        focusStatus.className = 'focus-status warning';
        return;
    }

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

        focusModeLabel.textContent = currentFocusMode === 'piano' ? '钢琴频段' : '简单音量';

        updateVolume();

        silentCheckInterval = setInterval(checkSilent, 1000);
    } catch (err) {
        console.error('麦克风访问被拒绝:', err);
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
    focusPeakCount.textContent = '--';
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
    const normalized = amplitude / 128;
    return Math.max(-80, Math.round(20 * Math.log10(normalized) * 10) / 10);
}

/**
 * 环境噪音校准
 * 采集 3 秒环境声音，估算 backgroundNoiseLevel
 */
async function calibrateBackgroundNoise() {
    if (!isMicActive || !analyser) {
        focusStatus.textContent = '⚠️ 请先开启麦克风检测再进行校准';
        focusStatus.className = 'focus-status warning';
        return;
    }

    calibrateBtn.disabled = true;
    calibrateBtn.textContent = '⏳ 采集中...';
    calibrateStatus.textContent = '采集中';
    calibrateStatus.style.color = '#f0c27f';

    const samples = [];
    const sampleCount = 30;

    for (let i = 0; i < sampleCount; i++) {
        const timeData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(timeData);

        let maxAmplitude = 0;
        for (let j = 0; j < timeData.length; j++) {
            const amp = Math.abs(timeData[j] - 128);
            if (amp > maxAmplitude) maxAmplitude = amp;
        }
        samples.push(maxAmplitude);

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    backgroundNoiseLevel = amplitudeToDb(median);
    isCalibrated = true;

    calibrateBtn.disabled = false;
    calibrateBtn.textContent = '🔇 环境噪音校准';
    calibrateStatus.textContent = `已校准 (${backgroundNoiseLevel.toFixed(1)} dB)`;
    calibrateStatus.style.color = '#27ae60';

    focusStatus.textContent = `✅ 环境噪音校准完成，背景噪音约 ${backgroundNoiseLevel.toFixed(1)} dB`;
    focusStatus.className = 'focus-status ok';
}

/**
 * 计算钢琴频段内的频谱峰值数量
 */
function countPeaksInPianoBand(freqData, freqPerBin, pianoLowHz, pianoHighHz) {
    let peakCount = 0;
    const noiseThreshold = isCalibrated
        ? Math.max(5, Math.min(128, (backgroundNoiseLevel + 80) / 80 * 128))
        : 10;

    for (let i = 1; i < freqData.length - 1; i++) {
        const frequency = i * freqPerBin;
        if (frequency < pianoLowHz || frequency > pianoHighHz) continue;

        const energy = freqData[i];
        if (energy > freqData[i - 1] && energy > freqData[i + 1] && energy > noiseThreshold) {
            peakCount++;
        }
    }

    return peakCount;
}

/**
 * 钢琴频段检测 - 核心检测函数
 */
function detectPianoActivity() {
    if (!analyser || !audioContext) {
        return { isActive: false, db: -80, ratio: 0, peakCount: 0 };
    }

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const timeData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(timeData);

    let maxAmplitude = 0;
    for (let i = 0; i < timeData.length; i++) {
        const amp = Math.abs(timeData[i] - 128);
        if (amp > maxAmplitude) maxAmplitude = amp;
    }
    const currentDb = amplitudeToDb(maxAmplitude);

    const sampleRate = audioContext.sampleRate;
    const fftSize = analyser.fftSize;
    const freqPerBin = sampleRate / fftSize;

    const pianoLowHz = parseFloat(settingFreqLow.value) || 80;
    const pianoHighHz = parseFloat(settingFreqHigh.value) || 4200;
    const ratioThreshold = (parseFloat(settingRatioThreshold.value) || 45) / 100;
    const dbThreshold = parseFloat(settingVolumeThreshold.value) || -45;
    const peakThreshold = parseFloat(settingPeakThreshold.value) || 3;
    const holdTime = parseFloat(settingHoldTime.value) || 1;
    const holdFrames = Math.max(1, Math.round(holdTime * 10));

    let totalEnergy = 0;
    let pianoBandEnergy = 0;

    for (let i = 0; i < freqData.length; i++) {
        const frequency = i * freqPerBin;
        const energy = freqData[i];
        totalEnergy += energy;

        if (frequency >= pianoLowHz && frequency <= pianoHighHz) {
            pianoBandEnergy += energy;
        }
    }

    const pianoBandRatio = totalEnergy > 0 ? pianoBandEnergy / totalEnergy : 0;
    const peakCount = countPeaksInPianoBand(freqData, freqPerBin, pianoLowHz, pianoHighHz);

    const volumeOk = currentDb > dbThreshold;
    const ratioOk = pianoBandRatio > ratioThreshold;
    const peakOk = peakCount >= peakThreshold;

    if (volumeOk && ratioOk && peakOk) {
        pianoActiveFrameCount++;
    } else {
        pianoActiveFrameCount = 0;
    }

    const isActive = pianoActiveFrameCount >= holdFrames;

    return {
        isActive: isActive,
        db: currentDb,
        ratio: pianoBandRatio,
        peakCount: peakCount,
        volumeOk: volumeOk,
        ratioOk: ratioOk,
        peakOk: peakOk,
        frameCount: pianoActiveFrameCount,
        holdFrames: holdFrames
    };
}

/**
 * 简单音量检测
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
 * 更新音量可视化和检测数据
 */
function updateVolume() {
    if (!isMicActive || !analyser) return;

    const mode = getFocusMode();
    currentFocusMode = mode;

    focusModeLabel.textContent = mode === 'piano' ? '钢琴频段' : '简单音量';

    let isActive = false;
    let currentDb = -80;
    let pianoRatio = 0;
    let peakCount = 0;

    if (mode === 'piano') {
        const result = detectPianoActivity();
        isActive = result.isActive;
        currentDb = result.db;
        pianoRatio = result.ratio;
        peakCount = result.peakCount;

        const barPercent = Math.min(100, Math.max(0, ((currentDb + 80) / 80) * 100));
        volumeBar.style.width = barPercent + '%';

        const now = Date.now();
        if (now - lastDataUpdateTime > 100) {
            focusDb.textContent = currentDb.toFixed(1) + ' dB';
            focusPianoRatio.textContent = (pianoRatio * 100).toFixed(1) + '%';
            focusPeakCount.textContent = peakCount;
            lastDataUpdateTime = now;
        }

        if (isActive) {
            lastActivityTime = Date.now();
            lastSilentWarningSpoken = false;
            focusStatus.textContent = '🎹 可能正在练琴';
            focusStatus.className = 'focus-status practicing';
        } else if (result.volumeOk && !result.ratioOk) {
            focusStatus.textContent = '⚠️ 检测到声音但不符合钢琴频段特征';
            focusStatus.className = 'focus-status not-piano';
        } else if (result.volumeOk && result.ratioOk && !result.peakOk) {
            focusStatus.textContent = '⚠️ 频谱峰值不足，可能不是钢琴声音';
            focusStatus.className = 'focus-status not-piano';
        } else if (!result.volumeOk) {
            focusStatus.textContent = '🔇 声音不足';
            focusStatus.className = 'focus-status low-volume';
        }

        if (isCalibrated && currentDb > backgroundNoiseLevel + 15 && !isActive) {
            focusStatus.textContent = '⚠️ 环境噪音偏高，建议重新校准';
            focusStatus.className = 'focus-status high-noise';
        }
    } else {
        // 简单音量检测模式
        const result = detectSimpleActivity();
        isActive = result.isActive;
        currentDb = result.db;

        const barPercent = Math.min(100, Math.max(0, ((currentDb + 80) / 80) * 100));
        volumeBar.style.width = barPercent + '%';

        const now = Date.now();
        if (now - lastDataUpdateTime > 100) {
            focusDb.textContent = currentDb.toFixed(1) + ' dB';
            focusPianoRatio.textContent = '-- (简单模式)';
            focusPeakCount.textContent = '--';
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
 */
function checkSilent() {
    if (!isMicActive) return;

    const silentTimeout = parseFloat(settingSilentTimeout.value) || 20;
    const elapsed = (Date.now() - lastActivityTime) / 1000;

    if (elapsed >= silentTimeout) {
        const mode = getFocusMode();
        const modeText = mode === 'piano' ? '钢琴频段' : '简单音量';
        focusStatus.textContent = `⚠️ 检测到你可能停止练习了，已 ${Math.floor(elapsed)} 秒未检测到练琴活动（${modeText}）！`;
        focusStatus.className = 'focus-status warning';

        if (!lastSilentWarningSpoken || Math.floor(elapsed) % 5 === 0) {
            speak('检测到你可能停止练习了，请继续练习');
            lastSilentWarningSpoken = true;
            focusReminderCount++;
            focusReminderDisplay.textContent = focusReminderCount;
        }
    }
}

// ============================================================
// 八、节拍器功能（修复：确保声音正常播放）
// ============================================================

/** 节拍器是否正在运行 */
let metronomeRunning = false;

/** 节拍器定时器 ID */
let metronomeInterval = null;

/** 当前拍数（从 1 开始） */
let currentBeat = 1;

/** 节拍器 AudioContext（独立于麦克风） */
let metronomeAudioCtx = null;

/** 节拍器最近一次播放是否成功 */
let lastMetronomePlaySuccess = false;

/** 节拍器最近一次错误信息 */
let lastMetronomeError = '';

/**
 * 获取或创建节拍器的 AudioContext
 * 修复：由用户点击触发创建，并处理 suspended 状态
 */
function getMetronomeAudioContext() {
    try {
        if (!metronomeAudioCtx) {
            metronomeAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // 如果 AudioContext 被暂停，尝试恢复
        if (metronomeAudioCtx.state === 'suspended') {
            metronomeAudioCtx.resume();
        }
        return metronomeAudioCtx;
    } catch (err) {
        lastMetronomeError = '创建 AudioContext 失败: ' + err.message;
        return null;
    }
}

/**
 * 播放节拍点击音
 * 修复：确保每次调用都正确创建 oscillator 并播放声音
 * @param {boolean} isStrongBeat - 是否为强拍
 */
function playMetronomeClick(isStrongBeat) {
    lastMetronomePlaySuccess = false;
    try {
        const ctx = getMetronomeAudioContext();
        if (!ctx) {
            lastMetronomeError = 'AudioContext 不可用';
            return;
        }

        // 创建 oscillator（振荡器）
        const oscillator = ctx.createOscillator();
        // 创建 gain（音量控制器）
        const gainNode = ctx.createGain();

        // 连接：oscillator -> gainNode -> 扬声器
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // 强拍：频率 1000Hz，音量 0.15
        // 弱拍：频率 700Hz，音量 0.1
        oscillator.frequency.value = isStrongBeat ? 1000 : 700;
        oscillator.type = 'sine';

        // 设置音量包络（快速衰减，产生点击效果）
        const now = ctx.currentTime;
        gainNode.gain.setValueAtTime(isStrongBeat ? 0.15 : 0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        // 播放
        oscillator.start(now);
        oscillator.stop(now + 0.08);

        lastMetronomePlaySuccess = true;
        lastMetronomeError = '';
    } catch (err) {
        lastMetronomeError = '播放节拍声音失败: ' + err.message;
        console.error('节拍器播放错误:', err);
    }
}

/**
 * 获取拍号的总拍数
 * @param {string} timeSig - 拍号字符串，如 "4/4"
 * @returns {number} 每小节拍数
 */
function getBeatsPerMeasure(timeSig) {
    const parts = timeSig.split('/');
    return parseInt(parts[0]) || 4;
}

/**
 * 更新节拍视觉反馈
 * @param {number} beat - 当前拍数
 * @param {number} beatsPerMeasure - 每小节拍数
 */
function updateBeatVisual(beat, beatsPerMeasure) {
    const dots = beatIndicators.querySelectorAll('.beat-dot');

    dots.forEach((dot, index) => {
        dot.classList.remove('active-strong', 'active-weak');

        if (index < beatsPerMeasure) {
            dot.style.display = 'flex';
            if (index + 1 === beat) {
                if (beat === 1) {
                    dot.classList.add('active-strong');
                } else {
                    dot.classList.add('active-weak');
                }
            }
        } else {
            dot.style.display = 'none';
        }
    });

    beatDisplay.textContent = `${beat} / ${beatsPerMeasure}`;
}

/**
 * 更新节拍器显示信息
 */
function updateMetronomeDisplay() {
    const bpm = parseInt(metronomeBpm.value) || 80;
    bpmDisplay.textContent = `${bpm} BPM`;
}

/**
 * 开启节拍器
 * 修复：确保 BPM 正确转换为毫秒，定时器正常启动
 */
function startMetronome() {
    const bpm = parseInt(metronomeBpm.value) || 80;
    const timeSig = metronomeTimeSig.value;
    const beatsPerMeasure = getBeatsPerMeasure(timeSig);

    // 先尝试创建 AudioContext（由用户点击触发）
    const ctx = getMetronomeAudioContext();
    if (!ctx) {
        alert('当前浏览器不支持网页音频功能，节拍器无法使用。');
        return;
    }

    // 更新显示
    updateMetronomeDisplay();

    // 重置拍数
    currentBeat = 1;

    // 更新视觉
    updateBeatVisual(currentBeat, beatsPerMeasure);

    // 播放第一拍
    playMetronomeClick(true);

    metronomeRunning = true;
    metronomeWasUsed = true;
    metronomeToggleBtn.textContent = '⏹ 关闭节拍器';
    metronomeToggleBtn.className = 'btn btn-danger';

    // 计算间隔（毫秒）：60000 / BPM
    const intervalMs = 60000 / bpm;

    // 清除旧的定时器（防止重复）
    if (metronomeInterval) {
        clearInterval(metronomeInterval);
        metronomeInterval = null;
    }

    metronomeInterval = setInterval(() => {
        currentBeat++;
        if (currentBeat > beatsPerMeasure) {
            currentBeat = 1;
        }

        const isStrong = currentBeat === 1;
        playMetronomeClick(isStrong);
        updateBeatVisual(currentBeat, beatsPerMeasure);
    }, intervalMs);
}

/**
 * 关闭节拍器
 */
function stopMetronome() {
    if (metronomeInterval) {
        clearInterval(metronomeInterval);
        metronomeInterval = null;
    }

    metronomeRunning = false;
    metronomeToggleBtn.textContent = '▶ 开启节拍器';
    metronomeToggleBtn.className = 'btn btn-secondary';

    // 重置视觉
    const dots = beatIndicators.querySelectorAll('.beat-dot');
    dots.forEach(dot => {
        dot.classList.remove('active-strong', 'active-weak');
    });
    beatDisplay.textContent = '--';
}

/**
 * 切换节拍器开启/关闭
 */
function toggleMetronome() {
    if (metronomeRunning) {
        stopMetronome();
    } else {
        startMetronome();
    }
}

/**
 * 处理节拍器自动开启/关闭（根据阶段类型和自动切换设置）
 */
function handleAutoMetronome() {
    if (!metronomeAutoToggle.checked) return;

    if (currentStageIndex >= stages.length) {
        stopMetronome();
        return;
    }

    const stage = stages[currentStageIndex];
    if (stage.type === '练习') {
        if (!metronomeRunning) {
            startMetronome();
        }
    } else {
        // 休息阶段关闭节拍器
        stopMetronome();
    }
}

// ============================================================
// 九、调试面板
// ============================================================

/** 调试面板 DOM 元素 */
let debugPanel = null;
let debugContent = null;

/** 页面内错误列表 */
let pageErrors = [];

/**
 * 创建调试面板（添加到页面底部）
 */
function createDebugPanel() {
    // 创建调试面板容器
    debugPanel = document.createElement('div');
    debugPanel.id = 'debugPanel';
    debugPanel.style.cssText = `
        margin-top: 20px;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 0;
        overflow: hidden;
    `;

    // 标题（可点击折叠）
    const header = document.createElement('div');
    header.textContent = '🔧 调试面板（点击展开/折叠）';
    header.style.cssText = `
        padding: 12px 16px;
        cursor: pointer;
        font-size: 0.9rem;
        color: #f0c27f;
        user-select: none;
        background: rgba(255, 255, 255, 0.04);
    `;

    // 内容区域（默认折叠）
    debugContent = document.createElement('div');
    debugContent.id = 'debugContent';
    debugContent.style.cssText = `
        padding: 12px 16px;
        display: none;
        font-size: 0.8rem;
        color: #aabbcc;
        line-height: 1.6;
        max-height: 500px;
        overflow-y: auto;
    `;

    // 点击切换折叠
    header.addEventListener('click', () => {
        if (debugContent.style.display === 'none') {
            debugContent.style.display = 'block';
            updateDebugPanel();
        } else {
            debugContent.style.display = 'none';
        }
    });

    debugPanel.appendChild(header);
    debugPanel.appendChild(debugContent);

    // 添加到页面底部
    const container = document.querySelector('.container');
    if (container) {
        container.appendChild(debugPanel);
    }
}

/**
 * 更新调试面板内容
 */
function updateDebugPanel() {
    if (!debugContent || debugContent.style.display === 'none') return;

    const bpm = parseInt(metronomeBpm.value) || 80;
    const timeSig = metronomeTimeSig.value;
    const beatsPerMeasure = getBeatsPerMeasure(timeSig);

    const ctxState = metronomeAudioCtx ? metronomeAudioCtx.state : '未创建';
    const micCtxState = audioContext ? audioContext.state : '未创建';

    const html = `
        <div style="margin-bottom: 8px; font-weight: bold; color: #f0c27f;">=== 计时器状态 ===</div>
        <div>当前阶段 index: ${currentStageIndex}</div>
        <div>当前阶段名称: ${stages[currentStageIndex] ? stages[currentStageIndex].name : '--'}</div>
        <div>当前剩余时间: ${remainingSeconds} 秒</div>
        <div>当前阶段总时长: ${stages[currentStageIndex] ? stages[currentStageIndex].minutes * 60 : 0} 秒</div>
        <div>当前模式: ${switchMode === 'auto' ? '自动模式' : '手动模式'}</div>
        <div>timerState: ${timerState}</div>
        <div>timerInterval 存在: ${timerInterval !== null}</div>
        <div>阶段列表数量: ${stages.length}</div>
        <div>下一阶段按钮存在: ${nextStageBtn !== null}</div>
        <div>下一阶段按钮 disabled: ${nextStageBtn ? nextStageBtn.disabled : 'N/A'}</div>

        <div style="margin-top: 8px; margin-bottom: 8px; font-weight: bold; color: #f0c27f;">=== 节拍器状态 ===</div>
        <div>节拍器开启: ${metronomeRunning}</div>
        <div>当前 BPM: ${bpm}</div>
        <div>当前拍号: ${timeSig} (每小节 ${beatsPerMeasure} 拍)</div>
        <div>当前拍数: ${currentBeat}</div>
        <div>metronomeInterval 存在: ${metronomeInterval !== null}</div>
        <div>AudioContext 存在: ${metronomeAudioCtx !== null}</div>
        <div>AudioContext 状态: ${ctxState}</div>
        <div>麦克风 AudioContext 状态: ${micCtxState}</div>
        <div>最近一次节拍声音播放成功: ${lastMetronomePlaySuccess}</div>
        <div>最近一次节拍错误: ${lastMetronomeError || '无'}</div>

        <div style="margin-top: 8px; margin-bottom: 8px; font-weight: bold; color: #f0c27f;">=== 页面错误 ===</div>
        <div>${pageErrors.length === 0 ? '暂无错误' : pageErrors.map((err, i) => `<div>${i + 1}. ${err}</div>`).join('')}</div>

        <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="debugTestNextStage" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.8rem;">测试下一阶段逻辑</button>
            <button id="debugTestMetronome" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;">测试节拍声音</button>
        </div>
    `;

    debugContent.innerHTML = html;

    // 绑定调试按钮事件
    const testNextBtn = document.getElementById('debugTestNextStage');
    const testMetBtn = document.getElementById('debugTestMetronome');

    if (testNextBtn) {
        testNextBtn.addEventListener('click', () => {
            goToNextStage();
            // 在调试面板显示结果
            const resultDiv = document.createElement('div');
            resultDiv.style.cssText = 'margin-top: 4px; color: #27ae60; font-weight: bold;';
            resultDiv.textContent = `已调用 goToNextStage() → currentStageIndex=${currentStageIndex}, remainingTime=${remainingSeconds}, timerState=${timerState}`;
            debugContent.appendChild(resultDiv);
        });
    }

    if (testMetBtn) {
        testMetBtn.addEventListener('click', () => {
            playMetronomeClick(true);
            const ctx = metronomeAudioCtx;
            const state = ctx ? ctx.state : '未创建';
            const resultDiv = document.createElement('div');
            resultDiv.style.cssText = 'margin-top: 4px; color: #27ae60; font-weight: bold;';
            resultDiv.textContent = `已尝试播放测试节拍声音 → AudioContext 状态: ${state}, 播放成功: ${lastMetronomePlaySuccess}`;
            if (lastMetronomeError) {
                resultDiv.textContent += `, 错误: ${lastMetronomeError}`;
            }
            debugContent.appendChild(resultDiv);
        });
    }
}

// ============================================================
// 十、页面内错误捕获
// ============================================================

/**
 * 全局错误捕获
 */
window.onerror = function (message, source, lineno, colno, error) {
    const errMsg = `${message} (${source}:${lineno}:${colno})`;
    pageErrors.push(errMsg);
    if (pageErrors.length > 20) pageErrors.shift();
    updateDebugPanel();
    return false;
};

/**
 * 未处理的 Promise 错误捕获
 */
window.addEventListener('unhandledrejection', function (event) {
    const errMsg = `Promise 错误: ${event.reason ? event.reason.message || event.reason : '未知错误'}`;
    pageErrors.push(errMsg);
    if (pageErrors.length > 20) pageErrors.shift();
    updateDebugPanel();
    event.preventDefault();
});

// ============================================================
// 十一、事件绑定
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
nextStageBtn.addEventListener('click', goToNextStage);

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
calibrateBtn.addEventListener('click', calibrateBackgroundNoise);

// 节拍器
metronomeToggleBtn.addEventListener('click', toggleMetronome);

// 测试节拍声音按钮
const testMetronomeBtn = document.getElementById('testMetronomeBtn');
if (testMetronomeBtn) {
    testMetronomeBtn.addEventListener('click', function() {
        playMetronomeClick(true);
        const ctx = metronomeAudioCtx;
        const state = ctx ? ctx.state : '未创建';
        if (lastMetronomePlaySuccess) {
            alert('✅ 节拍声音测试成功！AudioContext 状态: ' + state);
        } else {
            alert('❌ 节拍声音测试失败。' + (lastMetronomeError || '请查看调试面板获取详细信息。'));
        }
    });
}
metronomeBpm.addEventListener('change', () => {
    if (metronomeRunning) {
        stopMetronome();
        startMetronome();
    }
    updateMetronomeDisplay();
});
metronomeTimeSig.addEventListener('change', () => {
    if (metronomeRunning) {
        stopMetronome();
        startMetronome();
    }
});

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
// 十二、初始化
// ============================================================

// 创建调试面板
createDebugPanel();

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

// ============================================================
// 调律日志模块
// ============================================================
(function() {
    'use strict';

    // ===== 常量 =====
    const STORAGE_KEY = 'piano_tuner_logs';
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

    // ===== 状态 =====
    let logs = [];
    let selectedDate = '';       // YYYY-MM-DD
    let calendarYear = 0;
    let calendarMonth = 0;       // 0-11
    let editingId = null;        // 正在编辑的日志 id

    // ===== DOM 元素 =====
    const calendarDaysEl = document.getElementById('calendarDays');
    const calendarMonthYearEl = document.getElementById('calendarMonthYear');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const selectedDateTitleEl = document.getElementById('selectedDateTitle');
    const logEntriesEl = document.getElementById('logEntries');
    const logDateInput = document.getElementById('logDate');
    const logTitleInput = document.getElementById('logTitle');
    const logCategorySelect = document.getElementById('logCategory');
    const logContentTextarea = document.getElementById('logContent');
    const saveLogBtn = document.getElementById('saveLogBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const formTitleEl = document.getElementById('formTitle');

    // ===== 工具函数 =====
    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }

    function getTodayStr() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function getDateFromStr(dateStr) {
        const parts = dateStr.split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }

    function getLogDatesSet() {
        const set = new Set();
        logs.forEach(log => set.add(log.date));
        return set;
    }

    function getLogsByDate(dateStr) {
        return logs.filter(log => log.date === dateStr)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // ===== 数据管理 =====
    function loadLogs() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            logs = data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('读取调律日志失败:', e);
            logs = [];
        }
    }

    function saveLogs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
        } catch (e) {
            console.warn('保存调律日志失败:', e);
            alert('保存失败，请检查浏览器存储空间是否已满。');
        }
    }

    // ===== 日历渲染 =====
    function renderCalendar() {
        const year = calendarYear;
        const month = calendarMonth;
        const todayStr = getTodayStr();
        const logDatesSet = getLogDatesSet();

        // 更新月份标题
        calendarMonthYearEl.textContent = `${year}年${month + 1}月`;

        // 当月第一天是星期几
        const firstDay = new Date(year, month, 1).getDay();
        // 当月总天数
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        // 上个月总天数
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        let html = '';

        // 填充上个月末尾几天
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            html += `<div class="calendar-day other-month empty">${day}</div>`;
        }

        // 填充当月天数
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let classes = 'calendar-day';
            if (dateStr === todayStr) classes += ' today';
            if (dateStr === selectedDate) classes += ' selected';
            if (logDatesSet.has(dateStr)) classes += ' has-log';
            html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
        }

        // 填充下个月开头几天（补齐 6 行共 42 格）
        const totalCells = firstDay + daysInMonth;
        const remaining = Math.ceil(totalCells / 7) * 7 - totalCells;
        for (let day = 1; day <= remaining; day++) {
            html += `<div class="calendar-day other-month empty">${day}</div>`;
        }

        calendarDaysEl.innerHTML = html;

        // 绑定日期点击事件
        calendarDaysEl.querySelectorAll('.calendar-day:not(.empty)').forEach(el => {
            el.addEventListener('click', function() {
                const date = this.dataset.date;
                if (date) {
                    selectDate(date);
                }
            });
        });
    }

    // ===== 选择日期 =====
    function selectDate(dateStr) {
        selectedDate = dateStr;
        renderCalendar();
        renderLogList();
        // 更新表单日期
        logDateInput.value = dateStr;
    }

    // ===== 日志列表渲染 =====
    function renderLogList() {
        if (!selectedDate) return;

        selectedDateTitleEl.textContent = formatDate(selectedDate);
        const dayLogs = getLogsByDate(selectedDate);

        if (dayLogs.length === 0) {
            logEntriesEl.innerHTML = '<p class="empty-hint">这一天还没有调律日志。</p>';
            return;
        }

        let html = '';
        dayLogs.forEach(log => {
            const summary = log.content.length > 80
                ? log.content.substring(0, 80) + '...'
                : log.content;
            const createdDate = new Date(log.createdAt);
            const timeStr = `${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`;

            html += `
                <div class="log-entry" data-id="${log.id}">
                    <div class="log-entry-header">
                        <span class="log-entry-title">${escapeHtml(log.title)}</span>
                        <span class="log-entry-category" data-category="${log.category}">${log.category}</span>
                    </div>
                    <div class="log-entry-date">${log.date} ${timeStr}</div>
                    <div class="log-entry-summary">${escapeHtml(summary)}</div>
                    <div class="log-entry-actions">
                        <button class="btn btn-secondary edit-log-btn">✏️ 编辑</button>
                        <button class="btn btn-danger delete-log-btn">🗑️ 删除</button>
                    </div>
                </div>
            `;
        });

        logEntriesEl.innerHTML = html;

        // 绑定点击查看详情
        logEntriesEl.querySelectorAll('.log-entry').forEach(el => {
            el.addEventListener('click', function(e) {
                // 如果点击的是按钮，不触发详情弹窗
                if (e.target.closest('.log-entry-actions')) return;
                const id = this.dataset.id;
                showLogDetail(id);
            });
        });

        // 绑定编辑按钮
        logEntriesEl.querySelectorAll('.edit-log-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const entry = this.closest('.log-entry');
                const id = entry.dataset.id;
                startEditLog(id);
            });
        });

        // 绑定删除按钮
        logEntriesEl.querySelectorAll('.delete-log-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const entry = this.closest('.log-entry');
                const id = entry.dataset.id;
                deleteLog(id);
            });
        });
    }

    // ===== HTML 转义 =====
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== 查看日志详情（弹窗） =====
    function showLogDetail(id) {
        const log = logs.find(l => l.id === id);
        if (!log) return;

        const overlay = document.createElement('div');
        overlay.className = 'log-detail-overlay';
        overlay.addEventListener('click', function(e) {
            if (e.target === this) closeDetail();
        });

        const createdDate = new Date(log.createdAt);
        const dateTimeStr = `${log.date} ${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`;

        overlay.innerHTML = `
            <div class="log-detail-content">
                <h2>${escapeHtml(log.title)}</h2>
                <div class="log-detail-meta">
                    <span class="log-detail-date">${dateTimeStr}</span>
                    <span class="log-detail-category">${log.category}</span>
                </div>
                <div class="log-detail-body">${escapeHtml(log.content)}</div>
                <div class="log-detail-close">
                    <button class="btn btn-secondary close-detail-btn">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 绑定关闭按钮
        overlay.querySelector('.close-detail-btn').addEventListener('click', closeDetail);

        // ESC 键关闭
        function onKeyDown(e) {
            if (e.key === 'Escape') closeDetail();
        }
        document.addEventListener('keydown', onKeyDown);

        function closeDetail() {
            document.removeEventListener('keydown', onKeyDown);
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }
    }

    // ===== 表单校验 =====
    function validateForm() {
        if (!logDateInput.value) {
            alert('请选择日期');
            logDateInput.focus();
            return false;
        }
        if (!logTitleInput.value.trim()) {
            alert('请输入日志标题');
            logTitleInput.focus();
            return false;
        }
        if (!logCategorySelect.value) {
            alert('请选择分类');
            logCategorySelect.focus();
            return false;
        }
        if (!logContentTextarea.value.trim()) {
            alert('请输入心得正文');
            logContentTextarea.focus();
            return false;
        }
        return true;
    }

    // ===== 保存日志（新增/编辑） =====
    function saveLog() {
        if (!validateForm()) return;

        const date = logDateInput.value;
        const title = logTitleInput.value.trim();
        const category = logCategorySelect.value;
        const content = logContentTextarea.value.trim();

        if (editingId) {
            // 编辑模式：更新已有日志
            const index = logs.findIndex(l => l.id === editingId);
            if (index !== -1) {
                logs[index].date = date;
                logs[index].title = title;
                logs[index].category = category;
                logs[index].content = content;
                // 更新 createdAt 为当前时间
                logs[index].createdAt = new Date().toISOString();
            }
            editingId = null;
        } else {
            // 新增模式
            const newLog = {
                id: Date.now().toString(),
                date: date,
                title: title,
                category: category,
                content: content,
                createdAt: new Date().toISOString()
            };
            logs.push(newLog);
        }

        saveLogs();
        resetForm();
        renderCalendar();
        renderLogList();
    }

    // ===== 开始编辑 =====
    function startEditLog(id) {
        const log = logs.find(l => l.id === id);
        if (!log) return;

        editingId = id;
        logDateInput.value = log.date;
        logTitleInput.value = log.title;
        logCategorySelect.value = log.category;
        logContentTextarea.value = log.content;

        formTitleEl.textContent = '✏️ 编辑日志';
        saveLogBtn.textContent = '💾 更新日志';
        cancelEditBtn.style.display = 'block';

        // 滚动到表单区域
        document.querySelector('.log-form-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ===== 取消编辑 =====
    function cancelEdit() {
        resetForm();
    }

    // ===== 重置表单 =====
    function resetForm() {
        editingId = null;
        logDateInput.value = selectedDate || getTodayStr();
        logTitleInput.value = '';
        logCategorySelect.value = '调律练习';
        logContentTextarea.value = '';

        formTitleEl.textContent = '📄 新增日志';
        saveLogBtn.textContent = '💾 保存日志';
        cancelEditBtn.style.display = 'none';
    }

    // ===== 删除日志 =====
    function deleteLog(id) {
        const log = logs.find(l => l.id === id);
        if (!log) return;

        const confirmed = confirm(`确定要删除「${log.title}」这条日志吗？`);
        if (!confirmed) return;

        logs = logs.filter(l => l.id !== id);
        saveLogs();

        // 如果删除的是正在编辑的日志，退出编辑状态
        if (editingId === id) {
            resetForm();
        }

        renderCalendar();
        renderLogList();
    }

    // ===== 月份切换 =====
    function goToPrevMonth() {
        calendarMonth--;
        if (calendarMonth < 0) {
            calendarMonth = 11;
            calendarYear--;
        }
        renderCalendar();
    }

    function goToNextMonth() {
        calendarMonth++;
        if (calendarMonth > 11) {
            calendarMonth = 0;
            calendarYear++;
        }
        renderCalendar();
    }

    // ===== 初始化 =====
    function init() {
        // 加载数据
        loadLogs();

        // 设置初始日期
        const today = getTodayStr();
        selectedDate = today;

        // 设置日历为当前月份
        const now = new Date();
        calendarYear = now.getFullYear();
        calendarMonth = now.getMonth();

        // 表单默认日期
        logDateInput.value = today;

        // 渲染
        renderCalendar();
        renderLogList();

        // 绑定事件
        prevMonthBtn.addEventListener('click', goToPrevMonth);
        nextMonthBtn.addEventListener('click', goToNextMonth);
        saveLogBtn.addEventListener('click', saveLog);
        cancelEditBtn.addEventListener('click', cancelEdit);
    }

    // 启动
    init();
})();


