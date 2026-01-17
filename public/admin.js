let currentView = 'reservas'; // Estado actual de la vista
window.reservationsCache = []; // cache local de todas las reservas recibidas
window.historyCache = []; // cache local de reservas confirmadas (historial)
window.selectedReservations = new Set(); // ids seleccionados por checkbox

// Sorting + Pagination state
let sortBy = null;        // e.g. 'id', 'numero_reserva', 'nombre', 'email', 'fecha', 'estado', 'documento'
let sortDir = 'asc';      // 'asc' | 'desc'
let pageSize = Number(localStorage.getItem('pageSize')) || 25;
let pageReservas = 1;
let pagePedidos = 1;
let pageHistorial = 1;

// Auto-logout por inactividad
let inactivityTimeout;
const INACTIVITY_TIME = 60 * 60 * 1000; // 60 minutos en milisegundos

/* helpers para cache de documentos en localStorage */
function loadDocumentosCache() {
  try {
    return JSON.parse(localStorage.getItem('documentosCache') || '{}');
  } catch (e) {
    console.warn('documentosCache inválido en localStorage, resetear.', e);
    return {};
  }
}
function saveDocumentosCache(obj) {
  try {
    localStorage.setItem('documentosCache', JSON.stringify(obj || {}));
  } catch (e) {
    console.warn('No se pudo guardar documentosCache en localStorage', e);
  }
}


// Mostrar u ocultar la interfaz de administración según el estado de inicio de sesión.
function toggleLogin(isLoggedIn, fullName = '') {
  const userConfig = document.getElementById('user-config');
  const loginSection = document.getElementById('login-section');
  const tabs = document.getElementById('tabs');
  const dropdown = document.getElementById('config-dropdown');
  const adminMsg = document.getElementById('adminMessageDisplay');
  const usernameDisplay = document.getElementById('username-display');
  const backButton = document.getElementById('backButton');

  if (isLoggedIn) {
    
    // establecer nombre
    const nameToShow = fullName || sessionStorage.getItem('adminFullName') || '';
    if (usernameDisplay) usernameDisplay.textContent = nameToShow;
    if (userConfig) userConfig.style.display = 'block';
    if (loginSection) loginSection.style.display = 'none';
    if (tabs) tabs.style.display = 'block';
    if (dropdown) dropdown.style.display = 'none';
    if (adminMsg) { adminMsg.textContent = ''; adminMsg.style.color = ''; }
    if (backButton) backButton.style.display = 'none';
    // Iniciar temporizador de inactividad
    resetInactivityTimer();
  } else {
    // desconectar
    sessionStorage.removeItem('adminFullName');
    if (usernameDisplay) usernameDisplay.textContent = '';
    if (userConfig) userConfig.style.display = 'none';
    if (loginSection) loginSection.style.display = 'block';
    if (tabs) tabs.style.display = 'none';
    if (dropdown) dropdown.style.display = 'none';
    if (adminMsg) { adminMsg.textContent = ''; adminMsg.style.color = ''; }
    // restablecer vistas y cachés que deberían estar ocultos
    document.getElementById('reservasList').innerHTML = '';
    document.getElementById('pedidosList').innerHTML = '';
    document.getElementById('historialList').innerHTML = '';
    document.getElementById('adminList').innerHTML = '';
    // ocultar todas las secciones de administrador
    const creatorSection = document.getElementById('admin-management-section');
    const listSection = document.getElementById('admin-list-section');
    const resetSection = document.getElementById('admin-reset-password-section');
    if (creatorSection) creatorSection.style.display = 'none';
    if (listSection) listSection.style.display = 'none';
    if (resetSection) resetSection.style.display = 'none';
    window.reservationsCache = [];
    window.historyCache = [];
    window.selectedReservations = new Set();
    if (backButton) backButton.style.display = 'none';
    // Detener temporizador de inactividad
    stopInactivityTimer();
  }
}


// Activa o desactiva el menú desplegable de configuración (menú de usuario)
function toggleDropdown() {
  const dd = document.getElementById('config-dropdown');
  const btn = document.getElementById('config-icon');
  if (!dd) return;
  const isVisible = dd.style.display === 'block';
  dd.style.display = isVisible ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', (!isVisible).toString());
}

// Funciones para auto-logout por inactividad
function resetInactivityTimer() {
  clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => {
    console.log('Sesión cerrada por inactividad');
    // Mostrar mensaje en la sección de login antes de cerrar la sesión
    const msg = document.getElementById('adminMessageDisplay');
    if (msg) {
      msg.textContent = '⏱️ Tu sesión ha expirado por inactividad.';
      msg.style.color = 'orange';
    }
    toggleLogin(false);
  }, INACTIVITY_TIME);
}

function stopInactivityTimer() {
  clearTimeout(inactivityTimeout);
}

