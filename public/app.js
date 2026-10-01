document.addEventListener('DOMContentLoaded', () => {
  // Mode Switcher Elements
  const modeBtnSheets = document.getElementById('modeBtnSheets');
  const modeBtnManual = document.getElementById('modeBtnManual');
  const sheetsModePanel = document.getElementById('sheetsModePanel');
  const manualModePanel = document.getElementById('manualModePanel');
  const btnStartText = document.getElementById('btnStartText');

  // Google Sheets Mode Elements
  const sheetUrlInput = document.getElementById('sheetUrlInput');
  const btnConnectSheet = document.getElementById('btnConnectSheet');
  const sheetRowCounter = document.getElementById('sheetRowCounter');
  const sheetLoadingBox = document.getElementById('sheetLoadingBox');
  const sheetLoadingText = document.getElementById('sheetLoadingText');
  const sheetErrorBox = document.getElementById('sheetErrorBox');

  const sheetStep2Container = document.getElementById('sheetStep2Container');
  const sheetWorkbookTitle = document.getElementById('sheetWorkbookTitle');
  const sheetTabsCountText = document.getElementById('sheetTabsCountText');
  const btnOpenSheetWindow = document.getElementById('btnOpenSheetWindow');

  const tabConfirmPrompt = document.getElementById('tabConfirmPrompt');
  const detectedTabNameBadge = document.getElementById('detectedTabNameBadge');
  const btnConfirmTabYes = document.getElementById('btnConfirmTabYes');
  const btnConfirmTabNo = document.getElementById('btnConfirmTabNo');

  const tabConfirmedBar = document.getElementById('tabConfirmedBar');
  const confirmedTabLabel = document.getElementById('confirmedTabLabel');
  const btnChangeSheetTab = document.getElementById('btnChangeSheetTab');

  const tabDropdownBox = document.getElementById('tabDropdownBox');
  const sheetTabSelect = document.getElementById('sheetTabSelect');

  const sheetStep3Container = document.getElementById('sheetStep3Container');
  const singleTabColBox = document.getElementById('singleTabColBox');
  const phoneColumnSelect = document.getElementById('phoneColumnSelect');
  const validityColumnPreview = document.getElementById('validityColumnPreview');
  const validityActionIcon = document.getElementById('validityActionIcon');
  const validityActionTitle = document.getElementById('validityActionTitle');
  const validityActionDesc = document.getElementById('validityActionDesc');
  const autoResumeBanner = document.getElementById('autoResumeBanner');
  const autoResumeTitle = document.getElementById('autoResumeTitle');
  const autoResumeDesc = document.getElementById('autoResumeDesc');

  const allTabsSummaryBox = document.getElementById('allTabsSummaryBox');
  const allTabsList = document.getElementById('allTabsList');

  // Start / Continue From Row # Elements
  const startFromRowInput = document.getElementById('startFromRowInput');
  const resumeAutoTag = document.getElementById('resumeAutoTag');
  const btnResetStartRow = document.getElementById('btnResetStartRow');
  const startRowPreviewText = document.getElementById('startRowPreviewText');

  // Classic Manual Elements
  const numbersInput = document.getElementById('numbersInput');
  const numberCount = document.getElementById('numberCount');
  const defaultCountryCode = document.getElementById('defaultCountryCode');
  const minDelay = document.getElementById('minDelay');
  const maxDelay = document.getElementById('maxDelay');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const btnClear = document.getElementById('btnClear');
  const btnLogout = document.getElementById('btnLogout');
  const btnCloseBrowser = document.getElementById('btnCloseBrowser');
  const authStatusBadge = document.getElementById('authStatusBadge');
  const authStatusText = document.getElementById('authStatusText');

  // Cloudflare Tunnel Elements
  const btnShareLink = document.getElementById('btnShareLink');
  const tunnelLiveDot = document.getElementById('tunnelLiveDot');
  const tunnelModal = document.getElementById('tunnelModal');
  const btnCloseTunnelModal = document.getElementById('btnCloseTunnelModal');
  const tunnelStatusBadge = document.getElementById('tunnelStatusBadge');
  const tunnelStoppedView = document.getElementById('tunnelStoppedView');
  const tunnelStartingView = document.getElementById('tunnelStartingView');
  const tunnelRunningView = document.getElementById('tunnelRunningView');
  const tunnelErrorView = document.getElementById('tunnelErrorView');
  const tunnelUrlInput = document.getElementById('tunnelUrlInput');
  const btnStartTunnel = document.getElementById('btnStartTunnel');
  const btnStopTunnel = document.getElementById('btnStopTunnel');
  const btnCopyTunnelUrl = document.getElementById('btnCopyTunnelUrl');
  const btnOpenTunnelUrl = document.getElementById('btnOpenTunnelUrl');
  const btnRetryTunnel = document.getElementById('btnRetryTunnel');
  const tunnelErrorText = document.getElementById('tunnelErrorText');

  // Stats & ETA
  const statTotal = document.getElementById('statTotal');
  const statValid = document.getElementById('statValid');
  const statInvalid = document.getElementById('statInvalid');
  const statProgress = document.getElementById('statProgress');
  const statEta = document.getElementById('statEta');
  const progressBar = document.getElementById('progressBar');
  const liveStatusText = document.getElementById('liveStatusText');
  const etaStatusBadge = document.getElementById('etaStatusBadge');

  // Tabs & Export
  const countAll = document.getElementById('countAll');
  const countValid = document.getElementById('countValid');
  const countInvalid = document.getElementById('countInvalid');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const btnCopyValid = document.getElementById('btnCopyValid');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnCopyValidity = document.getElementById('btnCopyValidity');
  const resultsTableBody = document.getElementById('resultsTableBody');

  // App State
  let activeMode = 'sheets'; // 'sheets' | 'manual'
  let results = [];
  let currentFilter = 'all';
  let totalToProcess = 0;
  let eventSource = null;

  let sheetState = {
    spreadsheetId: null,
    title: '',
    tabs: [], // [{ name, gid }]
    detectedTab: null, // { name, gid }
    selectedTabGid: null, // gid or 'ALL_TABS'
    currentAnalysis: null, // { gid, tabName, totalRows, columns, bestColumnLetter }
    allTabsSummaries: [] // [{ gid, name, bestColumn, totalRows }]
  };

  // ==========================================
  // Mode Switching (Google Sheet vs Manual List)
  // ==========================================
  function setMode(mode) {
    activeMode = mode;
    if (mode === 'sheets') {
      modeBtnSheets.classList.add('active');
      modeBtnManual.classList.remove('active');
      sheetsModePanel.classList.remove('hidden');
      manualModePanel.classList.add('hidden');
    } else {
      modeBtnManual.classList.add('active');
      modeBtnSheets.classList.remove('active');
      manualModePanel.classList.remove('hidden');
      sheetsModePanel.classList.add('hidden');
    }
    updateStartRowPreview();
  }

  modeBtnSheets.addEventListener('click', () => setMode('sheets'));
  modeBtnManual.addEventListener('click', () => setMode('manual'));

  // ==========================================
  // Step 1, 2, 3: Google Sheets Inspection & Column Selection
  // ==========================================
  function showSheetLoading(msg) {
    sheetErrorBox.classList.add('hidden');
    sheetLoadingText.textContent = msg || 'Scanning Google Sheet tabs & columns...';
    sheetLoadingBox.classList.remove('hidden');
  }

  function hideSheetLoading() {
    sheetLoadingBox.classList.add('hidden');
  }

  function showSheetError(msg) {
    hideSheetLoading();
    sheetErrorBox.textContent = `⚠️ ${msg}`;
    sheetErrorBox.classList.remove('hidden');
  }

  async function inspectGoogleSheetUrl() {
    const url = sheetUrlInput.value.trim();
    if (!url) {
      showSheetError('Please paste a Google Sheet link first.');
      return;
    }

    showSheetLoading('Connecting to Google Sheet & detecting tabs from URL...');
    sheetStep2Container.classList.add('hidden');
    sheetStep3Container.classList.add('hidden');
    btnConnectSheet.disabled = true;

    try {
      const res = await fetch('/api/sheets/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showSheetError(data.error || 'Could not load Google Sheet.');
        return;
      }

      hideSheetLoading();

      sheetState.spreadsheetId = data.spreadsheetId;
      sheetState.title = data.title || 'Google Spreadsheet';
      sheetState.tabs = data.tabs || [];
      sheetState.detectedTab = data.detectedTab || sheetState.tabs[0];
      sheetState.selectedTabGid = sheetState.detectedTab.gid;
      sheetState.currentAnalysis = data.initialTabAnalysis;

      // Update Workbook Banner
      sheetWorkbookTitle.textContent = sheetState.title;
      sheetTabsCountText.textContent = `${sheetState.tabs.length} sheet tab${sheetState.tabs.length === 1 ? '' : 's'} found in workbook`;

      // Populate Sheet Tab Dropdown (#sheetTabSelect) including "All Tabs"
      populateSheetTabDropdown(sheetState.tabs, sheetState.selectedTabGid);

      // Show Step 2 with the Confirmation Prompt asking if the detected tab is the one they want
      detectedTabNameBadge.textContent = `📄 ${sheetState.detectedTab.name}`;
      tabConfirmPrompt.classList.remove('hidden');
      tabConfirmedBar.classList.add('hidden');
      tabDropdownBox.classList.add('hidden');
      sheetStep2Container.classList.remove('hidden');

      // Pre-populate Step 3 columns in background so as soon as they click Yes (or if they look down) it's ready
      if (sheetState.currentAnalysis) {
        renderPhoneColumnsDropdown(sheetState.currentAnalysis);
      }
    } catch (err) {
      showSheetError(err.message);
    } finally {
      btnConnectSheet.disabled = false;
    }
  }

  function populateSheetTabDropdown(tabs, selectedGid) {
    sheetTabSelect.innerHTML = '';

    tabs.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.gid;
      opt.textContent = `📄 ${t.name}`;
      if (String(t.gid) === String(selectedGid)) {
        opt.selected = true;
      }
      sheetTabSelect.appendChild(opt);
    });

    if (tabs.length > 1) {
      const allOpt = document.createElement('option');
      allOpt.value = 'ALL_TABS';
      allOpt.textContent = `🌐 All Tabs (Auto-validate all ${tabs.length} sheets)`;
      sheetTabSelect.appendChild(allOpt);
    }
  }

  // User clicks "✅ Yes, Use This Sheet"
  btnConfirmTabYes.addEventListener('click', () => {
    tabConfirmPrompt.classList.add('hidden');
    tabDropdownBox.classList.add('hidden');
    confirmedTabLabel.textContent = `📄 ${sheetState.detectedTab.name}`;
    tabConfirmedBar.classList.remove('hidden');

    // Reveal Step 3 (Phone Column Selector) immediately
    sheetStep3Container.classList.remove('hidden');
    if (sheetState.currentAnalysis) {
      renderPhoneColumnsDropdown(sheetState.currentAnalysis);
    }
  });

  // User clicks "🔄 No, Select Another Sheet"
  btnConfirmTabNo.addEventListener('click', () => {
    tabConfirmPrompt.classList.add('hidden');
    tabConfirmedBar.classList.add('hidden');
    tabDropdownBox.classList.remove('hidden');

    // Also reveal Step 3 for the currently selected dropdown tab
    sheetStep3Container.classList.remove('hidden');
    sheetTabSelect.focus();
  });

  // User clicks "Change Sheet ▾" after confirming
  btnChangeSheetTab.addEventListener('click', () => {
    tabConfirmedBar.classList.add('hidden');
    tabDropdownBox.classList.remove('hidden');
    sheetTabSelect.focus();
  });

  // When user picks a different sheet tab (or "All Tabs") from the dropdown
  sheetTabSelect.addEventListener('change', async () => {
    const chosenVal = sheetTabSelect.value;
    sheetState.selectedTabGid = chosenVal;

    if (chosenVal === 'ALL_TABS') {
      singleTabColBox.classList.add('hidden');
      allTabsSummaryBox.classList.remove('hidden');
      await loadAllTabsColumnsSummary();
      return;
    }

    allTabsSummaryBox.classList.add('hidden');
    singleTabColBox.classList.remove('hidden');

    const tabObj = sheetState.tabs.find((t) => String(t.gid) === String(chosenVal)) || {
      gid: chosenVal,
      name: 'Sheet'
    };

    showSheetLoading(`Scanning columns in "${tabObj.name}"...`);
    try {
      const res = await fetch('/api/sheets/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: sheetState.spreadsheetId,
          gid: tabObj.gid,
          tabName: tabObj.name
        })
      });
      const data = await res.json();
      hideSheetLoading();

      if (!res.ok || !data.success) {
        showSheetError(data.error || 'Failed to load columns for this sheet tab.');
        return;
      }

      sheetState.currentAnalysis = data;
      sheetStep3Container.classList.remove('hidden');
      renderPhoneColumnsDropdown(data);
    } catch (err) {
      showSheetError(err.message);
    }
  });

  async function loadAllTabsColumnsSummary() {
    showSheetLoading('Scanning all sheet tabs for phone columns...');
    try {
      const res = await fetch('/api/sheets/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: sheetState.spreadsheetId,
          gid: 'ALL_TABS',
          tabs: sheetState.tabs
        })
      });
      const data = await res.json();
      hideSheetLoading();

      if (!res.ok || !data.success) {
        showSheetError(data.error || 'Failed to scan all tabs.');
        return;
      }

      sheetState.allTabsSummaries = data.tabSummaries || [];
      sheetRowCounter.textContent = `${data.totalRowsAllTabs || 0} total rows`;

      allTabsList.innerHTML = '';
      sheetState.allTabsSummaries.forEach((ts) => {
        const div = document.createElement('div');
        div.className = 'all-tab-item';
        if (ts.bestColumn && ts.bestColumn.rowCount > 0) {
          div.innerHTML = `
            <span class="all-tab-item-name">📄 ${escapeHtml(ts.name)}</span>
            <span class="all-tab-item-col">📞 Col ${ts.bestColumn.colLetter} "${escapeHtml(ts.bestColumn.displayHeader)}" (${ts.bestColumn.rowCount} rows) → Col ${ts.bestColumn.rightColLetter} "Validity"</span>
          `;
        } else {
          div.innerHTML = `
            <span class="all-tab-item-name">📄 ${escapeHtml(ts.name)}</span>
            <span style="color: var(--text-muted); font-size: 0.74rem;">No phone rows (Skipped)</span>
          `;
        }
        allTabsList.appendChild(div);
      });
    } catch (err) {
      showSheetError(err.message);
    }
  }

  // Render Step 3 Phone Column Dropdown with 📞 badges at the top + auto-select Best Match
  function renderPhoneColumnsDropdown(analysis) {
    phoneColumnSelect.innerHTML = '';
    const cols = analysis.columns || [];

    if (cols.length === 0) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No data columns found in this sheet tab';
      phoneColumnSelect.appendChild(emptyOpt);
      sheetRowCounter.textContent = '0 rows';
      validityActionTitle.textContent = 'No Columns Available';
      validityActionDesc.textContent = 'This sheet tab appears to be empty.';
      return;
    }

    const phoneCols = cols.filter((c) => c.isPhoneColumn);
    const otherCols = cols.filter((c) => !c.isPhoneColumn);

    if (phoneCols.length > 0) {
      const phoneGroup = document.createElement('optgroup');
      phoneGroup.label = '📞 Detected Phone Number Columns';
      phoneCols.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.colLetter;
        const bestBadge = c.isBestMatch ? ' ★ Best Match' : '';
        opt.textContent = `📞 Column ${c.colLetter} — "${c.displayHeader}" (${c.rowCount} row${c.rowCount === 1 ? '' : 's'})${bestBadge}`;
        if (c.colLetter === analysis.bestColumnLetter) {
          opt.selected = true;
        }
        phoneGroup.appendChild(opt);
      });
      phoneColumnSelect.appendChild(phoneGroup);
    }

    if (otherCols.length > 0) {
      const otherGroup = document.createElement('optgroup');
      otherGroup.label = phoneCols.length > 0 ? 'Other Sheet Columns' : 'Sheet Columns';
      otherCols.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.colLetter;
        opt.textContent = `Column ${c.colLetter} — "${c.displayHeader}" (${c.rowCount} row${c.rowCount === 1 ? '' : 's'})`;
        if (c.colLetter === analysis.bestColumnLetter) {
          opt.selected = true;
        }
        otherGroup.appendChild(opt);
      });
      phoneColumnSelect.appendChild(otherGroup);
    }

    updateValidityColumnPreview();
  }

  // Update the Right-Side "Validity" Column Live Action Preview whenever a column is picked
  function updateValidityColumnPreview() {
    if (!sheetState.currentAnalysis || !sheetState.currentAnalysis.columns) return;
    const selectedLetter = phoneColumnSelect.value;
    const colObj = sheetState.currentAnalysis.columns.find((c) => c.colLetter === selectedLetter);
    if (!colObj) return;

    sheetRowCounter.textContent = `${colObj.rowCount} row${colObj.rowCount === 1 ? '' : 's'} (Col ${colObj.colLetter})`;

    if (colObj.rightColumnAction === 'REUSE_VALIDITY') {
      validityColumnPreview.classList.remove('insert-mode');
      validityActionIcon.textContent = '✅';
      validityActionTitle.textContent = `Right Column (${colObj.rightColLetter}) is Already "Validity"`;
      validityActionDesc.textContent = colObj.rightColumnMessage;
    } else if (colObj.rightColumnAction === 'USE_EMPTY_RIGHT') {
      validityColumnPreview.classList.remove('insert-mode');
      validityActionIcon.textContent = '🟢';
      validityActionTitle.textContent = `Right Column (${colObj.rightColLetter}) is Empty → Will Title as "Validity"`;
      validityActionDesc.textContent = colObj.rightColumnMessage;
    } else {
      validityColumnPreview.classList.add('insert-mode');
      validityActionIcon.textContent = '✨';
      validityActionTitle.textContent = `Will Insert 1 Column to Right as "Validity" (New Col ${colObj.rightColLetter})`;
      validityActionDesc.textContent = colObj.rightColumnMessage;
    }

    // Auto-detect resume row if "Validity" already has completed rows
    if (colObj.autoResumeRow && colObj.autoResumeRow > 1) {
      if (startFromRowInput) startFromRowInput.value = colObj.autoResumeRow;
      if (resumeAutoTag) resumeAutoTag.classList.remove('hidden');
      if (autoResumeBanner) {
        autoResumeBanner.classList.remove('hidden');
        if (autoResumeTitle) {
          autoResumeTitle.textContent = `Auto-Resume Detected: ${colObj.lastFilledDataRow} rows already completed!`;
        }
        if (autoResumeDesc) {
          autoResumeDesc.textContent = `Automatically set to continue from Row #${colObj.autoResumeRow} (Google Sheet Row ${colObj.autoResumeRow + 1}) so previous rows aren't repeated.`;
        }
      }
    } else {
      if (startFromRowInput) startFromRowInput.value = 1;
      if (resumeAutoTag) resumeAutoTag.classList.add('hidden');
      if (autoResumeBanner) autoResumeBanner.classList.add('hidden');
    }

    updateStartRowPreview();
  }

  function updateStartRowPreview() {
    if (!startFromRowInput) return;
    const rawVal = parseInt(startFromRowInput.value, 10);
    const startRow = isNaN(rawVal) || rawVal < 1 ? 1 : rawVal;

    if (btnResetStartRow) {
      if (startRow > 1) {
        btnResetStartRow.classList.remove('hidden');
      } else {
        btnResetStartRow.classList.add('hidden');
        if (resumeAutoTag) resumeAutoTag.classList.add('hidden');
      }
    }

    if (activeMode === 'sheets') {
      btnStartText.textContent =
        startRow > 1 ? `Start Sheet Validation (From Row #${startRow})` : 'Start Sheet Validation';

      if (
        sheetState.selectedTabGid !== 'ALL_TABS' &&
        sheetState.currentAnalysis &&
        sheetState.currentAnalysis.columns
      ) {
        const colObj = sheetState.currentAnalysis.columns.find((c) => c.colLetter === phoneColumnSelect.value);
        if (colObj && colObj.rowCount > 0) {
          const totalRows = colObj.rowCount;
          if (startRow > totalRows) {
            startRowPreviewText.innerHTML = `⚠️ Row #${startRow} is beyond the total rows (${totalRows}) in Column ${colObj.colLetter}.`;
            return;
          }
          const remaining = totalRows - startRow + 1;
          const phoneAtRow =
            colObj.phoneValues && colObj.phoneValues[startRow - 1] !== undefined
              ? colObj.phoneValues[startRow - 1] || '(Empty Row)'
              : '';
          const sheetRowNum = startRow + 1;
          if (startRow > 1) {
            startRowPreviewText.innerHTML = `🎯 Continuing from <strong>Row #${startRow}</strong> (Sheet Cell ${colObj.colLetter}${sheetRowNum}: <strong>${escapeHtml(phoneAtRow)}</strong>) • <strong>${remaining}</strong> of ${totalRows} rows remaining`;
          } else {
            startRowPreviewText.innerHTML = `Starts from <strong>Row #1</strong> (Sheet Cell ${colObj.colLetter}2: <strong>${escapeHtml(phoneAtRow)}</strong>) • Total <strong>${totalRows}</strong> rows (or type e.g. <strong>649</strong> to continue from row 649)`;
          }
          return;
        }
      }
      startRowPreviewText.innerHTML =
        startRow > 1
          ? `🎯 Will continue validation starting from <strong>Row #${startRow}</strong>.`
          : `Starts from Row #1 — or type any row number (e.g. <strong>649</strong>) to continue where you left off.`;
    } else {
      btnStartText.textContent =
        startRow > 1 ? `Start Validation (From Row #${startRow})` : 'Start Validation';
      const list = getRawNumbers();
      if (list.length > 0) {
        if (startRow > list.length) {
          startRowPreviewText.innerHTML = `⚠️ Row #${startRow} is beyond the total rows (${list.length}) in your list.`;
          return;
        }
        const remaining = list.length - startRow + 1;
        const phoneAtRow = list[startRow - 1] || '(Empty Row)';
        startRowPreviewText.innerHTML =
          startRow > 1
            ? `🎯 Continuing from <strong>Row #${startRow}</strong> (Phone: <strong>${escapeHtml(phoneAtRow)}</strong>) • <strong>${remaining}</strong> of ${list.length} rows remaining`
            : `Starts from <strong>Row #1</strong> • Total <strong>${list.length}</strong> rows (or type e.g. <strong>649</strong> to continue from row 649)`;
      } else {
        startRowPreviewText.innerHTML =
          startRow > 1
            ? `🎯 Will start from <strong>Row #${startRow}</strong>.`
            : `Starts from Row #1 — or type any row number (e.g. <strong>649</strong>) to continue where you left off.`;
      }
    }
  }

  if (startFromRowInput) {
    startFromRowInput.addEventListener('input', () => {
      if (resumeAutoTag) resumeAutoTag.classList.add('hidden');
      updateStartRowPreview();
    });
  }

  if (btnResetStartRow) {
    btnResetStartRow.addEventListener('click', () => {
      startFromRowInput.value = 1;
      if (resumeAutoTag) resumeAutoTag.classList.add('hidden');
      updateStartRowPreview();
    });
  }

  phoneColumnSelect.addEventListener('change', updateValidityColumnPreview);
  btnConnectSheet.addEventListener('click', inspectGoogleSheetUrl);

  // Auto-inspect when user pastes a valid Google Sheet URL
  sheetUrlInput.addEventListener('paste', () => {
    setTimeout(() => {
      const val = sheetUrlInput.value.trim();
      if (val.includes('docs.google.com/spreadsheets/d/')) {
        inspectGoogleSheetUrl();
      }
    }, 100);
  });

  sheetUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inspectGoogleSheetUrl();
    }
  });

  // Open live Google Sheet browser tab
  btnOpenSheetWindow.addEventListener('click', async () => {
    if (!sheetState.spreadsheetId) return;
    const gid =
      sheetState.selectedTabGid && sheetState.selectedTabGid !== 'ALL_TABS'
        ? sheetState.selectedTabGid
        : sheetState.detectedTab
        ? sheetState.detectedTab.gid
        : '0';

    btnOpenSheetWindow.disabled = true;
    try {
      await fetch('/api/sheets/open-window', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: sheetState.spreadsheetId,
          gid
        })
      });
    } catch (e) {
      console.error(e);
    } finally {
      btnOpenSheetWindow.disabled = false;
    }
  });

  // ==========================================
  // Manual Phone Numbers Counter
  // ==========================================
  function getRawNumbers() {
    const rawVal = numbersInput.value;
    if (!rawVal || !rawVal.trim()) return [];
    const lines = rawVal.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim());
    // Trim only trailing blank lines at the very end after the last entry
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines;
  }

  function updateInputCounter() {
    const list = getRawNumbers();
    numberCount.textContent = `${list.length} row${list.length === 1 ? '' : 's'}`;
    updateStartRowPreview();
  }

  numbersInput.addEventListener('input', updateInputCounter);

  // ==========================================
  // Zero-Load Client-Side Estimated Remaining Timer
  // Runs 100% in UI memory without touching backend/Playwright
  // ==========================================
  let etaState = {
    intervalId: null,
    totalRows: 0,
    completedRows: 0,
    firstRowStartMs: null,
    lastRowCompleteMs: null,
    rowDurationsMs: [],
    avgPacingMs: 2500,
    defaultRowMs: 3500,
    remainingSeconds: null
  };

  function formatEtaTime(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
      return '--:--';
    }
    const totalSec = Math.max(0, Math.round(seconds));
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }
    if (mins > 0) {
      return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${secs}s`;
  }

  function renderEtaDisplay() {
    if (etaState.remainingSeconds === null) {
      if (statEta) statEta.textContent = 'Calc...';
      if (etaStatusBadge) {
        etaStatusBadge.textContent = '⏱️ Est. Remaining: Calculating...';
        etaStatusBadge.classList.remove('hidden');
      }
      return;
    }
    const formatted = formatEtaTime(etaState.remainingSeconds);
    const remainingRows = Math.max(0, etaState.totalRows - etaState.completedRows);
    if (statEta) statEta.textContent = formatted;
    if (etaStatusBadge) {
      etaStatusBadge.textContent = `⏱️ Est. Remaining: ${formatted} (${remainingRows} row${remainingRows === 1 ? '' : 's'} left)`;
      etaStatusBadge.classList.remove('hidden');
    }
  }

  function recalculateEta() {
    if (etaState.totalRows <= 0) {
      etaState.remainingSeconds = null;
      renderEtaDisplay();
      return;
    }
    const remainingRows = Math.max(0, etaState.totalRows - etaState.completedRows);
    if (remainingRows === 0) {
      etaState.remainingSeconds = 0;
      renderEtaDisplay();
      return;
    }
    const avgRowMs =
      etaState.rowDurationsMs.length > 0
        ? etaState.rowDurationsMs.reduce((a, b) => a + b, 0) / etaState.rowDurationsMs.length
        : etaState.defaultRowMs;

    const totalRemMs = Math.max(
      500,
      remainingRows * avgRowMs - (remainingRows > 0 ? etaState.avgPacingMs * 0.5 : 0)
    );
    etaState.remainingSeconds = Math.ceil(totalRemMs / 1000);
    renderEtaDisplay();
  }

  function startEtaTimer(initialTotal = 0) {
    if (etaState.intervalId) {
      clearInterval(etaState.intervalId);
      etaState.intervalId = null;
    }
    const minD = Math.max(0, parseFloat(minDelay.value) || 0);
    const maxD = Math.max(minD, parseFloat(maxDelay.value) || minD);
    const avgPacingMs = ((minD + maxD) / 2) * 1000;
    const baseActionMs = activeMode === 'sheets' ? 1200 : 600;

    etaState.avgPacingMs = avgPacingMs;
    etaState.defaultRowMs = avgPacingMs + baseActionMs;
    etaState.totalRows = initialTotal || 0;
    etaState.completedRows = 0;
    etaState.firstRowStartMs = null;
    etaState.lastRowCompleteMs = null;
    etaState.rowDurationsMs = [];

    recalculateEta();

    etaState.intervalId = setInterval(() => {
      if (etaState.remainingSeconds !== null && etaState.remainingSeconds > 1) {
        etaState.remainingSeconds -= 1;
        renderEtaDisplay();
      }
    }, 1000);
  }

  function stopEtaTimer(finalState = 'IDLE') {
    if (etaState.intervalId) {
      clearInterval(etaState.intervalId);
      etaState.intervalId = null;
    }
    if (finalState === 'COMPLETED') {
      if (statEta) statEta.textContent = '0s ✓';
      if (etaStatusBadge) {
        etaStatusBadge.textContent = '⏱️ Completed All Rows ✓';
        etaStatusBadge.classList.remove('hidden');
      }
    } else if (finalState === 'STOPPED') {
      if (statEta) statEta.textContent = 'Stopped';
      if (etaStatusBadge) {
        etaStatusBadge.textContent = '⏱️ Paused / Stopped';
        etaStatusBadge.classList.remove('hidden');
      }
    } else {
      if (statEta) statEta.textContent = '--:--';
      if (etaStatusBadge) {
        etaStatusBadge.classList.add('hidden');
      }
    }
  }

  // ==========================================
  // Server-Sent Events (SSE)
  // ==========================================
  function setupSSE() {
    if (eventSource) return;

    eventSource = new EventSource('/api/events');

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      if (data.message) {
        liveStatusText.textContent = data.message;
      }
      if (data.total && data.total > 0) {
        totalToProcess = data.total;
        statTotal.textContent = data.total;
        if (etaState.totalRows !== data.total) {
          etaState.totalRows = data.total;
          recalculateEta();
        }
      }
      if (data.currentIndex === 1 && !etaState.firstRowStartMs) {
        etaState.firstRowStartMs = performance.now();
      }
      if (data.securityStop) {
        liveStatusText.textContent = 'Checking stopped because WhatsApp returned a security/restriction response.';
        liveStatusText.style.color = '#ef4444';
        stopEtaTimer('STOPPED');
        setRunningState(false);
        alert('Checking stopped because WhatsApp returned a security/restriction response.');
        return;
      }
      if (data.pacing) {
        liveStatusText.style.color = '#94a3b8';
      } else if (data.stopped) {
        liveStatusText.style.color = '#fbbf24';
      } else {
        liveStatusText.style.color = '';
      }
      if (data.currentIndex && data.total) {
        const percent = Math.round((data.currentIndex / data.total) * 100);
        progressBar.style.width = `${percent}%`;
        statProgress.textContent = `${percent}%`;
      }
      if (data.completed || data.error) {
        if (data.nextStartRow && startFromRowInput) {
          startFromRowInput.value = data.nextStartRow;
          if (resumeAutoTag) resumeAutoTag.classList.remove('hidden');
          updateStartRowPreview();
        }
        if (data.stopped || data.error) {
          stopEtaTimer('STOPPED');
        } else {
          stopEtaTimer('COMPLETED');
        }
        setRunningState(false);
        if (data.error && !data.securityStop) {
          alert(data.message);
        }
      }
    });

    eventSource.addEventListener('result', (e) => {
      const result = JSON.parse(e.data);
      results.push(result);
      renderRow(result, results.length);
      updateStats();

      // Update adaptive ETA with zero backend load
      const now = performance.now();
      etaState.completedRows += 1;
      if (etaState.lastRowCompleteMs !== null) {
        const dur = now - etaState.lastRowCompleteMs;
        if (dur > 100 && dur < 120000) {
          etaState.rowDurationsMs.push(dur);
          if (etaState.rowDurationsMs.length > 15) {
            etaState.rowDurationsMs.shift();
          }
        }
      } else if (etaState.firstRowStartMs !== null) {
        const firstCheckDur = Math.max(250, now - etaState.firstRowStartMs);
        etaState.rowDurationsMs.push(firstCheckDur + etaState.avgPacingMs);
      }
      etaState.lastRowCompleteMs = now;
      recalculateEta();
    });

    eventSource.onerror = () => {
      console.warn('SSE connection lost. Reconnecting...');
    };
  }

  setupSSE();

  // ==========================================
  // QR Modal & WhatsApp Session Management
  // ==========================================
  const qrModal = document.getElementById('qrModal');
  const btnCloseQrModal = document.getElementById('btnCloseQrModal');
  const qrSpinner = document.getElementById('qrSpinner');
  const qrImage = document.getElementById('qrImage');
  const btnRefreshQr = document.getElementById('btnRefreshQr');
  const btnFocusChrome = document.getElementById('btnFocusChrome');

  let qrModalInterval = null;
  let isFetchingQr = false;

  async function loadQrCode() {
    if (isFetchingQr) return;
    isFetchingQr = true;
    try {
      const res = await fetch('/api/qr');
      const data = await res.json();

      if (data.status === 'LOGGED_IN') {
        closeQrModal();
        authStatusText.textContent = 'WhatsApp Web: Logged In';
        authStatusBadge.className = 'badge badge-success';
        return;
      }

      if (data.status === 'QR_REQUIRED' && data.qrImage) {
        qrImage.src = data.qrImage;
        qrImage.classList.remove('hidden');
        qrSpinner.classList.add('hidden');
      } else {
        const span = qrSpinner.querySelector('span');
        if (span) span.textContent = data.message || 'Waiting for WhatsApp Web...';
      }
    } catch (e) {
      console.error(e);
    } finally {
      isFetchingQr = false;
    }
  }

  function openQrModal() {
    qrModal.classList.remove('hidden');
    qrImage.classList.add('hidden');
    qrSpinner.classList.remove('hidden');
    const span = qrSpinner.querySelector('span');
    if (span) span.textContent = 'Fetching live QR Code from WhatsApp...';
    loadQrCode();

    fetch('/api/open-login', { method: 'POST' }).catch(() => {});

    if (qrModalInterval) clearInterval(qrModalInterval);
    qrModalInterval = setInterval(loadQrCode, 4000);
  }

  function closeQrModal() {
    qrModal.classList.add('hidden');
    if (qrModalInterval) {
      clearInterval(qrModalInterval);
      qrModalInterval = null;
    }
    checkAuth();
  }

  btnCloseQrModal.addEventListener('click', closeQrModal);
  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) closeQrModal();
  });

  btnRefreshQr.addEventListener('click', () => {
    const span = qrSpinner.querySelector('span');
    if (span) span.textContent = 'Reloading QR code...';
    qrSpinner.classList.remove('hidden');
    qrImage.classList.add('hidden');
    loadQrCode();
  });

  btnFocusChrome.addEventListener('click', () => {
    fetch('/api/open-login', { method: 'POST' });
  });

  let isCheckingAuth = false;

  async function checkAuth() {
    if (isCheckingAuth) return;
    isCheckingAuth = true;

    try {
      const res = await fetch('/api/check-auth');
      const data = await res.json();

      if (data.status === 'LOGGED_IN') {
        authStatusText.textContent = 'WhatsApp Web: Logged In';
        authStatusBadge.className = 'badge badge-success';
        authStatusBadge.title = 'WhatsApp Web is authenticated';
      } else if (data.status === 'QR_REQUIRED') {
        authStatusText.textContent = 'Scan QR Code (Click to Show)';
        authStatusBadge.className = 'badge badge-warning';
        authStatusBadge.title = 'Click to view QR Code';
        setTimeout(checkAuth, 4000);
      } else {
        authStatusText.textContent = data.message || 'WhatsApp Web Loading...';
        authStatusBadge.className = 'badge badge-warning';
        setTimeout(checkAuth, 4000);
      }
    } catch (e) {
      authStatusText.textContent = 'Session Offline';
      authStatusBadge.className = 'badge badge-warning';
    } finally {
      isCheckingAuth = false;
    }
  }

  authStatusBadge.style.cursor = 'pointer';
  authStatusBadge.addEventListener('click', () => {
    if (authStatusText.textContent.includes('Logged In')) {
      checkAuth();
    } else {
      openQrModal();
    }
  });

  btnLogout.addEventListener('click', async () => {
    if (!confirm('Log out from current WhatsApp account and switch to a new one?')) {
      return;
    }

    btnLogout.disabled = true;
    const origHTML = btnLogout.innerHTML;
    btnLogout.textContent = 'Logging out...';

    try {
      const res = await fetch('/api/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        authStatusText.textContent = 'Scan QR Code (Click to Show)';
        authStatusBadge.className = 'badge badge-warning';
        openQrModal();
      } else {
        alert(data.message || 'Logout failed.');
      }
    } catch (err) {
      alert('Error during logout: ' + err.message);
    } finally {
      btnLogout.disabled = false;
      btnLogout.innerHTML = origHTML;
    }
  });

  btnCloseBrowser.addEventListener('click', async () => {
    if (confirm('Close the automated Chrome browser window?')) {
      await fetch('/api/close-browser', { method: 'POST' });
      authStatusText.textContent = 'Browser Closed';
      authStatusBadge.className = 'badge badge-warning';
    }
  });

  checkAuth();

  // ==========================================
  // Running vs Idle UI State
  // ==========================================
  function setRunningState(running) {
    btnStart.disabled = running;
    btnStop.disabled = !running;
    numbersInput.disabled = running;
    sheetUrlInput.disabled = running;
    btnConnectSheet.disabled = running;
    sheetTabSelect.disabled = running;
    phoneColumnSelect.disabled = running;
    if (startFromRowInput) startFromRowInput.disabled = running;
    if (btnResetStartRow) btnResetStartRow.disabled = running;
    defaultCountryCode.disabled = running;
    minDelay.disabled = running;
    maxDelay.disabled = running;
  }

  // ==========================================
  // Start Validation (Google Sheet Mode OR Manual Mode)
  // ==========================================
  btnStart.addEventListener('click', async () => {
    const minVal = parseFloat(minDelay.value);
    const maxVal = parseFloat(maxDelay.value);
    if (isNaN(minVal) || minVal < 0) {
      alert('Please enter a valid minimum delay (0 or greater).');
      return;
    }
    if (isNaN(maxVal) || maxVal < minVal) {
      alert('Maximum delay must be greater than or equal to minimum delay.');
      return;
    }

    const startFromRow = startFromRowInput ? Math.max(1, parseInt(startFromRowInput.value, 10) || 1) : 1;

    if (activeMode === 'sheets') {
      if (!sheetState.spreadsheetId) {
        const url = sheetUrlInput.value.trim();
        if (!url) {
          alert('Please paste a Google Sheet link and click "Fetch Sheet" first.');
          return;
        }
        await inspectGoogleSheetUrl();
        if (!sheetState.spreadsheetId) return;
      }

      // If user hasn't clicked "Yes, Use This Sheet" yet, automatically confirm the detected tab
      if (!tabConfirmPrompt.classList.contains('hidden')) {
        btnConfirmTabYes.click();
      }

      let tabsToProcess = [];

      if (sheetState.selectedTabGid === 'ALL_TABS') {
        tabsToProcess = sheetState.tabs.map((t) => ({
          gid: t.gid,
          name: t.name,
          phoneColLetter: 'AUTO'
        }));
      } else {
        const chosenCol = phoneColumnSelect.value;
        if (!chosenCol) {
          alert('Please select a phone number column to validate.');
          return;
        }
        const activeTabObj = sheetState.tabs.find(
          (t) => String(t.gid) === String(sheetState.selectedTabGid)
        ) || sheetState.detectedTab || { gid: '0', name: 'Sheet1' };

        tabsToProcess = [
          {
            gid: activeTabObj.gid,
            name: activeTabObj.name,
            phoneColLetter: chosenCol
          }
        ];
      }

      // Reset table & stats if starting from Row 1 (or if user hasn't accumulated earlier rows in this session)
      const isContinuingSameRun =
        startFromRow > 1 &&
        results.length > 0 &&
        (results[results.length - 1].rowNumber || results.length) < startFromRow;

      if (!isContinuingSameRun) {
        results = [];
        resultsTableBody.innerHTML = '';
        statValid.textContent = '0';
        statInvalid.textContent = '0';
      }

      statProgress.textContent = '0%';
      progressBar.style.width = '0%';
      liveStatusText.textContent =
        startFromRow > 1
          ? `Connecting to Google Sheet (Continuing from Row #${startFromRow})...`
          : 'Connecting to Google Sheet for live row-by-row validation...';
      liveStatusText.style.color = '';

      let initialSheetRows = 0;
      if (sheetState.selectedTabGid !== 'ALL_TABS' && sheetState.currentAnalysis && sheetState.currentAnalysis.columns) {
        const colObj = sheetState.currentAnalysis.columns.find((c) => c.colLetter === phoneColumnSelect.value);
        if (colObj && colObj.rowCount) {
          initialSheetRows = Math.max(0, colObj.rowCount - startFromRow + 1);
          statTotal.textContent = initialSheetRows;
        }
      }
      startEtaTimer(initialSheetRows);
      setRunningState(true);

      try {
        const res = await fetch('/api/sheets/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId: sheetState.spreadsheetId,
            tabsToProcess,
            defaultCountryCode: defaultCountryCode.value.trim(),
            minDelay: minVal,
            maxDelay: maxVal,
            startFromRow
          })
        });

        const data = await res.json();
        if (!res.ok) {
          stopEtaTimer('IDLE');
          alert(data.error || 'Failed to start Google Sheet validation');
          setRunningState(false);
        }
      } catch (err) {
        stopEtaTimer('IDLE');
        alert('Error: ' + err.message);
        setRunningState(false);
      }
      return;
    }

    // Manual Phone List Mode
    const numbers = getRawNumbers();
    if (numbers.length === 0) {
      alert('Please enter at least one phone number to validate.');
      return;
    }
    if (startFromRow > numbers.length) {
      alert(`Start Row (#${startFromRow}) is greater than the total rows in your list (${numbers.length}).`);
      return;
    }

    const isContinuingManual =
      startFromRow > 1 &&
      results.length > 0 &&
      (results[results.length - 1].rowNumber || results.length) < startFromRow;

    if (!isContinuingManual) {
      results = [];
      resultsTableBody.innerHTML = '';
      statValid.textContent = '0';
      statInvalid.textContent = '0';
    }

    totalToProcess = Math.max(0, numbers.length - startFromRow + 1);
    statTotal.textContent = totalToProcess;
    statProgress.textContent = '0%';
    progressBar.style.width = '0%';
    liveStatusText.textContent =
      startFromRow > 1 ? `Starting validation from Row #${startFromRow}...` : 'Starting validation...';
    liveStatusText.style.color = '';

    startEtaTimer(totalToProcess);
    setRunningState(true);

    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numbers,
          defaultCountryCode: defaultCountryCode.value.trim(),
          minDelay: minVal,
          maxDelay: maxVal,
          startFromRow
        })
      });

      const data = await res.json();
      if (!res.ok) {
        stopEtaTimer('IDLE');
        alert(data.error || 'Failed to start validation');
        setRunningState(false);
      }
    } catch (err) {
      stopEtaTimer('IDLE');
      alert('Error: ' + err.message);
      setRunningState(false);
    }
  });

  // Stop validation (Preserves all previously written Validity cells in Google Sheet)
  btnStop.addEventListener('click', async () => {
    btnStop.disabled = true;
    stopEtaTimer('STOPPED');
    liveStatusText.textContent = 'Stopping... All written "Validity" cells remain saved in cloud.';
    try {
      await fetch('/api/stop', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  });

  // Clear inputs & table
  btnClear.addEventListener('click', () => {
    if (confirm('Clear dashboard results? (Note: Any data already written to your Google Sheet remains safely saved in the cloud)')) {
      if (activeMode === 'manual') {
        numbersInput.value = '';
        updateInputCounter();
      }
      if (startFromRowInput) {
        startFromRowInput.value = 1;
        updateStartRowPreview();
      }
      results = [];
      resultsTableBody.innerHTML = `
        <tr class="empty-state">
          <td colspan="6">No numbers validated yet. Connect a Google Sheet on the left (or paste numbers manually) and click "Start".</td>
        </tr>
      `;
      statTotal.textContent = '0';
      statValid.textContent = '0';
      statInvalid.textContent = '0';
      statProgress.textContent = '0%';
      progressBar.style.width = '0%';
      stopEtaTimer('IDLE');
      liveStatusText.textContent = 'Ready to validate';
      updateStats();
    }
  });

  // Render individual row in Results Table
  function renderRow(item, index) {
    const emptyRow = resultsTableBody.querySelector('.empty-state');
    if (emptyRow) {
      resultsTableBody.innerHTML = '';
    }

    const displayRowNum = item.rowNumber || index;
    const tr = document.createElement('tr');
    const filterKey = item.status === 'VALID' ? 'valid' : 'invalid';
    tr.dataset.status = filterKey;

    if (currentFilter !== 'all' && tr.dataset.status !== currentFilter) {
      tr.style.display = 'none';
    }

    const sheetCellHtml = item.targetCell
      ? `<span class="cloud-cell-badge" title="Sheet: ${escapeHtml(item.sheetName || 'Sheet')} • Row ${item.sheetRow}">📄 ${escapeHtml(item.sheetName || 'Sheet')} • ${escapeHtml(item.targetCell)}</span>`
      : `<span style="color: var(--text-muted); font-size: 0.76rem;">Manual #${displayRowNum}</span>`;

    const cloudSyncPrefix = item.cloudSaved
      ? `<span class="cloud-saved-tag">☁️ Saved to ${escapeHtml(item.targetCell)}</span>`
      : '';

    const statusClass = (item.status || 'UNKNOWN').replace(/\s+/g, '_');

    tr.innerHTML = `
      <td>${displayRowNum}</td>
      <td>${sheetCellHtml}</td>
      <td><strong>${escapeHtml(item.number || '(Empty Row)')}</strong></td>
      <td>${escapeHtml(item.cleanNumber || '-')}</td>
      <td><span class="status-tag ${statusClass}">${escapeHtml(item.status || 'NO NUMBER')}</span></td>
      <td>${cloudSyncPrefix}${escapeHtml(item.reason || '')}</td>
    `;

    resultsTableBody.appendChild(tr);
    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updateStats() {
    const validCount = results.filter((r) => r.status === 'VALID').length;
    const invalidCount = results.filter((r) => r.status !== 'VALID').length;

    statValid.textContent = validCount;
    statInvalid.textContent = invalidCount;

    countAll.textContent = results.length;
    countValid.textContent = validCount;
    countInvalid.textContent = invalidCount;
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      currentFilter = btn.dataset.filter;
      const rows = resultsTableBody.querySelectorAll('tr:not(.empty-state)');
      rows.forEach((row) => {
        if (currentFilter === 'all' || row.dataset.status === currentFilter) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  });

  btnCopyValid.addEventListener('click', () => {
    const validNumbers = results
      .filter((r) => r.status === 'VALID')
      .map((r) => r.cleanNumber || r.number);

    if (validNumbers.length === 0) {
      alert('No valid numbers found to copy.');
      return;
    }

    navigator.clipboard.writeText(validNumbers.join('\n')).then(() => {
      alert(`Copied ${validNumbers.length} valid number(s) to clipboard!`);
    });
  });

  // Copy entire "Validity" column from the results box in exact row order
  if (btnCopyValidity) {
    btnCopyValidity.addEventListener('click', () => {
      if (results.length === 0) {
        alert('No validity results found in the table yet.');
        return;
      }

      const validityValues = results.map((r) => r.status || '');
      navigator.clipboard.writeText(validityValues.join('\n')).then(() => {
        const originalText = btnCopyValidity.textContent;
        btnCopyValidity.textContent = `✅ Copied ${validityValues.length} Validity Rows!`;
        setTimeout(() => {
          btnCopyValidity.textContent = originalText;
        }, 2200);
      });
    });
  }

  btnExportCsv.addEventListener('click', () => {
    if (results.length === 0) {
      alert('No results to export.');
      return;
    }

    let csvContent =
      'data:text/csv;charset=utf-8,Index,Sheet Name,Target Cell,Input Number,Cleaned Number,Validity,Reason\n';
    results.forEach((r, idx) => {
      const row = [
        idx + 1,
        `"${(r.sheetName || 'Manual').replace(/"/g, '""')}"`,
        `"${(r.targetCell || '').replace(/"/g, '""')}"`,
        `"${(r.number || '').replace(/"/g, '""')}"`,
        `"${(r.cleanNumber || '').replace(/"/g, '""')}"`,
        r.status,
        `"${(r.reason || '').replace(/"/g, '""')}"`
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `outgrow_ultra_validated_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // Cloudflare Tunnel Controller
  // ==========================================
  function updateTunnelUI(status, url, errorMsg) {
    tunnelStoppedView.classList.add('hidden');
    tunnelStartingView.classList.add('hidden');
    tunnelRunningView.classList.add('hidden');
    tunnelErrorView.classList.add('hidden');

    if (status === 'RUNNING' && url) {
      tunnelStatusBadge.textContent = 'Active (Live)';
      tunnelStatusBadge.className = 'badge badge-active';
      tunnelRunningView.classList.remove('hidden');
      tunnelUrlInput.value = url;
      btnOpenTunnelUrl.href = url;
      tunnelLiveDot.classList.remove('hidden');
    } else if (status === 'STARTING') {
      tunnelStatusBadge.textContent = 'Connecting...';
      tunnelStatusBadge.className = 'badge badge-connecting';
      tunnelStartingView.classList.remove('hidden');
      tunnelLiveDot.classList.add('hidden');
    } else if (status === 'ERROR') {
      tunnelStatusBadge.textContent = 'Error';
      tunnelStatusBadge.className = 'badge badge-danger';
      tunnelErrorView.classList.remove('hidden');
      tunnelErrorText.textContent = errorMsg || 'Failed to establish Cloudflare Tunnel.';
      tunnelLiveDot.classList.add('hidden');
    } else {
      tunnelStatusBadge.textContent = 'Inactive';
      tunnelStatusBadge.className = 'badge badge-neutral';
      tunnelStoppedView.classList.remove('hidden');
      tunnelUrlInput.value = '';
      tunnelLiveDot.classList.add('hidden');
    }
  }

  async function checkTunnelStatus() {
    try {
      const res = await fetch('/api/tunnel/status');
      const data = await res.json();
      updateTunnelUI(data.status, data.url, data.error);
      return data;
    } catch (e) {
      console.error('Error checking tunnel status:', e);
    }
  }

  async function startTunnel() {
    updateTunnelUI('STARTING');
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.url) {
        updateTunnelUI('RUNNING', data.url);
      } else {
        updateTunnelUI('ERROR', null, data.error || 'Failed to start tunnel');
      }
    } catch (err) {
      updateTunnelUI('ERROR', null, err.message);
    }
  }

  async function stopTunnel() {
    try {
      await fetch('/api/tunnel/stop', { method: 'POST' });
      updateTunnelUI('STOPPED');
    } catch (err) {
      console.error('Error stopping tunnel:', err);
    }
  }

  btnShareLink.addEventListener('click', () => {
    tunnelModal.classList.remove('hidden');
    checkTunnelStatus();
  });

  function closeTunnelModal() {
    tunnelModal.classList.add('hidden');
  }

  btnCloseTunnelModal.addEventListener('click', closeTunnelModal);
  tunnelModal.addEventListener('click', (e) => {
    if (e.target === tunnelModal) closeTunnelModal();
  });

  btnStartTunnel.addEventListener('click', startTunnel);
  btnRetryTunnel.addEventListener('click', startTunnel);
  btnStopTunnel.addEventListener('click', stopTunnel);

  btnCopyTunnelUrl.addEventListener('click', () => {
    const url = tunnelUrlInput.value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      const originalText = btnCopyTunnelUrl.textContent;
      btnCopyTunnelUrl.textContent = '✅ Copied!';
      setTimeout(() => {
        btnCopyTunnelUrl.textContent = originalText;
      }, 2000);
    });
  });

  checkTunnelStatus();
});
