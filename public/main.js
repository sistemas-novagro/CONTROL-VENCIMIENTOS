/* ===========================================================
   NAVEGACIÓN ENTRE VISTAS
   =========================================================== */
function irAVista(nombreVista) {
  document.querySelectorAll('.item-menu').forEach(b => b.classList.remove('activo'));
  const botonNav = document.querySelector(`.item-menu[data-vista="${nombreVista}"]`);
  if (botonNav) botonNav.classList.add('activo');
  document.querySelectorAll('.vista').forEach(v => v.style.display = 'none');
  document.getElementById(nombreVista).style.display = 'block';

  if (nombreVista === 'vista-lista') cargarVencimientos();
  if (nombreVista === 'vista-panel') cargarPanel();
  if (nombreVista === 'vista-entidades') cargarVistaEntidades();
}

document.querySelectorAll('.item-menu').forEach(btn => {
  btn.addEventListener('click', () => irAVista(btn.dataset.vista));
});

document.querySelectorAll('.chip-categoria').forEach(chip => {
  chip.addEventListener('click', () => {
    FILTRO_ACTUAL = chip.dataset.filtro;
    document.querySelectorAll('.filtro-btn').forEach(b => {
      b.classList.toggle('activo', b.dataset.filtro === FILTRO_ACTUAL);
    });
    irAVista('vista-lista'); // dispara cargarVencimientos(), que ya renderiza con FILTRO_ACTUAL puesto
  });
});

// Panel es la vista inicial al cargar la página
cargarPanel();

function mostrarToast(mensaje, esError) {
  const toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.className = 'toast visible' + (esError ? ' error' : '');
  setTimeout(() => toast.classList.remove('visible'), 4000);
}

/* ===========================================================
   FORMULARIO: NUEVO VENCIMIENTO
   =========================================================== */
const OPCIONES_TIPO = ['Seguro', 'Cuota', 'Impuesto', 'Servicio', 'Tarjeta'];
const OPCIONES_RECURRENCIA = [
  { value: 'unico', label: 'Único' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'anual', label: 'Anual' },
];
const TIPOS_VALIDOS_POR_ENTIDAD = { 'Banco': ['Tarjeta', 'Cuota'] };

let ENTIDADES = [];

function armarSelectConManual(selectEl, opciones, manualId) {
  opciones.forEach(op => {
    const opt = document.createElement('option');
    opt.value = op.value ?? op;
    opt.textContent = op.label ?? op;
    selectEl.appendChild(opt);
  });
  const optOtro = document.createElement('option');
  optOtro.value = 'otro';
  optOtro.textContent = '✎ Otro...';
  selectEl.appendChild(optOtro);

  const manualEl = document.getElementById(manualId);
  selectEl.addEventListener('change', () => {
    manualEl.classList.toggle('activo', selectEl.value === 'otro');
    if (selectEl.value === 'otro') manualEl.focus();
  });
}

function valorFinal(selectId, manualId) {
  const select = document.getElementById(selectId);
  if (select.value === 'otro') return document.getElementById(manualId).value.trim();
  return select.value;
}

async function cargarEntidadesEnFormulario() {
  const res = await fetch('/api/entidades');
  const entidades = await res.json();
  ENTIDADES = entidades;
  const opciones = entidades.map(e => ({
    value: e.id,
    label: e.cuenta_producto ? `${e.nombre} — ${e.cuenta_producto}` : e.nombre,
  }));
  armarSelectConManual(document.getElementById('entidad_id'), opciones, 'entidad_manual');
}

armarSelectConManual(document.getElementById('tipo'), OPCIONES_TIPO, 'tipo_manual');
armarSelectConManual(document.getElementById('recurrencia'), OPCIONES_RECURRENCIA, 'recurrencia_manual');
cargarEntidadesEnFormulario();

document.getElementById('tipo').addEventListener('change', actualizarSeccionSeguro);
document.getElementById('tipo_manual').addEventListener('input', actualizarSeccionSeguro);
function actualizarSeccionSeguro() {
  const tipo = valorFinal('tipo', 'tipo_manual');
  document.getElementById('seccion-seguro').classList.toggle('activa', tipo === 'Seguro');
}

