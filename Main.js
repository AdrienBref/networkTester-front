/* ===================== Config ===================== */
const API_BASE = window.API_BASE || '';                      // p. ej. 'http://localhost:8081'
const ENDPOINTS = {
  devices: `${API_BASE}/api/devices`,
  updateDevice: (id) => `${API_BASE}/api/devices/${id}`
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
        notifyDays: Array.isArray(d.notifyDays) ? d.notifyDays : [],
        // NUEVO: reglas por día
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

        try {
          const res = await fetch(ENDPOINTS.updateDevice(dev.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const saved = await res.json();

          dev.pingEvery = saved.pingInterval;
          dev.always = saved.testAlways;
          dev.minOfflineAlarm = saved.minOfflineAlarm;
          dev.start = toHHMM(saved.startTime ?? saved.start) || dev.start;
          dev.end   = toHHMM(saved.endTime   ?? saved.end)   || dev.end;
          dev.notifyDays   = Array.isArray(saved.notifyDays) ? saved.notifyDays : (dev.notifyDays || []);
          dev.scheduleRules = Array.isArray(saved.scheduleRules) ? saved.scheduleRules : (dev.scheduleRules || []);

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

/* ===================== Modal avanzado ===================== */
const modal = $('#modal');
const form  = $('#modal-form');
const closeBtn = $('#modal-close');
const cancelBtn = $('#modal-cancel');
const addRulesButton = $('#add-rules-btn');
const rulesWrap = $('#rulesWrap');
const rulesList = $('#rulesList');
const ruleAddBtn = $('#ruleAdd');
let editingDevice = null;

function applyAlwaysLock(always){
  // Mantenemos sombreado/bloqueado SOLO el bloque de "Horario" superior.
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

  // IMPORTANTE: las reglas por día permanecen editables SIEMPRE.
}

function openAdvanced(dev){
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

  // Render de reglas existentes
  renderRules(dev.scheduleRules || []);

  // Bloqueo por "Test siempre" SOLO para el bloque de horario upper
  applyAlwaysLock(!!dev.always);

  modal.classList.remove('hidden');
}

function closeModal(){
  modal.classList.add('hidden');
  editingDevice = null;
}

closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// Mostrar la caja de reglas al pulsar el botón de añadir reglas (y no ocultarla después)
addRulesButton.addEventListener('click', ()=>{
  rulesWrap.hidden = false;
});
ruleAddBtn.addEventListener('click', ()=>{
  addRuleRow({ day: 'MONDAY', start: '08:00', end: '17:00' });
});

// Cambiar bloqueo al togglear "Test siempre" en el modal (no afecta a reglas)
document.addEventListener('change', (e)=>{
  if (e.target && e.target.id === 'f-always'){
    applyAlwaysLock(!!e.target.checked);
  }
});

/* ====== Reglas UI ====== */
function renderRules(rules){
  rulesWrap.hidden = false; // si hay reglas, muéstralo
  rulesList.innerHTML = '';
  (rules || []).forEach(r => addRuleRow(r));
  if ((rules || []).length === 0){
    // si no hay, muestra 1 por defecto al abrir desde el botón + o al guardar
  }
}

function addRuleRow(rule){
  const row = document.createElement('div');
  row.className = 'rule-row';

  // Día
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

  // Inicio
  const fieldStart = document.createElement('div');
  fieldStart.className = 'field';
  fieldStart.innerHTML = `
    <label>Inicio</label>
    <input type="time" class="rule-start" value="${rule?.start ?? '08:00'}" />
  `;

  // Fin
  const fieldEnd = document.createElement('div');
  fieldEnd.className = 'field';
  fieldEnd.innerHTML = `
    <label>Fin</label>
    <input type="time" class="rule-end" value="${rule?.end ?? '17:00'}" />
  `;

  // Eliminar
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

  // Set day if provided
  const sel = row.querySelector('.rule-day');
  if (rule?.day) sel.value = rule.day;
}

/* Recoger reglas del DOM */
function collectRules(){
  return Array.from(rulesList.querySelectorAll('.rule-row')).map(row => {
    const day   = row.querySelector('.rule-day')?.value;
    const start = row.querySelector('.rule-start')?.value || null;
    const end   = row.querySelector('.rule-end')?.value || null;
    return { day, start, end };
  }).filter(r => r.day && r.start && r.end);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingDevice) return;

  const always = !!$('#f-always')?.checked;

  const h1 = pad2($('#f-horaInicio')?.value);
  const m1 = pad2($('#f-minInicio')?.value);
  const h2 = pad2($('#f-horaFin')?.value);
  const m2 = pad2($('#f-minFin')?.value);

  let start = (h1 && m1) ? `${h1}:${m1}` : null;
  let end   = (h2 && m2) ? `${h2}:${m2}` : null;

  let selectedDays = Array.from(document.querySelectorAll('input[name="f-days"]:checked'))
    .map(cb => cb.value);

  // Reglas por día (se recogen siempre)
  const rules = collectRules();

  // Si es "Test siempre", el bloque superior queda ignorado (pero conservamos reglas)
  if (always){
    start = null;
    end = null;
    selectedDays = [];
  }

  const payload = {
    id: editingDevice.id,
    name: ($('#f-name')?.value || '').trim(),
    ip: ($('#f-ip')?.value || '').trim(),
    pingInterval: Number($('#f-pingEvery')?.value) || 1000,
    testAlways: always,
    minOfflineAlarm: Number($('#f-minOfflineAlarm')?.value) || 0,
    start,
    end,
    notifyDays: selectedDays,
    scheduleRules: rules // <== NUEVO
  };

  try{
    const res = await fetch(ENDPOINTS.updateDevice(editingDevice.id), {
      method: 'PUT',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const saved = await res.json();

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
        notifyDays: Array.isArray(saved.notifyDays) ? saved.notifyDays : selectedDays,
        scheduleRules: Array.isArray(saved.scheduleRules) ? saved.scheduleRules : rules
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
  const sock = new SockJS(`${WS_BASE}/ws`); // ej: http://localhost:8081/ws
  stomp = Stomp.over(sock);
  stomp.reconnect_delay = 2000;
  stomp.connect({}, () => {
    stomp.subscribe('/topic/devices/changes', (frame) => {
      try {
        const change = JSON.parse(frame.body); // {id, online, latencyMs, updatedAt}
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
$('#addDeviceBtn').addEventListener('click', async () =>{
  alert('Crear dispositivo (POST) — pendiente');
});

/* ===================== Inicio ===================== */
fetchDevices();
connectWS();
