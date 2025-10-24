/* ===================== Config ===================== */
const API_BASE = window.API_BASE || '';                      // p. ej. 'http://localhost:8081'
const ENDPOINTS = {
  devices: `${API_BASE}/api/devices`,
  updateDevice: (id) => `${API_BASE}/api/devices/${id}`,
  create: `${API_BASE}/api/devices/createDevice`,
  delete: `${API_BASE}/api/devices/deleteDevice`
};
const WS_BASE = API_BASE || '';                              // para SockJS

/* ===================== Estado global ===================== */
const state = { devices: [], loading: false, error: null };
const $ = (sel, root=document) => root.querySelector(sel);

/* ===================== Helpers horario ===================== */
function toHHMM(val){
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '';
  return `${m[1]}:${m[2]}`;
}
function splitHHMM(hhmm){
  if (!hhmm) return { hh:'', mm:'' };
  const [hh, mm] = hhmm.split(':');
  return { hh: hh ?? '', mm: mm ?? '' };
}
function pad2(n){ return String(n ?? '').padStart(2, '0'); }

/* ===================== UI ===================== */
function setStatus(msg, type){
  const box = $('#status');
  if (!box) return;
  box.textContent = msg;
  box.className = `status ${type||''}`.trim();
}
function clearStatus(){ setStatus('', ''); }

/* ===================== Carga inicial ===================== */
async function fetchDevices(){
  setStatus('Cargando dispositivos…', 'loading');
  state.loading = true; state.error = null;
  try{
    const res = await fetch(ENDPOINTS.devices, { headers: { 'Accept': 'application/json' } });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.devices = (Array.isArray(data) ? data : []).map(d => {
      const start = toHHMM(d.startTime ?? d.start);
      const end   = toHHMM(d.endTime   ?? d.end);
      return {
        id: d.id,
        name: d.name,
        ip: d.ip,
        online: false,
        pingEvery: d.pingInterval ?? 1000,
        always: !!d.testAlways,
        minOfflineAlarm: d.minOfflineAlarm ?? 0,
        start, end,
        notifyDays: Array.isArray(d.notificationDays) ? d.notificationDays : (Array.isArray(d.notifyDays) ? d.notifyDays : []),
        scheduleRules: Array.isArray(d.scheduleRules) ? d.scheduleRules : [] // [{day,start,end}]
      };
    });

    render();
    if(state.devices.length === 0) setStatus('No hay dispositivos. Usa el botón "Añadir dispositivo" o inserta datos en H2.', '');
    else clearStatus();
  }catch(err){
    console.error(err);
    state.error = String(err.message || err);
    setStatus(`Error cargando dispositivos: ${state.error}`, 'error');
  }finally{
    state.loading = false;
  }
}