document.getElementById('tipo').addEventListener('change', chequearCoincidenciaTipo);
document.getElementById('entidad_id').addEventListener('change', chequearCoincidenciaTipo);
function chequearCoincidenciaTipo() {
  const aviso = document.getElementById('aviso-tipo');
  const entidadId = document.getElementById('entidad_id').value;
  const tipoElegido = document.getElementById('tipo').value;
  const entidad = ENTIDADES.find(e => String(e.id) === String(entidadId));

  if (!entidad || !entidad.tipo_entidad || tipoElegido === 'otro') {
    aviso.classList.remove('visible');
    return;
  }
  const validos = TIPOS_VALIDOS_POR_ENTIDAD[entidad.tipo_entidad] || [entidad.tipo_entidad];
  if (!validos.includes(tipoElegido)) {
    aviso.textContent = `${entidad.nombre} normalmente se carga como ${validos.map(t => `"${t}"`).join(' o ')}, no "${tipoElegido}". Revisá el tipo.`;
    aviso.classList.add('visible');
  } else {
    aviso.classList.remove('visible');
  }
}

document.getElementById('btn-analizar-ia').addEventListener('click', async () => {
  const archivos = document.getElementById('pdf').files;
  if (archivos.length === 0) {
    mostrarToast('Elegí un PDF primero', true);
    return;
  }

  const boton = document.getElementById('btn-analizar-ia');
  const textoSpan = boton.querySelector('.boton-ia-texto');
  const textoOriginal = textoSpan.textContent;
  textoSpan.textContent = 'Leyendo el comprobante...';
  boton.classList.add('cargando');
  boton.disabled = true;

  try {
    const formData = new FormData();
    formData.append('pdf', archivos[0]); // analizamos el primero si hay varios

    const res = await fetch('/api/analizar-pdf', { method: 'POST', body: formData });
    const datos = await res.json();

    if (!res.ok) throw new Error(datos.error || 'No se pudo analizar el documento');

    // Tipo
    if (datos.tipo) {
      const selectTipo = document.getElementById('tipo');
      const existeOpcion = Array.from(selectTipo.options).some(o => o.value === datos.tipo);
      selectTipo.value = existeOpcion ? datos.tipo : 'otro';
      if (!existeOpcion) {
        document.getElementById('tipo_manual').value = datos.tipo;
        document.getElementById('tipo_manual').classList.add('activo');
      }
      actualizarSeccionSeguro();
    }

    // Entidad: buscamos si ya existe una con ese nombre, si no la dejamos como texto manual
    if (datos.entidad_nombre) {
      const coincidencia = ENTIDADES.find(
        e => e.nombre.toLowerCase() === datos.entidad_nombre.toLowerCase()
      );
      const selectEntidad = document.getElementById('entidad_id');
      if (coincidencia) {
        selectEntidad.value = coincidencia.id;
        document.getElementById('entidad_manual').classList.remove('activo');
      } else {
        selectEntidad.value = 'otro';
        document.getElementById('entidad_manual').value = datos.entidad_nombre;
        document.getElementById('entidad_manual').classList.add('activo');
      }
      chequearCoincidenciaTipo();
    }

    if (datos.concepto) document.getElementById('concepto').value = datos.concepto;
    if (datos.monto) document.getElementById('monto').value = datos.monto;
    if (datos.fecha_vencimiento) document.getElementById('fecha_vencimiento').value = datos.fecha_vencimiento;
    if (datos.objeto_asegurado) document.getElementById('objeto_asegurado').value = datos.objeto_asegurado;
    if (datos.detalle) document.getElementById('detalle').value = datos.detalle;

    if (datos.recurrencia) {
      const selectRec = document.getElementById('recurrencia');
      const existeRec = Array.from(selectRec.options).some(o => o.value === datos.recurrencia);
      if (existeRec) selectRec.value = datos.recurrencia;
    }

    mostrarToast('Datos completados — revisalos antes de guardar');
  } catch (err) {
    mostrarToast('Error: ' + err.message, true);
  } finally {
    textoSpan.textContent = textoOriginal;
    boton.classList.remove('cargando');
    boton.disabled = false;
  }
});

document.getElementById('form-vencimiento').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
});

