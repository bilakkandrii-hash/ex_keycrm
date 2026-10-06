(function () {
  const {
    el, createRatePanel, createCreatePanel, createClient, buildStatusMap, formatLeadRow, sortLeadsByRecent, pickPipelineId, isValidTenant,
    shortStatusTitle, selectableStatuses, creatableStatuses, rejectStatuses, rejectConfirmText, statusConfirmText, statusChangedText, lockChanged,
    login, saveSession, loadSession, clearSession, isSessionValid, listLeads, listStatuses,
    RATE_STYLE, CREATE_STYLE, PIPELINE_ERROR, CREATE_LOCK_TEXT, ratesText, createSuccessText, createErrorText
  } = globalThis.Ex42;

  const PER_PAGE = 20;
  const LAST_TENANT_KEY = 'ex42_last_tenant';
  const SESSION_EXPIRED = 'Сесія збігла: увійдіть знову';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fetchFn = window.fetch.bind(window);

  const screens = {
    login: document.getElementById('login-screen'),
    leads: document.getElementById('leads-screen'),
    rate: document.getElementById('rate-screen'),
    create: document.getElementById('create-screen')
  };

  function showScreen(name) {
    Object.entries(screens).forEach(([key, node]) => {
      node.hidden = key !== name;
    });
  }

  const toLeads = () => showScreen('leads');

  const state = { tenant: null, session: null, statusMap: {}, statuses: [], pipelineId: null, page: 1, lastPage: 1, loadingMore: false };

  function getToken() {
    return state.session ? state.session.accessToken : null;
  }

  function setStatus(panel, text, kind) {
    panel.status.textContent = text;
    panel.status.className = kind ? `status ${kind}` : 'status';
  }

  const loginForm = document.getElementById('login-form');
  const loginTenant = document.getElementById('login-tenant');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');

  const leadsList = document.getElementById('leads-list');
  const leadsError = document.getElementById('leads-error');
  const leadsStatus = document.getElementById('leads-status');
  const leadsRefresh = document.getElementById('leads-refresh');
  const leadsMore = document.getElementById('leads-more');
  const leadsLogout = document.getElementById('leads-logout');
  const leadsNew = document.getElementById('leads-new');
  const leadsTenantLabel = document.getElementById('leads-tenant-label');

  const rateBack = document.getElementById('rate-back');
  const rateTitle = document.getElementById('rate-title');
  const rateMount = document.getElementById('rate-mount');
  const statusMount = document.getElementById('status-mount');

  const createBack = document.getElementById('create-back');
  const createMount = document.getElementById('create-mount');
  const createResult = document.getElementById('create-result');
  const createResultText = document.getElementById('create-result-text');
  const createOpen = document.getElementById('create-open');
  const createToList = document.getElementById('create-to-list');

  let createLocked = false;

  function requireLogin(message) {
    state.session = null;
    createLocked = false;
    if (state.tenant) clearSession(state.tenant);
    leadsList.replaceChildren();
    leadsError.textContent = '';
    leadsStatus.textContent = '';
    leadsMore.hidden = true;
    showScreen('login');
    loginError.textContent = message || '';
  }

  function handleAuthError(error) {
    if (!error || error.status !== 401) return false;
    requireLogin(SESSION_EXPIRED);
    return true;
  }

  loginTenant.value = localStorage.getItem(LAST_TENANT_KEY) || '';

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const tenant = loginTenant.value.trim();
    const username = loginEmail.value.trim();
    const password = loginPassword.value;
    if (tenant === '' || username === '' || password === '') {
      loginError.textContent = 'Заповніть усі поля';
      return;
    }
    if (!isValidTenant(tenant)) {
      loginError.textContent = 'Тенант може містити лише латинські літери, цифри й дефіс';
      return;
    }
    loginSubmit.disabled = true;
    loginError.textContent = '';
    const result = await login({ fetchFn, tenant, username, password });
    loginSubmit.disabled = false;
    if (!result.ok) {
      loginError.textContent = result.error;
      return;
    }
    localStorage.setItem(LAST_TENANT_KEY, tenant);
    saveSession(tenant, result.session);
    loginPassword.value = '';
    state.tenant = tenant;
    state.session = result.session;
    enterLeadsScreen();
  });

  function leadRowNode(row, lead) {
    const node = el('button', { type: 'button', class: 'lead-row' }, [
      el('span', { class: 'lead-badge', style: `background:${row.statusColor}`, title: row.statusFullTitle }, [row.statusTitle || '—']),
      el('span', { class: 'lead-main' }, [
        el('span', { class: 'lead-title' }, [row.title]),
        el('span', { class: 'lead-contact' }, [row.contact])
      ]),
      el('span', { class: 'lead-count' }, [`${row.productsCount} рядк.`])
    ]);
    node.addEventListener('click', () => enterRateScreen(lead));
    return node;
  }

  async function ensureStatusMap(pipelineId) {
    if (Object.keys(state.statusMap).length > 0 || !pipelineId) return;
    try {
      const statuses = await listStatuses({ fetchFn, token: getToken(), tenant: state.tenant, pipelineId });
      state.statusMap = buildStatusMap(statuses);
      state.statuses = statuses;
    } catch {
      state.statusMap = {};
      state.statuses = [];
    }
  }

  async function loadLeadsPage(page, { append }) {
    leadsStatus.textContent = 'Завантаження…';
    leadsError.textContent = '';
    try {
      const response = await listLeads({ fetchFn, token: getToken(), tenant: state.tenant, page, perPage: PER_PAGE });
      const pipelineId = pickPipelineId(response.data);
      state.pipelineId = pipelineId || state.pipelineId;
      await ensureStatusMap(pipelineId);
      const sorted = sortLeadsByRecent(response.data);
      if (!append) leadsList.replaceChildren();
      sorted.forEach(lead => leadsList.append(leadRowNode(formatLeadRow(lead, state.statusMap), lead)));
      state.page = response.current_page;
      state.lastPage = response.last_page;
      leadsMore.hidden = state.page >= state.lastPage;
      leadsStatus.textContent = response.data.length === 0 && !append ? 'Заявок немає' : '';
    } catch (error) {
      if (handleAuthError(error)) return;
      leadsError.textContent = error.message;
      leadsStatus.textContent = '';
    }
  }

  leadsRefresh.addEventListener('click', () => {
    state.statusMap = {};
    loadLeadsPage(1, { append: false });
  });

  leadsMore.addEventListener('click', async () => {
    if (state.loadingMore) return;
    state.loadingMore = true;
    await loadLeadsPage(state.page + 1, { append: true });
    state.loadingMore = false;
  });

  leadsLogout.addEventListener('click', () => requireLogin(''));

  function enterLeadsScreen() {
    leadsTenantLabel.textContent = state.tenant;
    state.statusMap = {};
    state.pipelineId = null;
    showScreen('leads');
    loadLeadsPage(1, { append: false });
  }

  let ratePanel = null;
  let currentLead = null;

  function setRateNavDisabled(flag) {
    rateBack.disabled = flag;
    ratePanel.cancel.disabled = flag;
  }

  function newClient() {
    return createClient({ fetchFn, getToken, getPipelineId: () => state.pipelineId, tenant: state.tenant, sleep });
  }

  function mountRatePanel() {
    if (ratePanel) return ratePanel;
    ratePanel = createRatePanel();
    ratePanel.cancel.textContent = 'Назад до списку';
    ratePanel.cancel.addEventListener('click', toLeads);
    ratePanel.form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = ratePanel.validate();
      if (!values) return;
      const lead = currentLead;
      ratePanel.setDisabled(true);
      setRateNavDisabled(true);
      setStatus(ratePanel, 'Збереження…');
      try {
        const result = await newClient().saveRates({ leadId: lead.id, ...values }, step => setStatus(ratePanel, `${step}…`));
        setStatus(ratePanel, ratesText(result), 'success');
      } catch (error) {
        if (handleAuthError(error)) return;
        setStatus(ratePanel, error.message, 'error');
      }
      ratePanel.setDisabled(false);
      setRateNavDisabled(false);
    });
    rateMount.append(ratePanel.form);
    return ratePanel;
  }

  let statusBox = null;

  function syncStatusButton() {
    const value = statusBox.select.value;
    statusBox.button.disabled = value === '' || value === String(currentLead.status_id);
  }

  function setStatusBusy(flag) {
    statusBox.select.disabled = flag;
    statusBox.reject.disabled = flag;
    statusBox.reasons.querySelectorAll('button').forEach(button => {
      button.disabled = flag;
    });
    ratePanel.setDisabled(flag);
    setRateNavDisabled(flag);
    if (flag) statusBox.button.disabled = true;
    else syncStatusButton();
  }

  function renderRejectReasons() {
    const reasons = rejectStatuses(state.statuses);
    statusBox.reasons.replaceChildren(...reasons.map(status => {
      const button = el('button', { type: 'button', class: 'danger' }, [status.title]);
      button.addEventListener('click', () => submitStatusChange(status.id, rejectConfirmText));
      return button;
    }));
    statusBox.reasons.hidden = true;
    statusBox.reject.hidden = reasons.length === 0;
  }

  function renderStatusBox() {
    statusBox.select.replaceChildren(...selectableStatuses(state.statuses, currentLead.status_id).map(status => el('option', { value: status.id, title: status.title }, [shortStatusTitle(status.title)])));
    statusBox.select.value = String(currentLead.status_id);
    renderRejectReasons();
    setStatus(statusBox, '');
    setStatusBusy(false);
    statusMount.hidden = state.statuses.length === 0;
  }

  async function loadRates(lead) {
    setStatus(ratePanel, 'Завантаження курсів…');
    try {
      const data = await newClient().loadRateRows({ leadId: lead.id });
      ratePanel.load(data);
      setStatus(ratePanel, '');
      return data;
    } catch (error) {
      if (!handleAuthError(error)) setStatus(ratePanel, error.message, 'error');
      return null;
    }
  }

  async function submitStatusChange(statusId, confirmText) {
    const lead = currentLead;
    const target = state.statusMap[statusId];
    if (!window.confirm(confirmText(target.title))) return;
    setStatusBusy(true);
    setStatus(statusBox, 'Збереження…');
    try {
      await newClient().changeStatus({ leadId: lead.id, statusId }, step => setStatus(statusBox, `${step}…`));
      const previous = state.statusMap[lead.status_id];
      lead.status_id = statusId;
      statusBox.reasons.hidden = true;
      setStatus(statusBox, statusChangedText(target.title), 'success');
      loadLeadsPage(1, { append: false });
      if (lockChanged({ alias: previous && previous.alias }, { alias: target.alias }) && !(await loadRates(lead))) ratePanel.clear();
    } catch (error) {
      if (handleAuthError(error)) return;
      setStatus(statusBox, error.message, 'error');
    }
    setStatusBusy(false);
  }

  function mountStatusBox() {
    if (statusBox) return;
    const select = el('select', { name: 'status' });
    const button = el('button', { type: 'button', class: 'primary' }, ['Змінити статус']);
    const status = el('div', { class: 'status', role: 'status' });
    const reject = el('button', { type: 'button', class: 'danger' }, ['Відхилити заявку']);
    const reasons = el('div', { class: 'reasons', hidden: '' });
    statusBox = { select, button, status, reject, reasons };
    select.addEventListener('change', syncStatusButton);
    button.addEventListener('click', () => submitStatusChange(Number(select.value), statusConfirmText));
    reject.addEventListener('click', () => {
      reasons.hidden = !reasons.hidden;
    });
    statusMount.append(el('label', {}, ['Статус', select]), button, reject, reasons, status);
  }

  async function enterRateScreen(lead) {
    currentLead = lead;
    rateTitle.textContent = lead.title || `#${lead.id}`;
    const panel = mountRatePanel();
    mountStatusBox();
    statusMount.hidden = true;
    panel.clear();
    panel.setDisabled(false);
    showScreen('rate');
    setRateNavDisabled(true);
    await ensureStatusMap(state.pipelineId);
    const data = await loadRates(lead);
    if (data) {
      lead.status_id = data.statusId;
      renderStatusBox();
    }
    setRateNavDisabled(false);
  }

  rateBack.addEventListener('click', toLeads);

  let createPanel = null;
  let createLoadToken = 0;
  let createdLead = null;

  function setCreateNavDisabled(flag) {
    createBack.disabled = flag;
    createPanel.cancel.disabled = flag;
  }

  function applyCreateLock() {
    createPanel.acknowledge.hidden = !createLocked;
    createPanel.setDisabled(createLocked);
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (createLocked) return;
    const value = createPanel.validate();
    if (!value) return;
    if (!state.pipelineId) {
      setStatus(createPanel, PIPELINE_ERROR, 'error');
      return;
    }
    createPanel.setDisabled(true);
    setCreateNavDisabled(true);
    setStatus(createPanel, 'Збереження…');
    try {
      createdLead = await newClient().createLead({ value, statusId: createPanel.getStatusId() }, step => setStatus(createPanel, `${step}…`));
      createPanel.form.hidden = true;
      createResultText.textContent = createSuccessText(createdLead);
      createResult.hidden = false;
      loadLeadsPage(1, { append: false });
    } catch (error) {
      if (!error.lineAdded && handleAuthError(error)) return;
      createLocked = error.lineAdded === true;
      setStatus(createPanel, createErrorText(error), 'error');
      if (createLocked) loadLeadsPage(1, { append: false });
      applyCreateLock();
    } finally {
      setCreateNavDisabled(false);
    }
  }

  function mountCreatePanel() {
    if (createPanel) return createPanel;
    createPanel = createCreatePanel(query => newClient().searchContacts(query));
    createPanel.cancel.textContent = 'Назад до списку';
    createPanel.cancel.addEventListener('click', toLeads);
    createPanel.acknowledge.addEventListener('click', () => {
      createLocked = false;
      applyCreateLock();
      setStatus(createPanel, '');
    });
    createPanel.form.addEventListener('submit', submitCreate);
    createMount.append(createPanel.form);
    return createPanel;
  }

  async function enterCreateScreen() {
    const panel = mountCreatePanel();
    createLoadToken += 1;
    const token = createLoadToken;
    createResult.hidden = true;
    panel.form.hidden = false;
    panel.setDisabled(true);
    panel.acknowledge.hidden = true;
    setStatus(panel, 'Завантаження даних…');
    showScreen('create');
    try {
      const context = await newClient().loadCreateContext();
      if (token !== createLoadToken) return;
      await ensureStatusMap(state.pipelineId);
      if (token !== createLoadToken) return;
      panel.load(context, new Date(), creatableStatuses(state.statuses));
      applyCreateLock();
      if (createLocked) setStatus(panel, CREATE_LOCK_TEXT, 'error');
      else if (!state.pipelineId) setStatus(panel, PIPELINE_ERROR, 'error');
      else setStatus(panel, '');
    } catch (error) {
      if (token !== createLoadToken) return;
      if (handleAuthError(error)) return;
      setStatus(panel, error.message, 'error');
    }
  }

  leadsNew.addEventListener('click', enterCreateScreen);
  createBack.addEventListener('click', toLeads);
  createToList.addEventListener('click', toLeads);
  createOpen.addEventListener('click', () => enterRateScreen(createdLead));

  function init() {
    document.head.appendChild(el('style', {}, [RATE_STYLE + CREATE_STYLE]));
    const tenant = localStorage.getItem(LAST_TENANT_KEY);
    const session = tenant ? loadSession(tenant) : null;
    if (tenant && isSessionValid(session, Date.now())) {
      state.tenant = tenant;
      state.session = session;
      enterLeadsScreen();
    } else {
      showScreen('login');
    }
  }

  init();
})();