/* ===================== Render tarjetas ===================== */
function render(){
  const grid = $('#grid');
  const tpl = $('#card-template');
  if (!grid || !tpl) return;

  grid.innerHTML = '';

  if(!state.devices.length){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay dispositivos que mostrar.';
    grid.appendChild(empty);
    return;
  }

  state.devices.forEach(dev => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = dev.id;

    node.querySelector('.name').textContent = dev.name;
    node.querySelector('.ip').textContent = dev.ip;

    const dot = node.querySelector('.dot');
    const stText = node.querySelector('.status-text');
    updateStatus(dot, stText, dev.online);

    const head = node.querySelector('.card-head');
    head.addEventListener('click', () => toggleBody(node, head));

    const inputPing = node.querySelector('.ping-every');
    if (inputPing) {
      inputPing.value = dev.pingEvery;
      inputPing.addEventListener('change', (e)=> dev.pingEvery = Number(e.target.value) || 1000);
    }

    const inputMinOff = node.querySelector('.min-offline');
    if (inputMinOff) {
      inputMinOff.value = dev.minOfflineAlarm ?? 0;
      inputMinOff.addEventListener('change', (e)=> dev.minOfflineAlarm = Math.max(0, Number(e.target.value) || 0));
    }

    const chkAlways = node.querySelector('.always-test');
    if (chkAlways) {
      chkAlways.checked = dev.always;
      chkAlways.addEventListener('change', (e)=> {
        dev.always = !!e.target.checked;
      });
    }

    const refreshBtn = node.querySelector('.refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        // Simulación local
        const online = Math.random() > 0.5;
        dev.online = online;
        updateStatus(dot, stText, online);
      });
    }

    // Guardar cambios (dentro de la tarjeta)
    const saveBtn = node.querySelector('.save-card');
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        setStatus('Guardando cambios...', 'loading');

        const payload = {
          id: dev.id,
          name: dev.name,
          ip: dev.ip,
          pingInterval: Number(node.querySelector('.ping-every')?.value) || 1000,
          testAlways: !!node.querySelector('.always-test')?.checked,
          minOfflineAlarm: Number(node.querySelector('.min-offline')?.value) || 0,
          start: dev.start || null,
          end: dev.end || null,
          notifyDays: Array.isArray(dev.notifyDays) ? dev.notifyDays : [],
          scheduleRules: Array.isArray(dev.scheduleRules) ? dev.scheduleRules : []
        };
        console.log(payload)

        try {
          const res = await fetch(ENDPOINTS.updateDevice(dev.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const saved = await res.json();
          window.location.reload();
          dev.pingEvery = saved.pingInterval;
          dev.always = saved.testAlways;
          dev.minOfflineAlarm = saved.minOfflineAlarm;
          dev.start = toHHMM(saved.startTime ?? saved.start) || dev.start;
          dev.end   = toHHMM(saved.endTime   ?? saved.end)   || dev.end;
          dev.notifyDays   = Array.isArray(saved.notificationDays) ? saved.notificationDays
                                : (Array.isArray(saved.notifyDays) ? saved.notifyDays : (dev.notifyDays || []));
          dev.scheduleRules = Array.isArray(saved.scheduleRules) ? saved.scheduleRules : (dev.scheduleRules || []);
          console.log(body)
          setStatus(`Dispositivo "${dev.name}" actualizado`, '');
        } catch (err) {
          console.error(err);
          setStatus(`Error guardando cambios: ${err.message}`, 'error');
        }
      });
    }

    const gearBtn = node.querySelector('.gear');
    if (gearBtn) {
      gearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAdvanced(dev);
      });
    }

    grid.appendChild(node);
  });
}

function toggleBody(card, head){
  const body = card.querySelector('.card-body');
  if (!body || !head) return;
  const expanded = head.getAttribute('aria-expanded') === 'true';
  head.setAttribute('aria-expanded', String(!expanded));
  body.hidden = expanded;
}

function updateStatus(dot, txt, online){
  if (!dot || !txt) return;
  dot.classList.remove('ok', 'bad');
  if(online){ dot.classList.add('ok'); txt.textContent = 'Online'; }
  else { dot.classList.add('bad'); txt.textContent = 'Offline'; }
}

/* ===================== Modal avanzado / creación ===================== */
const modal = $('#modal');
const form  = $('#modal-form');
const closeBtn = $('#modal-close');
const cancelBtn = $('#modal-cancel');
const addRulesButton = $('#add-rules-btn');
const rulesWrap = $('#rulesWrap');
const rulesList = $('#rulesList');
const ruleAddBtn = $('#ruleAdd');

let formMode = 'edit';       // 'edit' | 'create'
let editingDevice = null;

function setModalTitle(txt){
  const t = $('#modal-title');
  if (t) t.textContent = txt;
}

function resetFormFields(){
  $('#f-name').value = '';
  $('#f-ip').value = '';
  $('#f-pingEvery').value = 1000;
  $('#f-minOfflineAlarm').value = 0;
  $('#f-always').checked = false;

  ['#f-horaInicio', '#f-minInicio', '#f-horaFin', '#f-minFin'].forEach(sel => {
    const el = $(sel); if (el) el.value = '';
  });

  document.querySelectorAll('input[name="f-days"]').forEach(cb => cb.checked = false);

  // Reglas UI a vacío
  if (rulesList) rulesList.innerHTML = '';
  if (rulesWrap) rulesWrap.hidden = true;

  applyAlwaysLock(false);
}