document.getElementById('form-vencimiento').addEventListener('submit', async (e) => {
  e.preventDefault();

  const concepto = document.getElementById('concepto').value.trim();
  const fecha = document.getElementById('fecha_vencimiento').value;
  if (!concepto) { mostrarToast('Completá el concepto', true); return; }
  if (!fecha) { mostrarToast('Elegí la fecha de vencimiento', true); return; }

  try {
    let entidadId = document.getElementById('entidad_id').value;

    if (entidadId === 'otro') {
      const nombreNuevo = document.getElementById('entidad_manual').value.trim();
      if (!nombreNuevo) { mostrarToast('Escribí el nombre de la entidad', true); return; }
      const resEntidad = await fetch('/api/entidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreNuevo, cuenta_producto: null, tipo_entidad: null }),
      });
      if (!resEntidad.ok) throw new Error((await resEntidad.json()).error || 'Error al crear la entidad');
      const nuevaEntidad = await resEntidad.json();
      entidadId = nuevaEntidad.id;
    }

    const formData = new FormData();
    formData.append('tipo', valorFinal('tipo', 'tipo_manual'));
    formData.append('entidad_id', entidadId);
    formData.append('objeto_asegurado', document.getElementById('objeto_asegurado').value || '');
    formData.append('detalle', document.getElementById('detalle').value || '');
    formData.append('concepto', concepto);
    formData.append('monto', document.getElementById('monto').value);
    formData.append('fecha_vencimiento', fecha);
    formData.append('recurrencia', valorFinal('recurrencia', 'recurrencia_manual'));

    Array.from(document.getElementById('pdf').files).forEach(archivo => {
      formData.append('pdf', archivo);
    });

    const res = await fetch('/api/vencimientos', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok) {
      mostrarToast('Vencimiento guardado');
      e.target.reset();
      document.querySelectorAll('.campo-manual').forEach(el => el.classList.remove('activo'));
      document.getElementById('seccion-seguro').classList.remove('activa');
      document.getElementById('aviso-tipo').classList.remove('visible');
    } else {
      mostrarToast('Error: ' + (data.error || 'no se pudo guardar'), true);
    }
  } catch (err) {
    mostrarToast('Error: ' + err.message, true);
  }
});

/* ===========================================================
   MIS VENCIMIENTOS: RESUMEN, TABLA Y MODAL
   =========================================================== */
let VENCIMIENTOS = [];
let ID_EDITANDO = null;
let FILTRO_ACTUAL = 'todos';
let FILTRO_ESTADO = null; // null | 'vencido' | 'por-vencer' | 'al-dia' | 'pagado' 

function diasHasta(fechaStr) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr + 'T00:00:00');
  return Math.round((fecha - hoy) / 86400000);
}

function estadoDe(v) {
  if (v.estado === 'pagado') return 'pagado';
  const dias = diasHasta(v.fecha_vencimiento);
  if (dias < 0) return 'vencido';
  if (dias <= 7) return 'por-vencer';
  return 'al-dia';
}

function textoEstado(v) {
  if (v.estado === 'pagado') return { texto: 'Pagado', clase: 'gris' };
  const dias = diasHasta(v.fecha_vencimiento);
  if (dias < 0) return { texto: `Venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`, clase: 'rojo' };
  if (dias === 0) return { texto: 'Vence hoy', clase: 'rojo' };
  if (dias <= 7) return { texto: `Vence en ${dias} día${dias === 1 ? '' : 's'}`, clase: 'amarillo' };
  return { texto: `Vence en ${dias} días`, clase: 'verde' };
}

function formatoMoneda(monto) {
  if (!monto) return '-';
  return '$' + Number(monto).toLocaleString('es-AR');
}

function renderSkeletonTabla() {
  const cont = document.getElementById('tabla');
  const filaSkeleton = `
    <div class="fila-tabla" style="cursor:default;">
      <div>
        <div class="skeleton" style="height:14px; width:70%; margin-bottom:6px;"></div>
        <div class="skeleton" style="height:11px; width:45%;"></div>
      </div>
      <div class="skeleton" style="height:12px; width:60%;"></div>
      <div class="skeleton" style="height:12px; width:50%;"></div>
      <div class="skeleton" style="height:12px; width:70%;"></div>
      <div></div>
    </div>`;
  cont.innerHTML = `
    <div class="fila-tabla header">
      <div>Concepto</div><div>Tipo</div><div>Monto</div><div>Vencimiento</div><div></div>
    </div>
    ${filaSkeleton.repeat(4)}
  `;
}