// Construir tabla reutilizable (mantener tal como la tenías)
function buildTable(list, isPedidos = false, startIndex = 0, options = {}) {
    if (!list || list.length === 0) return '<div>No hay registros.</div>';
    const hideSelection = !!options.hideSelection;
    const readonly = !!options.readonly;

    const rows = list.map((r, i) => {
        const displayIndex = startIndex + i + 1; // secuencia 1..N basada en lista filtrada/ordenada
        let fileLinksHtml = "N/A";
        if (r.nombre_archivo) {
            const files = r.nombre_archivo.split(';').map(f => f.trim()).filter(f => f.length > 0);
            if (files.length > 0) {
                fileLinksHtml = files.map(f => {
                    const ext = f.split('.').pop().toLowerCase(); // Obtener la extensión del archivo
                    let iconPath = '';
                    if (['doc', 'docx'].includes(ext)) {
                        iconPath = '/icons/word.ico'; // Ruta al ícono de Word
                    } else if (['xls', 'xlsx'].includes(ext)) {
                        iconPath = '/icons/excel.ico'; // Ruta al ícono de Excel
                    } else {
                        iconPath = '/icons/generic.ico'; // Ruta al ícono genérico
                    }
                    return `<a class="file-link" href="/uploads/${encodeURIComponent(f)}" target="_blank" rel="noopener noreferrer">
                    <img src="${iconPath}" alt="${ext} icon" style="width: 16px; height: 16px; vertical-align: middle;"> 
                </a>`;
                }).join('');
            }
        }

        const estadoSafe = escapeHtml(r.estado || '');
        const statusClass = `status-${estadoSafe}`;

        const firstColumnHtml = isPedidos
            ? `<td>${escapeHtml(r.rango_desde || 'N/A')} - ${escapeHtml(r.rango_hasta || 'N/A')}</td>`
            : `<td>${escapeHtml(r.numero_reserva || 'N/A')}</td>`;

        // documento field shown as editable input (no save indicator)
        const docValue = escapeHtml(r.documento && r.documento !== 'null' ? String(r.documento).trim() : '');

        // derive checkbox flags from reserva (flexible)
        const flags = flagsFromReserva(r);

        // casilla de selección (refleja las reservas seleccionadas) - omitir si se oculta la selección
        let selectHtml = '';
        if (!hideSelection) {
            const selected = window.selectedReservations && window.selectedReservations.has(String(r.id));
            selectHtml = `<td class="col-select"><input type="checkbox" class="select-reservation" data-id="${escapeHtml(String(r.id))}" ${selected ? 'checked' : ''} onchange="toggleRowSelection(this, ${escapeHtml(String(r.id))})" aria-label="Seleccionar reserva ${escapeHtml(String(r.id))}"></td>`;
        }

        // columnas de casilla de verificación (deshabilitada si solo lectura)
        const separacionHtml = `<td class="col-checkbox"><input type="checkbox" data-flag="separacion" ${flags.separacion ? 'checked' : ''} onchange="onEstadoLocalToggle(this, ${escapeHtml(String(r.id))})" aria-label="Separación reserva ${escapeHtml(String(r.id))}" ${readonly ? 'disabled' : ''}></td>`;

        // editable informational columns: CAJAS and RESPONSABLE (inputs like Documento)
        const cajasValue = escapeHtml(r.cajas && r.cajas !== 'null' ? String(r.cajas).trim() : '');
        const cajasHtml = readonly 
            ? `<td>${cajasValue || 'N/A'}</td>` 
            : `<td><input class="doc-input" value="${cajasValue}" placeholder="Cajas" onkeydown="if(event.key==='Enter'){this.blur();}" onblur="saveField(this, ${escapeHtml(String(r.id))}, 'cajas')" aria-label="Cajas reserva ${escapeHtml(String(r.id))}"></td>`;

        const responsableValue = escapeHtml(r.responsable && r.responsable !== 'null' ? String(r.responsable).trim() : '');
        const responsableHtml = readonly 
            ? `<td>${responsableValue || 'N/A'}</td>` 
            : `<td><input class="doc-input" value="${responsableValue}" placeholder="Responsable" onkeydown="if(event.key==='Enter'){this.blur();}" onblur="saveField(this, ${escapeHtml(String(r.id))}, 'responsable')" aria-label="Responsable reserva ${escapeHtml(String(r.id))}"></td>`;

        // NUEVO: Agregar columna de teléfono
        const telefonoHtml = `<td>${escapeHtml(r.telefono || 'N/A')}</td>`;

        // Modificar la columna de "Fecha Solicitud" para incluir fecha y hora
        const fechaHoraHtml = `<td>${escapeHtml(r.fecha || 'N/A')} ${escapeHtml(r.hora || '')}</td>`;

        // Nueva columna de fecha confirmación solo para historial (readonly)
        const fechaConfirmacionHtml = readonly ? `<td>${r.estado === 'cancelada' ? escapeHtml(r.fecha_cancelacion || 'N/A') : escapeHtml(r.fecha_confirmacion || 'N/A')}</td>` : '';

        return ``
            + `<tr data-id="${escapeHtml(String(r.id))}">`
            + `    ${selectHtml}`
            + `    <td>${displayIndex}</td>`  // muestra el número secuencial en lugar del id original
            + `    ${firstColumnHtml}`
            + `    <td>${escapeHtml(r.nombre || 'N/A')}</td>`
            + `    <td>${escapeHtml(r.email || 'N/A')}</td>`
            + `    ${telefonoHtml}` // Agregar teléfono aquí
            + `    ${separacionHtml}`
            + `    ${cajasHtml}`
            + `    ${responsableHtml}`
            + `    ${fechaHoraHtml}` // Nueva columna con fecha y hora
            + `    <td>${escapeHtml(r.notas || 'N/A')}</td>`
            + `    <td>${fileLinksHtml}</td>`
            + `    <td class="${statusClass}">${estadoSafe}</td>`
            + `    ${fechaConfirmacionHtml}` // Nueva columna fecha confirmación
            + `    <td>${readonly ? (docValue || 'N/A') : `<input class="doc-input" value="${docValue}" placeholder="Documento" onkeydown="if(event.key==='Enter'){this.blur();}" onblur="saveDocumento(this, ${escapeHtml(String(r.id))})" aria-label="Documento para reserva ${escapeHtml(String(r.id))}">`}</td>`
            + `</tr>`;
    }).join('');
    const headerColumnName = isPedidos ? 'Rango (Desde - Hasta)' : '# Reserva';

    // build header with/without selection column
    const selectHeader = hideSelection ? '' : `<th class="col-select"><input type="checkbox" id="select-all-checkbox" onchange="toggleSelectAll(this)" aria-label="Seleccionar todo"></th>`;
    const fechaConfirmacionHeader = readonly ? `<th class="sortable" data-key="fecha_confirmacion">Fecha Confirmacion <span class="sort-ind"></span></th>` : '';
    return `
        <table>
            <thead>
                <tr>
                    ${selectHeader}
                    <th class="sortable" data-key="seq">ID <span class="sort-ind"></span></th>
                    <th class="sortable" data-key="${isPedidos ? 'rango_desde' : 'numero_reserva'}">${headerColumnName} <span class="sort-ind"></span></th>
                    <th class="sortable" data-key="nombre">Nombre <span class="sort-ind"></span></th>
                    <th class="sortable" data-key="email">Email <span class="sort-ind"></span></th>
                    <th class="sortable" data-key="telefono">Teléfono <span class="sort-ind"></span></th> <!-- NUEVO: Encabezado de teléfono -->
                    <th class="col-checkbox">SEPARACIÓN</th>
                    <th class="sortable" data-key="cajas">CAJAS</th>
                    <th class="sortable" data-key="responsable">RESPONSABLE</th>
                    <th class="sortable" data-key="fecha">FECHA SOLICITUD <span class="sort-ind"></span></th>
                    <th class="sortable" data-key="notas">Notas <span class="sort-ind"></span></th>
                    <th class="sortable" data-key="nombre_archivo">Archivo Adjuntos <span class="sort-ind"></span></th>
                    <th class="sortable" data-key="estado">Estado <span class="sort-ind"></span></th>
                    ${fechaConfirmacionHeader}
                    <th class="sortable" data-key="documento">Documento <span class="sort-ind"></span></th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

// Mostrar pestaña activa (ahora también actualiza currentView)
function showTab(tab) {
    const reservasDiv = document.getElementById('reservasList');
    const pedidosDiv = document.getElementById('pedidosList');
    const historialDiv = document.getElementById('historialList');
    const tabReservasBtn = document.getElementById('tab-reservas');
    const tabPedidosBtn = document.getElementById('tab-pedidos');
    const tabHistorialBtn = document.getElementById('tab-historial');

    if (tab === 'reservas') {
        reservasDiv.style.display = 'block';
        pedidosDiv.style.display = 'none';
        historialDiv.style.display = 'none';
        tabReservasBtn.style.background = 'var(--color-prebel-blue)';
        tabPedidosBtn.style.background = '#6c757d';
        tabHistorialBtn.style.background = '#6c757d';
        currentView = 'reservas';
    } else if (tab === 'pedidos') {
        reservasDiv.style.display = 'none';
        pedidosDiv.style.display = 'block';
        historialDiv.style.display = 'none';
        tabReservasBtn.style.background = '#6c757d';
        tabPedidosBtn.style.background = 'var(--color-prebel-blue)';
        currentView = 'pedidos';
    } else if (tab === 'historial') {
        reservasDiv.style.display = 'none';
        pedidosDiv.style.display = 'none';
        historialDiv.style.display = 'block';
        tabReservasBtn.style.background = '#6c757d';
        tabPedidosBtn.style.background = '#6c757d';
        tabHistorialBtn.style.background = 'var(--color-prebel-blue)';
        currentView = 'historial';
    }
}

function renderHistoryView() {
  const all = (window.historyCache || []).slice();

  // obtener valores de filtros
  const textRaw = (document.getElementById('filter-text')?.value || '').trim();
  const text = textRaw.toLowerCase();
  const estado = (document.getElementById('filter-estado')?.value || '').trim().toLowerCase();
  const dateFrom = document.getElementById('filter-date-from')?.value;
  const dateTo = document.getElementById('filter-date-to')?.value;
  pageSize = Number(document.getElementById('page-size')?.value || pageSize);

  function inDateRange(fechaStr) {
    if (!fechaStr) return true;
    try {
      const fecha = new Date(fechaStr);
      if (isNaN(fecha)) return true;
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (fecha < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23,59,59,999);
        if (fecha > to) return false;
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  // filtro principal
  let filtered = all.filter(r => {
    if (estado && String(r.estado || '').toLowerCase() !== estado) return false;
    if (!inDateRange(r.fecha)) return false;
    if (text) {
      const parts = [
        r.nombre,
        r.email,
        r.numero_reserva,
        r.numero_pedido,
        r.notas,
        r.rango_desde,
        r.rango_hasta,
        r.fecha,
        r.hora,
        r.nombre_archivo,
        r.documento
      ].map(v => (v || '').toString().toLowerCase());
      const hay = parts.join(' ');
      return hay.indexOf(text) !== -1;
    }
    return true;
  });

  // aplicar orden global
  filtered = applySort(filtered);

  // paginar
  const pagHist = paginate(filtered, pageHistorial, pageSize);

  // compute start index for sequential numbering
  const startIndexHistorial = (pagHist.current - 1) * pageSize;

  const historialDiv = document.getElementById('historialList');
  if (!historialDiv) return;
  if (!filtered || filtered.length === 0) {
    historialDiv.innerHTML = '<div>No hay historial.</div>';
    return;
  }

  // Para mostrar rango completo en historial si tiene rango
  const itemsForTable = pagHist.pageItems.map(r => {
    if (r.rango_desde && r.rango_hasta) {
      return { ...r, numero_reserva: `${r.rango_desde} - ${r.rango_hasta}` };
    }
    return r;
  });

  // render tabla paginada
  historialDiv.innerHTML = buildTable(itemsForTable, false, startIndexHistorial, { hideSelection: true, readonly: true });

  // render pagination controls
  renderPaginationControls('historialList', 'historial', { current: pagHist.current, totalPages: pagHist.totalPages, totalItems: pagHist.totalItems });

  // attach sort handlers and indicators so headers work
  attachSortHandlers();
  updateSortIndicators();

  // persist pageSize
  localStorage.setItem('pageSize', String(pageSize));
}

// Eventos de pestañas
document.getElementById('tab-reservas').addEventListener('click', () => { showTab('reservas'); renderReservationsView(); });
document.getElementById('tab-pedidos').addEventListener('click', () => { showTab('pedidos'); renderReservationsView(); });
document.getElementById('tab-historial').addEventListener('click', () => { showTab('historial'); renderHistoryView(); });

// Botón único de refrescar (mantiene la pestaña activa)
const btnRefreshEl = document.getElementById('btnRefresh');
if (btnRefreshEl) {
  btnRefreshEl.addEventListener('click', async () => {
      const fullName = sessionStorage.getItem('adminFullName');
      if (!fullName) return toggleLogin(false);
      await loadReservations(fullName);
      // asegurar que después de cargar se muestre la misma pestaña
      showTab(currentView || 'reservas');
  });
}

async function createAdmin() {
    const fullName = document.getElementById('full-name').value;
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;
    const msg = document.getElementById('adminCreationMessageDisplay');

    if (!fullName || !username || !password) {
        msg.textContent = '❌ Todos los campos son obligatorios.';
        msg.style.color = 'red';
        return;
    }

    msg.textContent = 'Creando administrador...';
    msg.style.color = 'black';

    try {
      const res = await fetch('/api/admin/create', {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fullName, username, password }),
          credentials: 'include'
      });

      const j = await res.json();

      if (j.ok) {
          msg.textContent = j.message;
          msg.style.color = 'green';
          document.getElementById('full-name').value = '';
          document.getElementById('new-username').value = '';
          document.getElementById('new-password').value = '';
      } else {
          msg.textContent = `❌ Error: ${j.error}`;
          msg.style.color = 'red';
      }
    } catch (err) {
      msg.textContent = 'Error de red al crear administrador.';
      msg.style.color = 'red';
      console.error('createAdmin error', err);
    }
}

async function resetPassword() {
    const username = document.getElementById('reset-username').value;
    const password = document.getElementById('reset-password').value;
    const msg = document.getElementById('resetPasswordMessageDisplay');

    if (!username || !password) {
        msg.textContent = '❌ Todos los campos son obligatorios.';
        msg.style.color = 'red';
        return;
    }

    msg.textContent = 'Restaurando contraseña...';
    msg.style.color = 'black';

    try {
      const res = await fetch('/api/admin/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: 'include'
      });

      const j = await res.json();

      if (j.ok) {
          msg.textContent = `✅ ${j.message}`;
          msg.style.color = 'green';
          document.getElementById('reset-username').value = '';
          document.getElementById('reset-password').value = '';
      } else {
          msg.textContent = `❌ Error: ${j.error}`;
          msg.style.color = 'red';
      }
    } catch (err) {
      msg.textContent = 'Error de red al restaurar contraseña.';
      msg.style.color = 'red';
      console.error('resetPassword error', err);
    }
}

async function loadAdmins() {
    const listContainer = document.getElementById('adminList');

    listContainer.innerHTML = 'Cargando administradores...';
    
    try {
      const res = await fetch('/api/admin/usuarios', {
          credentials: 'include'
      });

      if (res.status === 401) return toggleLogin(false);

      const j = await res.json();
      if (!j.ok) {
          listContainer.innerHTML = 'Error al obtener la lista de administradores.';
          return;
      }

      const admins = j.admins;
      
      let html = `
          <table style="max-width: 600px;">
              <thead>
                  <tr>
                      <th>ID</th>
                      <th>Usuario</th>
                      <th>Nombre Completo</th>
                  </tr>
              </thead>
              <tbody>
      `;

      admins.forEach(admin => {
          html += `
              <tr>
                  <td>${escapeHtml(String(admin.id))}</td>
                  <td>${escapeHtml(admin.username)}</td>
                  <td>${escapeHtml(admin.nombre_completo)}</td>
              </tr>
          `;
      });

      html += `</tbody></table>`;
      listContainer.innerHTML = html;
    } catch (err) {
      listContainer.innerHTML = 'Error de red al obtener administradores.';
      console.error('loadAdmins error', err);
    }
}

function toggleAdminSection(sectionIdToShow) {
    const creator = document.getElementById('admin-management-section');
    const list = document.getElementById('admin-list-section');
    const resetPassword = document.getElementById('admin-reset-password-section');
    const dropdown = document.getElementById('config-dropdown');
    const tabs = document.getElementById('tabs');
    const backButton = document.getElementById('backButton');

    if (creator) creator.style.display = 'none';
    if (list) list.style.display = 'none';
    if (resetPassword) resetPassword.style.display = 'none';
    if (dropdown) dropdown.style.display = 'none';
    if (tabs) tabs.style.display = 'none';

    if (backButton) backButton.style.display = 'inline-block';

    if (sectionIdToShow === 'creator') {
        if (creator) creator.style.display = 'block';
        currentView = 'creator';
    } else if (sectionIdToShow === 'list') {
        if (list) {
            list.style.display = 'block';
            loadAdmins();
        }
        currentView = 'list';
    } else if (sectionIdToShow === 'reset') {
        if (resetPassword) resetPassword.style.display = 'block';
        currentView = 'reset';
    }
}

function goBack() {
    const creator = document.getElementById('admin-management-section');
    const list = document.getElementById('admin-list-section');
    const resetPassword = document.getElementById('admin-reset-password-section');
    const tabs = document.getElementById('tabs');
    const backButton = document.getElementById('backButton');
    const dropdown = document.getElementById('config-dropdown');

    if (tabs) tabs.style.display = 'block';

    if (creator) creator.style.display = 'none';
    if (list) list.style.display = 'none';
    if (resetPassword) resetPassword.style.display = 'none';
    if (dropdown) dropdown.style.display = 'none';

    if (backButton) backButton.style.display = 'none';

    currentView = 'reservas';
}

// -----------------------
// Sorting + Pagination Helpers
// -----------------------
function applySort(list) {
  if (!sortBy || sortBy === 'seq') return list;
  const dir = sortDir === 'asc' ? 1 : -1;
  const key = sortBy;
  return list.slice().sort((a,b) => {
    let va = a[key];
    let vb = b[key];

    if (key === 'fecha') {
      va = (a.fecha || '') + ' ' + (a.hora || '');
      vb = (b.fecha || '') + ' ' + (b.hora || '');
    } else if (key === 'numero_reserva' || key === 'id') {
      const na = Number(va);
      const nb = Number(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
    } else if (key === 'rango_desde') {
      va = a.rango_desde || '';
      vb = b.rango_desde || '';
    } else if (key === 'documento') {
      va = a.documento || '';
      vb = b.documento || '';
    } else {
      va = va || '';
      vb = vb || '';
    }

    va = String(va).toLowerCase();
    vb = String(vb).toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function paginate(list, page, size) {
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  let current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * size;
  const end = start + size;
  const pageItems = list.slice(start, end);
  return { pageItems, totalPages, current, totalItems };
}

function renderPaginationControls(containerId, group, meta) {
  const { current, totalPages, totalItems } = meta;
  const container = document.getElementById(containerId + '-pagination');
  let el = container;
  if (!el) {
    el = document.createElement('div');
    el.id = containerId + '-pagination';
    el.className = 'pagination';
    document.getElementById(containerId).appendChild(el);
  }
  const buttons = [];
  buttons.push(`<button ${current===1?'disabled':''} onclick="goToPage('${group}',${current-1})">Prev</button>`);
  const pagesToShow = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  if (start > 1) pagesToShow.push(1, '...');
  for (let p = start; p <= end; p++) pagesToShow.push(p);
  if (end < totalPages) pagesToShow.push('...', totalPages);

  pagesToShow.forEach(p => {
    if (p === '...') buttons.push(`<button disabled>...</button>`);
    else buttons.push(`<button class="${p===current?'active':''}" onclick="goToPage('${group}',${p})">${p}</button>`);
  });

  buttons.push(`<button ${current===totalPages?'disabled':''} onclick="goToPage('${group}',${current+1})">Next</button>`);
  const metaHtml = `<span class="meta">Mostrando página ${current} de ${totalPages} — ${totalItems} registros</span>`;

  el.innerHTML = buttons.join('') + metaHtml;
}

// entry function: applies filters, sort, pagination, splits into reservas/pedidos and renders
function renderReservationsView() {
    const all = (window.reservationsCache || []).slice();

    // obtener valores de filtros
    const textRaw = (document.getElementById('filter-text')?.value || '').trim();
    const text = textRaw.toLowerCase();
    const estado = (document.getElementById('filter-estado')?.value || '').trim().toLowerCase();
    const dateFrom = document.getElementById('filter-date-from')?.value;
    const dateTo = document.getElementById('filter-date-to')?.value;
    pageSize = Number(document.getElementById('page-size')?.value || pageSize);

    function inDateRange(fechaStr) {
        if (!fechaStr) return true;
        try {
            const fecha = new Date(fechaStr);
            if (isNaN(fecha)) return true;
            if (dateFrom) {
                const from = new Date(dateFrom);
                if (fecha < from) return false;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23,59,59,999);
                if (fecha > to) return false;
            }
            return true;
        } catch (e) {
            return true;
        }
    }

    // filtro principal
    let filtered = all.filter(r => {
        if (estado && String(r.estado || '').toLowerCase() !== estado) return false;
        if (!inDateRange(r.fecha)) return false;
        if (text) {
            const parts = [
                r.nombre,
                r.email,
                r.numero_reserva,
                r.numero_pedido,
                r.notas,
                r.rango_desde,
                r.rango_hasta,
                r.fecha,
                r.hora,
                r.nombre_archivo,
                r.documento
            ].map(v => (v || '').toString().toLowerCase());
            const hay = parts.join(' ');
            return hay.indexOf(text) !== -1;
        }
        return true;
    });

    // aplicar orden global (note: 'seq' is UI-only and ignored in applySort)
    filtered = applySort(filtered);

    // Separar en dos grupos basados en columnas rango_desde / rango_hasta
    const pedidosList = [];
    const reservasList = [];

    filtered.forEach(r => {
        const tieneRango = (r.rango_desde && String(r.rango_desde).trim() !== '') ||
                           (r.rango_hasta && String(r.rango_hasta).trim() !== '');
        if (tieneRango) pedidosList.push(r); else reservasList.push(r);
    });

    // paginar ambos
    const pagRes = paginate(reservasList, pageReservas, pageSize);
    const pagPed = paginate(pedidosList, pagePedidos, pageSize);

    // compute start indices for sequential numbering across the filtered list
    const startIndexReservas = (pagRes.current - 1) * pageSize;
    const startIndexPedidos = (pagPed.current - 1) * pageSize;

    // render tablas (paginated arrays) passing startIndex so rows show sequential numbers
    document.getElementById('reservasList').innerHTML = buildTable(pagRes.pageItems, false, startIndexReservas);
    document.getElementById('pedidosList').innerHTML = buildTable(pagPed.pageItems, true, startIndexPedidos);

    // render pagination controls (they append below the tables)
    renderPaginationControls('reservasList', 'reservas', { current: pagRes.current, totalPages: pagRes.totalPages, totalItems: pagRes.totalItems });
    renderPaginationControls('pedidosList', 'pedidos', { current: pagPed.current, totalPages: pagPed.totalPages, totalItems: pagPed.totalItems });

    // attach sorting listeners to headers (after tables rendered)
    attachSortHandlers();

    // update sort indicators on headers
    updateSortIndicators();

    // restore view
    showTab(currentView || 'reservas');

    // persist pageSize
    localStorage.setItem('pageSize', String(pageSize));

    // update select-all checkbox state & toolbar
    syncSelectAllCheckbox();
    updateDeleteToolbar();
}

// navigate to page for group (extiende para historial)
function goToPage(group, page) {
  if (group === 'reservas') pageReservas = page;
  if (group === 'pedidos') pagePedidos = page;
  if (group === 'historial') pageHistorial = page;
  if (currentView === 'historial') renderHistoryView();
  else renderReservationsView();
}

// Attach click listeners to TH.sortable (dynamic after buildTable)
function attachSortHandlers() {
  const heads = document.querySelectorAll('th.sortable');
  heads.forEach(h => {
    // avoid adding multiple listeners
    if (h._sortableAttached) return;
    h._sortableAttached = true;
    h.addEventListener('click', () => {
      const key = h.getAttribute('data-key');
      if (!key) return;
      // 'seq' is UI-only: clicking it will clear sort (toggle off)
      if (key === 'seq') {
        if (sortBy === 'seq') { sortBy = null; sortDir = 'asc'; }
        else { sortBy = null; sortDir = 'asc'; }
      } else {
        if (sortBy === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortBy = key;
          sortDir = 'asc';
        }
      }
      // reset pages when sorting
      pageReservas = 1;
      pagePedidos = 1;
      pageHistorial = 1;
      if (currentView === 'historial') renderHistoryView(); else renderReservationsView();
    });
  });
}

function updateSortIndicators() {
  const heads = document.querySelectorAll('th.sortable');
  heads.forEach(h => {
    const ind = h.querySelector('.sort-ind');
    const key = h.getAttribute('data-key');
    if (!ind) return;
    if (key === sortBy) {
      ind.textContent = sortDir === 'asc' ? '▲' : '▼';
    } else {
      ind.textContent = '';
    }
  });
}

// -------------------------
// Documento: guardar local + intentar persistir en servidor (sin indicador visual)
// -------------------------
async function saveDocumento(inputEl, id) {
  const value = (inputEl.value || '').trim();

  // update local cache immediately
  const idx = (window.reservationsCache || []).findIndex(r => String(r.id) === String(id));
  if (idx !== -1) {
    window.reservationsCache[idx].documento = value;
  }

  // update localStorage cache
  const docs = loadDocumentosCache();
  if (value) docs[String(id)] = value;
  else delete docs[String(id)];
  saveDocumentosCache(docs);

  // attempt to persist to server (PUT to same reserva endpoint with documento)
  try {
    const res = await fetch(`/api/admin/reservas/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ documento: value }),
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    // optional: read response (ignored)
    try { await res.json(); } catch (e) {}
  } catch (err) {
    // no visual indicator: keep local value and log the error
    console.warn('No se pudo guardar documento en servidor:', err);
  }
}