function applyAlwaysLock(always){
  const schedWrap = $('#schedWrap');
  const daysWrap  = $('#daysWrap');

  const inputsToToggle = [
    '#f-horaInicio', '#f-minInicio', '#f-horaFin', '#f-minFin'
  ].map(sel => $(sel));
  const dayCheckboxes = Array.from(document.querySelectorAll('input[name="f-days"]'));

  inputsToToggle.forEach(inp => { if (inp) inp.disabled = !!always; });
  dayCheckboxes.forEach(cb => { cb.disabled = !!always; });

  if (schedWrap) schedWrap.classList.toggle('locked', !!always);
  if (daysWrap)  daysWrap.classList.toggle('locked',  !!always);
}

function openCreate(){
  formMode = 'create';
  editingDevice = null;
  resetFormFields();
  setModalTitle('Añadir dispositivo');
  modal.classList.remove('hidden');
}

function openAdvanced(dev){
  formMode = 'edit';
  editingDevice = dev;

  $('#f-name').value = dev.name || '';
  $('#f-ip').value = dev.ip || '';
  $('#f-pingEvery').value = dev.pingEvery ?? 1000;
  $('#f-minOfflineAlarm').value = dev.minOfflineAlarm ?? 0;
  $('#f-always').checked = !!dev.always;

  const hIni = $('#f-horaInicio');
  const mIni = $('#f-minInicio');
  const hFin = $('#f-horaFin');
  const mFin = $('#f-minFin');

  if (hIni) hIni.value = '';
  if (mIni) mIni.value = '';
  if (hFin) hFin.value = '';
  if (mFin) mFin.value = '';

  const { hh: hh1, mm: mm1 } = splitHHMM(dev.start);
  const { hh: hh2, mm: mm2 } = splitHHMM(dev.end);

  if (hh1) hIni.value = hh1;
  if (mm1) mIni.value = mm1;
  if (hh2) hFin.value = hh2;
  if (mm2) mFin.value = mm2;

  // Preseleccionar días (L M X J V S D)
  document.querySelectorAll('input[name="f-days"]').forEach(cb => {
    cb.checked = Array.isArray(dev.notifyDays) && dev.notifyDays.includes(cb.value);
  });

  // Render de reglas existentes (si las hubiera)
  renderRules(dev.scheduleRules || []);

  applyAlwaysLock(!!dev.always);

  setModalTitle('Editar dispositivo');
  modal.classList.remove('hidden');
}

function closeModal(){
  modal.classList.add('hidden');
  editingDevice = null;
}

const deleteBtn = $('#deleteDeviceBtn');

closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// Mostrar reglas (opcional; no se envían en creación)
addRulesButton.addEventListener('click', ()=>{
  rulesWrap.hidden = false;
});
ruleAddBtn.addEventListener('click', ()=>{
  addRuleRow({ day: 'MONDAY', start: '08:00', end: '17:00' });
});

// Cambiar bloqueo al togglear "Test siempre" en el modal
document.addEventListener('change', (e)=>{
  if (e.target && e.target.id === 'f-always'){
    applyAlwaysLock(!!e.target.checked);
  }
});

