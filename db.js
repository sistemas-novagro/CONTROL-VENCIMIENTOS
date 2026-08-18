const Database = require('better-sqlite3');
const db = new Database('vencimientos.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS entidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cuenta_producto TEXT,
    tipo_entidad TEXT
  );

  CREATE TABLE IF NOT EXISTS personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    area TEXT
  );

  CREATE TABLE IF NOT EXISTS vencimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    entidad_id INTEGER,
    concepto TEXT NOT NULL,
    monto REAL,
    fecha_vencimiento TEXT NOT NULL,
    recurrencia TEXT,
    responsable_id INTEGER,
    cargado_por_id INTEGER,
    estado TEXT,
    fecha_pago TEXT,
    objeto_asegurado TEXT,
    detalle TEXT,
    FOREIGN KEY (entidad_id) REFERENCES entidades(id),
    FOREIGN KEY (responsable_id) REFERENCES personas(id),
    FOREIGN KEY (cargado_por_id) REFERENCES personas(id)
  );

  CREATE TABLE IF NOT EXISTS comprobantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vencimiento_id INTEGER NOT NULL,
    archivo_url TEXT NOT NULL,
    fecha_subida TEXT,
    FOREIGN KEY (vencimiento_id) REFERENCES vencimientos(id)
  );
`);

// Si la base ya existía de antes, sumamos la columna nueva sin borrar nada (migración simple)
try {
  db.exec('ALTER TABLE comprobantes ADD COLUMN nombre_original TEXT');
} catch (err) {
  if (!err.message.includes('duplicate column')) throw err; // ya existía, no pasa nada
}

console.log('Base de datos y tablas creadas correctamente.');

module.exports = db;