// -------------------------
// Nuevo helper: guardar campos editables (cajas, responsable)
// - Misma UX que documento: actualiza cache local y hace PUT { field: value }, no revierte automáticamente si falla
// -------------------------
async function saveField(inputEl, id, field) {
  const value = (inputEl.value || '').trim();

  // update local cache immediately
  const idx = (window.reservationsCache || []).findIndex(r => String(r.id) === String(id));
  if (idx !== -1) {
    window.reservationsCache[idx][field] = value;
  }

  // attempt to persist to server (PUT to same reserva endpoint with dynamic field)
  try {
    const payload = {};
    payload[field] = value;
    const res = await fetch(`/api/admin/reservas/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    // try to sync if server returns updated reserva
    try {
      const j = await res.json();
      if (j && j.reserva) {
        const serverReserva = j.reserva;
        const i = (window.reservationsCache || []).findIndex(r => String(r.id) === String(serverReserva.id));
        if (i !== -1) {
          window.reservationsCache[i] = { ...window.reservationsCache[i], ...serverReserva };
        }
        renderReservationsView();
      }
    } catch (e) {
      // ignore parse errors
    }
  } catch (err) {
    console.warn(`No se pudo guardar ${field} en servidor para id ${id}:`, err);
  }
}

async function deleteReservation(id) {
    if (!confirm(`¿Eliminar reserva ${id}?`)) return;

    try {
      const res = await fetch(`/api/admin/reservas/${id}`, {
          method: 'DELETE',
          credentials: 'include'
      });

      if (res.ok) {
          // quitar de cache en memoria
          window.reservationsCache = (window.reservationsCache || []).filter(r => String(r.id) !== String(id));
          // quitar de cache localStorage
          const docs = loadDocumentosCache();
          if (docs[String(id)]) {
            delete docs[String(id)];
            saveDocumentosCache(docs);
          }
          // quitar de selección si estaba
          window.selectedReservations.delete(String(id));
          // reset pagination to first page to avoid empty page after deletion (optional)
          pageReservas = 1;
          pagePedidos = 1;
          renderReservationsView();
      } else {
          alert('Error al eliminar reserva.');
      }
    } catch (err) {
      console.error('deleteReservation error', err);
      alert('Error de conexión al eliminar reserva.');
    }
}

// -------------------------
// Implementación de changeStatus (se había invocado pero no existía)
// - Actualización optimista en cache local
// - PUT a /api/admin/reservas/:id con { estado }
// - Re-render y manejo de error que revierte cambio local si falla
// -------------------------
async function changeStatus(id, nuevoEstado) {
  // encontrar índice y estado antiguo
  const idx = (window.reservationsCache || []).findIndex(r => String(r.id) === String(id));
  const oldEstado = idx !== -1 ? window.reservationsCache[idx].estado : null;

  // optimista: actualizar cache local y re-render
  if (idx !== -1) {
    window.reservationsCache[idx].estado = nuevoEstado;
    renderReservationsView();
  }

  try {
    const res = await fetch(`/api/admin/reservas/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ estado: nuevoEstado }),
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    // si el backend devuelve la reserva actualizada, sincronizarla
    try {
      const j = await res.json();
      if (j && j.reserva) {
        const serverReserva = j.reserva;
        const i = (window.reservationsCache || []).findIndex(r => String(r.id) === String(serverReserva.id));
        if (i !== -1) {
          window.reservationsCache[i] = { ...window.reservationsCache[i], ...serverReserva };
        }
      }
    } catch (e) {
      // ignore parse errors
    }

    if (String(nuevoEstado).toLowerCase() === 'confirmada') {
      // re-render ambas vistas
      renderReservationsView();
      renderHistoryView();
    } else {
      renderReservationsView();
    }

  } catch (err) {
    console.error('changeStatus error', err);
    // revertir cambio optimista si existía estado antiguo
    if (idx !== -1) {
      window.reservationsCache[idx].estado = oldEstado;
      renderReservationsView();
    }
    alert('No se pudo actualizar el estado en el servidor.');
  }
}

