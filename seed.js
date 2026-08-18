const db = require('./db.js');

const entidades = [
  { nombre: 'Banco Nación', cuenta_producto: 'Agronación', tipo_entidad: 'Banco' },
  { nombre: 'Banco Nación', cuenta_producto: 'Corporativa Nación', tipo_entidad: 'Banco' },
  { nombre: 'Banco Nación', cuenta_producto: 'Cuenta corriente', tipo_entidad: 'Banco' },
  { nombre: 'Galicia', cuenta_producto: 'Business', tipo_entidad: 'Banco' },
  { nombre: 'Galicia', cuenta_producto: 'Cuenta corriente', tipo_entidad: 'Banco' },
  { nombre: 'BBVA', cuenta_producto: null, tipo_entidad: 'Banco' },
  { nombre: 'Santander', cuenta_producto: null, tipo_entidad: 'Banco' },
  { nombre: 'Banco Santa Fe', cuenta_producto: null, tipo_entidad: 'Banco' },
  { nombre: 'Patagonia', cuenta_producto: null, tipo_entidad: 'Banco' },
  { nombre: 'Macro', cuenta_producto: null, tipo_entidad: 'Banco' },
  { nombre: 'API', cuenta_producto: null, tipo_entidad: 'Seguro' },
  { nombre: 'Cooperación Seguros', cuenta_producto: null, tipo_entidad: 'Seguro' },
  { nombre: 'Sancor Seguros', cuenta_producto: null, tipo_entidad: 'Seguro' },
  { nombre: 'AFIP/ARCA', cuenta_producto: null, tipo_entidad: 'Impuesto' },
  { nombre: 'Comuna Cañada Rosquín', cuenta_producto: null, tipo_entidad: 'Impuesto' },
  { nombre: 'EPE', cuenta_producto: null, tipo_entidad: 'Servicio' },
  { nombre: 'Conecta', cuenta_producto: null, tipo_entidad: 'Servicio' },
  { nombre: 'OSECAC', cuenta_producto: null, tipo_entidad: 'Servicio' },
];

const insertEntidad = db.prepare(
  'INSERT INTO entidades (nombre, cuenta_producto, tipo_entidad) VALUES (?, ?, ?)'
);

for (const e of entidades) {
  insertEntidad.run(e.nombre, e.cuenta_producto, e.tipo_entidad);
}

console.log(`Se cargaron ${entidades.length} entidades.`);