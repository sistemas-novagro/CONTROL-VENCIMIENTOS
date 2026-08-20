require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('./db.js');

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads', { setHeaders: (res) => res.setHeader('Content-Disposition', 'inline') }));

// Convierte el nombre original en algo seguro para guardar en disco
// (saca tildes, espacios y caracteres raros) pero mantiene el nombre reconocible.
function sanitizarNombre(nombre) {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca tildes
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const nombreSeguro = sanitizarNombre(file.originalname || 'comprobante.pdf');
    const conExtension = nombreSeguro.toLowerCase().endsWith('.pdf') ? nombreSeguro : nombreSeguro + '.pdf';
    cb(null, Date.now() + '-' + conExtension); // el timestamp adelante evita que dos archivos con el mismo nombre se pisen
  },
});
const upload = multer({ storage });

// Para el análisis con IA no necesitamos guardar el PDF en disco todavía,
// solo tenerlo en memoria un instante para mandarlo a la API.
const uploadMemoria = multer({ storage: multer.memoryStorage() });

app.post('/api/analizar-pdf', uploadMemoria.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún PDF' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' });
    }

    const base64Pdf = req.file.buffer.toString('base64');

    const prompt = `Analizá este comprobante o factura y extraé los siguientes datos. Respondé ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, sin bloques de código, con esta forma exacta:

{
  "tipo": "Seguro" | "Cuota" | "Impuesto" | "Servicio" | "Tarjeta",
  "entidad_nombre": "nombre de la empresa o entidad que emite el comprobante",
  "concepto": "descripción breve del concepto, ej: Póliza granizo - lote 14",
  "monto": numero sin símbolo de moneda ni separador de miles, con punto decimal,
  "fecha_vencimiento": "YYYY-MM-DD",
  "objeto_asegurado": "solo si tipo es Seguro y se identifica, ej: Maquinaria, Camiones — si no, null",
  "detalle": "solo si tipo es Seguro y hay detalle adicional, ej: modelo o patente — si no, null",
  "recurrencia": "mensual" | "anual" | "unico"
}

Si no podés determinar un dato con certeza, usá null en ese campo (excepto tipo y concepto, que siempre deben tener un valor razonable según el documento).`;

    const respuestaIA = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await respuestaIA.json();

    if (!respuestaIA.ok) {
      console.error('Error de la API de Anthropic:', data);
      return res.status(500).json({ error: 'No se pudo analizar el documento con IA' });
    }

    const bloqueTexto = data.content.find(b => b.type === 'text');
    const textoLimpio = (bloqueTexto?.text || '').replace(/```json|```/g, '').trim();
    const extraido = JSON.parse(textoLimpio);

    res.json(extraido);
  } catch (err) {
    console.error('Error en POST /api/analizar-pdf:', err);
    res.status(500).json({ error: 'No se pudo analizar el documento' });
  }
});