// -------------------------
// NUEVO (UI-only por ahora): manejo local de checkboxes "SEPARACIÓN", "PROCESADA", "CONFIRMADA"
// - onEstadoLocalToggle actualiza solo la cache local y recalcula estado primario localmente
// - No realiza llamadas al servidor (el backend lo implementaremos cuando me lo indiques)
// - Si el usuario marca como confirmado localmente, migramos a historial local
// -------------------------
function flagsFromReserva(r) {
  const out = { separacion: false, procesada: false, confirmada: false };
  if (!r) return out;
  // si existe un array r.estados
  if (Array.isArray(r.estados)) {
    r.estados.forEach(e => {
      if (!e) return;
      const k = String(e).toLowerCase();
      if (out.hasOwnProperty(k)) out[k] = true;
    });
    return out;
  }
  // si vienen propiedades booleanas sueltas
  if (typeof r.separacion !== 'undefined') out.separacion = !!r.separacion;
  if (typeof r.procesada !== 'undefined') out.procesada = !!r.procesada;
  if (typeof r.confirmada !== 'undefined') out.confirmada = !!r.confirmada;
  // si solo hay r.estado (string) mapearlo
  if (r.estado && !out.confirmada && !out.procesada && !out.separacion) {
    const s = String(r.estado).toLowerCase();
    if (out.hasOwnProperty(s)) out[s] = true;
  }
  return out;
}

