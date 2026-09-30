import dotenv from 'dotenv'

dotenv.config()

const env = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  dbPath: process.env.DB_PATH || './data/facturacion.db',
  seedAdmin: {
    username: process.env.SEED_ADMIN_USERNAME || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD || 'admin123'
  },
  seedVendedor: {
    username: process.env.SEED_VENDEDOR_USERNAME || 'vendedor',
    password: process.env.SEED_VENDEDOR_PASSWORD || 'vendedor123'
  }
}

// Validate required variables
if (!env.jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required')
}

export default env
