import db from '../../src/database/connection.js'

export const resetDb = () => {
  db.exec(`
    DELETE FROM invoice_items;
    DELETE FROM invoices;
    DELETE FROM products;
    DELETE FROM users;
  `)
}

export default resetDb