// evento invocado por onchange de los checkboxes: actualiza solo la cache local
function onEstadoLocalToggle(checkboxEl, id) {
  const row = checkboxEl.closest('tr');
  if (!row) return;
  const inputs = row.querySelectorAll('input[type="checkbox"][data-flag]');
  const flags = { separacion: false, procesada: false, confirmada: false };
  inputs.forEach(inp => {
    const f = inp.getAttribute('data-flag');
    if (f && flags.hasOwnProperty(f)) flags[f] = !!inp.checked;
  });

  const idx = (window.reservationsCache || []).findIndex(r => String(r.id) === String(id));
  if (idx === -1) return;

  // actualizar solo la representación local: crear/actualizar r.estados (array)
  window.reservationsCache[idx].estados = Object.keys(flags).filter(k => flags[k]);

  // mantener propiedades booleanas si existen (no necesarias, pero útil)
  window.reservationsCache[idx].separacion = !!flags.separacion;
  window.reservationsCache[idx].procesada = !!flags.procesada;
  window.reservationsCache[idx].confirmada = !!flags.confirmada;

  // recalcular estado primario localmente (no persistido)
  window.reservationsCache[idx].estado = computePrimaryEstadoFromFlags(flags);

  // si marcó confirmada localmente, migrar a historial
  if (flags.confirmada) {
    // mover reserva al historial local
    const moved = window.reservationsCache.splice(idx, 1);
    if (moved && moved.length > 0) {
      window.historyCache = window.historyCache || [];
      window.historyCache.push(moved[0]);
    }
    renderReservationsView();
    renderHistoryView();
    return;
  }

  // re-render para reflejar cambios
  renderReservationsView();
}