app.get('/api/vencimientos', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT v.*, e.nombre AS entidad_nombre, e.cuenta_producto,
             p.nombre AS responsable_nombre,
             (SELECT COUNT(*) FROM comprobantes c WHERE c.vencimiento_id = v.id) AS tiene_pdf
      FROM vencimientos v
      LEFT JOIN entidades e ON v.entidad_id = e.id
      LEFT JOIN personas p ON v.responsable_id = p.id
      ORDER BY v.fecha_vencimiento ASC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/vencimientos:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vencimientos/:id', (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM vencimientos WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'no encontrado' });
    const comprobantes = db.prepare(`SELECT * FROM comprobantes WHERE vencimiento_id = ?`).all(req.params.id);
    res.json({ ...row, comprobantes });
  } catch (err) {
    console.error('Error en GET /api/vencimientos/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vencimientos', upload.array('pdf', 10), (req, res) => {
  try {
    const v = req.body;

    if (!v.concepto || !v.fecha_vencimiento) {
      return res.status(400).json({ error: 'Falta concepto o fecha de vencimiento' });
    }

    const insert = db.prepare(`
      INSERT INTO vencimientos
        (tipo, entidad_id, concepto, monto, fecha_vencimiento, recurrencia,
         responsable_id, cargado_por_id, estado, objeto_asegurado, detalle)
      VALUES (@tipo, @entidad_id, @concepto, @monto, @fecha_vencimiento, @recurrencia,
              @responsable_id, @cargado_por_id, 'pendiente', @objeto_asegurado, @detalle)
    `);

    const result = insert.run({
      tipo: v.tipo || null,
      entidad_id: v.entidad_id || null,
      concepto: v.concepto,
      monto: v.monto || null,
      fecha_vencimiento: v.fecha_vencimiento,
      recurrencia: v.recurrencia || null,
      responsable_id: v.responsable_id || null,
      cargado_por_id: v.cargado_por_id || null,
      objeto_asegurado: v.objeto_asegurado || null,
      detalle: v.detalle || null,
    });

    const insertComprobante = db.prepare(
      `INSERT INTO comprobantes (vencimiento_id, archivo_url, fecha_subida, nombre_original) VALUES (?, ?, ?, ?)`
    );
    (req.files || []).forEach(file => {
      insertComprobante.run(result.lastInsertRowid, '/uploads/' + file.filename, new Date().toISOString().slice(0, 10), file.originalname);
    });

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error en POST /api/vencimientos:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vencimientos/:id', upload.array('pdf', 10), (req, res) => {
  try {
    const v = req.body;
    db.prepare(`
      UPDATE vencimientos SET
        tipo=@tipo, entidad_id=@entidad_id, concepto=@concepto, monto=@monto,
        fecha_vencimiento=@fecha_vencimiento, recurrencia=@recurrencia,
        objeto_asegurado=@objeto_asegurado, detalle=@detalle
      WHERE id=@id
    `).run({
      tipo: v.tipo || null,
      entidad_id: v.entidad_id || null,
      concepto: v.concepto,
      monto: v.monto || null,
      fecha_vencimiento: v.fecha_vencimiento,
      recurrencia: v.recurrencia || null,
      objeto_asegurado: v.objeto_asegurado || null,
      detalle: v.detalle || null,
      id: req.params.id,
    });

    const insertComprobante = db.prepare(
      `INSERT INTO comprobantes (vencimiento_id, archivo_url, fecha_subida, nombre_original) VALUES (?, ?, ?, ?)`
    );
    (req.files || []).forEach(file => {
      insertComprobante.run(req.params.id, '/uploads/' + file.filename, new Date().toISOString().slice(0, 10), file.originalname);
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PUT /api/vencimientos/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/comprobantes/:id', (req, res) => {
  try {
    const comp = db.prepare('SELECT * FROM comprobantes WHERE id = ?').get(req.params.id);
    if (!comp) return res.status(404).json({ error: 'no encontrado' });
    db.prepare('DELETE FROM comprobantes WHERE id = ?').run(req.params.id);
    const ruta = 'uploads/' + comp.archivo_url.split('/').pop();
    if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /api/comprobantes/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// Calcula la fecha del próximo vencimiento para recurrencias mensuales o anuales.
// Recurrencias manuales (ej. "cada 3 meses") no se interpretan automáticamente todavía.
function calcularProximaFecha(fechaStr, recurrencia) {
  if (!fechaStr) return null;
  const fecha = new Date(fechaStr + 'T00:00:00');
  const rec = (recurrencia || '').toLowerCase();
  if (rec === 'mensual') fecha.setMonth(fecha.getMonth() + 1);
  else if (rec === 'anual') fecha.setFullYear(fecha.getFullYear() + 1);
  else return null;
  return fecha.toISOString().slice(0, 10);
}

app.put('/api/vencimientos/:id/pagar', (req, res) => {
  try {
    const original = db.prepare('SELECT * FROM vencimientos WHERE id = ?').get(req.params.id);
    if (!original) return res.status(404).json({ error: 'no encontrado' });

    db.prepare(`UPDATE vencimientos SET estado = 'pagado', fecha_pago = ? WHERE id = ?`)
      .run(new Date().toISOString().slice(0, 10), req.params.id);

    let proximoId = null;
    const proximaFecha = calcularProximaFecha(original.fecha_vencimiento, original.recurrencia);

    if (proximaFecha) {
      const insert = db.prepare(`
        INSERT INTO vencimientos
          (tipo, entidad_id, concepto, monto, fecha_vencimiento, recurrencia,
           responsable_id, cargado_por_id, estado, objeto_asegurado, detalle)
        VALUES (@tipo, @entidad_id, @concepto, @monto, @fecha_vencimiento, @recurrencia,
                @responsable_id, @cargado_por_id, 'pendiente', @objeto_asegurado, @detalle)
      `);
      const resultado = insert.run({
        tipo: original.tipo,
        entidad_id: original.entidad_id,
        concepto: original.concepto,
        monto: original.monto,
        fecha_vencimiento: proximaFecha,
        recurrencia: original.recurrencia,
        responsable_id: original.responsable_id,
        cargado_por_id: original.cargado_por_id,
        objeto_asegurado: original.objeto_asegurado,
        detalle: original.detalle,
      });
      proximoId = resultado.lastInsertRowid;
    }

    res.json({ ok: true, proximoId, proximaFecha });
  } catch (err) {
    console.error('Error en PUT /api/vencimientos/:id/pagar:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vencimientos/:id/pendiente', (req, res) => {
  try {
    db.prepare(`UPDATE vencimientos SET estado = 'pendiente', fecha_pago = NULL WHERE id = ?`)
      .run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PUT /api/vencimientos/:id/pendiente:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/entidades', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM entidades ORDER BY nombre').all());
  } catch (err) {
    console.error('Error en GET /api/entidades:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/entidades', (req, res) => {
  try {
    const { nombre, cuenta_producto, tipo_entidad } = req.body;

    const existente = db.prepare(`
      SELECT * FROM entidades
      WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?))
        AND (
          (cuenta_producto IS NULL AND ? IS NULL)
          OR LOWER(TRIM(cuenta_producto)) = LOWER(TRIM(?))
        )
    `).get(nombre, cuenta_producto || null, cuenta_producto || '');

    if (existente) {
      return res.json({ id: existente.id, reutilizada: true });
    }

    const result = db.prepare(
      'INSERT INTO entidades (nombre, cuenta_producto, tipo_entidad) VALUES (?, ?, ?)'
    ).run(nombre, cuenta_producto || null, tipo_entidad || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error en POST /api/entidades:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));