async function cargarVencimientos() {
  renderSkeletonTabla();
  try {
    const res = await fetch('/api/vencimientos');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al traer los vencimientos');
    VENCIMIENTOS = data;
    renderResumen();
    renderTabla();
  } catch (err) {
    mostrarToast('Error: ' + err.message, true);
  }
}

function renderResumen() {
  const activos = VENCIMIENTOS.filter(v => v.estado !== 'pagado');
  const vencidos = activos.filter(v => diasHasta(v.fecha_vencimiento) < 0).length;
  const porVencer = activos.filter(v => { const d = diasHasta(v.fecha_vencimiento); return d >= 0 && d <= 7; }).length;
  const alDia = activos.length - vencidos - porVencer;
  const totalMes = activos.reduce((acc, v) => acc + (Number(v.monto) || 0), 0);

  const sel = (clave) => FILTRO_ESTADO === clave ? 'seleccionado' : '';

  document.getElementById('resumen').innerHTML = `
    <div class="stat rojo ${sel('vencido')}" data-estado="vencido"><p class="label">Vencidos</p><p class="valor">${vencidos}</p></div>
    <div class="stat amarillo ${sel('por-vencer')}" data-estado="por-vencer"><p class="label">Por vencer (7 días)</p><p class="valor">${porVencer}</p></div>
    <div class="stat ${sel('al-dia')}" data-estado="al-dia"><p class="label">Al día</p><p class="valor">${alDia}</p></div>
    <div class="stat"><p class="label">Total pendiente</p><p class="valor">${formatoMoneda(totalMes)}</p></div>
  `;

  document.querySelectorAll('.resumen .stat[data-estado]').forEach(stat => {
    stat.addEventListener('click', () => {
      const estado = stat.dataset.estado;
      FILTRO_ESTADO = FILTRO_ESTADO === estado ? null : estado;
      renderResumen();
      renderTabla();
    });
  });
}

function limpiarFiltroEstado() {
  FILTRO_ESTADO = null;
  renderResumen();
  renderTabla();
}

function renderTabla() {
  const cont = document.getElementById('tabla');
  let lista = FILTRO_ACTUAL === 'todos' ? VENCIMIENTOS : VENCIMIENTOS.filter(v => v.tipo === FILTRO_ACTUAL);
  if (FILTRO_ESTADO) lista = lista.filter(v => estadoDe(v) === FILTRO_ESTADO);

  const etiquetaEstado = { 'vencido': 'Vencidos', 'por-vencer': 'Por vencer', 'al-dia': 'Al día' };
  const avisoFiltro = FILTRO_ESTADO
    ? `<button class="limpiar-filtro-estado" onclick="limpiarFiltroEstado()">✕ Mostrando solo: ${etiquetaEstado[FILTRO_ESTADO]} — quitar filtro</button>`
    : '';

  const filas = lista.map(v => {
    const est = textoEstado(v);
    const entidad = v.cuenta_producto ? `${v.entidad_nombre} — ${v.cuenta_producto}` : (v.entidad_nombre || '');
    return `
      <div class="fila-tabla ${estadoDe(v)}" data-id="${v.id}">
        <div>
          <div class="concepto-nombre">${v.concepto}</div>
          <div class="entidad-nombre">${entidad}</div>
        </div>
        <div>${v.tipo}</div>
        <div>${formatoMoneda(v.monto)}</div>
        <div class="estado-texto ${est.clase}">${est.texto}</div>
        <div>${v.tiene_pdf ? '📎' : ''}</div>
      </div>
    `;
  }).join('');

  document.getElementById('aviso-filtro-estado').innerHTML = avisoFiltro;

  cont.innerHTML = `
    <div class="fila-tabla header">
      <div>Concepto</div><div>Tipo</div><div>Monto</div><div>Vencimiento</div><div></div>
    </div>
    ${filas || '<div style="padding:36px 20px; text-align:center;"><p style="font-size:14px; color:var(--tinta); font-weight:600; margin:0 0 4px;">No hay vencimientos con este filtro</p><p style="font-size:12.5px; color:var(--piedra); margin:0;">Probá con otro filtro o cargá un vencimiento nuevo.</p></div>'}
  `;

  cont.querySelectorAll('.fila-tabla[data-id]').forEach((fila, i) => {
    fila.style.opacity = '0';
    fila.style.animation = `aparecer 220ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 28}ms forwards`;
    fila.addEventListener('click', () => abrirModal(Number(fila.dataset.id)));
  });

  renderGruposEntidad();
}