// Decide estado primario según flags
function computePrimaryEstadoFromFlags(flags) {
  if (!flags) return 'pendiente';
  if (flags.confirmada) return 'confirmada';
  if (flags.procesada) return 'procesada';
  if (flags.separacion) return 'separacion';
  return 'pendiente';
}


// -------------------------
// Selección y eliminación en bloque
// -------------------------

// toggle selection for a single row checkbox
function toggleRowSelection(checkboxEl, id) {
  const idStr = String(id);
  if (!window.selectedReservations) window.selectedReservations = new Set();
  if (checkboxEl.checked) window.selectedReservations.add(idStr);
  else window.selectedReservations.delete(idStr);
  updateDeleteToolbar();
  syncSelectAllCheckbox();
}

// toggle select-all (only affects currently rendered page)
function toggleSelectAll(headerCheckbox) {
  const checkboxes = document.querySelectorAll('#reservasList .select-reservation, #pedidosList .select-reservation');
  if (!window.selectedReservations) window.selectedReservations = new Set();
  checkboxes.forEach(cb => {
    const id = cb.getAttribute('data-id');
    if (!id) return;
    cb.checked = headerCheckbox.checked;
    if (headerCheckbox.checked) window.selectedReservations.add(String(id));
    else window.selectedReservations.delete(String(id));
  });
  updateDeleteToolbar();
}

// keep header select-all checkbox in sync with row selections
function syncSelectAllCheckbox() {
    const header = document.getElementById('select-all-checkbox');
    if (!header) return;
    const pageCheckboxes = Array.from(document.querySelectorAll('#reservasList .select-reservation, #pedidosList .select-reservation'));
    if (pageCheckboxes.length === 0) { header.checked = false; header.indeterminate = false; return; }
    const total = pageCheckboxes.length;
    const checked = pageCheckboxes.filter(cb => cb.checked).length;
    header.checked = (checked === total);
    header.indeterminate = (checked > 0 && checked < total);
}

// show/hide and update top delete button
function updateDeleteToolbar() {
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  const cancelBtn = document.getElementById('cancelSelectedBtn');
  const confirmBtn = document.getElementById('confirmSelectedBtn');
  const count = window.selectedReservations ? window.selectedReservations.size : 0;

  if (count > 0) {
    deleteBtn.style.display = 'inline-block';
    deleteBtn.textContent = `Eliminar seleccionados (${count})`;

    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = `Cancelar seleccionados (${count})`;

    confirmBtn.style.display = 'inline-block';
    confirmBtn.textContent = `Confirmar (${count})`;
  } else {
    deleteBtn.style.display = 'none';
    deleteBtn.textContent = 'Eliminar seleccionados';

    cancelBtn.style.display = 'none';
    cancelBtn.textContent = 'Cancelar seleccionados';

    confirmBtn.style.display = 'none';
    confirmBtn.textContent = 'Confirmar';
  }
}

// delete selected reservations (loop over ids, call DELETE per id)
async function deleteSelected() {
  if (!window.selectedReservations || window.selectedReservations.size === 0) return;
  const ids = Array.from(window.selectedReservations);
  if (!confirm(`¿Eliminar ${ids.length} reserva(s) seleccionada(s)? Esta acción no se puede deshacer.`)) return;

  const failed = [];
  // run deletes sequentially to avoid overloading backend and to handle local cache updates safely
  for (const id of ids) {
    try {
      const res = await fetch(`/api/admin/reservas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        // remove from cache
        window.reservationsCache = (window.reservationsCache || []).filter(r => String(r.id) !== String(id));
        // remove document cache entry if any
        const docs = loadDocumentosCache();
        if (docs[String(id)]) {
          delete docs[String(id)];
          saveDocumentosCache(docs);
        }
        // remove from selection set
        window.selectedReservations.delete(String(id));
      } else {
        failed.push(id);
      }
    } catch (err) {
      console.error('Error deleting id', id, err);
      failed.push(id);
    }
  }

  // re-render
  pageReservas = 1;
  pagePedidos = 1;
  renderReservationsView();

  if (failed.length > 0) {
    alert(`No se pudieron eliminar ${failed.length} reserva(s): ${failed.join(', ')}. Revisa la consola para más detalles.`);
  } else {
    alert('Reservas eliminadas correctamente.');
  }
}

// wire deleteSelectedBtn
const deleteSelectedBtnEl = document.getElementById('deleteSelectedBtn');
if (deleteSelectedBtnEl) deleteSelectedBtnEl.addEventListener('click', deleteSelected);

// -------------------------
// confirmar reserva (fila única) -> ahora usa endpoint /confirm
// -------------------------
async function confirmarReserva(id) {
  try {
    const res = await fetch(`/api/admin/reservas/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data && data.ok && data.reserva) {
      // mover al historial local
      window.historyCache = window.historyCache || [];
      window.historyCache.unshift(data.reserva);
      window.reservationsCache = (window.reservationsCache || []).filter(r => String(r.id) !== String(id));
      renderReservationsView();
      renderHistoryView();
      showTab('historial');
      alert(data.message || 'Reserva confirmada.');
    } else {
      alert(`Error: ${data && (data.message || data.error) ? (data.message || data.error) : 'No se pudo confirmar.'}`);
    }
  } catch (err) {
    console.error('Error al confirmar la reserva:', err);
    alert('Error al confirmar la reserva.');
  }
}

// Conexión de Eventos (resto)
const btnLoginEl = document.getElementById('btnLogin');
if (btnLoginEl) btnLoginEl.addEventListener('click', login);

const btnLogoutEl = document.getElementById('btnLogout');
if (btnLogoutEl) {
  btnLogoutEl.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { 
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
    toggleLogin(false);
  });
}

const btnCreateAdminEl = document.getElementById('btnCreateAdmin');
if (btnCreateAdminEl) btnCreateAdminEl.addEventListener('click', createAdmin);

const btnResetPasswordEl = document.getElementById('btnResetPassword');
if (btnResetPasswordEl) btnResetPasswordEl.addEventListener('click', resetPassword);