if (deleteBtn) {
deleteBtn.addEventListener('click', async () => {
    if (!editingDevice) {
      alert('No hay dispositivo seleccionado para eliminar.');
      return;
    }

    const confirmDelete = confirm(`¿Seguro que quieres eliminar "${editingDevice.name}"?`);
    if (!confirmDelete) return;

    try {
      setStatus('Eliminando dispositivo...', 'loading');

      const res = await fetch(`${ENDPOINTS.delete}/${editingDevice.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Quitar del estado local
      state.devices = state.devices.filter(d => d.id !== editingDevice.id);
      render();
      closeModal();

      setStatus(`Dispositivo "${editingDevice.name}" eliminado correctamente`, '');
    } catch (err) {
      console.error(err);
      setStatus(`Error eliminando dispositivo: ${err.message}`, 'error');
    }
  });
}

/* ===================== Modal Configuración General (emails) ===================== */
const configBtn    = $('#configBtn');
const configModal  = $('#config-modal');
const configForm   = $('#config-form');
const configClose  = $('#config-close');
const configCancel = $('#config-cancel');
const emailAddBtn  = $('#emailAddBtn');
const emailList    = $('#emailList');

const ENDPOINTS_EMAIL = {
  recipients: `${API_BASE}/api/email/recipients`
};

// ---- Helpers ----
function parseEmailSeed(data) {
  // Acepta {emails:[...]}, ["a@..."], o [{id,email}]
  if (!data) return [];
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (typeof data[0] === 'string') return data;
    if (typeof data[0] === 'object' && data[0]?.email) return data.map(x => x.email).filter(Boolean);
    return [];
  }
  if (Array.isArray(data.emails)) return data.emails;
  return [];
}

function openConfig(initial = []) {
  emailList.innerHTML = '';
  if (initial.length === 0) {
    addEmailRow('');
  } else {
    initial.forEach(e => addEmailRow(e));
  }
  configModal.classList.remove('hidden');
}

function closeConfig() {
  configModal.classList.add('hidden');
}

function addEmailRow(value = '') {
  const row = document.createElement('div');
  row.className = 'email-row';
  row.innerHTML = `
    <input type="email" class="email-input" placeholder="correo@dominio.com" value="${value || ''}" />
    <button type="button" class="remove">Eliminar</button>
  `;
  row.querySelector('.remove').addEventListener('click', () => {
    row.remove();
    if (emailList.children.length === 0) addEmailRow('');
  });
  emailList.appendChild(row);
}

function collectEmails() {
  return Array.from(emailList.querySelectorAll('.email-input'))
    .map(i => (i.value || '').trim())
    .filter(v => v.length > 0);
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// ---- Un único listener para abrir el modal y cargar datos ----
if (configBtn) {
  configBtn.addEventListener('click', async () => {
    let seed = [];
    try {
      const res = await fetch(ENDPOINTS_EMAIL.recipients, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        seed = parseEmailSeed(data);
      } else {
        console.warn('GET recipients HTTP', res.status);
      }
    } catch (e) {
      console.warn('Error obteniendo emails:', e);
    }
    openConfig(seed);
  });
}

// (recuerda tener también los listeners de cerrar/cancelar y submit en otra parte)


if (configClose)  configClose.addEventListener('click', closeConfig);
if (configCancel) configCancel.addEventListener('click', closeConfig);
if (emailAddBtn)  emailAddBtn.addEventListener('click', ()=> addEmailRow(''));

// Guardar emails
if (configForm) {
  configForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const emails = collectEmails();

    if (emails.length === 0) {
      setStatus('Añade al menos un email', 'error');
      return;
    }
    const invalid = emails.filter(e => !isValidEmail(e));
    if (invalid.length){
      setStatus(`Hay emails con formato inválido: ${invalid.join(', ')}`, 'error');
      return;
    }

    // (Opción 1) Guardado en backend si ya tienes endpoint
    try{
      setStatus('Guardando configuración de emails…', 'loading');
      const res = await fetch(ENDPOINTS_EMAIL.recipients, {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify(( emails.map(email => ({ email }))
))
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStatus('Configuración de emails guardada', '');
      closeConfig();
    } catch(err){
      console.error(err);
      setStatus(`Error guardando emails: ${err.message||err}`, 'error');
    }

    // (Opción 2) Si aún no tienes back, comenta el bloque try/catch de arriba
    // y deja simplemente:
    // console.log('Emails configurados:', emails);
    // closeConfig(); setStatus('Configuración de emails (local) aplicada', '');
  });
}


/* ====== Reglas UI ====== */
function renderRules(rules){
  rulesWrap.hidden = false;
  rulesList.innerHTML = '';
  (rules || []).forEach(r => addRuleRow(r));
}

function addRuleRow(rule){
  const row = document.createElement('div');
  row.className = 'rule-row';

  const fieldDay = document.createElement('div');
  fieldDay.className = 'field';
  fieldDay.innerHTML = `
    <label>Día</label>
    <select class="rule-day">
      <option value="MONDAY">Lunes</option>
      <option value="TUESDAY">Martes</option>
      <option value="WEDNESDAY">Miércoles</option>
      <option value="THURSDAY">Jueves</option>
      <option value="FRIDAY">Viernes</option>
      <option value="SATURDAY">Sábado</option>
      <option value="SUNDAY">Domingo</option>
    </select>
  `;

  const fieldStart = document.createElement('div');
  fieldStart.className = 'field';
  fieldStart.innerHTML = `
    <label>Inicio</label>
    <input type="time" class="rule-start" value="${rule?.start ?? '08:00'}" />
  `;

  const fieldEnd = document.createElement('div');
  fieldEnd.className = 'field';
  fieldEnd.innerHTML = `
    <label>Fin</label>
    <input type="time" class="rule-end" value="${rule?.end ?? '17:00'}" />
  `;

  const remove = document.createElement('div');
  remove.innerHTML = `<button type="button" class="remove">Eliminar</button>`;
  remove.querySelector('button').addEventListener('click', ()=> {
    row.remove();
  });

  row.appendChild(fieldDay);
  row.appendChild(fieldStart);
  row.appendChild(fieldEnd);
  row.appendChild(remove);

  rulesList.appendChild(row);

  const sel = row.querySelector('.rule-day');
  if (rule?.day) sel.value = rule.day;
}

function collectRules(){
  return Array.from(rulesList.querySelectorAll('.rule-row')).map(row => {
    const day   = row.querySelector('.rule-day')?.value;
    const start = row.querySelector('.rule-start')?.value || null;
    const end   = row.querySelector('.rule-end')?.value || null;
    return { day, start, end };
  }).filter(r => r.day && r.start && r.end);
}

/* ====== Submit modal ====== */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const always = !!$('#f-always')?.checked;

  const h1 = pad2($('#f-horaInicio')?.value);
  const m1 = pad2($('#f-minInicio')?.value);
  const h2 = pad2($('#f-horaFin')?.value);
  const m2 = pad2($('#f-minFin')?.value);

  let start = (h1 && m1) ? `${h1}:${m1}` : null;
  let end   = (h2 && m2) ? `${h2}:${m2}` : null;

  let selectedDays = Array.from(document.querySelectorAll('input[name="f-days"]:checked'))
    .map(cb => cb.value);

  // Reglas (no se envían en creación porque el DTO no las contempla)
  const rules = collectRules();

  if (always){
    start = null;
    end = null;
    selectedDays = [];
  }

  if (formMode === 'create'){
    // === CREAR (POST) conforme a DeviceCreateDTO ===
    const payloadCreate = {
      name: ($('#f-name')?.value || '').trim(),
      ip: ($('#f-ip')?.value || '').trim(),
      pingInterval: Number($('#f-pingEvery')?.value) || 1000,
      testAlways: always,
      minOfflineAlarm: Number($('#f-minOfflineAlarm')?.value) || 0,
      notificationDays: selectedDays,
      startTime: start,
      endTime: end
    };

    if (!payloadCreate.name || !payloadCreate.ip){
      setStatus('Nombre e IP son obligatorios', 'error');
      return;
    }
    if (payloadCreate.pingInterval < 100){
      setStatus('El pingInterval debe ser ≥ 100 ms', 'error');
      return;
    }
    if (payloadCreate.minOfflineAlarm < 0){
      setStatus('El mínimo offline debe ser ≥ 0', 'error');
      return;
    }

    try{
      setStatus('Creando dispositivo…', 'loading');
      const res = await fetch(ENDPOINTS.create, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify(payloadCreate)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();

      // Normalizamos para el front
      const dev = {
        id: created.id,
        name: created.name,
        ip: created.ip,
        online: false,
        pingEvery: created.pingInterval ?? payloadCreate.pingInterval,
        always: !!created.testAlways,
        minOfflineAlarm: created.minOfflineAlarm ?? payloadCreate.minOfflineAlarm,
        start: toHHMM(created.startTime ?? created.start) || toHHMM(payloadCreate.startTime),
        end:   toHHMM(created.endTime   ?? created.end)   || toHHMM(payloadCreate.endTime),
        notifyDays: Array.isArray(created.notificationDays) ? created.notificationDays
                    : (Array.isArray(created.notifyDays) ? created.notifyDays : payloadCreate.notificationDays),
        scheduleRules: Array.isArray(created.scheduleRules) ? created.scheduleRules : []
      };

      state.devices.push(dev);
      render();
      closeModal();
      setStatus(`Dispositivo "${dev.name}" creado`, '');
    } catch(err){
      console.error(err);
      setStatus(`Error creando: ${err.message||err}`, 'error');
    }
    return;
  }

  // === EDITAR (PUT) ===
  if (!editingDevice) return;

  const payload = {
    id: editingDevice.id,
    name: ($('#f-name')?.value || '').trim(),
    ip: ($('#f-ip')?.value || '').trim(),
    pingInterval: Number($('#f-pingEvery')?.value) || 1000,
    testAlways: always,
    minOfflineAlarm: Number($('#f-minOfflineAlarm')?.value) || 0,
    start,
    end,
    notifyDays: selectedDays
  };

  try{
    const res = await fetch(ENDPOINTS.updateDevice(editingDevice.id), {
      method: 'PUT',
      headers: { 'Content-Type':'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const saved = await res.json();
    window.location.reload();
    const idx = state.devices.findIndex(d => d.id === saved.id);
    if (idx >= 0) {
      state.devices[idx] = {
        ...state.devices[idx],
        name: saved.name,
        ip: saved.ip,
        pingEvery: saved.pingInterval,
        always: saved.testAlways,
        minOfflineAlarm: saved.minOfflineAlarm,
        start: toHHMM(saved.startTime ?? saved.start) || '',
        end:   toHHMM(saved.endTime   ?? saved.end)   || '',
        notifyDays: Array.isArray(saved.notificationDays) ? saved.notificationDays
                      : (Array.isArray(saved.notifyDays) ? saved.notifyDays : selectedDays)
      };
      updateCardDOM(state.devices[idx]);
    }
    closeModal();
    setStatus('Dispositivo actualizado', '');
  } catch(err){
    console.error(err);
    setStatus(`Error actualizando: ${err.message||err}`, 'error');
  }
});

/* ===================== WebSocket (STOMP sobre SockJS) ===================== */
let stomp = null;
function connectWS(){
  if (typeof SockJS === 'undefined' || typeof Stomp === 'undefined') {
    console.warn('SockJS/STOMP no cargados. Revisa los <script> en Main.html');
    return;
  }
  const sock = new SockJS(`${WS_BASE}/ws`);
  stomp = Stomp.over(sock);
  stomp.reconnect_delay = 2000;
  stomp.connect({}, () => {
    stomp.subscribe('/topic/devices/changes', (frame) => {
      try {
        const change = JSON.parse(frame.body);
        const i = state.devices.findIndex(d => d.id === change.id);
        if (i >= 0) {
          state.devices[i].online  = change.online;
          state.devices[i].latency = change.latencyMs;
          updateCardDOM(state.devices[i]);
        }
      } catch(e) {
        console.error('WS parse error:', e);
      }
    });
  }, (err) => {
    console.warn('WS disconnected:', err);
  });
}

function updateCardDOM(dev){
  const card = document.querySelector(`[data-id="${dev.id}"]`);
  if (!card) return;
  const name = card.querySelector('.name');
  const ip = card.querySelector('.ip');
  if (name) name.textContent = dev.name;
  if (ip) ip.textContent = dev.ip;

  const dot = card.querySelector('.dot');
  const txt = card.querySelector('.status-text');
  updateStatus(dot, txt, dev.online);

  const lat = card.querySelector('.latency');
  if (lat) lat.textContent = dev.latency != null ? `${dev.latency} ms` : '—';
}

/* ===================== Botones globales ===================== */
$('#shuffleBtn').addEventListener('click', () =>{
  state.devices = state.devices.map(d => ({...d, online: Math.random() > 0.5 }));
  render();
});
$('#addDeviceBtn').addEventListener('click', () =>{
  openCreate();
});

/* ===================== Inicio ===================== */
fetchDevices();
connectWS();
