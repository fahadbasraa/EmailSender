/* ═══════════════════════════════════════════════════════════════════
   CV Bulk Email Sender — app.js
═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── DOM Refs: Form & Sections ────────────────────────────────────
  const form = document.getElementById('emailForm');
  const sections = [
    document.getElementById('section-1'),
    document.getElementById('section-2'),
    document.getElementById('section-3'),
    document.getElementById('section-4'),
  ];
  const steps = document.querySelectorAll('.step');
  const stepLines = document.querySelectorAll('.step-line');

  // ── DOM Refs: Navigation Buttons ─────────────────────────────────
  const btnNext1 = document.getElementById('next1');
  const btnNext2 = document.getElementById('next2');
  const btnNext3 = document.getElementById('next3');

  const btnBack2 = document.getElementById('back2');
  const btnBack3 = document.getElementById('back3');
  const btnBack4 = document.getElementById('back4');

  // ── DOM Refs: Inputs ─────────────────────────────────────────────
  const dropZone = document.getElementById('dropZone');
  const cvFile = document.getElementById('cvFile');
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const removeFile = document.getElementById('removeFile');

  const emailList = document.getElementById('emailList');
  const emailCount = document.getElementById('emailCount');
  const csvFile = document.getElementById('csvFile');

  const senderName = document.getElementById('senderName');
  const subject = document.getElementById('subject');
  const message = document.getElementById('message');
  const charCount = document.getElementById('charCount');

  // ── DOM Refs: Review & Submit ────────────────────────────────────
  const reviewGrid = document.getElementById('reviewGrid');
  const sendBtn = document.getElementById('sendBtn');

  // ── DOM Refs: Result Panel ───────────────────────────────────────
  const mainCard = document.getElementById('mainCard'); // the card holding the form
  const resultPanel = document.getElementById('resultPanel');
  const btnAnother = document.getElementById('sendAnother');

  const resultIcon = document.getElementById('resultIcon');
  const resultTitle = document.getElementById('resultTitle');
  const resultSubtitle = document.getElementById('resultSubtitle');
  const statSent = document.getElementById('statSent');
  const statFailed = document.getElementById('statFailed');
  const statTotal = document.getElementById('statTotal');
  const invalidNotice = document.getElementById('invalidNotice');
  const invalidList = document.getElementById('invalidList');

  // ── DOM Refs: Log Table ──────────────────────────────────────────
  const logBody = document.getElementById('logBody');
  const refreshLog = document.getElementById('refreshLog');

  // ── State ────────────────────────────────────────────────────────
  let currentStep = 1;
  let selectedFile = null;
  const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

  // ── Toast Container ──────────────────────────────────────────────
  const toastContainer = (() => {
    let tc = document.querySelector('.toast-container');
    if (!tc) {
      tc = document.createElement('div');
      tc.className = 'toast-container';
      document.body.appendChild(tc);
    }
    return tc;
  })();

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────
  function parseEmails(raw) {
    // Split by comma, semicolon, newline, return, and space
    const parts = raw.split(/[,;\n\r\s]+/).map(e => e.trim()).filter(Boolean);
    return [...new Set(parts)]; // Remove duplicates
  }

  function getValidEmails(raw) {
    return parseEmails(raw).filter(e => EMAIL_RE.test(e));
  }

  function countValidEmails(raw) {
    return getValidEmails(raw).length;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg, type = 'toast-error') {
    const icon = type === 'toast-success' ? '✅' : '⚠';
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${escapeHtml(msg)}</span>
      <button class="toast-close" aria-label="Close">✕</button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  // ─────────────────────────────────────────────────────────────────
  // Stepper Navigation
  // ─────────────────────────────────────────────────────────────────
  function goToStep(step) {
    // Hide all
    sections.forEach(s => s.classList.remove('active'));
    // Show target
    sections[step - 1].classList.add('active');

    // Update Indicators
    steps.forEach((s, idx) => {
      s.classList.remove('active', 'done');
      if (idx + 1 === step) s.classList.add('active');
      else if (idx + 1 < step) s.classList.add('done');
    });

    stepLines.forEach((line, idx) => {
      line.classList.remove('done');
      if (idx < step - 1) line.classList.add('done');
    });

    currentStep = step;

    // Special behavior if reaching step 4 (Review)
    if (step === 4) {
      populateReview();
    }
  }

  function populateReview() {
    const emails = getValidEmails(emailList.value);
    reviewGrid.innerHTML = `
      <div class="review-item">
        <div class="review-label">Attached CV</div>
        <div class="review-value">📄 ${escapeHtml(selectedFile.name)}</div>
      </div>
      <div class="review-item">
        <div class="review-label">Recipients</div>
        <div class="review-value">✉ ${emails.length} valid address(es)</div>
      </div>
      <div class="review-item full-width">
        <div class="review-label">Subject</div>
        <div class="review-value"><strong>${escapeHtml(subject.value.trim())}</strong></div>
      </div>
      <div class="review-item full-width">
        <div class="review-label">Message Preview</div>
        <div class="review-value" style="font-family: monospace; font-size: 0.8rem; opacity: 0.9; padding-top: 5px;">${escapeHtml(message.value.trim().substring(0, 150))}${message.value.length > 150 ? '...' : ''}</div>
      </div>
    `;
  }

  // Step 1 -> 2
  btnNext1.addEventListener('click', () => {
    if (!selectedFile) {
      showToast('Please select a PDF file first.', 'toast-error');
      return;
    }
    goToStep(2);
  });

  // Step 2 -> 3
  btnNext2.addEventListener('click', () => {
    if (countValidEmails(emailList.value) === 0) {
      showToast('Please enter at least one valid email address.', 'toast-error');
      emailList.focus();
      return;
    }
    goToStep(3);
  });

  // Step 3 -> 4
  btnNext3.addEventListener('click', () => {
    if (!subject.value.trim()) {
      showToast('Subject is required.', 'toast-error');
      subject.focus();
      return;
    }
    if (!message.value.trim()) {
      showToast('Message body is required.', 'toast-error');
      message.focus();
      return;
    }
    goToStep(4);
  });

  // Back buttons
  btnBack2.addEventListener('click', () => goToStep(1));
  btnBack3.addEventListener('click', () => goToStep(2));
  btnBack4.addEventListener('click', () => goToStep(3));

  // ─────────────────────────────────────────────────────────────────
  // File Handling
  // ─────────────────────────────────────────────────────────────────
  function handleFileSelect(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Only PDF files are allowed.', 'toast-error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File exceeds 5 MB limit.', 'toast-error'); return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);

    fileInfo.hidden = false;
    dropZone.classList.add('has-file');
    dropZone.querySelector('.drop-primary').hidden = true;
    dropZone.querySelector('.drop-secondary').hidden = true;
    dropZone.querySelector('.drop-icon').hidden = true;
  }

  function clearFile() {
    selectedFile = null;
    cvFile.value = '';
    fileInfo.hidden = true;
    dropZone.classList.remove('has-file');
    dropZone.querySelector('.drop-primary').hidden = false;
    dropZone.querySelector('.drop-secondary').hidden = false;
    dropZone.querySelector('.drop-icon').hidden = false;
  }

  cvFile.addEventListener('change', () => handleFileSelect(cvFile.files[0]));
  removeFile.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); clearFile(); });

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFileSelect(e.dataTransfer.files[0]);
  });

  // ─────────────────────────────────────────────────────────────────
  // Emails & CSV
  // ─────────────────────────────────────────────────────────────────
  emailList.addEventListener('input', () => {
    emailCount.textContent = countValidEmails(emailList.value);
  });

  csvFile.addEventListener('change', () => {
    const f = csvFile.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      // Clean out quotes and split the CSV logic exactly as with raw typing
      const text = e.target.result.replace(/"/g, '');
      const importedEmails = parseEmails(text);

      const current = emailList.value.trim();
      emailList.value = current ? current + '\n' + importedEmails.join('\n') : importedEmails.join('\n');

      // Trigger input to deduplicate and validate inside UI
      emailList.dispatchEvent(new Event('input'));
      showToast(`Imported ${importedEmails.length} email(s) from CSV.`, 'toast-success');
    };
    reader.readAsText(f);
    csvFile.value = '';
  });

  // ─────────────────────────────────────────────────────────────────
  // Character Count
  // ─────────────────────────────────────────────────────────────────
  message.addEventListener('input', () => {
    charCount.textContent = message.value.length;
  });

  // ─────────────────────────────────────────────────────────────────
  // Submit Form
  // ─────────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Final safety check
    if (!selectedFile || countValidEmails(emailList.value) === 0 || !subject.value.trim() || !message.value.trim()) {
      showToast('Please complete all fields before sending.', 'toast-error');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.classList.add('loading');

    // Add progress UI
    const progressDiv = document.createElement('div');
    progressDiv.className = 'progress-wrap';
    progressDiv.innerHTML = '<div class="progress-bar" id="progressBar"></div>';

    const progressLabel = document.createElement('div');
    progressLabel.className = 'progress-label';
    progressLabel.id = 'progressLabel';
    progressLabel.textContent = 'Connecting to server...';

    const sendZone = document.querySelector('.send-zone');
    sendZone.insertBefore(progressDiv, document.querySelector('.send-note'));
    sendZone.insertBefore(progressLabel, document.querySelector('.send-note'));

    const pBar = document.getElementById('progressBar');

    let prog = 0;
    const interval = setInterval(() => {
      prog = Math.min(prog + Math.random() * 5, 85);
      pBar.style.width = prog + '%';
      if (prog > 20) progressLabel.textContent = 'Sending emails individually...';
    }, 500);

    const fd = new FormData();
    fd.append('email_list', emailList.value);
    fd.append('subject', subject.value);
    fd.append('message', message.value);
    fd.append('cv_file', selectedFile, selectedFile.name);
    if (senderName.value.trim()) fd.append('sender_name', senderName.value.trim());

    try {
      const res = await fetch('/api/send-emails', { method: 'POST', body: fd });
      const data = await res.json();

      clearInterval(interval);
      pBar.style.width = '100%';
      progressLabel.textContent = 'Done!';

      if (!res.ok) throw new Error(data.detail || 'An error occurred.');

      // Hide form, show result success panel
      setTimeout(() => {
        form.hidden = true;
        document.getElementById('steps').hidden = true;
        resultPanel.hidden = false;

        const { summary } = data;
        statSent.textContent = summary.sent;
        statFailed.textContent = summary.failed;
        statTotal.textContent = summary.total;

        if (summary.failed === 0) {
          resultIcon.innerHTML = '✅';
          resultTitle.textContent = 'Campaign Complete!';
          resultSubtitle.textContent = `Successfully delivered to ${summary.sent} recipients.`;
        } else if (summary.sent === 0) {
          resultIcon.innerHTML = '❌';
          resultTitle.textContent = 'Campaign Failed';
          resultSubtitle.textContent = 'None of the emails could be sent. Check logs.';
        } else {
          resultIcon.innerHTML = '⚠';
          resultTitle.textContent = 'Partially Sent';
          resultSubtitle.textContent = `${summary.sent} successful, ${summary.failed} failed.`;
        }

        if (summary.invalid_emails && summary.invalid_emails.length > 0) {
          invalidNotice.hidden = false;
          invalidList.textContent = ' ' + summary.invalid_emails.join(', ');
        } else {
          invalidNotice.hidden = true;
        }

        fetchLogs();
      }, 600);

    } catch (err) {
      clearInterval(interval);
      pBar.style.width = '0%';
      progressLabel.textContent = 'Failed';
      showToast('Error: ' + err.message, 'toast-error');
    } finally {
      setTimeout(() => {
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
        progressDiv.remove();
        progressLabel.remove();
      }, 1000);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // Send Another 
  // ─────────────────────────────────────────────────────────────────
  btnAnother.addEventListener('click', () => {
    form.hidden = false;
    document.getElementById('steps').hidden = false;
    resultPanel.hidden = true;
    form.reset();
    clearFile();
    emailCount.textContent = '0';
    charCount.textContent = '0';
    goToStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ─────────────────────────────────────────────────────────────────
  // Delivery Log
  // ─────────────────────────────────────────────────────────────────
  async function fetchLogs() {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      renderLogs(data.logs);
    } catch (_) { /* ignore */ }
  }

  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      logBody.innerHTML = '<tr class="log-empty"><td colspan="4">No emails sent yet.</td></tr>';
      return;
    }
    logBody.innerHTML = logs.map(log => {
      const isSent = log.status === 'sent';
      const badgeCls = isSent ? 'badge-sent' : 'badge-failed';
      const badgeTxt = isSent ? '✓ Sent' : '✕ Failed';
      return `
      <tr>
        <td><strong>${escapeHtml(log.email)}</strong></td>
        <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
        <td><span style="opacity: 0.8;">📄 ${escapeHtml(log.filename)}</span></td>
        <td style="color:var(--clr-muted); font-size:0.75rem;">${escapeHtml(log.timestamp)}</td>
      </tr>
      ${log.error ? `<tr><td colspan="4" style="color:var(--clr-danger); padding-top:0; font-size:0.8rem;">Reason: ${escapeHtml(log.error)}</td></tr>` : ''}
    `}).join('');
  }

  refreshLog.addEventListener('click', () => {
    refreshLog.style.opacity = '0.5';
    fetchLogs().finally(() => {
      setTimeout(() => refreshLog.style.opacity = '1', 300);
    });
  });

  setInterval(fetchLogs, 20000); // Check every 20s
  fetchLogs();

})();