const backButtonEl = document.getElementById('backButton');
if (backButtonEl) backButtonEl.addEventListener('click', goBack);

const showAdminCreatorEl = document.getElementById('show-admin-creator');
if (showAdminCreatorEl) showAdminCreatorEl.addEventListener('click', () => toggleAdminSection('creator'));

const showAdminListEl = document.getElementById('show-admin-list');
if (showAdminListEl) showAdminListEl.addEventListener('click', () => toggleAdminSection('list'));

const showResetPasswordEl = document.getElementById('show-reset-password');
if (showResetPasswordEl) showResetPasswordEl.addEventListener('click', () => toggleAdminSection('reset'));

const btnRefreshReservationsEl = document.getElementById('btnRefreshReservations');
if (btnRefreshReservationsEl) btnRefreshReservationsEl.addEventListener('click', () => {
    const fullName = sessionStorage.getItem('adminFullName'); 
    if (fullName) {
        loadReservations(fullName);
    } else {
        toggleLogin(false); 
    }
});

// Llama a login al cargar la página para reanudar sesión si hay token
document.addEventListener('DOMContentLoaded', () => {
    const fullName = sessionStorage.getItem('adminFullName'); 
    if (fullName) {
        loadReservations(fullName);
    }

    // conectar botones "ojito" (se hace aquí para asegurar que DOM esté ready)
    initPasswordToggleButtons();

    // conectar eventos de filtros
    initFilterEvents();

    // page-size control
    const ps = document.getElementById('page-size');
    if (ps) {
      ps.value = String(pageSize);
      ps.addEventListener('change', () => {
        pageSize = Number(ps.value);
        // reset pages on page size change
        pageReservas = 1;
        pagePedidos = 1;
        if (currentView === 'historial') renderHistoryView(); else renderReservationsView();
      });
    }

    // Close config dropdown when clicking outside
    document.addEventListener('click', (ev) => {
      const dd = document.getElementById('config-dropdown');
      const icon = document.getElementById('config-icon');
      if (!dd || !icon) return;
      const target = ev.target;
      if (!dd.contains(target) && !icon.contains(target)) {
        dd.style.display = 'none';
        icon.setAttribute('aria-expanded', 'false');
      }
    });

    // Event listeners para reiniciar temporizador de inactividad
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, true);
    });

    // Si ya está logueado, iniciar temporizador
    if (token && fullName) {
      resetInactivityTimer();
    }
});

// -------------------------
// Mostrar / Ocultar Contraseña (centralizado y accesible)
// -------------------------
function initPasswordToggleButtons() {
  const buttons = document.querySelectorAll('.toggle-pass-btn');

  buttons.forEach(btn => {
    // add click only if not using inline onclick
    if (!btn.onclick) {
      btn.addEventListener('click', () => {
        togglePasswordVisibility(btn.getAttribute('data-target'), btn);
      });
    }
  });
}

function togglePasswordVisibility(inputId, btn) {
  try { console.log('togglePasswordVisibility called for', inputId); } catch(e){}
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  // actualizar aria-label para accesibilidad
  btn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');

  // Cambiar el ícono SVG (eye / eye-off)
  if (isPassword) {
    // ahora está mostrando, poner icono "eye-off"
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.94 17.94L6.06 6.06"/>
        <path d="M10.58 10.58A3 3 0 0113.41 13.4"/>
        <path d="M4.94 9.17A12.18 12.18 0 003 12a12.18 12.18 0 002.09 3.13"/>
        <path d="M9.17 4.94A9.77 9.77 0 0112 4c5 0 9.27 3.11 11 7-1.04 2.34-2.6 4.2-4.47 5.5"/>
      </svg>`;
  } else {
    // oculto -> mostrar el icono "eye"
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7C21.27 8.11 17 5 12 5z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>`;
  }

 }

  // mantener foco en el botón (buena UX)
  try { btn.focus(); } catch(e){}


// -------------------------
// Filtros: eventos y helpers
// -------------------------
function initFilterEvents() {
  const text = document.getElementById('filter-text');
  const estado = document.getElementById('filter-estado');
  const from = document.getElementById('filter-date-from');
  const to = document.getElementById('filter-date-to');
  const clear = document.getElementById('btnClearFilters');

  if (text) text.addEventListener('input', debounce(() => {
    pageReservas = 1; pagePedidos = 1; pageHistorial = 1;
    if (currentView === 'historial') renderHistoryView(); else renderReservationsView();
  }, 200));
  if (estado) estado.addEventListener('change', () => { pageReservas = 1; pagePedidos = 1; pageHistorial = 1; if (currentView === 'historial') renderHistoryView(); else renderReservationsView(); });
  if (from) from.addEventListener('change', () => { pageReservas = 1; pagePedidos = 1; pageHistorial = 1; if (currentView === 'historial') renderHistoryView(); else renderReservationsView(); });
  if (to) to.addEventListener('change', () => { pageReservas = 1; pagePedidos = 1; pageHistorial = 1; if (currentView === 'historial') renderHistoryView(); else renderReservationsView(); });
  if (clear) clear.addEventListener('click', clearFilterInputs);
}

// small debounce helper
function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };

}

// Helpers: limpiar filtros
function clearFilterInputs() {
    if (document.getElementById('filter-text')) document.getElementById('filter-text').value = '';
    if (document.getElementById('filter-estado')) document.getElementById('filter-estado').value = '';
    if (document.getElementById('filter-date-from')) document.getElementById('filter-date-from').value = '';
    if (document.getElementById('filter-date-to')) document.getElementById('filter-date-to').value = '';
    // reset pagination
    pageReservas = 1;
    pagePedidos = 1;
    pageHistorial = 1;
    if (currentView === 'historial') renderHistoryView(); else renderReservationsView();
}

// escape básico para prevenir inyección al construir innerHTML
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Detectar la tecla Enter en el campo de contraseña
const pwdField = document.getElementById('password');
if (pwdField) {
  pwdField.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Evitar comportamiento predeterminado
      const btn = document.getElementById('btnLogin');
      if (btn) btn.click(); // Simular clic en el botón
    }
  });
}

// -------------------------
// Funcionalidad para cancelar reservas con observación (usa endpoint PUT /cancel)
// -------------------------

// abrir modal de cancelación
function openCancelModal() {
  const modal = document.getElementById('cancelModal');
  if (modal) {
    modal.style.display = 'block';
    // limpiar observación anterior
    document.getElementById('cancelObservation').value = '';
  }
}

// cerrar modal de cancelación
function closeCancelModal() {
  const modal = document.getElementById('cancelModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// confirmar cancelación
async function confirmCancel() {
  const observation = document.getElementById('cancelObservation').value;

  if (!window.selectedReservations || window.selectedReservations.size === 0) {
    alert('No hay reservas seleccionadas para cancelar.');
    return closeCancelModal();
  }

  if (!observation || String(observation).trim() === '') {
    alert('La observación es obligatoria para cancelar.');
    return;
  }

  if (!confirm(`¿Cancelar ${window.selectedReservations.size} reserva(s) seleccionada(s)?`)) return closeCancelModal();

  const ids = Array.from(window.selectedReservations);
  const failed = [];

  // enviar solicitud PUT /cancel por cada reserva seleccionada
  for (const id of ids) {
    try {
      const res = await fetch(`/api/admin/reservas/${encodeURIComponent(id)}/cancel`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ observacion: observation }),
        credentials: 'include'
      });
      const j = await res.json();
      if (res.ok && j && j.ok && j.reserva) {
        // actualizar caches: quitar de reservas activas y agregar al historial si procede
        window.reservationsCache = (window.reservationsCache || []).filter(r => String(r.id) !== String(id));
        window.historyCache = window.historyCache || [];
        window.historyCache.unshift(j.reserva);
        window.selectedReservations.delete(String(id));
      } else {
        failed.push(id);
      }
    } catch (err) {
      console.error('Error cancelando id', id, err);
      failed.push(id);
    }
  }

  // actualizar vista: recargar reservas (o actualizar UI)
  await loadReservations('');
  closeCancelModal();

  if (failed.length > 0) {
    alert(`No se pudieron cancelar ${failed.length} reserva(s): ${failed.join(', ')}. Revisa la consola para más detalles.`);
  } else {
    alert('Reservas canceladas correctamente.');
  }
}