function renderGruposEntidad() {
  const cont = document.getElementById('grupos-entidad');
  const grupos = {};
  VENCIMIENTOS.forEach(v => {
    const clave = v.entidad_nombre || 'Sin entidad';
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(v);
  });

  const nombres = Object.keys(grupos).sort();
  if (nombres.length === 0) {
    cont.innerHTML = '<p style="font-size:13px; color:var(--piedra);">Todavía no hay vencimientos cargados.</p>';
    return;
  }

  cont.innerHTML = nombres.map(nombre => {
    const items = grupos[nombre];
    const pendientes = items.filter(v => v.estado !== 'pagado').length;
    const filasGrupo = items.map(v => {
      const est = textoEstado(v);
      return `
        <div class="fila-tabla" data-id="${v.id}">
          <div>
            <div class="concepto-nombre">${v.concepto}</div>
            <div class="entidad-nombre">${v.cuenta_producto || ''}</div>
          </div>
          <div>${v.tipo}</div>
          <div>${formatoMoneda(v.monto)}</div>
          <div class="estado-texto ${est.clase}">${est.texto}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="grupo-entidad">
        <div class="grupo-entidad-header" data-nombre="${nombre}">
          <span class="nombre">${nombre}</span>
          <span class="contador">${items.length} vencimiento${items.length === 1 ? '' : 's'} · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}</span>
        </div>
        <div class="grupo-entidad-body">${filasGrupo}</div>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('.grupo-entidad-header').forEach(header => {
    header.addEventListener('click', () => {
      header.nextElementSibling.classList.toggle('abierto');
    });
  });

  cont.querySelectorAll('.grupo-entidad-body .fila-tabla[data-id]').forEach(fila => {
    fila.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModal(Number(fila.dataset.id));
    });
  });
}

document.querySelectorAll('.filtro-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    FILTRO_ACTUAL = btn.dataset.filtro;
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    renderTabla();
  });
});

function proximaFecha(fechaStr, recurrencia) {
  if (!fechaStr) return null;
  const fecha = new Date(fechaStr + 'T00:00:00');
  const rec = (recurrencia || '').toLowerCase();
  if (rec === 'mensual') fecha.setMonth(fecha.getMonth() + 1);
  else if (rec === 'anual') fecha.setFullYear(fecha.getFullYear() + 1);
  else return null; // único, o recurrencia manual no reconocida automáticamente
  return fecha.toISOString().slice(0, 10);
}

async function abrirModal(id) {
  const v = VENCIMIENTOS.find(x => x.id === id);
  if (!v) return;
  ID_EDITANDO = id;

  document.getElementById('m_tipo').value = v.tipo;
  document.getElementById('m_concepto').value = v.concepto || '';
  document.getElementById('m_monto').value = v.monto || '';
  document.getElementById('m_fecha_vencimiento').value = v.fecha_vencimiento || '';
  document.getElementById('m_recurrencia').value = v.recurrencia || '';
  document.getElementById('m_pdf').value = '';
  document.getElementById('m_marcar_pagado').style.display = v.estado === 'pagado' ? 'none' : 'block';
  document.getElementById('m_deshacer_pago').style.display = v.estado === 'pagado' ? 'block' : 'none';

  const entidad = v.cuenta_producto ? `${v.entidad_nombre} — ${v.cuenta_producto}` : (v.entidad_nombre || '-');
  const proxima = proximaFecha(v.fecha_vencimiento, v.recurrencia);

  document.getElementById('m_info').innerHTML = `
    <div><span>Entidad</span><span>${entidad}</span></div>
    <div><span>Estado</span><span>${v.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</span></div>
    ${v.fecha_pago ? `<div><span>Fecha de pago</span><span>${v.fecha_pago}</span></div>` : ''}
    ${proxima ? `<div><span>Próxima cuota</span><span>${proxima}</span></div>` : ''}
  `;

  document.getElementById('m_comprobante').innerHTML = '<p style="font-size:12.5px; color:var(--piedra);">Cargando comprobantes...</p>';
  document.getElementById('fondo-modal').classList.add('visible');

  await recargarComprobantesModal(id);
}

async function recargarComprobantesModal(id) {
  try {
    const res = await fetch(`/api/vencimientos/${id}`);
    const detalle = await res.json();
    const comprobantes = detalle.comprobantes || [];

    if (comprobantes.length === 0) {
      document.getElementById('m_comprobante').innerHTML = `<p style="font-size:12.5px; color:var(--piedra);">Sin comprobantes cargados</p>`;
      return;
    }

    document.getElementById('m_comprobante').innerHTML = comprobantes.map((c) => `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <a class="pdf-link" href="#" onclick="return abrirPreviewPdf('${c.archivo_url}')" style="flex:1;">📎 ${c.nombre_original || 'Comprobante'} — ${c.fecha_subida || ''}</a>
        <button type="button" onclick="borrarComprobante(${c.id}, ${id})" style="background:none; border:none; color:#a33; font-size:16px; cursor:pointer; padding:4px 8px;" title="Eliminar">🗑</button>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('m_comprobante').innerHTML = `<p style="font-size:12.5px; color:var(--piedra);">No se pudieron cargar los comprobantes</p>`;
  }
}

async function borrarComprobante(comprobanteId, vencimientoId) {
  try {
    const res = await fetch(`/api/comprobantes/${comprobanteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'no se pudo borrar');
    mostrarToast('Comprobante eliminado');
    await recargarComprobantesModal(vencimientoId);
  } catch (err) {
    mostrarToast('Error: ' + err.message, true);
  }
}

function abrirPreviewPdf(url) {
  document.getElementById('visor-pdf').src = url;
  document.getElementById('descargar-pdf').href = url;
  document.getElementById('fondo-pdf').classList.add('visible');
  return false;
}

document.getElementById('cerrar-pdf').addEventListener('click', () => {
  document.getElementById('fondo-pdf').classList.remove('visible');
  document.getElementById('visor-pdf').src = '';
});
document.getElementById('fondo-pdf').addEventListener('click', (e) => {
  if (e.target.id === 'fondo-pdf') {
    document.getElementById('fondo-pdf').classList.remove('visible');
    document.getElementById('visor-pdf').src = '';
  }
});

function cerrarModal() {
  document.getElementById('fondo-modal').classList.remove('visible');
  ID_EDITANDO = null;
}

document.getElementById('cerrar-modal').addEventListener('click', cerrarModal);
document.getElementById('fondo-modal').addEventListener('click', (e) => {
  if (e.target.id === 'fondo-modal') cerrarModal();
});

document.getElementById('m_guardar').addEventListener('click', async () => {
  try {
    const formData = new FormData();
    formData.append('tipo', document.getElementById('m_tipo').value);
    formData.append('concepto', document.getElementById('m_concepto').value);
    formData.append('monto', document.getElementById('m_monto').value);
    formData.append('fecha_vencimiento', document.getElementById('m_fecha_vencimiento').value);
    formData.append('recurrencia', document.getElementById('m_recurrencia').value);

    const original = VENCIMIENTOS.find(x => x.id === ID_EDITANDO);
    formData.append('entidad_id', original.entidad_id || '');
    formData.append('objeto_asegurado', original.objeto_asegurado || '');
    formData.append('detalle', original.detalle || '');

    Array.from(document.getElementById('m_pdf').files).forEach(archivo => {
      formData.append('pdf', archivo);
    });

    const res = await fetch(`/api/vencimientos/${ID_EDITANDO}`, { method: 'PUT', body: formData });
    const data = await res.json();

    if (res.ok) {
      mostrarToast('Cambios guardados');
      cerrarModal();
      cargarVencimientos();
    } else {
      mostrarToast('Error: ' + (data.error || 'no se pudo guardar'), true);
    }
  } catch (err) {
    mostrarToast('Error: ' + err.message, true);
  }
});

document.getElementById('m_marcar_pagado').addEventListener('click', async () => {
  try {
    const res = await fetch(`/api/vencimientos/${ID_EDITANDO}/pagar`, { method: 'PUT' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'no se pudo marcar como pagado');
    mostrarToast(data.proximaFecha ? `Pagado — próxima cuota: ${data.proximaFecha}` : 'Marcado como pagado');
    cerrarModal();
    cargarVencimientos();
  } catch (err) {
    mostrarToast('Error: ' + err.message, true);
  }
});

document.getElementById('m_deshacer_pago').addEventListener('click', async () => {
  try {
    const res = await fetch(`/api/vencimientos/${ID_EDITANDO}/pendiente`, { method: 'PUT' });
    if (!res.ok) throw new Error((await res.json()).error || 'no se pudo deshacer el pago');
    mostrarToast('Vuelto a pendiente');
    cerrarModal();
    cargarVencimientos();
  } catch (err) {
    mostrarToast('Error: ' + err.message, true);
  }
});
/* ===========================================================
   PANEL (dashboard)
   =========================================================== */
async function cargarPanel() {
  try {
    const res = await fetch('/api/vencimientos');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al traer los vencimientos');
    VENCIMIENTOS = data;
    renderResumenPanel();
    renderGraficoTipos();
    renderProximos();
  } catch (err) {
    // Silencioso: el panel puede cargarse antes que el usuario haga nada más
  }
}

function renderResumenPanel() {
  const activos = VENCIMIENTOS.filter(v => v.estado !== 'pagado');
  const vencidos = activos.filter(v => diasHasta(v.fecha_vencimiento) < 0).length;
  const porVencer = activos.filter(v => { const d = diasHasta(v.fecha_vencimiento); return d >= 0 && d <= 7; }).length;
  const alDia = activos.length - vencidos - porVencer;
  const totalMes = activos.reduce((acc, v) => acc + (Number(v.monto) || 0), 0);

  const cont = document.getElementById('resumen-panel');
  if (!cont) return;

  cont.innerHTML = `
    <div class="stat rojo" data-estado="vencido"><p class="label">Vencidos</p><p class="valor">${vencidos}</p></div>
    <div class="stat amarillo" data-estado="por-vencer"><p class="label">Por vencer (7 días)</p><p class="valor">${porVencer}</p></div>
    <div class="stat" data-estado="al-dia"><p class="label">Al día</p><p class="valor">${alDia}</p></div>
    <div class="stat"><p class="label">Total pendiente</p><p class="valor">${formatoMoneda(totalMes)}</p></div>
  `;

  cont.querySelectorAll('.stat[data-estado]').forEach(stat => {
    stat.addEventListener('click', () => {
      FILTRO_ESTADO = stat.dataset.estado;
      FILTRO_ACTUAL = 'todos';
      irAVista('vista-lista');
    });
  });
}

function renderGraficoTipos() {
  const cont = document.getElementById('grafico-tipos');
  if (!cont) return;

  const tipos = ['Seguro', 'Cuota', 'Impuesto', 'Servicio', 'Tarjeta'];
  const activos = VENCIMIENTOS.filter(v => v.estado !== 'pagado');
  const conteos = tipos.map(t => activos.filter(v => v.tipo === t).length);
  const max = Math.max(1, ...conteos);

  cont.innerHTML = tipos.map((tipo, i) => {
    const cantidad = conteos[i];
    const alturaPct = Math.max(6, Math.round((cantidad / max) * 100));
    return `
      <div class="silo-columna">
        <span class="silo-numero">${cantidad}</span>
        <div class="silo-cuerpo">
          <div class="silo-relleno" style="height:${cantidad === 0 ? 0 : alturaPct}%;"></div>
        </div>
        <span class="silo-etiqueta">${tipo}</span>
      </div>
    `;
  }).join('');
}

function renderProximos() {
  const cont = document.getElementById('lista-proximos');
  if (!cont) return;

  const proximos = VENCIMIENTOS
    .filter(v => v.estado !== 'pagado')
    .map(v => ({ ...v, dias: diasHasta(v.fecha_vencimiento) }))
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 5);

  if (proximos.length === 0) {
    cont.innerHTML = '<p class="vacio">No hay vencimientos pendientes cargados todavía.</p>';
    return;
  }

  cont.innerHTML = proximos.map(v => {
    const urgente = v.dias <= 3;
    const entidad = v.cuenta_producto ? `${v.entidad_nombre} — ${v.cuenta_producto}` : (v.entidad_nombre || v.tipo);
    const etiquetaDia = v.dias < 0 ? `${Math.abs(v.dias)}d` : (v.dias === 0 ? 'Hoy' : `${v.dias}d`);
    return `
      <div class="proximo-item" data-id="${v.id}">
        <div class="proximo-dia ${urgente ? 'urgente' : ''}">${etiquetaDia}</div>
        <div class="proximo-texto">
          <div class="proximo-concepto">${v.concepto}</div>
          <div class="proximo-sub">${entidad}</div>
        </div>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('.proximo-item').forEach(item => {
    item.addEventListener('click', async () => {
      irAVista('vista-lista');
      await cargarVencimientos();
      abrirModal(Number(item.dataset.id));
    });
  });
}

/* ===========================================================
   ENTIDADES
   =========================================================== */
async function cargarVistaEntidades() {
  const cont = document.getElementById('entidades-grid');
  cont.innerHTML = '<p class="vacio">Cargando entidades...</p>';
  try {
    const [resEnt, resVenc] = await Promise.all([
      fetch('/api/entidades'),
      fetch('/api/vencimientos'),
    ]);
    const entidades = await resEnt.json();
    const vencimientos = await resVenc.json();

    if (entidades.length === 0) {
      cont.innerHTML = '<p class="vacio">Todavía no hay entidades cargadas — se crean automáticamente al guardar un vencimiento nuevo.</p>';
      return;
    }

    cont.innerHTML = entidades.map(ent => {
      const relacionados = vencimientos.filter(v => v.entidad_id === ent.id);
      const pendientes = relacionados.filter(v => v.estado !== 'pagado').length;
      return `
        <div class="entidad-card">
          <div class="entidad-card-encabezado">
            <div>
              <p class="entidad-nombre-grande">${ent.nombre}</p>
              ${ent.cuenta_producto ? `<p class="entidad-producto">${ent.cuenta_producto}</p>` : ''}
            </div>
            ${ent.tipo_entidad ? `<span class="entidad-tipo-tag">${ent.tipo_entidad}</span>` : ''}
          </div>
          <div class="entidad-contador">📎 ${relacionados.length} vencimiento${relacionados.length === 1 ? '' : 's'} · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    cont.innerHTML = '<p class="vacio">No se pudieron cargar las entidades.</p>';
  }
}

/* ===========================================================
   ZONA DE CARGA (drag & drop) + estado visual del botón IA
   =========================================================== */
(function inicializarZonaDrop() {
  const zona = document.getElementById('zona-drop');
  const input = document.getElementById('pdf');
  const label = document.getElementById('zona-drop-label');
  if (!zona || !input) return;

  function actualizarLabel() {
    if (input.files.length === 0) {
      label.textContent = 'Arrastrá los PDF acá, o hacé click para elegirlos';
    } else if (input.files.length === 1) {
      label.textContent = '📎 ' + input.files[0].name;
    } else {
      label.textContent = `📎 ${input.files.length} archivos seleccionados`;
    }
  }

  input.addEventListener('change', actualizarLabel);

  ['dragenter', 'dragover'].forEach(evento => {
    zona.addEventListener(evento, (e) => { e.preventDefault(); zona.classList.add('arrastrando'); });
  });
  ['dragleave', 'drop'].forEach(evento => {
    zona.addEventListener(evento, (e) => { e.preventDefault(); zona.classList.remove('arrastrando'); });
  });
  zona.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) {
      input.files = e.dataTransfer.files;
      actualizarLabel();
    }
  });

  const formVencimiento = document.getElementById('form-vencimiento');
  if (formVencimiento) formVencimiento.addEventListener('reset', () => setTimeout(actualizarLabel, 0));
})();