// conectar botones de modal
const confirmCancelBtnEl = document.getElementById('confirmCancelBtn');
if (confirmCancelBtnEl) confirmCancelBtnEl.addEventListener('click', confirmCancel);
const closeCancelModalBtnEl = document.getElementById('closeCancelModalBtn');
if (closeCancelModalBtnEl) closeCancelModalBtnEl.addEventListener('click', closeCancelModal);

// Conectar cancelSelectedBtn para abrir modal
const cancelSelectedBtnEl = document.getElementById('cancelSelectedBtn');
if (cancelSelectedBtnEl) cancelSelectedBtnEl.addEventListener('click', () => {
  if (!window.selectedReservations || window.selectedReservations.size === 0) {
    alert('No hay reservas seleccionadas.');
    return;
  }
  openCancelModal();
});

// -------------------------

async function confirmSelected() {
    if (!window.selectedReservations || window.selectedReservations.size === 0) return;
    const ids = Array.from(window.selectedReservations);
    if (!confirm(`¿Confirmar ${ids.length} reserva(s) seleccionada(s)?`)) return;

    const failed = [];
    const confirmedReservations = [];

    for (const id of ids) {
      try {
        const res = await fetch(`/api/admin/reservas/${encodeURIComponent(id)}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        const j = await res.json();
        if (res.ok && j && j.ok && j.reserva) {
          confirmedReservations.push(j.reserva);
        } else {
          failed.push(id);
        }
      } catch (err) {
        console.error('Error confirmando id', id, err);
        failed.push(id);
      }
    }

    // Actualizar caches
    const confirmedSet = new Set(confirmedReservations.map(c => String(c.id)));
    window.reservationsCache = (window.reservationsCache || []).filter(r => !confirmedSet.has(String(r.id)));
    window.historyCache = window.historyCache || [];
    // añadir confirmadas al inicio del historial
    confirmedReservations.reverse().forEach(c => window.historyCache.unshift(c));

    // Limpiar selección de los ids confirmados
    ids.forEach(id => window.selectedReservations.delete(String(id)));

    // Actualizar vista
    pageReservas = 1;
    pagePedidos = 1;
    renderReservationsView();
    renderHistoryView();

    // Mostrar historial tab
    showTab('historial');

    updateDeleteToolbar();
    syncSelectAllCheckbox();

    if (failed.length > 0) {
        alert(`No se pudieron confirmar ${failed.length} reserva(s): ${failed.join(', ')}. Revisa la consola para más detalles.`);
    } else {
        alert('Reservas confirmadas correctamente.');
    }
}

// Modificar el evento para garantizar que las reservas confirmadas se muevan correctamente
const confirmSelectedBtn = document.getElementById('confirmSelectedBtn');
if (confirmSelectedBtn) {
  confirmSelectedBtn.addEventListener('click', confirmSelected);
}

// -------------------------
// loadReservations: ahora pide reservas activas e historial al servidor
// -------------------------
async function loadReservations(fullName) {
    const activeTab = currentView || 'reservas';

    try {
      const [resR, resH] = await Promise.all([
        fetch('/api/admin/reservas', { credentials: 'include' }),
        fetch('/api/admin/historial', { credentials: 'include' })
      ]);

      if (resR.status === 401 || resH.status === 401) {
          console.error('Sesión expirada o token inválido');
          document.getElementById('adminMessageDisplay').textContent = 'Sesión expirada. Por favor ingresa de nuevo.';
          document.getElementById('adminMessageDisplay').style.color = 'red';
          return toggleLogin(false);
      }

      const jR = await resR.json();
      const jH = await resH.json();

      if (!jR.ok) {
          document.getElementById('reservasList').innerHTML = 'Error obteniendo reservas.';
          document.getElementById('pedidosList').innerHTML = '';
          return;
      }

      const reservations = jR.reservas || [];

      // merge con cache local de documentos (localStorage)
      const docCache = loadDocumentosCache();
      reservations.forEach(r => {
        const idStr = String(r.id);
        // Preferir siempre el valor del servidor sobre el caché
        // Solo usar caché si el servidor NO devuelve un documento para IDs que ya existían antes
        if ((r.documento === undefined || r.documento === null || String(r.documento).trim() === '') && docCache[idStr]) {
          r.documento = docCache[idStr];
        }
        // si servidor devuelve documento diferente, preferimos servidor (y actualizamos cache local)
        if (r.documento && String(r.documento).trim() !== '') {
          docCache[idStr] = String(r.documento).trim();
        } else {
          // Si la reserva NO tiene documento (nueva), eliminar del caché cualquier valor residual
          delete docCache[idStr];
        }
      });
      // guardar cache sincronizada (sin residuos)
      saveDocumentosCache(docCache);

      // Guardar cache completa (sin filtrar)
      window.reservationsCache = reservations.slice();

      // Historial desde servidor
      window.historyCache = (jH.reservas || []).slice();

      // limpiar selección que ya no exista
      const existingIds = new Set(window.reservationsCache.map(r => String(r.id)));
      window.selectedReservations.forEach(id => {
        if (!existingIds.has(String(id))) window.selectedReservations.delete(id);
      });

      // Renderizar aplicando filtros/sorting/paginación
      renderReservationsView();
      renderHistoryView();

      toggleLogin(true, fullName);
      document.getElementById('backButton').style.display = 'none';

      // restaurar la pestaña activa que había antes del refresh
      showTab(activeTab);
      updateDeleteToolbar();
    } catch (err) {
      console.error('Error cargando reservas:', err);
      document.getElementById('reservasList').innerHTML = 'Error de conexión al obtener reservas.';
    }
}
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const msg = document.getElementById('adminMessageDisplay');

    if (!username || !password) {
        msg.textContent = '❌ Por favor, ingresa tu usuario y contraseña.';
        msg.style.color = 'red';
        return;
    }

    msg.textContent = 'Iniciando sesión...';
    msg.style.color = 'black';

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include' // Permitir envío de cookies
        });

        const data = await res.json();

        if (res.ok && data.fullName) {
            // La cookie httpOnly se establece automáticamente
            sessionStorage.setItem('adminFullName', data.fullName);
            msg.textContent = '✅ Inicio de sesión exitoso.';
            msg.style.color = 'green';
            await loadReservations(data.fullName);
        } else {
            msg.textContent = `❌ Error: ${data.message || data.error || 'Credenciales incorrectas.'}`;
            msg.style.color = 'red';
        }
    } catch (err) {
        console.error('Error en login:', err);
        msg.textContent = '❌ Error de conexión. Intenta nuevamente.';
        msg.style.color = 'red';
    }
}